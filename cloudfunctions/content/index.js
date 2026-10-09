/**
 * 站点内容接口 —— 区块版
 *
 * 改这个文件之前，先把下面这几条读完，它们是这一个版本刻意做出的取舍：
 *
 * 1. 写入不设门槛。任何拿到接口地址的人都能改这张页面的文案。这是作者明确要的：
 *    重心放在「前端管理员改完内容，推送给后端」，而不是一整套账号、口令、登录态。
 *    代价记在这里：站点一旦有了真实流量，第一件事就是回来把这个口子收上
 *    （最省事的做法是加一个写密钥，放在云函数的环境变量里，别放在存储桶里——
 *    这个环境的默认桶是公有读的，文件谁都能下载）。
 *
 * 2. 没有门槛不等于没有边界。字段白名单、数量上限、长度上限、请求体体积上限
 *    全部在服务端执行。它们挡不住有心涂改，但能挡住有人往这个桶里塞垃圾文件。
 *
 * 3. 内容按区块分文件存放：site/content/<区块>.json。改「首屏」不会碰到「空间」，
 *    写入前不需要 read-modify-write，也就不存在「两个区块同时被改、互相覆盖」的问题。
 *
 * 4. 读必须带时间戳参数走 CDN 源站。同名文件的下载结果会被 CDN 缓存若干分钟，
 *    覆盖写之后直接读，拿到的是上一版，表现为「保存成功但页面没变」。
 *
 * 5. 图片不塞进 JSON，单独上传到 site/media/YYYY-MM/ 再回落 CDN 链接。
 *    base64 编码会让体积膨胀三分之一，塞进内容文件迟早把页面拖垮。
 *
 * 区块一览：
 *   hero      首屏主标题 / 副标题 / 按钮文字
 *   about     两段自我介绍
 *   skills    技能标签列表
 *   spaces    自建空间列表：每个空间有名字，内含若干「文字块 / 图片块」
 *   contact   联系区引导语 + 邮箱 + GitHub（页脚的两个图标也用这两个值）
 *   footer    页脚一行小字
 *
 * 接口：
 *   GET  /content            读取全部区块，没有写过内容的区块返回 null
 *   GET  /content?section=X  只读一个区块
 *   POST /content            { section, content } 或 { sections: { X: {...} } }
 *   POST /content            { action: 'upload', mimeType, data(base64) } 上传一张图片
 */

'use strict';

const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
    env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV
});

const CONTENT_DIR = 'site/content';
const MEDIA_DIR = 'site/media';

// 写一次内容顶多几十 KB，但图片是按 MB 计的。base64 还会再膨胀三分之一，
// 余量留到 4MB，真正卡尺寸的是下面每张图单独的 MAX_IMAGE_BYTES。
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SPACES = 12;
const MAX_BLOCKS_PER_SPACE = 30;

/** 白名单而不是黑名单：只收这几种能安全内联展示的位图，
 *  SVG 坚决不收——它是 XML，里面能塞脚本。 */
const IMAGE_TYPES = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp'
};

const SECTION_KEYS = ['hero', 'about', 'skills', 'spaces', 'contact', 'footer'];

/* ------------------------------------------------------------------ */
/* HTTP 外壳                                                            */
/* ------------------------------------------------------------------ */

function respond(statusCode, payload, origin) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(payload)
    };
}

function parsePayload(event) {
    if (!event) return {};

    if (typeof event === 'string') {
        try {
            return JSON.parse(event);
        } catch {
            return parseFormEncoded(event);
        }
    }

    if (typeof event.body === 'string' && event.body !== '') {
        try {
            return JSON.parse(event.body);
        } catch {
            return parseFormEncoded(event.body);
        }
    }

    if (typeof event.body === 'object' && event.body !== null) return event.body;
    return event;
}

function parseFormEncoded(text) {
    const result = {};
    for (const pair of String(text).split('&')) {
        const index = pair.indexOf('=');
        if (index < 0) continue;
        const key = decodeURIComponent(pair.slice(0, index).replace(/\+/g, ' '));
        const value = decodeURIComponent(pair.slice(index + 1).replace(/\+/g, ' '));
        result[key] = value;
    }
    return result;
}

function readQuery(event, name) {
    const query = event.queryStringParameters || event.queryString || {};
    return String(query[name] || '').trim();
}

/* ------------------------------------------------------------------ */
/* 校验工具                                                            */
/* ------------------------------------------------------------------ */

/**
 * 统一的换行规范：内容会出现在 textarea 里来回传递，\r\n 会让字符串长度在两个
 * 环境之间对不上，先归一成 \n 再校验。
 */
function text(value) {
    return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

/** 把「标签串」或数组都收成字符串数组：支持英文逗号、中文逗号与顿号分隔 */
function textList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => text(item)).filter(Boolean);
    }
    if (typeof value !== 'string') return [];
    return value.split(/[,，、\n]/).map((item) => text(item)).filter(Boolean);
}

/**
 * 每个区块一个整理函数：只取白名单字段，超长、超量都记进 errors。
 * 宁可拒绝掉这一条，也不要把明显不对的东西写进存储。
 */
const NORMALIZERS = {
    hero(raw, errors) {
        return {
            title: limited(raw.title, 'title', 60, errors),
            subtitle: limited(raw.subtitle, 'subtitle', 160, errors),
            ctaText: limited(raw.ctaText, 'ctaText', 24, errors)
        };
    },

    about(raw, errors) {
        return {
            lead: limited(raw.lead, 'lead', 800, errors),
            more: limited(raw.more, 'more', 800, errors)
        };
    },

    skills(raw, errors) {
        const items = list(raw.items, 'items', 24, 24, errors);
        return { items };
    },

    spaces(raw, errors) {
        const rawItems = Array.isArray(raw.items) ? raw.items : [];
        if (rawItems.length > MAX_SPACES) {
            errors.items = `最多建 ${MAX_SPACES} 个空间`;
            return { items: [] };
        }

        const items = rawItems.map((rawSpace, index) => {
            const source = rawSpace && typeof rawSpace === 'object' ? rawSpace : {};
            const at = (name) => `第 ${index + 1} 个空间的${name}`;

            const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
            if (rawBlocks.length > MAX_BLOCKS_PER_SPACE) {
                errors[`第 ${index + 1} 个空间的内容块`] = `一个空间最多 ${MAX_BLOCKS_PER_SPACE} 块内容`;
            }

            const blocks = rawBlocks.slice(0, MAX_BLOCKS_PER_SPACE).map((rawBlock, order) => {
                const block = rawBlock && typeof rawBlock === 'object' ? rawBlock : {};
                const label = `第 ${index + 1} 个空间第 ${order + 1} 块`;

                if (block.type === 'image') {
                    const url = within(text(block.url), 400, `${label}图片链接`, errors);
                    // 图片链接由前端回填，理论上只会是我们自己桶里的地址；
                    // 既然接口公开可写，还是要保证它不可能变成 javascript: 之类的东西
                    if (url && !/^https?:\/\/\S+$/i.test(url)) {
                        errors[`${label}图片链接`] = `${label}图片链接必须是 http(s) 地址`;
                    }
                    return { type: 'image', url, alt: within(text(block.alt), 120, `${label}图片说明`, errors) };
                }

                return { type: 'text', value: within(text(block.value), 2000, `${label}文字`, errors) };
            });

            return {
                name: within(text(source.name), 40, at('名字'), errors),
                blocks
            };
        });

        return { items };
    },

    contact(raw, errors) {
        return {
            intro: limited(raw.intro, 'intro', 200, errors),
            email: limited(raw.email, 'email', 120, errors),
            github: limited(raw.github, 'github', 300, errors)
        };
    },

    footer(raw, errors) {
        return {
            note: limited(raw.note, 'note', 160, errors)
        };
    }
};

/** 字符串字段：超长报错，但仍然返回原值，方便前端照原样回填让用户改 */
function limited(value, name, max, errors) {
    const cleaned = text(value);
    if (cleaned.length > max) errors[name] = `${name} 不能超过 ${max} 个字`;
    return cleaned;
}

/** 与 limited 相同，只是错误文案换成更具体的名字 */
function within(value, max, label, errors) {
    if (value.length > max) errors[label] = `${label} 不能超过 ${max} 个字`;
    return value;
}

/** 列表字段：既限制条目数，也限制每条的长度 */
function list(value, label, maxItems, maxLength, errors) {
    const items = textList(value);
    if (items.length > maxItems) errors[label] = `${label} 最多 ${maxItems} 项`;
    return items.map((item) => (item.length > maxLength ? item.slice(0, maxLength) : item));
}

function normalizeSection(key, raw) {
    const errors = {};
    const content = NORMALIZERS[key](raw || {}, errors);
    return {
        ok: Object.keys(errors).length === 0,
        errors,
        content
    };
}

/* ------------------------------------------------------------------ */
/* 云存储读写                                                            */
/* ------------------------------------------------------------------ */

/**
 * 存储桶域名。首次靠约定格式猜，之后每次上传都会从返回的 fileID 里学到真实值，
 * 万一平台换了规则也能自愈。
 */
let cdnBucket = '';

function guessBucket() {
    const env = process.env.TCB_ENV || '';
    const appId = process.env.TENCENTCLOUD_APPID || '';
    return `6d79-${env}-${appId}`;
}

function learnBucket(fileID) {
    // cloud://<env>.<bucket>/<path...> —— 取第二段即桶名
    const parts = String(fileID).split('/');
    if (parts.length >= 3) {
        const host = parts[2];
        const dot = host.indexOf('.');
        if (dot > 0) cdnBucket = host.slice(dot + 1);
    }
}

function cloudPath(section) {
    return `${CONTENT_DIR}/${section}.json`;
}

/**
 * 走 CDN 源地址并缀一次性参数读取，跳过文件级别的 CDN 缓存，
 * 保证写完之后立刻读，读到的就是刚写进去的那份。
 */
async function fetchFresh(path) {
    const host = cdnBucket || guessBucket();
    const url = `https://${host}.tcb.qcloud.la/${path}?_=${Date.now()}`;
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        return JSON.parse(await response.text());
    } catch {
        return null;
    }
}

async function readJson(path) {
    const fresh = await fetchFresh(path);
    if (fresh) return fresh;

    // CDN 域名规则万一变了，退回 SDK 的下载通道
    const env = process.env.TCB_ENV || '';
    const appId = process.env.TENCENTCLOUD_APPID || '';
    const candidates = [
        `cloud://${env}.${cdnBucket || guessBucket()}/${path}`,
        `cloud://${env}.${env}-${appId}/${path}`,
        `cloud://${env}.6d79-${env}/${path}`
    ];

    for (const fileID of candidates) {
        try {
            const result = await app.downloadFile({ fileID });
            const content = result && result.fileContent;
            if (!content) continue;
            learnBucket(fileID);
            return JSON.parse(Buffer.from(content).toString('utf8'));
        } catch {
            // 文件不存在或 ID 不对，换下一个候选
        }
    }
    return null;
}

async function writeJson(path, data) {
    const result = await app.uploadFile({
        cloudPath: path,
        fileContent: Buffer.from(JSON.stringify(data, null, 2), 'utf8')
    });
    if (result && result.fileID) learnBucket(result.fileID);
    return result;
}

/* ------------------------------------------------------------------ */
/* 图片上传                                                            */
/* ------------------------------------------------------------------ */

/**
 * 只看文件头。声明的 MIME 是浏览器给的，改一下就能骗过去；
 * 文件头是文件内容的一部分，改了就不是那种格式了。
 */
function looksLike(buffer, mimeType) {
    if (buffer.length < 12) return false;
    switch (mimeType) {
        case 'image/png':
            return buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG';
        case 'image/jpeg':
            return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        case 'image/gif':
            return buffer.toString('ascii', 0, 4) === 'GIF8';
        case 'image/webp':
            return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
        default:
            return false;
    }
}

function mediaPath(extension) {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `${MEDIA_DIR}/${month}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
}

/**
 * 收一张 base64 图片，写进云存储，回给它能直接放进 <img src> 的公网地址。
 * 存储桶默认是公有读的，所以这一步拿到的 URL 天然可以被 <img> 直接引用。
 */
async function handleUpload(body, origin) {
    const mimeType = String(body.mimeType || '').toLowerCase();
    const extension = IMAGE_TYPES[mimeType];
    if (!extension) {
        return respond(400, { ok: false, message: '只支持 PNG / JPG / GIF / WebP 图片' }, origin);
    }

    const raw = String(body.data || '').replace(/^data:image\/[a-z+]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) {
        return respond(400, { ok: false, message: '图片内容是空的' }, origin);
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        return respond(413, {
            ok: false,
            message: `单张图片不能超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB，这张 ${(buffer.length / 1024 / 1024).toFixed(2)}MB`
        }, origin);
    }
    if (!looksLike(buffer, mimeType)) {
        return respond(400, { ok: false, message: '文件内容跟它声明的格式对不上，换张图试试' }, origin);
    }

    try {
        const path = mediaPath(extension);
        const result = await app.uploadFile({ cloudPath: path, fileContent: buffer });
        if (result && result.fileID) learnBucket(result.fileID);
        return respond(200, {
            ok: true,
            url: `https://${cdnBucket || guessBucket()}.tcb.qcloud.la/${path}`,
            bytes: buffer.length
        }, origin);
    } catch (error) {
        console.error('[content] 图片写入失败:', error);
        return respond(500, { ok: false, message: '图片没传上去，稍后再试一次。' }, origin);
    }
}

/** 并发读取多个区块，单个区块读失败不影响其余 */
async function readSections(keys) {
    const entries = await Promise.all(
        keys.map(async (key) => {
            try {
                return [key, await readJson(cloudPath(key))];
            } catch {
                return [key, null];
            }
        })
    );

    const sections = {};
    const updatedAt = {};
    entries.forEach(([key, data]) => {
        sections[key] = data || null;
        updatedAt[key] = data ? data.updatedAt || null : null;
    });
    return { sections, updatedAt };
}

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

exports.main = async (event = {}) => {
    const headers = event.headers || {};
    const origin = headers.origin || headers.Origin || '';

    if (event.httpMethod === 'OPTIONS') {
        return respond(204, {}, origin);
    }

    if (event.httpMethod === 'GET') {
        const asked = readQuery(event, 'section');
        if (asked) {
            if (!SECTION_KEYS.includes(asked)) {
                return respond(400, { ok: false, message: `没有 ${asked} 这个区块` }, origin);
            }
            const { sections, updatedAt } = await readSections([asked]);
            return respond(200, {
                ok: true,
                sections,
                updatedAt: updatedAt[asked]
            }, origin);
        }

        try {
            const { sections, updatedAt } = await readSections(SECTION_KEYS);
            return respond(200, { ok: true, sections, updatedAt }, origin);
        } catch {
            // 读不到就返回全空，前端沿用 HTML 里的静态内容，不会白屏
            const empty = {};
            SECTION_KEYS.forEach((key) => { empty[key] = null; });
            return respond(200, { ok: true, sections: empty, updatedAt: {} }, origin);
        }
    }

    if (event.httpMethod !== 'POST') {
        return respond(405, { ok: false, message: '仅支持 GET / POST 请求' }, origin);
    }

    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || '');
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
        return respond(413, { ok: false, message: '内容太大了' }, origin);
    }

    const body = parsePayload(event);

    /* ---- 上传一张图片：不进 JSON，单独落到 site/media/ 下 ---- */
    if (body.action === 'upload') {
        return handleUpload(body, origin);
    }

    /* 一次提交多个区块时，逐个校验：任一区块不合格就整批退回，
       免得出现「一半写进去一半没写进去」的状态 */
    const batch = body.sections && typeof body.sections === 'object'
        ? Object.keys(body.sections)
        : [String(body.section || '')];

    const targets = batch.filter((key) => SECTION_KEYS.includes(key));
    if (!targets.length) {
        return respond(400, {
            ok: false,
            message: `请指定要保存的区块，可选：${SECTION_KEYS.join(' / ')}`
        }, origin);
    }

    const allErrors = {};
    const prepared = [];

    targets.forEach((key) => {
        const source = body.sections ? body.sections[key] : body.content;
        const { ok, errors, content } = normalizeSection(key, source);
        if (!ok) {
            Object.keys(errors).forEach((name) => {
                allErrors[`${key}.${name}`] = errors[name];
            });
            return;
        }
        prepared.push({ key, content });
    });

    if (Object.keys(allErrors).length > 0) {
        return respond(400, { ok: false, message: '内容未通过校验', errors: allErrors }, origin);
    }

    try {
        const savedAt = Date.now();
        // 区块之间互不相干，可以放心并发写
        await Promise.all(
            prepared.map(({ key, content }) => writeJson(cloudPath(key), { ...content, updatedAt: savedAt }))
        );
        return respond(200, {
            ok: true,
            message: targets.length > 1 ? '区块已全部保存。' : '已保存，访客刷新即可看到。',
            saved: targets,
            savedAt
        }, origin);
    } catch (error) {
        console.error('[content] 区块写入失败:', error);
        return respond(500, { ok: false, message: '写入云端存储失败，请稍后重试。' }, origin);
    }
};
