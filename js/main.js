/**
 * Lyq 个人站点 - 交互脚本
 * 无全局污染：所有逻辑包在 IIFE 中，通过事件委托与单一入口注册。
 */

(() => {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /**
     * 用 requestAnimationFrame 节流回调，保证每帧最多执行一次。
     */
    function rafThrottle(fn) {
        let ticking = false;
        return (...args) => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                fn(...args);
                ticking = false;
            });
        };
    }

    /* ---------------- Hero 粒子背景 ---------------- */

    const PARTICLE_CONFIG = {
        count: 80,
        color: '#ffd700',
        lineColor: '#ffd700',
        lineDistance: 150,
        lineWidth: 1,
        baseOpacity: 0.5,
        radius: 3,
        speed: 2
    };

    function createParticles(container) {
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let particles = [];
        let width = 0;
        let height = 0;
        let frameId = null;

        function resize() {
            width = container.offsetWidth;
            height = container.offsetHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function seed() {
            particles = Array.from({ length: PARTICLE_CONFIG.count }, () => {
                const angle = Math.random() * Math.PI * 2;
                const velocity = (Math.random() + 0.2) * PARTICLE_CONFIG.speed;
                return {
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: Math.cos(angle) * velocity,
                    vy: Math.sin(angle) * velocity,
                    radius: Math.random() * PARTICLE_CONFIG.radius + PARTICLE_CONFIG.radius / 2,
                    opacity: Math.random() * PARTICLE_CONFIG.baseOpacity + 0.1
                };
            });
        }

        function step() {
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x <= 0 || p.x >= width) p.vx *= -1;
                if (p.y <= 0 || p.y >= height) p.vy *= -1;
            }
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);

            for (const p of particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = PARTICLE_CONFIG.color;
                ctx.globalAlpha = p.opacity;
                ctx.fill();
            }

            const { lineDistance, lineColor, lineWidth } = PARTICLE_CONFIG;
            for (let i = 0; i < particles.length; i += 1) {
                for (let j = i + 1; j < particles.length; j += 1) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.hypot(dx, dy);
                    if (dist >= lineDistance) continue;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = lineColor;
                    ctx.lineWidth = lineWidth;
                    ctx.globalAlpha = 0.4 * (1 - dist / lineDistance);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        }

        function loop() {
            step();
            draw();
            frameId = window.requestAnimationFrame(loop);
        }

        function start() {
            if (frameId !== null) return;
            loop();
        }

        function stop() {
            if (frameId === null) return;
            window.cancelAnimationFrame(frameId);
            frameId = null;
        }

        resize();
        seed();
        draw();

        const onResize = rafThrottle(() => {
            resize();
            seed();
            draw();
        });
        window.addEventListener('resize', onResize, { passive: true });

        return {
            start,
            stop,
            redraw() {
                resize();
                seed();
                draw();
            }
        };
    }

    function initParticles() {
        const container = document.getElementById('particles-js');
        if (!container) return;

        const field = createParticles(container);

        // 尊重系统「减少动态效果」偏好：只渲染一帧静态星空，不启动动画循环
        if (prefersReducedMotion) return;

        field.start();
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) field.stop();
            else field.start();
        });

        // 首屏滚出视口后停止绘制，避免无谓的 CPU/GPU 消耗
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) field.start();
                else field.stop();
            });
        }, { threshold: 0 });
        observer.observe(container);
    }

    /* ---------------- 导航：吸顶、移动端开合、滚动高亮 ---------------- */

    function initNavigation() {
        const header = document.getElementById('mainHeader');
        const nav = document.getElementById('mainNav');
        const hamburger = document.getElementById('hamburger');
        if (!header || !nav || !hamburger) return;

        const sections = Array.from(document.querySelectorAll('main section[id]'));
        const navLinks = Array.from(nav.querySelectorAll('a'));

        const closeNav = () => {
            nav.classList.remove('active');
            hamburger.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.setAttribute('aria-label', '打开导航菜单');
        };

        const toggleNav = () => {
            const opened = nav.classList.toggle('active');
            hamburger.classList.toggle('active', opened);
            hamburger.setAttribute('aria-expanded', String(opened));
            hamburger.setAttribute('aria-label', opened ? '关闭导航菜单' : '打开导航菜单');
        };

        hamburger.addEventListener('click', toggleNav);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && nav.classList.contains('active')) {
                closeNav();
                hamburger.focus();
            }
        });

        nav.addEventListener('click', (event) => {
            if (event.target.closest('a')) closeNav();
        });

        document.addEventListener('click', (event) => {
            if (!nav.classList.contains('active')) return;
            if (nav.contains(event.target) || hamburger.contains(event.target)) return;
            closeNav();
        });

        const updateState = () => {
            const scrolled = window.scrollY > 50;
            header.classList.toggle('scrolled', scrolled);

            const triggerY = window.scrollY + header.offsetHeight + 20;
            let currentId = sections[0]?.id ?? '';
            for (const section of sections) {
                if (section.offsetTop <= triggerY) currentId = section.id;
            }

            navLinks.forEach((link) => {
                const active = link.getAttribute('href') === `#${currentId}`;
                link.classList.toggle('active', active);
                if (active) link.setAttribute('aria-current', 'true');
                else link.removeAttribute('aria-current');
            });
        };

        const onScroll = rafThrottle(updateState);
        window.addEventListener('scroll', onScroll, { passive: true });
        updateState();
    }

    /* ---------------- 平滑滚动（考虑吸顶 header 高度） ---------------- */

    function initSmoothScroll() {
        const anchors = Array.from(document.querySelectorAll('#mainNav a, .cta-button'));

        anchors.forEach((anchor) => {
            anchor.addEventListener('click', (event) => {
                const target = document.querySelector(anchor.getAttribute('href'));
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({
                    behavior: prefersReducedMotion ? 'auto' : 'smooth',
                    block: 'start'
                });
                try {
                    history.replaceState(null, '', anchor.getAttribute('href'));
                } catch {
                    // file:// 协议下部分浏览器禁止修改 history，忽略即可
                }
            });
        });
    }

    /* ---------------- 滚动淡入 ---------------- */

    function initFadeIn() {
        const targets = document.querySelectorAll('.fade-in-section');
        if (!targets.length) return;

        if (!('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries, instance) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                instance.unobserve(entry.target);
            });
        }, { threshold: 0.2, rootMargin: '0px 0px -100px 0px' });

        targets.forEach((el) => observer.observe(el));
    }

    /* ---------------- 联系表单：前端校验 + 无障碍反馈 ---------------- */

    const VALIDATORS = {
        name(value) {
            const trimmed = value.trim();
            if (!trimmed) return '请填写您的姓名';
            if (trimmed.length < 2) return '姓名至少 2 个字符';
            return '';
        },
        email(value) {
            const trimmed = value.trim();
            if (!trimmed) return '请填写您的邮箱';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return '邮箱格式看起来不太对';
            return '';
        },
        message(value) {
            const trimmed = value.trim();
            if (!trimmed) return '留言内容不能为空';
            if (trimmed.length < 10) return '再多写几句吧，至少 10 个字符';
            return '';
        }
    };

    /**
     * 站点配置来自 site.config.js（含真实云函数地址，被 gitignore 排除，不进公开仓库）。
     * 没有这个文件就退回 index.html 的 meta 兜底值；两者都为空即视为「还没开通」。
     * 注意：这里只接受 http/https，避免有人在配置里塞 javascript: 之类的伪协议。
     */
    function readConfigValue(key) {
        const config = window.SITE_CONFIG;
        if (!config || typeof config !== 'object') return '';
        const value = config[key];
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        return /^https?:\/\//i.test(trimmed) ? trimmed : '';
    }

    /**
     * 联系表单的云函数地址。留空则不开通线上提交能力（而不是假装成功）。
     */
    function readContactEndpoint() {
        const configured = readConfigValue('contactEndpoint');
        if (configured) return configured;
        const meta = document.querySelector('meta[name="contact-endpoint"]');
        return meta ? meta.content.trim() : '';
    }

    function showStatus(statusBox, message, tone) {
        statusBox.textContent = message;
        statusBox.hidden = false;
        statusBox.classList.remove('is-error', 'is-success');
        if (tone) statusBox.classList.add(`is-${tone}`);
    }

    const FALLBACK_CONTACT = '你可以直接发邮件到 18546266901@163.com。';

    /**
     * 真正把留言发到云函数。
     * 三种结果都要能被用户看见：成功、服务端拒绝、网络失败。
     */
    async function sendToEndpoint({ form, fields, statusBox, setError, endpoint }) {
        const button = form.querySelector('button[type="submit"]');
        const originalLabel = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = '发送中…';
        }
        statusBox.hidden = true;

        const payload = {
            name: form.elements.name.value.trim(),
            email: form.elements.email.value.trim(),
            message: form.elements.message.value.trim()
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // 网关异常时可能返回 HTML，解析失败要能兜住而不是抛给用户
            let result = null;
            try {
                result = await response.json();
            } catch {
                result = null;
            }

            if (response.ok && result && result.ok) {
                form.reset();
                fields.forEach((field) => setError(field, ''));
                showStatus(statusBox, result.message || '留言已收到，我会尽快回复你。', 'success');
                return;
            }

            // 服务端给出了字段级错误，回填到对应输入框而不是笼统报错
            if (result && result.errors) {
                let focused = false;
                fields.forEach((field) => {
                    const message = result.errors[field.name];
                    if (!message) return;
                    setError(field, message);
                    if (!focused) {
                        field.input.focus();
                        focused = true;
                    }
                });
                showStatus(statusBox, result.message || '有几项内容需要修改一下。', 'error');
                return;
            }

            showStatus(statusBox, (result && result.message) || `发送失败（${response.status}），请稍后再试。${FALLBACK_CONTACT}`, 'error');
        } catch {
            showStatus(statusBox, `网络不太顺畅，留言没能发出去。${FALLBACK_CONTACT}`, 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalLabel;
            }
        }
    }

    function initContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) return;

        const statusBox = document.getElementById('formStatus');
        const fields = ['name', 'email', 'message'].map((name) => {
            const input = form.elements[name];
            return { name, input, error: document.getElementById(`${name}Error`) };
        });

        function setError({ input, error }, message) {
            if (message) {
                input.setAttribute('aria-invalid', 'true');
                error.textContent = message;
                error.hidden = false;
                return false;
            }
            input.removeAttribute('aria-invalid');
            error.textContent = '';
            error.hidden = true;
            return true;
        }

        function validateField(field) {
            return setError(field, VALIDATORS[field.name](field.input.value));
        }

        fields.forEach((field) => {
            field.input.addEventListener('blur', () => validateField(field));
            field.input.addEventListener('input', () => {
                if (field.input.getAttribute('aria-invalid') === 'true') validateField(field);
            });
        });

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const firstInvalid = fields.find((field) => !validateField(field));
            if (firstInvalid) {
                statusBox.hidden = true;
                firstInvalid.input.focus();
                return;
            }

            const endpoint = readContactEndpoint();
            if (!endpoint) {
                // 还没有部署云函数：如实告知，不要伪装成提交成功
                showStatus(
                    statusBox,
                    `在线留言还没开通，${FALLBACK_CONTACT}`,
                    'error'
                );
                return;
            }

            sendToEndpoint({ form, fields, statusBox, setError, endpoint });
        });
    }

    /* ---------------- 站点内容：按区块读写 + 管理面板 ---------------- */

    /**
     * 一张表定义整站可管理的内容：SEO 之外的文案、技能、自建空间都在这里。
     * 加一个新区块的流程：① HTML 里放一段带 data-section 的默认内容
     *                    ② 这里加一条 ③ 云函数 content/index.js 的 NORMALIZERS 里加一个整理函数
     * 字段层面的 type 目前有三种：text（默认）、textarea、tags（数组）；
     * url: true 的字段会被当成链接处理，只接受 http/https。
     */
    const SECTIONS = [
        {
            key: 'hero',
            label: '首屏',
            fields: [
                { name: 'title', label: '主标题', max: 60 },
                { name: 'subtitle', label: '副标题', type: 'textarea', rows: 2, max: 160 },
                { name: 'ctaText', label: '按钮文字', max: 24 }
            ]
        },
        {
            key: 'about',
            label: '关于我',
            fields: [
                { name: 'lead', label: '第一段自我介绍', type: 'textarea', rows: 3, max: 800 },
                { name: 'more', label: '第二段自我介绍', type: 'textarea', rows: 3, max: 800 }
            ]
        },
        {
            key: 'skills',
            label: '技能',
            fields: [
                { name: 'items', label: '技能标签', type: 'tags', hint: '逗号或顿号分隔，最多 24 项', maxItems: 24, itemMax: 24 }
            ]
        },
        {
            key: 'spaces',
            label: '空间',
            list: {
                label: '空间',
                maxItems: 12,
                fields: [
                    { name: 'name', label: '空间名字', max: 40, placeholder: '例如：读书笔记 / 摄影 / 项目记录' }
                ],
                // 每个空间除了这些字段，还能往下塞文字块和图片块
                blocks: true
            }
        },
        {
            key: 'contact',
            label: '联系方式',
            fields: [
                { name: 'intro', label: '引导语', type: 'textarea', rows: 2, max: 200 },
                { name: 'email', label: '邮箱', max: 120 },
                { name: 'github', label: 'GitHub 主页', max: 300, url: true, placeholder: 'https://github.com/…' }
            ]
        },
        {
            key: 'footer',
            label: '页脚',
            fields: [
                { name: 'note', label: '版权文字', max: 160 }
            ]
        }
    ];

    const TAGS_SEPARATOR = /[,，、]/;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function sectionByKey(key) {
        return SECTIONS.find((section) => section.key === key) || null;
    }

    function readContentEndpoint() {
        const configured = readConfigValue('contentEndpoint');
        if (configured) return configured;
        const meta = document.querySelector('meta[name="content-endpoint"]');
        return meta ? meta.content.trim() : '';
    }

    /** 把 "a、b, c" 这样的输入收成数组；后端也会这么切，两边保持一致 */
    function parseTags(value) {
        return String(value || '')
            .split(TAGS_SEPARATOR)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    /**
     * 只认 http/https。内容来源是公开可写的接口，
     * 不拦一道的话，一条 javascript: 开头的链接就能在访客点击时执行脚本。
     */
    function safeUrl(value) {
        const url = String(value || '').trim();
        return /^https?:\/\/\S+$/i.test(url) ? url : '';
    }

    function emptyData(section) {
        if (section.list) return { items: [] };
        const data = {};
        section.fields.forEach((field) => {
            data[field.name] = field.type === 'tags' ? [] : '';
        });
        return data;
    }

    /* ---- 默认内容：写在 HTML 里，禁用 JS 时页面照样完整 ---- */

    function sectionRoot(key) {
        return document.querySelector(`[data-section="${key}"]`);
    }

    function readTagsFromNode(node) {
        if (!node) return [];
        return Array.from(node.children)
            .map((child) => child.textContent.trim())
            .filter(Boolean);
    }

    /**
     * 读一个字段的默认值。链接类字段要从 href 里取，文本类取 textContent；
     * mailto 链接还得把 mailto: 和后面的 subject 参数剥掉才是邮箱本身。
     */
    function readFieldValue(field, node) {
        if (field.type === 'tags') return readTagsFromNode(node);
        if (!node) return '';

        if (node.tagName === 'A') {
            const href = node.getAttribute('href') || '';
            if (field.url) return href;
            if (href.startsWith('mailto:')) {
                return decodeURIComponent(href.slice('mailto:'.length).split('?')[0]);
            }
            return node.textContent.trim();
        }

        return node.textContent.trim();
    }

    function readSectionFromDom(section) {
        const root = sectionRoot(section.key);
        if (!root) return emptyData(section);

        if (section.list) {
            const cards = Array.from(root.children);
            return {
                items: cards.map((card) => {
                    const item = {};
                    section.list.fields.forEach((field) => {
                        item[field.name] = readFieldValue(field, card.querySelector(`[data-field="${field.name}"]`));
                    });
                    return item;
                })
            };
        }

        const data = {};
        section.fields.forEach((field) => {
            data[field.name] = readFieldValue(field, root.querySelector(`[data-field="${field.name}"]`));
        });
        return data;
    }

    function readDefaults() {
        const defaults = {};
        SECTIONS.forEach((section) => {
            defaults[section.key] = readSectionFromDom(section);
        });
        return defaults;
    }

    /* ---- 把内容画到页面上 ---- */

    function renderTags(node, items) {
        if (!node) return;
        node.textContent = '';
        items.forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            node.appendChild(li);
        });
    }

    /* ---- 空间：管理员自己建的容器，里面按顺序摆文字块和图片块 ---- */

    function renderTextBlock(block) {
        const text = String((block && block.value) || '').trim();
        // 空块不渲染，免得页面上留一个个看不见的段落
        if (!text) return null;

        const p = document.createElement('p');
        p.className = 'space-text';
        p.textContent = text;
        return p;
    }

    function renderImageBlock(block) {
        const url = safeUrl(block && block.url);
        if (!url) return null;

        const figure = document.createElement('figure');
        figure.className = 'space-media';

        const img = document.createElement('img');
        img.src = url;
        img.alt = String((block && block.alt) || '');
        // 图片可能有好几张，别让它们挡住后面的内容渲染
        img.loading = 'lazy';
        img.decoding = 'async';
        figure.appendChild(img);

        const caption = String((block && block.alt) || '').trim();
        if (caption) {
            const figcaption = document.createElement('figcaption');
            figcaption.textContent = caption;
            figure.appendChild(figcaption);
        }

        return figure;
    }

    function renderSpaceCard(space) {
        const card = document.createElement('article');
        card.className = 'space-card';

        const name = String((space && space.name) || '').trim();
        if (name) {
            const title = document.createElement('h3');
            title.className = 'space-title';
            title.textContent = name;
            card.appendChild(title);
        }

        (space.blocks || []).forEach((block) => {
            const node = block && block.type === 'image' ? renderImageBlock(block) : renderTextBlock(block);
            if (node) card.appendChild(node);
        });

        return card;
    }

    /** 一个空间都没有时，整块收起来，别留一片空白 Section */
    function toggleSpacesSection(items) {
        const host = document.getElementById('spaces');
        if (host) host.hidden = !(items && items.length);
    }

    function applySection(key, data, defaults) {
        const section = sectionByKey(key);
        const root = sectionRoot(key);
        if (!section || !root) return;

        const fallback = defaults[key] || emptyData(section);
        const source = data || {};

        if (section.list) {
            // 云端返回空数组时要尊重它：管理员可能真的把空间全删了
            const items = Array.isArray(source.items) ? source.items : fallback.items;
            root.textContent = '';
            items.forEach((item) => root.appendChild(renderSpaceCard(item)));
            toggleSpacesSection(items);
            return;
        }

        section.fields.forEach((field) => {
            // 邮箱和 GitHub 落到多处（联系区 + 页脚图标），统一交给下面的 extras 处理
            if (key === 'contact' && (field.name === 'email' || field.name === 'github')) return;

            if (field.type === 'tags') {
                const items = Array.isArray(source[field.name]) ? source[field.name] : fallback[field.name];
                renderTags(root.querySelector(`[data-field="${field.name}"]`), items || []);
                return;
            }

            const node = root.querySelector(`[data-field="${field.name}"]`);
            if (!node) return;
            // 文案留空就顶上默认内容，免得页面上出现一块说不清的空白
            node.textContent = String(source[field.name] || '').trim() || String(fallback[field.name] || '');
        });

        if (key === 'contact') applyContactExtras(source, fallback);
    }

    /** 把 https://github.com/Lee-Orlando/ 显示成 Lee-Orlando，链接该给机器，名字该给人看 */
    function shortHandle(url) {
        return String(url || '')
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/+$/, '');
    }

    /**
     * 邮箱和 GitHub 不止出现在一处：联系区的两行直连方式、页脚的两个圆形图标
     * 都读同一份数据，改一次要三处同时变，否则会出现「页脚邮件还是旧地址」这种事。
     */
    function applyContactExtras(source, fallback) {
        const root = sectionRoot('contact');
        const email = String(source.email || fallback.email || '').trim();
        const github = safeUrl(source.github || fallback.github);
        const subject = encodeURIComponent('来自个人站点的留言');

        const emailNode = root && root.querySelector('[data-field="email"]');
        if (emailNode && email) {
            emailNode.textContent = email;
            if (emailNode.tagName === 'A') {
                emailNode.href = `mailto:${email}?subject=${subject}`;
                emailNode.setAttribute('aria-label', `发送邮件到 ${email}`);
            }
        }

        const githubNode = root && root.querySelector('[data-field="github"]');
        if (githubNode && github) {
            githubNode.textContent = shortHandle(github);
            githubNode.href = github;
            githubNode.setAttribute('aria-label', `GitHub 主页：${shortHandle(github)}`);
        }

        const mailLink = document.getElementById('footerEmail');
        if (mailLink) {
            if (email) {
                mailLink.href = `mailto:${email}?subject=${subject}`;
                mailLink.setAttribute('aria-label', `发送邮件到 ${email}`);
            } else {
                mailLink.hidden = true;
            }
        }

        const githubLink = document.getElementById('footerGithub');
        if (githubLink) {
            if (github) {
                githubLink.href = github;
                githubLink.setAttribute('aria-label', `GitHub 主页：${shortHandle(github)}`);
            } else {
                githubLink.hidden = true;
            }
        }
    }

    /* ---- 与云端通信 ---- */

    async function fetchSections(endpoint) {
        try {
            const response = await fetch(endpoint, { method: 'GET' });
            const data = await response.json();
            if (!response.ok || !data || !data.ok || !data.sections) return null;
            return data.sections;
        } catch {
            // 接口不通就沿用 HTML 里的静态内容，页面不会白屏
            return null;
        }
    }

    async function pushSection(endpoint, key, content) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section: key, content })
            });
            const data = await response.json().catch(() => null);

            if (response.ok && data && data.ok) {
                return { ok: true, message: data.message || '已保存' };
            }
            return {
                ok: false,
                errors: (data && data.errors) || null,
                message: (data && data.message) || `保存失败（${response.status}）`
            };
        } catch {
            return { ok: false, message: '网络不太顺畅，没能连上云端。' };
        }
    }

    /* ---- 管理面板 ---- */

    function initContentManager() {
        const fab = document.getElementById('adminFab');
        const panel = document.getElementById('adminPanel');
        if (!fab || !panel) return;

        const tabsHost = document.getElementById('adminTabs');
        const panesHost = document.getElementById('adminPanes');
        const form = document.getElementById('adminForm');
        const hint = document.getElementById('adminPanelHint');
        const closeButton = document.getElementById('adminPanelClose');
        if (!tabsHost || !panesHost || !form || !hint || !closeButton) return;

        const endpoint = readContentEndpoint();
        const defaults = readDefaults();
        const published = clone(defaults);   // 页面上正在展示的内容
        let draft = null;                    // 面板里的编辑副本，保存成功才写回 published
        const dirty = new Set();
        const panes = new Map();
        const tabs = new Map();
        let activeKey = SECTIONS[0].key;

        function setStatus(key, message, tone) {
            const node = panes.get(key)?.querySelector('[data-status]');
            if (!node) return;
            node.textContent = message;
            node.hidden = false;
            node.classList.remove('is-error', 'is-success');
            if (tone) node.classList.add(`is-${tone}`);
        }

        function clearStatus(key) {
            const node = panes.get(key)?.querySelector('[data-status]');
            if (node) node.hidden = true;
        }

        /* ---- 生成表单控件 ---- */

        function createFieldControl(field, value) {
            const group = document.createElement('div');
            group.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = field.label;
            const id = `f-${field.name}-${Math.random().toString(36).slice(2, 8)}`;
            label.htmlFor = id;

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = field.rows || 3;
            } else {
                input = document.createElement('input');
                input.type = field.type === 'url' ? 'url' : 'text';
                input.autocomplete = 'off';
            }
            input.id = id;
            input.maxLength = field.max || 500;
            input.setAttribute('data-field', field.name);
            if (field.placeholder) input.placeholder = field.placeholder;

            if (field.type === 'tags') {
                input.value = Array.isArray(value) ? value.join('、') : '';
            } else {
                input.value = String(value ?? '');
            }

            group.append(label, input);

            if (field.hint) {
                const tip = document.createElement('span');
                tip.className = 'field-hint';
                tip.textContent = field.hint;
                group.appendChild(tip);
            }

            return group;
        }

        function fillPane(key) {
            const pane = panes.get(key);
            const section = sectionByKey(key);
            if (!pane || !section) return;

            const body = pane.querySelector('[data-pane-body]');
            if (!body) return;

            const data = draft[key];
            const fieldsKey = key.replace(/[^a-z]/gi, '');
            body.querySelectorAll('[data-field]').forEach((input) => {
                const name = input.getAttribute('data-field');
                const value = data ? data[name] : '';
                input.value = Array.isArray(value) ? value.join('、') : String(value ?? '');
                if (!input.id) input.id = `f-${fieldsKey}-${name}`;
            });
        }

        function buildPanes() {
            SECTIONS.forEach((section) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'admin-tab';
                tab.setAttribute('role', 'tab');
                tab.setAttribute('data-tab', section.key);
                tab.textContent = section.label;
                tab.addEventListener('click', () => activateTab(section.key));
                tabsHost.appendChild(tab);
                tabs.set(section.key, tab);

                const pane = document.createElement('section');
                pane.className = 'admin-pane';
                pane.setAttribute('data-pane', section.key);
                pane.setAttribute('role', 'tabpanel');
                pane.hidden = true;

                const body = document.createElement('div');
                body.className = 'admin-pane-body';
                body.setAttribute('data-pane-body', '');

                if (section.list) {
                    const listHost = document.createElement('div');
                    listHost.className = 'item-editor-list';
                    listHost.setAttribute('data-item-list', '');
                    body.appendChild(listHost);

                    const addButton = document.createElement('button');
                    addButton.type = 'button';
                    addButton.className = 'ghost-button item-add';
                    addButton.textContent = `+ 添加${section.list.label}`;
                    addButton.addEventListener('click', () => addListItem(section));
                    body.appendChild(addButton);
                } else {
                    section.fields.forEach((field) => {
                        const current = published[section.key];
                        body.appendChild(createFieldControl(field, current ? current[field.name] : ''));
                    });
                }

                pane.appendChild(body);

                const actions = document.createElement('div');
                actions.className = 'editor-actions';

                const save = document.createElement('button');
                save.type = 'submit';
                save.className = 'submit-button';
                save.textContent = `保存「${section.label}」`;
                save.addEventListener('click', (event) => {
                    event.preventDefault();
                    saveSection(section.key);
                });

                const reset = document.createElement('button');
                reset.type = 'button';
                reset.className = 'ghost-button';
                reset.textContent = '恢复默认';
                reset.addEventListener('click', () => resetSection(section.key));

                actions.append(save, reset);
                pane.appendChild(actions);

                const status = document.createElement('p');
                status.className = 'editor-status';
                status.setAttribute('data-status', section.key);
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                status.hidden = true;
                pane.appendChild(status);

                panesHost.appendChild(pane);
                panes.set(section.key, pane);
            });
        }

        /* ---- 自建空间：列表的增删改序 + 空间内的文字块 / 图片块 ---- */

        // 与云函数 content/index.js 里的白名单保持一致：改一边记得改另一边
        const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

        function addListItem(section) {
            const items = draft[section.key].items;
            if (items.length >= section.list.maxItems) {
                setStatus(section.key, `最多 ${section.list.maxItems} 个空间，先删一个再加。`, 'error');
                return;
            }
            items.push(emptyItem(section));
            renderItemEditor(section);
            markDirty(section.key);
        }

        function emptyItem(section) {
            const item = {};
            section.list.fields.forEach((field) => {
                item[field.name] = field.type === 'tags' ? [] : '';
            });
            if (section.list.blocks) item.blocks = [];
            return item;
        }

        function emptyBlock(kind) {
            return kind === 'image'
                ? { type: 'image', url: '', alt: '' }
                : { type: 'text', value: '' };
        }

        function itemsOf(section) {
            return draft[section.key].items;
        }

        /** 一个空间内部的块编辑器：每行一块内容，可加文字、可传图 */
        function renderBlocksEditor(section, space, index, host) {
            const list = document.createElement('div');
            list.className = 'block-editor-list';
            list.setAttribute('data-block-list', '');

            space.blocks.forEach((block, order) => {
                const row = document.createElement('div');
                row.className = 'block-editor';
                row.setAttribute('data-block', String(order));

                const head = document.createElement('div');
                head.className = 'block-head';

                const kind = document.createElement('span');
                kind.className = `block-kind is-${block.type}`;
                kind.textContent = block.type === 'image' ? '图片' : '文字';

                const controls = document.createElement('div');
                controls.className = 'item-controls';

                const up = document.createElement('button');
                up.type = 'button';
                up.className = 'icon-button';
                up.textContent = '↑';
                up.disabled = order === 0;
                up.setAttribute('aria-label', `把这块内容上移`);
                up.addEventListener('click', () => moveBlock(section, index, order, -1));

                const down = document.createElement('button');
                down.type = 'button';
                down.className = 'icon-button';
                down.textContent = '↓';
                down.disabled = order === space.blocks.length - 1;
                down.setAttribute('aria-label', '把这块内容下移');
                down.addEventListener('click', () => moveBlock(section, index, order, 1));

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'icon-button is-danger';
                remove.textContent = '删除';
                remove.setAttribute('aria-label', '删除这块内容');
                remove.addEventListener('click', () => removeBlock(section, index, order));

                controls.append(up, down, remove);
                head.append(kind, controls);
                row.appendChild(head);

                if (block.type === 'image') row.appendChild(buildImageEditor(section, index, order, block));
                else row.appendChild(buildTextEditor(order, block));

                list.appendChild(row);
            });

            host.appendChild(list);

            const actions = document.createElement('div');
            actions.className = 'block-actions';

            const addText = document.createElement('button');
            addText.type = 'button';
            addText.className = 'ghost-button';
            addText.textContent = '+ 加一段文字';
            addText.addEventListener('click', () => addBlock(section, index, 'text'));

            const addImage = document.createElement('button');
            addImage.type = 'button';
            addImage.className = 'ghost-button';
            addImage.textContent = '+ 加一张图片';
            addImage.addEventListener('click', () => addBlock(section, index, 'image'));

            actions.append(addText, addImage);
            host.appendChild(actions);
        }

        function buildTextEditor(order, block) {
            const group = document.createElement('div');
            group.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = `第 ${order + 1} 块文字`;
            const id = `b-text-${Math.random().toString(36).slice(2, 8)}`;
            label.htmlFor = id;

            const area = document.createElement('textarea');
            area.id = id;
            area.rows = 3;
            area.maxLength = 2000;
            area.value = block.value || '';
            area.setAttribute('data-block-field', 'value');

            group.append(label, area);
            return group;
        }

        function buildImageEditor(section, index, order, block) {
            const group = document.createElement('div');
            group.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = `第 ${order + 1} 块图片`;
            const id = `b-img-${Math.random().toString(36).slice(2, 8)}`;
            label.htmlFor = id;

            const picker = document.createElement('input');
            picker.type = 'file';
            picker.id = id;
            picker.accept = IMAGE_MIME_TYPES.join(',');
            picker.className = 'block-file';
            picker.setAttribute('data-block-file', '');
            picker.setAttribute('data-item-index', String(index));
            picker.setAttribute('data-block-index', String(order));

            group.append(label, picker);

            // 已经传过的图，把缩略图摆出来，才知道这块到底放了什么
            const url = safeUrl(block.url);
            if (url) {
                const preview = document.createElement('img');
                preview.className = 'block-preview';
                preview.src = url;
                preview.alt = block.alt || '已上传的图片';
                group.appendChild(preview);
            }

            const altLabel = document.createElement('label');
            altLabel.textContent = '图片说明（会显示在图下方，可留空）';
            const altId = `${id}-alt`;
            altLabel.htmlFor = altId;

            const alt = document.createElement('input');
            alt.type = 'text';
            alt.id = altId;
            alt.maxLength = 120;
            alt.autocomplete = 'off';
            alt.placeholder = '例如：凌晨四点的自习室';
            alt.value = block.alt || '';
            alt.setAttribute('data-block-field', 'alt');

            group.append(altLabel, alt);

            if (url) {
                const linkLabel = document.createElement('span');
                linkLabel.className = 'field-hint';
                linkLabel.textContent = url;
                group.appendChild(linkLabel);
            }

            return group;
        }

        function addBlock(section, index, kind) {
            const space = itemsOf(section)[index];
            if (!space) return;
            if (space.blocks.length >= 30) {
                setStatus(section.key, '一个空间最多 30 块内容。', 'error');
                return;
            }
            space.blocks.push(emptyBlock(kind));
            renderItemEditor(section);
            markDirty(section.key);
        }

        function removeBlock(section, index, order) {
            const space = itemsOf(section)[index];
            if (!space) return;
            space.blocks.splice(order, 1);
            renderItemEditor(section);
            markDirty(section.key);
        }

        function moveBlock(section, index, order, delta) {
            const space = itemsOf(section)[index];
            if (!space) return;
            const target = order + delta;
            if (target < 0 || target >= space.blocks.length) return;
            [space.blocks[order], space.blocks[target]] = [space.blocks[target], space.blocks[order]];
            renderItemEditor(section);
            markDirty(section.key);
        }

        /**
         * 选图 → 读成 base64 → 交给云函数 → 拿回可以直接 <img src> 的地址。
         * 图片不塞进内容 JSON，而是单独落在 site/media/ 下，否则内容文件会迅速膨胀。
         */
        async function uploadImage(section, index, order, file) {
            if (!file) return;
            if (!IMAGE_MIME_TYPES.includes(file.type)) {
                setStatus(section.key, '只支持 PNG / JPG / GIF / WebP 图片。', 'error');
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setStatus(section.key, `这张图 ${(file.size / 1024 / 1024).toFixed(2)}MB，超过 2MB 上限，先压缩一下。`, 'error');
                return;
            }
            if (!endpoint) {
                setStatus(section.key, '还没配置 content-endpoint，图片没地方存。', 'error');
                return;
            }

            setStatus(section.key, '图片上传中…');
            try {
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(new Error('读不出这张图'));
                    reader.readAsDataURL(file);
                });

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'upload', mimeType: file.type, data: dataUrl })
                });
                const data = await response.json().catch(() => null);

                if (!response.ok || !data || !data.ok) {
                    setStatus(section.key, (data && data.message) || `上传失败（${response.status}）`, 'error');
                    return;
                }

                const space = itemsOf(section)[index];
                if (!space || !space.blocks[order]) return;
                space.blocks[order].url = data.url;
                renderItemEditor(section);
                markDirty(section.key);
                setStatus(section.key, '图片已上传，记得点保存。', 'success');
            } catch (error) {
                setStatus(section.key, error.message || '图片上传失败，重试一次试试。', 'error');
            }
        }

        function renderItemEditor(section) {
            const pane = panes.get(section.key);
            const listHost = pane?.querySelector('[data-item-list]');
            if (!listHost) return;

            listHost.textContent = '';

            draft[section.key].items.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'item-editor';
                card.setAttribute('data-item', String(index));

                const head = document.createElement('div');
                head.className = 'item-editor-head';

                const order = document.createElement('span');
                order.className = 'item-index';
                order.textContent = `${index + 1}. ${item.name || '未命名空间'}`;

                const controls = document.createElement('div');
                controls.className = 'item-controls';

                const moveUp = document.createElement('button');
                moveUp.type = 'button';
                moveUp.className = 'icon-button';
                moveUp.textContent = '↑';
                moveUp.setAttribute('aria-label', `把第 ${index + 1} 条上移`);
                moveUp.disabled = index === 0;
                moveUp.addEventListener('click', () => moveListItem(section, index, -1));

                const moveDown = document.createElement('button');
                moveDown.type = 'button';
                moveDown.className = 'icon-button';
                moveDown.textContent = '↓';
                moveDown.setAttribute('aria-label', `把第 ${index + 1} 条下移`);
                moveDown.disabled = index === draft[section.key].items.length - 1;
                moveDown.addEventListener('click', () => moveListItem(section, index, 1));

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'icon-button is-danger';
                remove.textContent = '删除';
                remove.setAttribute('aria-label', `删除第 ${index + 1} 条`);
                remove.addEventListener('click', () => removeListItem(section, index));

                controls.append(moveUp, moveDown, remove);
                head.append(order, controls);
                card.appendChild(head);

                section.list.fields.forEach((field) => {
                    card.appendChild(createFieldControl(field, item[field.name]));
                });

                if (section.list.blocks) {
                    item.blocks = Array.isArray(item.blocks) ? item.blocks : [];
                    renderBlocksEditor(section, item, index, card);
                }

                listHost.appendChild(card);
            });
        }

        function moveListItem(section, index, delta) {
            const items = draft[section.key].items;
            const target = index + delta;
            if (target < 0 || target >= items.length) return;
            [items[index], items[target]] = [items[target], items[index]];
            renderItemEditor(section);
            markDirty(section.key);
        }

        function removeListItem(section, index) {
            const name = draft[section.key].items[index].name || '这个空间';
            if (!window.confirm(`删除「${name}」？里面的内容一起删掉。`)) return;
            draft[section.key].items.splice(index, 1);
            renderItemEditor(section);
            markDirty(section.key);
        }

        /* ---- 编辑中的输入同步回 draft ---- */

        function collectInput(section, field, input) {
            if (field.type === 'tags') return parseTags(input.value);
            return input.value.trim();
        }

        /**
         * 一次 'input' 事件要弄清三件事：改的是哪个区块、哪一条、哪个字段。
         * 空间是两层结构（空间 → 内容块），所以比普通区块多一层判定。
         */
        form.addEventListener('input', (event) => {
            const input = event.target.closest('[data-block-field], [data-field]');
            const pane = input?.closest('[data-pane]');
            if (!input || !pane) return;

            const key = pane.getAttribute('data-pane');
            const section = sectionByKey(key);
            if (!section || !draft) return;

            const blockRow = input.closest('[data-block]');
            const itemCard = input.closest('[data-item]');

            if (blockRow && itemCard) {
                const index = Number(itemCard.getAttribute('data-item'));
                const order = Number(blockRow.getAttribute('data-block'));
                const target = draft[key].items[index]?.blocks[order];
                if (!target) return;
                target[input.getAttribute('data-block-field')] = input.value.trim();
            } else if (itemCard) {
                const index = Number(itemCard.getAttribute('data-item'));
                const field = section.list.fields.find((f) => f.name === input.getAttribute('data-field'));
                const target = draft[key].items[index];
                if (!field || !target) return;
                target[field.name] = collectInput(section, field, input);
            } else {
                const field = section.fields.find((f) => f.name === input.getAttribute('data-field'));
                if (!field) return;
                draft[key][field.name] = collectInput(section, field, input);
            }

            markDirty(key);
        });

        // 选文件的 input 不触发 'input'，单独监听 'change'
        form.addEventListener('change', (event) => {
            const picker = event.target.closest('[data-block-file]');
            const pane = picker?.closest('[data-pane]');
            if (!picker || !pane) return;

            const section = sectionByKey(pane.getAttribute('data-pane'));
            if (!section) return;

            const index = Number(picker.getAttribute('data-item-index'));
            const order = Number(picker.getAttribute('data-block-index'));
            const file = picker.files && picker.files[0];
            picker.value = '';   // 清掉，下次选同一张图还能再触发 change
            uploadImage(section, index, order, file);
        });

        form.addEventListener('submit', (event) => event.preventDefault());

        /* ---- 保存 / 恢复默认 ---- */

        async function saveSection(key) {
            const section = sectionByKey(key);
            if (!draft || !section) return;

            if (!endpoint) {
                setStatus(key, '还没配置 content-endpoint（见 site.config.js），现在改的内容不会保存。', 'error');
                return;
            }

            const saveButton = panes.get(key)?.querySelector('.submit-button');
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = '保存中…';
            }

            const result = await pushSection(endpoint, key, draft[key]);

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = `保存「${section.label}」`;
            }

            if (!result.ok) {
                if (result.errors) {
                    // 后端给出的是「区块.字段」形式的键，这里剥掉前缀再找控件
                    const messages = Object.keys(result.errors)
                        .map((name) => result.errors[name])
                        .slice(0, 3);
                    setStatus(key, `${result.message}：${messages.join('；')}`, 'error');
                } else {
                    setStatus(key, result.message, 'error');
                }
                return;
            }

            published[key] = clone(draft[key]);
            applySection(key, published[key], defaults);
            dirty.delete(key);
            syncDirtyMarks();
            setStatus(key, result.message || '已保存，访客刷新即可看到。', 'success');
        }

        function resetSection(key) {
            if (!window.confirm(`把「${sectionByKey(key).label}」恢复成源码里的默认内容？这会覆盖云端已保存的版本。`)) return;
            draft[key] = clone(defaults[key]);
            if (sectionByKey(key).list) renderItemEditor(sectionByKey(key));
            else fillPane(key);
            markDirty(key);
            saveSection(key);
        }

        /* ---- 面板开关与脏标记 ---- */

        function markDirty(key) {
            const changed = JSON.stringify(draft[key]) !== JSON.stringify(published[key]);
            if (changed) dirty.add(key);
            else dirty.delete(key);
            syncDirtyMarks();
        }

        function syncDirtyMarks() {
            tabs.forEach((tab, key) => {
                tab.classList.toggle('is-dirty', dirty.has(key));
            });
        }

        function activateTab(key) {
            activeKey = key;
            panes.forEach((pane, paneKey) => { pane.hidden = paneKey !== key; });
            tabs.forEach((tab, tabKey) => {
                const selected = tabKey === key;
                tab.classList.toggle('is-active', selected);
                tab.setAttribute('aria-selected', String(selected));
            });
            clearStatus(key);
        }

        function openPanel() {
            draft = clone(published);
            dirty.clear();
            syncDirtyMarks();
            SECTIONS.forEach((section) => {
                if (section.list) renderItemEditor(section);
                else fillPane(section.key);
            });
            panel.hidden = false;
            fab.classList.add('is-active');
            activateTab(activeKey);
            const firstTab = tabs.get(activeKey);
            if (firstTab) firstTab.focus();
        }

        function closePanel() {
            panel.hidden = true;
            fab.classList.remove('is-active');
            fab.focus();
        }

        function togglePanel() {
            if (panel.hidden) openPanel();
            else closePanel();
        }

        fab.addEventListener('click', togglePanel);
        closeButton.addEventListener('click', closePanel);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panel.hidden) closePanel();
        });

        document.addEventListener('click', (event) => {
            if (panel.hidden) return;
            if (panel.contains(event.target) || fab.contains(event.target)) return;
            closePanel();
        });

        /* ---- 启动 ---- */

        buildPanes();

        hint.textContent = endpoint
            ? '改完点保存，内容写入云端后所有访客刷新即可看到。每个区块单独保存，互不覆盖。'
            : '还没配置 content-endpoint，面板只能看不能存：把 site.config.example.js 复制成 site.config.js 并填上云函数地址，或直接用邮件改内容。';
        fab.hidden = false;

        if (window.location.hash === '#edit') openPanel();

        // 云端没连上就保持 HTML 里的静态内容，页面不会白屏，也不谎报成功
        if (endpoint) {
            fetchSections(endpoint).then((remote) => {
                if (!remote) return;
                SECTIONS.forEach((section) => {
                    if (!remote[section.key]) return;
                    published[section.key] = remote[section.key];
                    applySection(section.key, published[section.key], defaults);
                });
            });
        }
    }

    /* ---------------- 页脚年份 ---------------- */

    function initFooterYear() {
        const yearSlot = document.getElementById('copyright-year');
        if (yearSlot) yearSlot.textContent = String(new Date().getFullYear());
    }

    /* ---------------- 启动 ---------------- */

    document.addEventListener('DOMContentLoaded', () => {
        initParticles();
        initNavigation();
        initSmoothScroll();
        initFadeIn();
        initContactForm();
        initContentManager();
        initFooterYear();
    });
})();
