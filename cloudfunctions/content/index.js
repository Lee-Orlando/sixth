/**
 * 「关于我」内容接口 —— 云存储版
 *
 * 为什么用云存储而不是数据库：
 *   这个环境开通的是 PostgreSQL，「数据模型」为空，node-sdk 的 rdb REST 接口要求
 *   显式指定数据连接器标识（dbLinkName），配置起来比存储本身还重。而本站点的数据量
 *   只有几百字节、每月写入不到几次，用 JSON 文件存最省事，也不受数据库类型限制。
 *
 * 存了什么：
 *   site/about.json  —— 页面内容，公开可读，本来就要展示给所有人
 *   site/cred/administrator-credential.json
 *                    —— 管理员账号与口令哈希
 *
 * 为什么凭据放在这里、以及里面刻意不放什么：
 *   环境的默认存储桶是公有读的，写进去的文件理论上谁都能下载，所以这个文件里
 *   不放任何能直接当钥匙用的东西——没有签名密钥，只有加盐哈希。
 *
 *   也因此没有采用「登录一次换一张凭证」的通行做法：凭证要靠签名密钥签发，
 *   而密钥一旦写进存储，等于把钥匙挂在门外，拿到文件的人不需要知道口令就能
 *   伪造出合法管理员。改成每次写操作都附上用户名与口令，由服务端重算哈希比对。
 *   攻击者拿到这个文件，得到的只是一串哈希，只能离线去猜。
 *
 *   代价是这样一套保护完全压在口令本身的强度上，所以接口里带了修改口令和
 *   拒绝常见弱口令的能力，别用能被秒猜出来的口令。
 *
 * 为什么失败计数要单独放一个文件：
 *   计数是典型的「读出来 → 改一下 → 整个写回」。若跟口令哈希挤在同一个文件，
 *   改完口令后紧接着的任意一次写操作，都可能把读到的旧对象整体写回，
 *   把刚更新的哈希盖掉。分开存，凭据就只在播种和改口令时才动。
 *
 * 安全底线（改动请一并遵守）：
 *   1. 口令不以明文落地，只存 PBKDF2-HMAC-SHA256 加随机盐的派生值。
 *   2. GET 只返回 about.json 的白名单字段，凭据文件的任何内容都不会出现在响应里。
 *   3. 校验永远发生在服务端，浏览器里做判断等于没有锁。
 *   4. 连续失败会被临时锁定，这是抵御爆破的关键一环，弱口令下尤其重要。
 *   5. 初始口令写在代码里只为让站点第一次就能用，登录后务必换掉。
 */

'use strict';

const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
    env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV
});

const CONTENT_FILE = 'site/about.json';
const CRED_FILE = 'site/cred/administrator-credential.json';
const GUARD_FILE = 'site/cred/login-guard.json';

/* 首次播种用的初始管理员。登录成功后请立刻换掉。 */
const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'admin';
const MIN_PASSWORD_LENGTH = 6;

/* 常见弱口令黑名单：既然保护全压在口令强度上，这一步不能省 */
const WEAK_PASSWORDS = [
    'admin', 'password', '123456', '12345678', '123456789', 'qwerty',
    '111111', '000000', 'abc123', 'iloveyou', 'root', 'letmein',
    'admin123', 'administrator', 'lyq', 'test', 'test123', '654321'
];

const PBKDF2_ITERATIONS = 120000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;

const PUBLIC_FIELDS = ['lead', 'more', 'school', 'role', 'available', 'city', 'skills'];
const LIMITS = {
    lead: 800,
    more: 800,
    school: 80,
    role: 80,
    available: 60,
    city: 60,
    skills: 300
};

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

/* ------------------------------------------------------------------ */
/* 口令                                                                */
/* ------------------------------------------------------------------ */

/** 常量时间比较：长度不同直接返回 false，避免泄漏「前几位是对的」这类信息 */
function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function derivePassword(password, salt, iterations) {
    return crypto
        .pbkdf2Sync(String(password), salt, iterations, KEY_LENGTH, 'sha256')
        .toString('hex');
}

function createAdminRecord(username, password) {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    return {
        username,
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: derivePassword(password, salt, PBKDF2_ITERATIONS),
        // 播种出来的初始口令属于半公开信息，标记下来好提醒管理员换掉
        seeded: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

function credentialsMatch(admin, username, password) {
    if (!safeEqual(username || '', admin.username)) return false;
    const expected = derivePassword(password, admin.salt, admin.iterations || PBKDF2_ITERATIONS);
    return safeEqual(expected, admin.hash || '');
}

function isWeakPassword(password) {
    const lower = String(password).toLowerCase();
    if (WEAK_PASSWORDS.includes(lower)) return true;
    // 纯数字、或用户名倒着写这类也没什么强度
    if (/^\d+$/.test(lower)) return true;
    return false;
}

/* ------------------------------------------------------------------ */
/* 云存储读写                                                            */
/* ------------------------------------------------------------------ */

/**
 * 存储桶域名。首次靠约定格式猜，之后每次上传都会取到真实值覆盖上去，
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

/**
 * 直接走 CDN 源地址并缀一个一次性参数读取。
 *
 * 同名文件的下载结果会被 CDN 缓存若干分钟，结果是「保存成功，但自己和访客
 * 看到的还是上一版」。带上时间戳参数可以跳过缓存，拿到的是刚写进去的那份。
 */
async function fetchFresh(cloudPath) {
    const host = cdnBucket || guessBucket();
    const url = `https://${host}.tcb.qcloud.la/${cloudPath}?_=${Date.now()}`;
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        return JSON.parse(await response.text());
    } catch {
        return null;
    }
}

async function readJson(cloudPath) {
    const fresh = await fetchFresh(cloudPath);
    if (fresh) return fresh;

    // CDN 域名规则万一变了，退回 SDK 的下载通道
    const env = process.env.TCB_ENV || '';
    const appId = process.env.TENCENTCLOUD_APPID || '';
    const candidates = [
        `cloud://${env}.${cdnBucket || guessBucket()}/${cloudPath}`,
        `cloud://${env}.${env}-${appId}/${cloudPath}`,
        `cloud://${env}.6d79-${env}/${cloudPath}`
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

async function writeJson(cloudPath, data) {
    const result = await app.uploadFile({
        cloudPath,
        fileContent: Buffer.from(JSON.stringify(data, null, 2), 'utf8')
    });
    if (result && result.fileID) learnBucket(result.fileID);
    return result;
}

/* ------------------------------------------------------------------ */
/* 凭据与计数                                                            */
/* ------------------------------------------------------------------ */

async function ensureAdmin() {
    const stored = await readJson(CRED_FILE);
    if (stored && stored.hash) return stored;

    // 第一次跑：用初始口令播种，往后凭据就在这个文件里，改也在这里改
    const created = createAdminRecord(SEED_USERNAME, SEED_PASSWORD);
    await writeJson(CRED_FILE, created);
    return created;
}

async function persistAdmin(admin) {
    admin.updatedAt = Date.now();
    await writeJson(CRED_FILE, admin);
}

async function readGuard() {
    const stored = await readJson(GUARD_FILE);
    if (stored && typeof stored === 'object' && 'failedCount' in stored) return stored;
    return { failedCount: 0, lockedUntil: 0 };
}

async function writeGuard(guard) {
    guard.updatedAt = Date.now();
    await writeJson(GUARD_FILE, guard);
}

/**
 * 统一的身份校验。口令不对就顺带累计失败次数，达到上限临时锁定。
 * 返回 null 表示通过，否则返回可直接下发给前端的错误响应。
 */
async function guardCredentials(username, password, origin) {
    const guard = await readGuard();

    if (guard.lockedUntil && guard.lockedUntil > Date.now()) {
        const remain = Math.ceil((guard.lockedUntil - Date.now()) / 1000);
        return respond(429, { ok: false, message: `口令连续输错多次，请 ${remain} 秒后再试。` }, origin);
    }

    const admin = await ensureAdmin();
    if (!credentialsMatch(admin, username, password)) {
        guard.failedCount = (guard.failedCount || 0) + 1;
        if (guard.failedCount >= MAX_FAILED_ATTEMPTS) {
            guard.lockedUntil = Date.now() + LOCK_DURATION_MS;
            guard.failedCount = 0;
        }
        await writeGuard(guard);
        return respond(401, { ok: false, message: '用户名或口令不正确' }, origin);
    }

    if (guard.failedCount || guard.lockedUntil) {
        guard.failedCount = 0;
        guard.lockedUntil = 0;
        await writeGuard(guard);
    }

    return null;
}

/* ------------------------------------------------------------------ */
/* 内容校验                                                              */
/* ------------------------------------------------------------------ */

/** 只保留白名单字段，避免有人借接口往存储里塞别的东西 */
function normalizeContent(raw) {
    const errors = {};
    const content = {};

    PUBLIC_FIELDS.forEach((field) => {
        const value = typeof raw[field] === 'string' ? raw[field].trim() : '';
        if (value.length > LIMITS[field]) {
            errors[field] = `${field} 超过 ${LIMITS[field]} 字上限`;
            return;
        }
        content[field] = value;
    });

    return { ok: Object.keys(errors).length === 0, errors, content };
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
        try {
            const content = await readJson(CONTENT_FILE);
            return respond(200, {
                ok: true,
                content: content || null,
                updatedAt: content ? content.updatedAt || null : null
            }, origin);
        } catch {
            // 拿不到就返回空，前端会沿用 HTML 里的静态内容，不会白屏
            return respond(200, { ok: true, content: null, updatedAt: null }, origin);
        }
    }

    if (event.httpMethod !== 'POST') {
        return respond(405, { ok: false, message: '仅支持 GET / POST 请求' }, origin);
    }

    const body = parsePayload(event);
    const action = String(body.action || '');
    const username = String(body.username || '');
    const password = String(body.password || '');

    /* ---- 验证口令（不产生凭证，只回答「这对不对」）---- */
    if (action === 'verify') {
        const rejected = await guardCredentials(username, password, origin);
        if (rejected) return rejected;

        const admin = await ensureAdmin();
        return respond(200, {
            ok: true,
            username: admin.username,
            // 还在用播种出来的初始口令时如实说明，前端据此提醒更换
            usingSeedPassword: admin.seeded === true
        }, origin);
    }

    /* ---- 修改口令 ---- */
    if (action === 'changePassword') {
        const rejected = await guardCredentials(username, password, origin);
        if (rejected) return rejected;

        const next = String(body.newPassword || '');
        if (next.length < MIN_PASSWORD_LENGTH) {
            return respond(400, { ok: false, message: `新口令至少 ${MIN_PASSWORD_LENGTH} 位` }, origin);
        }
        if (isWeakPassword(next)) {
            return respond(400, {
                ok: false,
                message: '这个口令太容易猜，换一个带字母、数字和符号的组合。'
            }, origin);
        }

        const admin = await ensureAdmin();
        admin.salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
        admin.hash = derivePassword(next, admin.salt, admin.iterations || PBKDF2_ITERATIONS);
        admin.seeded = false;
        await persistAdmin(admin);

        return respond(200, { ok: true, message: '口令已更新，下次用新口令登录。' }, origin);
    }

    /* ---- 保存内容 ---- */
    if (action === 'save') {
        const rejected = await guardCredentials(username, password, origin);
        if (rejected) return rejected;

        const { ok, errors, content } = normalizeContent(body.content || {});
        if (!ok) {
            return respond(400, { ok: false, message: '内容未通过校验', errors }, origin);
        }

        try {
            await writeJson(CONTENT_FILE, { ...content, updatedAt: Date.now() });
            return respond(200, { ok: true, message: '已保存，访客刷新即可看到。' }, origin);
        } catch (error) {
            console.error('[content] 内容写入失败:', error);
            return respond(500, { ok: false, message: '写入云端存储失败，请稍后重试。' }, origin);
        }
    }

    return respond(400, { ok: false, message: '不支持的操作' }, origin);
};
