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
     * 云函数 HTTP 触发地址。
     * 配在 index.html 的 <meta name="contact-endpoint"> 里，部署时替换成自己的地址即可。
     * 留空则不开通线上提交能力（而不是假装成功）。
     */
    function readContactEndpoint() {
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

    /* ---------------- 「关于我」：云端存储 + 管理员登录后编辑 ---------------- */

    const ABOUT_FIELDS = ['lead', 'more', 'school', 'role', 'available', 'city'];
    // 会话级保存管理员凭据，关掉标签页即失效。
    // 服务端不签发凭证，所以每次写操作都要把用户名和口令一起送去重新核验。
    const ADMIN_CRED_KEY = 'lyq:admin-cred';

    /**
     * 从静态 DOM 里读默认值，作为「恢复默认」的基线。
     * 默认内容写在 HTML 中，所以禁用 JS 时页面照样有内容。
     */
    function readAboutFromDom(view) {
        const data = {};
        ABOUT_FIELDS.forEach((name) => {
            const node = view.querySelector(`[data-field="${name}"]`);
            data[name] = node ? node.textContent.trim() : '';
        });
        const list = view.querySelector('#skillsList');
        data.skills = list
            ? Array.from(list.children).map((li) => li.textContent.trim()).join('、')
            : '';
        return data;
    }

    function applyAboutToDom(view, data) {
        ABOUT_FIELDS.forEach((name) => {
            const node = view.querySelector(`[data-field="${name}"]`);
            if (node && typeof data[name] === 'string') node.textContent = data[name];
        });

        const list = view.querySelector('#skillsList');
        if (!list || typeof data.skills !== 'string') return;
        const items = data.skills.split(/[,，、]/).map((text) => text.trim()).filter(Boolean);
        list.textContent = '';
        items.forEach((text) => {
            const li = document.createElement('li');
            li.className = 'skill-tag';
            li.textContent = text;
            list.appendChild(li);
        });
    }

    function readContentEndpoint() {
        const meta = document.querySelector('meta[name="content-endpoint"]');
        return meta ? meta.content.trim() : '';
    }

    /**
     * 管理员凭据放在会话存储：关掉标签页即失效。
     * 不用持久存储，免得在公用电脑上留下长期可用的凭据。
     */
    function readCredentials() {
        try {
            const raw = window.sessionStorage.getItem(ADMIN_CRED_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && parsed.username && parsed.password ? parsed : null;
        } catch {
            return null;
        }
    }

    function writeCredentials(credentials) {
        try {
            if (credentials) {
                window.sessionStorage.setItem(ADMIN_CRED_KEY, JSON.stringify(credentials));
            } else {
                window.sessionStorage.removeItem(ADMIN_CRED_KEY);
            }
        } catch {
            // 存不下就每次重新登录，不影响安全性
        }
    }

    async function fetchContent(endpoint) {
        try {
            const response = await fetch(endpoint, { method: 'GET' });
            const data = await response.json();
            if (response.ok && data && data.ok && data.content) return data.content;
            return null;
        } catch {
            // 接口不通就沿用源码里的静态内容，页面不会白屏
            return null;
        }
    }

    /**
     * 登录只回答「这对不对」，不换回任何凭证。
     * 服务端没有签名密钥可用，也就没什么可签发的——写操作一律重新核验口令。
     */
    async function verifyCredentials(endpoint, username, password) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', username, password })
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data && data.ok) {
            return {
                ok: true,
                // 服务端会说明当前是不是仍在用播种出来的初始口令
                usingSeedPassword: Boolean(data.usingSeedPassword)
            };
        }
        return { ok: false, message: (data && data.message) || `登录失败（${response.status}）` };
    }

    async function saveContent(endpoint, credentials, content) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', ...credentials, content })
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data && data.ok) {
            return { ok: true, message: data.message || '已保存' };
        }
        return {
            ok: false,
            // 口令不对或已被锁定，只能让用户重新输
            unauthorized: response.status === 401 || response.status === 429,
            message: (data && data.message) || `保存失败（${response.status}）`
        };
    }

    async function changePassword(endpoint, credentials, newPassword) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'changePassword', ...credentials, newPassword })
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data && data.ok) {
            return { ok: true, message: data.message || '口令已更新' };
        }
        return {
            ok: false,
            unauthorized: response.status === 401,
            message: (data && data.message) || `更新失败（${response.status}）`
        };
    }

    function initEditableAbout() {
        const view = document.getElementById('aboutView');
        const editor = document.getElementById('aboutEditor');
        const toolbar = document.getElementById('aboutToolbar');
        const loginPanel = document.getElementById('adminLogin');
        const editButton = document.getElementById('editAbout');
        if (!view || !editor || !toolbar || !loginPanel || !editButton) return;

        const endpoint = readContentEndpoint();
        const defaults = readAboutFromDom(view);
        let current = defaults;

        const status = document.getElementById('editorStatus');
        const loginStatus = document.getElementById('loginStatus');
        const exportBox = document.getElementById('exportBox');
        const passwordInput = document.getElementById('adminPassword');
        const usernameInput = document.getElementById('adminUsername');
        const saveButton = document.getElementById('saveAbout');

        const fab = document.getElementById('adminFab');
        const seedWarning = document.getElementById('seedWarning');
        const seedFix = document.getElementById('seedFix');
        const passwordForm = document.getElementById('passwordForm');
        const passwordStatus = document.getElementById('passwordStatus');
        const newPasswordInput = document.getElementById('newPassword');
        const changePasswordToggle = document.getElementById('changePasswordToggle');

        function setStatus(node, message, tone) {
            if (!node) return;
            node.textContent = message;
            node.hidden = false;
            node.classList.remove('is-error', 'is-success');
            if (tone) node.classList.add(`is-${tone}`);
        }

        function fillForm(data) {
            ABOUT_FIELDS.forEach((name) => {
                const input = editor.elements[name];
                if (input) input.value = data[name] || '';
            });
            if (editor.elements.skills) editor.elements.skills.value = data.skills || '';
        }

        /** 悬浮按钮的外观随登录状态变化，一眼看得出是不是处在管理态 */
        function syncFabState() {
            if (!fab) return;
            const logged = Boolean(readCredentials());
            fab.classList.toggle('is-active', logged);
            fab.setAttribute('aria-label', logged ? '站点管理（已登录）' : '进入站点管理');
        }

        function toggleSeedWarning(show) {
            if (seedWarning) seedWarning.hidden = !show;
        }

        /** 点击悬浮按钮多半人在页面别处，主动把管理区滚到视野里 */
        function scrollToAdminPanel() {
            const anchor = !loginPanel.hidden ? loginPanel : (!editor.hidden ? editor : view);
            if (anchor && anchor.scrollIntoView) {
                anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        /** 回到浏览态：编辑入口只在还持有凭证时出现，访客永远看不到 */
        function showView() {
            view.hidden = false;
            editor.hidden = true;
            loginPanel.hidden = true;
            if (passwordForm) passwordForm.hidden = true;
            toolbar.hidden = !readCredentials();
            syncFabState();
        }

        function openEditor() {
            fillForm(current);
            if (exportBox) exportBox.hidden = true;
            if (status) status.hidden = true;
            if (passwordForm) passwordForm.hidden = true;
            view.hidden = true;
            loginPanel.hidden = true;
            editor.hidden = false;
            toolbar.hidden = true;
            syncFabState();
            if (editor.elements.lead) editor.elements.lead.focus();
        }

        function openLogin() {
            editor.hidden = true;
            if (passwordForm) passwordForm.hidden = true;
            view.hidden = false;
            toolbar.hidden = true;
            loginPanel.hidden = false;
            syncFabState();
            if (passwordInput) passwordInput.focus();
        }

        function openPasswordForm() {
            editor.hidden = true;
            loginPanel.hidden = true;
            if (passwordStatus) passwordStatus.hidden = true;
            passwordForm.hidden = false;
            syncFabState();
            if (newPasswordInput) newPasswordInput.focus();
        }

        /** 身份没验证过之前，编辑器不会露出来 */
        function requestEditAccess() {
            if (!endpoint) return;
            if (readCredentials()) openEditor();
            else openLogin();
        }

        function collectForm(fallbackToDefaults) {
            const data = {};
            ABOUT_FIELDS.forEach((name) => {
                const input = editor.elements[name];
                const value = input ? input.value.trim() : '';
                data[name] = value || (fallbackToDefaults ? defaults[name] : '');
            });
            const skills = editor.elements.skills ? editor.elements.skills.value.trim() : '';
            data.skills = skills || (fallbackToDefaults ? defaults.skills : '');
            return data;
        }

        async function persist(data, successMessage) {
            const credentials = readCredentials();
            if (!credentials) {
                openLogin();
                return false;
            }

            const result = await saveContent(endpoint, credentials, data);
            if (result.ok) {
                current = data;
                applyAboutToDom(view, data);
                setStatus(status, successMessage || result.message, 'success');
                return true;
            }

            // 口令不对或已被临时锁定，留着没意义，请重新输入
            if (result.unauthorized) {
                writeCredentials(null);
                setStatus(status, `${result.message}，请重新登录。`, 'error');
                openLogin();
                return false;
            }

            setStatus(status, result.message, 'error');
            return false;
        }

        editButton.addEventListener('click', requestEditAccess);

        loginPanel.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!passwordInput || !usernameInput) return;

            const submitButton = document.getElementById('loginSubmit');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = '登录中…';
            }

            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const result = await verifyCredentials(endpoint, username, password);

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = '登录';
            }

            if (!result.ok) {
                passwordInput.value = '';
                setStatus(loginStatus, result.message, 'error');
                return;
            }

            // 校验通过才留下凭据，之后每次写操作都会带上它重新核验
            writeCredentials({ username, password });
            passwordInput.value = '';
            if (loginStatus) loginStatus.hidden = true;
            // 还在用初始口令就明说，别让人以为换了其实是没换
            toggleSeedWarning(result.usingSeedPassword);
            openEditor();
        });

        const loginCancel = document.getElementById('loginCancel');
        if (loginCancel) loginCancel.addEventListener('click', showView);

        editor.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = '保存中…';
            }

            const saved = await persist(collectForm(true), '已保存到云端，访客刷新即可看到。');

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = '保存并发布';
            }

            if (saved) showView();
        });

        const cancelButton = document.getElementById('cancelEdit');
        if (cancelButton) cancelButton.addEventListener('click', showView);

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!editor.hidden) showView();
            else if (!loginPanel.hidden) showView();
            else if (passwordForm && !passwordForm.hidden) openEditor();
        });

        const exportButton = document.getElementById('exportAbout');
        if (exportButton) {
            exportButton.addEventListener('click', () => {
                if (!exportBox) return;
                exportBox.value = JSON.stringify(current, null, 2);
                exportBox.hidden = false;
                exportBox.focus();
                exportBox.select();
            });
        }

        const resetButton = document.getElementById('resetAbout');
        if (resetButton) {
            resetButton.addEventListener('click', async () => {
                if (!window.confirm('把云端内容重置为源码里的默认内容？')) return;
                const saved = await persist({ ...defaults }, '已重置为默认内容。');
                if (saved) fillForm(defaults);
            });
        }

        const logoutButton = document.getElementById('logoutAbout');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                writeCredentials(null);
                toggleSeedWarning(false);
                showView();
            });
        }

        /* ---- 修改管理员口令 ---- */

        const openPasswordEditor = () => {
            if (!readCredentials()) {
                openLogin();
                return;
            }
            openPasswordForm();
        };

        if (changePasswordToggle) {
            changePasswordToggle.addEventListener('click', openPasswordEditor);
        }
        if (seedFix) seedFix.addEventListener('click', openPasswordEditor);

        const cancelPassword = document.getElementById('cancelPassword');
        if (cancelPassword) cancelPassword.addEventListener('click', openEditor);

        if (passwordForm) {
            passwordForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!newPasswordInput) return;

                const credentials = readCredentials();
                if (!credentials) {
                    openLogin();
                    return;
                }

                const next = newPasswordInput.value;

                const submitButton = document.getElementById('changePasswordSubmit');
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = '更新中…';
                }

                const result = await changePassword(endpoint, credentials, next);

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = '更新口令';
                }
                newPasswordInput.value = '';

                if (result.ok) {
                    setStatus(passwordStatus, result.message, 'success');
                    toggleSeedWarning(false);
                    // 旧口令当场作废，本地留着的也一并清掉
                    writeCredentials(null);
                    setStatus(passwordStatus, `${result.message} 已退出登录，请用新口令重新登录。`, 'success');
                    showView();
                    return;
                }

                if (result.unauthorized) {
                    writeCredentials(null);
                    setStatus(passwordStatus, `${result.message}，请重新登录。`, 'error');
                    openLogin();
                    return;
                }

                setStatus(passwordStatus, result.message, 'error');
            });
        }

        /* ---- 整站唯一的可见入口：右下角小按钮 ---- */

        if (fab && endpoint) {
            // 没有 JS 就没人点得了这个按钮，所以默认 hidden、由脚本点亮
            fab.hidden = false;
            fab.addEventListener('click', () => {
                requestEditAccess();
                scrollToAdminPanel();
            });
        }

        // 云端内容优先于静态兜底：拿到就覆盖，拿不到就保持源码里的版本
        if (endpoint) {
            fetchContent(endpoint).then((remote) => {
                if (!remote) return;
                current = remote;
                applyAboutToDom(view, remote);
            });
        }

        toolbar.hidden = !readCredentials();
        syncFabState();
        if (window.location.hash === '#edit') requestEditAccess();
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
        initEditableAbout();
        initFooterYear();
    });
})();
