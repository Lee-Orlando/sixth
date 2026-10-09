# Lyq · 个人博客与作品集

一个零依赖的静态个人站点，包含首屏 Canvas 粒子背景、响应式导航、滚动动效与联系表单。
静态资源托管在**腾讯云开发 CloudBase**，联系表单由一个 Serverless 云函数接收。

> 当前页面由四个区块组成：首屏 Hero、关于我、联系表单、页脚。作品集与博客板块原为占位内容，已移除，等有真实内容再填。
>
> 「关于我」支持管理员在线编辑：点页面右下角半透明的「管理」按钮，或访问 `<站点>#edit`，
> 输入管理员账号后即可修改，保存后**所有访客刷新就能看到**。
> 访客侧看不到任何编辑入口，也不会加载编辑器。

## 在线预览

```bash
python -m http.server 8000
# 或
npx serve .
```

打开 http://localhost:8000 即可。纯静态文件，**不需要任何构建步骤**。

## 技术栈

| 类型 | 说明 |
| --- | --- |
| HTML5 | 语义化标签（`header` / `nav` / `main` / `section` / `article` / `figure`） |
| CSS3 | Flexbox + Grid 布局、CSS 变量、`clamp` 式自适应（媒体查询） |
| JavaScript | 原生 ES2015+，无框架、无第三方库 |
| Canvas 2D | 手写粒子背景（含连线、DPR 适配、可见性暂停） |
| CloudBase | 两个 Node.js 云函数：接收留言、提供「关于我」的读写接口；数据落在云存储的 JSON 文件里 |

**没有引入任何 CDN 依赖**，图标为内联 SVG，字体使用系统字体栈，因此不存在外链加载失败或阻塞渲染的问题。

## 目录结构

```
second-main/
├── index.html                  # 唯一页面入口，单页多 section
├── 404.html                    # 静态托管自定义错误页
├── favicon.svg                 # 站点图标
├── og-image.svg                # 社交分享预览图（上线前建议换成 PNG）
├── robots.txt                  # 爬虫规则
├── sitemap.xml                 # 站点地图
├── cloudbaserc.json            # CloudBase CLI 部署配置
├── css/styles.css              # 全部样式，含响应式与无障碍规则
├── js/main.js                  # 交互逻辑，IIFE 封装，零全局变量
└── cloudfunctions/
    └── contact/                # 联系表单云函数
        ├── index.js
        └── package.json
```

## 已实现的能力

**结构与响应式**

- 移动端汉堡菜单 + 侧滑导航，支持 Esc 关闭、点击外部区域关闭、`aria-expanded` 状态同步
- 桌面 / 平板 / 手机三档断点（768px、480px）
- 首屏高度用 `100dvh`（带 `100vh` 兜底），避免 iOS Safari 地址栏收合时跳动

**无障碍（a11y）**

- 跳转到主内容的 skip link
- 全局 `:focus-visible` 焦点环，键盘可达
- 所有表单控件绑定 `<label>`（视觉隐藏但不丢语义），错误信息通过 `aria-describedby` 与 `aria-invalid` 关联
- 表单提交结果使用 `role="status"` + `aria-live="polite"` 播报
- 导航高亮项带 `aria-current`
- 装饰性 Canvas 标记为 `aria-hidden`
- JS 被禁用时有 `<noscript>` 兜底，淡入区块不会保持不可见

**性能**

- 粒子动画在页面隐藏（`visibilitychange`）或首屏滚出视口时自动暂停
- 所有滚动监听统一为 `passive: true` 并用 `requestAnimationFrame` 节流
- Canvas 按 devicePixelRatio 缩放，避免高分屏模糊
- 尊重系统 `prefers-reduced-motion`：开启后关闭所有动画，粒子仅渲染静态一帧

**表单**

- 自定义前端校验（姓名长度、邮箱正则、留言字数）
- 失焦即校验、输入即纠正，错误内联展示而非 `alert`
- 提交到 CloudBase 云函数，**服务端再做一次同样规则的校验**
- 加载态禁用按钮；成功、服务端拒绝、网络失败三种结果分别给出可见反馈

**关于我（管理员登录后可编辑）**

- 学校 / 求职意向 / 到岗时间 / 城市四个字段独立可改，正是 HR 最关心的信息
- 自我介绍两段、技能列表同样可改，技能用逗号或顿号分隔
- 内容存在**云存储**的 `site/about.json`，保存后所有访客刷新即可看到
- 凭据存 `sessionStorage`（键名 `lyq:admin-cred`），关掉标签页即失效；可手动「退出登录」
- 「导出备份」把当前内容导出成 JSON；「重置为默认」把云端内容还原成源码版本
- 登录后可改口令；仍在用初始口令时页面会挂一条红色提醒
- 普通访客看不到任何编辑控件；「管理」按钮只会唤出登录框，验证通过才进编辑器
- 默认内容写在 HTML 里而非由 JS 渲染，禁用 JS 时照样可读

## 管理员模式

在 `index.html` 的 `<meta name="content-endpoint">` 填好 `content` 云函数的 HTTP 地址即可。
**不需要配置任何环境变量**，也不需要开通数据库——内容与管理凭据都存在云存储里。

初始账号是 `admin` / `admin`（写在 `cloudfunctions/content/index.js` 顶部的常量里，
第一次运行时自动播种）。登录后请立刻用「修改口令」换掉它。

### 为什么不用「登录换凭证」那套常见做法

通行做法是用一个签名密钥签发带时效的 token。但 CloudBase 环境的默认存储桶是
**公有读**的：任何秘密一旦写进这里，等于把钥匙挂在门外——拿到文件的人不需要知道
口令，就能自己签一个合法管理员出来。

所以这里改成：**每次写操作都附上用户名与口令，由服务端重算哈希比对**。
凭据文件里因此只有加盐哈希，没有任何能直接当钥匙用的东西。
代价是保护力度完全压在口令强度上——这也是为什么要拒绝常见弱口令，
以及为什么初始登录后第一件事应该是改口令。

口令落盘前经过 PBKDF2-HMAC-SHA256 + 随机盐处理；连续输错 5 次会锁定 10 分钟。

### 云端存了什么

| 路径 | 内容 | 谁可以读 |
| --- | --- | --- |
| `site/about.json` | 「关于我」的内容 | 公开，本来就要展示 |
| `site/cred/administrator-credential.json` | 管理员账号与口令哈希 | 桶内文件理论可匿名下载，故只放哈希 |
| `site/cred/login-guard.json` | 失败计数与锁定时长 | 同上 |
| `site/messages/YYYY-MM.json` | 留言，按月归档 | 同上 |

### 一个容易踩的坑：CDN 会把下载结果缓存几分钟

同名文件被读过一次后，再覆盖写、再读，很可能拿到的还是上一版——表现为
「保存成功，但自己和访客都看不到变化」。所以云函数读取时统一走 CDN 源地址并缀上
一次性时间戳跳过缓存。**如果以后要改这块，别把这一句删掉。**

### 「到底谁能改我的页面」

只有知道口令的人。访客最多能拿到那个哈希文件，离能改页面还差一次离线破解。
口令强度决定了这堵墙有多厚——用 `admin` 就等于没有墙。

**SEO**

- `description` / `keywords` / `author` / `theme-color`
- Open Graph 与 Twitter Card 元信息
- `robots.txt` + `sitemap.xml`

## 部署到腾讯云开发 CloudBase

### 前置准备

1. 注册并实名认证 [腾讯云](https://cloud.tencent.com)，进入**云开发 CloudBase** 控制台
2. 新建环境，计费方式选**按量付费**（免费额度：每月 3000 资源点／每账号 1 个免费环境）
3. 安装 CLI：`npm i -g @cloudbase/cli`，然后 `tcb login`

### 部署云函数

```bash
cd second-main

# 1. 部署两个云函数
tcb fn deploy contact --dir ./cloudfunctions/contact --runtime Nodejs18.15 --install-dependency true -e <环境ID>
tcb fn deploy content --dir ./cloudfunctions/content --path /content --runtime Nodejs18.15 --install-dependency true -e <环境ID>

# 2. 不需要建集合、不需要配环境变量——两个函数都把数据写在云存储里
#    `--path` 会自动创建 HTTP 访问路由，命令输出里能直接拿到地址
```

> **Git Bash 用户注意**：`--path /contact` 这类参数会被 MSYS 当成 Windows 路径转掉。
> 先 `export MSYS_NO_PATHCONV=1` 再执行，否则会报出莫名其妙的路径错误。
>
> 另外 `tcb routes add` 对系统分配的内置域名不生效，访问路由只能靠 `fn deploy --path` 自动建。

拿到形如 `https://<env>.service.tcloudbase.com/contact` 的地址后，填进 `index.html`：

```html
<meta name="contact-endpoint" content="https://<env>.service.tcloudbase.com/contact">
<meta name="content-endpoint" content="https://<env>.service.tcloudbase.com/content">
```

然后：

```bash
tcb hosting deploy ./ -e <你的环境ID> --exclude "cloudfunctions/**" "cloudbaserc.json" ".gitignore"
```

CloudBase 会返回一个默认域名（形如 `xxx.tcloudbaseapp.com`），记得把它回填到
`robots.txt` 和 `sitemap.xml` 里的 `REPLACE_ME` 占位处。

> 绑定自己的域名需要 ICP 备案。未备案时直接用 CloudBase 默认域名即可正常访问和被收录。

### 备选：Framework 一键部署

直接编辑 `cloudbaserc.json` 的 `envId`，然后一条命令：

```bash
cloudbase framework deploy
```

## 待办（TODO）

- [ ] 把 `og-image.svg` 换成 1200×630 的 **PNG**（多数社交平台不解析 SVG 预览图）
- [ ] 补充作品集 / 文章板块：原先的「作品集」与「最新目标」是占位内容，已删除；等有真实项目后再按同样的语义化标记加回来
- [ ] 登录后把默认的 `admin` / `admin` 换掉（登录后会看到红色提醒条）
- [ ] 在线登录，把学校、到岗时间、所在城市三项填实（默认为「待填写」）
- [ ] 「关于我」板块补充一张真实头像（删掉占位图后 `#about` 已改为单栏居中）
- [ ] 联系表单加一层人机校验（云函数侧接入验证码或做 IP 频率限制）
- [ ] 有新留言时发通知（邮件或 Serverless 定时扫描 `site/messages/`）
