/**
 * 联系表单云函数
 *
 * 部署方式：CloudBase CLI `tcb fn deploy contact`，或在控制台新建云函数后上传此目录。
 * 触发方式：HTTP 触发（云函数 -> HTTP 访问服务），前端用 fetch POST 到该路径。
 *
 * 入参：HTTP 触发器传入的 event 形如 { body, headers, httpMethod, queryStringParameters }，
 *       body 在 application/json 下为字符串，在 form-urlencoded 下为 key=value&...。
 * 出参：{ statusCode, headers, body(JSON 字符串) }，便于直接作为 HTTP 集成响应。
 *
 * 为什么写进云存储而不是数据库：
 *   本环境开通的是 PostgreSQL，node-sdk 面向下一代环境的 rdb REST 接口要求显式
 *   指定数据连接器标识，而本站点每月留言量有限。按月归档到
 *   site/messages/YYYY-MM.json 既免去了连接器配置，也便于直接下载查看。
 */

'use strict';

const cloudbase = require('@cloudbase/node-sdk');

// 使用当前云函数所属环境，免去在每个环境里改 env id
const app = cloudbase.init({
    env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV
});

const LIMITS = { name: 60, email: 120, message: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * 统一响应。CORS 头在这里直接给出，省得前端被同源策略拦住。
 * 注意：若控制台的 HTTP 触发服务已自行配置 CORS，重复设置不会冲突。
 */
function respond(statusCode, payload, origin) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(payload)
    };
}

/**
 * 把 HTTP 触发器的 event 还原成普通对象。
 */
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
    for (const pair of text.split('&')) {
        const index = pair.indexOf('=');
        if (index < 0) continue;
        const key = decodeURIComponent(pair.slice(0, index).replace(/\+/g, ' '));
        const value = decodeURIComponent(pair.slice(index + 1).replace(/\+/g, ' '));
        result[key] = value;
    }
    return result;
}

/**
 * 存储桶域名。首次靠约定格式猜，之后每次上传都会取到真实值覆盖，
 * 万一平台换了规则也能自愈。
 */
let cdnBucket = '';

function monthPath(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `site/messages/${year}-${month}.json`;
}

function guessBucket() {
    const env = process.env.TCB_ENV || '';
    const appId = process.env.TENCENTCLOUD_APPID || '';
    return `6d79-${env}-${appId}`;
}

function learnBucket(fileID) {
    // cloud://<env>.<bucket>/<path...> —— 取第二段即桶名。
    // 只对 / 做切分、不连带目录，避免拼出来的路径多出一层。
    const parts = String(fileID).split('/');
    if (parts.length >= 3) {
        const host = parts[2];
        const dot = host.indexOf('.');
        if (dot > 0) cdnBucket = host.slice(dot + 1);
    }
}

/**
 * 读 CDN 源地址并缀一次性参数。
 * 同名文件的下载结果会被 CDN 缓存若干分钟，追加留言前若读到旧副本，
 * 就会把新留言覆盖写丢。加时间戳跳过缓存可以避免这一点。
 */
async function fetchFresh(cloudPath) {
    const url = `https://${cdnBucket || guessBucket()}.tcb.qcloud.la/${cloudPath}?_=${Date.now()}`;
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

/** 读不到就当成「这个月还没有留言」，返回空数组 */
async function readMessages(cloudPath) {
    const fresh = await fetchFresh(cloudPath);
    if (fresh !== null) {
        const parsed = fresh;
        return Array.isArray(parsed) ? parsed : (parsed.items || []);
    }

    // CDN 域名规则万一变了，退回 SDK 下载
    const env = process.env.TCB_ENV || '';
    try {
        const result = await app.downloadFile({
            fileID: `cloud://${env}.${cdnBucket || guessBucket()}/${cloudPath}`
        });
        const content = result && result.fileContent;
        if (!content) return [];
        const parsed = JSON.parse(Buffer.from(content).toString('utf8'));
        return Array.isArray(parsed) ? parsed : (parsed.items || []);
    } catch {
        return [];
    }
}

async function writeMessages(cloudPath, items) {
    const result = await app.uploadFile({
        cloudPath,
        fileContent: Buffer.from(JSON.stringify(items, null, 2), 'utf8')
    });
    if (result && result.fileID) learnBucket(result.fileID);
    return result;
}

/**
 * 服务端二次校验。前端校验是为了体验，服务端校验是为了数据安全，两者都不能省。
 * 返回 { ok, errors }
 */
function validate(raw) {
    const errors = {};
    const pick = (value) => (typeof value === 'string' ? value.trim() : '');

    const name = pick(raw.name);
    const email = pick(raw.email);
    const message = pick(raw.message);

    if (name.length < 2) errors.name = '姓名至少 2 个字符';
    else if (name.length > LIMITS.name) errors.name = `姓名不能超过 ${LIMITS.name} 个字符`;

    if (!EMAIL_RE.test(email)) errors.email = '邮箱格式不正确';
    else if (email.length > LIMITS.email) errors.email = '邮箱过长';

    if (message.length < 10) errors.message = '留言至少 10 个字符';
    else if (message.length > LIMITS.message) errors.message = `留言不能超过 ${LIMITS.message} 个字符`;

    return {
        ok: Object.keys(errors).length === 0,
        errors,
        data: { name, email, message }
    };
}

exports.main = async (event = {}, context = {}) => {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';

    // 浏览器跨域预检
    if (event.httpMethod === 'OPTIONS') {
        return respond(204, {}, origin);
    }

    if (event.httpMethod && event.httpMethod !== 'POST') {
        return respond(405, { ok: false, message: '仅支持 POST 请求' }, origin);
    }

    const { ok, errors, data } = validate(parsePayload(event));
    if (!ok) {
        return respond(400, { ok: false, message: '提交内容未通过校验', errors }, origin);
    }

    // 留言是个人隐私数据，不写进公开路径；按月归档便于日后整月下载备份
    try {
        const cloudPath = monthPath(new Date());
        const items = await readMessages(cloudPath);
        const record = {
            name: data.name,
            email: data.email,
            message: data.message,
            // 记录来源，方便日后区分哪个引流渠道有效
            ua: (event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '',
            ip: event.requestContext?.sourceIp || '',
            createdAt: Date.now()
        };
        items.push(record);

        await writeMessages(cloudPath, items);

        return respond(201, {
            ok: true,
            message: '留言已收到，我会尽快回复你。',
            id: `${cloudPath}#${items.length - 1}`
        }, origin);
    } catch (error) {
        console.error('[contact] 写入云存储失败:', error);
        return respond(500, {
            ok: false,
            message: '服务暂时不可用，请稍后再试或直接发邮件联系我。'
        }, origin);
    }
};
