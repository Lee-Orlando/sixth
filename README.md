# Lyq · 个人博客与作品集

一个零依赖的静态个人站点，包含首屏 Canvas 粒子背景、响应式导航、滚动动效、作品集与联系表单。
静态资源托管在**腾讯云开发 CloudBase**，留言与站点内容各由一个 Serverless 云函数处理。

> 站点文案按区块存在云端：**首屏 / 关于我 / 技能 / 作品集 / 联系方式 / 页脚**六个区块各自独立，
> 点右下角「管理」按钮打开侧边面板，改哪个区块就保存哪个，保存后**所有访客刷新就能看到**。
>
> 默认内容写在 HTML 里：禁用 JS、接口不可用都没关系，页面照样完整可读。
>
> ⚠️ **内容接口的写入目前没有任何门槛**，任何拿到地址的人都能改这张页面的文案。
> 这是刻意的取舍（详见下方「一道需要自己权衡的选择」）。
> 站点一旦有了真实流量，第一件事就该把这个口子收上。

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
| CloudBase | 两个 Node.js 云函数：接收留言、提供站点内容的读写接口；数据落在云存储的 JSON 文件里 |

**没有引入任何 CDN 依赖**，图标为内联 SVG，字体使用系统字体栈，因此不存在外链加载失败或阻塞渲染的问题。

## 目录结构

```
sixth-main/
├── index.html                  # 唯一页面入口，单页多 section（含静态默认内容）
├── 404.html                    # 静态托管自定义错误页
├── favicon.svg                 # 站点图标
├── og-image.svg                # 社交分享预览图（上线前建议换成 PNG）
├── robots.txt                  # 爬虫规则
├── sitemap.xml                 # 站点地图
├── cloudbaserc.json            # CloudBase CLI 部署配置（含环境 ID，不进版本库）
├── css/styles.css              # 全部样式，含响应式与无障碍规则
├── js/main.js                  # 交互逻辑，IIFE 封装，零全局变量
└── cloudfunctions/
    ├── contact/                # 联系表单云函数：留言按月归档到云存储
    │   ├── index.js
    │   └── package.json
    └── content/                # 内容云函数：按区块读写站点文案
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

**站点内容：前端编辑 + 按区块存云端**

- 六个区块各自独立保存：首屏文案、自我介绍、技能标签、作品集列表、联系方式、页脚
- 自我介绍两段 + 技能列表可改；技能用逗号或顿号分隔，最多 24 项
- 作品集可**增删条目、上下调序**，每条含标题、年份、简介、技术标签、链接
- 邮箱与 GitHub 改一次，联系区和页脚两个图标同时更新，不会出现「页脚还是旧地址」
- 改过的区块标签上有红点提示未保存，Esc 或点页面别处收起面板
- **每个区块单独写、互不覆盖**：改首屏不会动到作品集，也不存在「整份覆盖把另一处改没了」
- 默认内容写在 HTML 里而非由 JS 渲染，禁用 JS 时照样可读；接口拿不到内容就沿用默认值，
  绝不谎报「保存成功」
- 字段的白名单、数量上限、长度上限都在服务端执行；链接字段只接受 `http(s)://`，
  挡住 `javascript:` 这类伪协议

## 内容是怎么存的

```
GET  /content            读取全部区块（未写过内容的区块返回 null）
GET  /content?section=X  只读一个区块
POST /content            { section, content }  写单个区块
                         也支持 { sections: { hero: {...}, about: {...} } } 一次写多个
```

云端文件结构：

| 路径 | 内容 | 谁可以读 |
| --- | --- | --- |
| `site/content/hero.json` | 首屏文案 | 公开 |
| `site/content/about.json` | 两段自我介绍 + 四个 HR 关注字段 | 公开 |
| `site/content/skills.json` | 技能标签列表 | 公开 |
| `site/content/projects.json` | 作品集列表 | 公开 |
| `site/content/contact.json` | 引导语、邮箱、GitHub | 公开 |
| `site/content/footer.json` | 页脚版权文字 | 公开 |
| `site/messages/YYYY-MM.json` | 留言，按月归档 | 桶内文件理论可匿名下载 |

### 一道需要自己权衡的选择

这一版**没有做登录**。上一版围绕安全搭了一整套东西——用户名口令、PBKDF2 加盐哈希、
每次写操作重新核验、失败锁定、修改口令——代码量不小，可每次改一行文案都得先登录。
这个项目的重心是「前台管理员改完推送给后端」，所以整套凭据体系被拿掉了。

代价要写得明明白白：**知道接口地址的人就能改首页文案。**
接口地址写在 `index.html` 的 meta 里，等于公开。

想要收回来的话，最省事的一招：给 `content` 云函数配一个环境变量 `WRITE_KEY`，
写操作比对它，前端在面板里多问一次这个密钥。**别把密钥写进存储桶的 JSON**——
这个环境的默认桶是公有读的，放进去等于把钥匙挂在门外。

### 一个容易踩的坑：CDN 会把下载结果缓存几分钟

同名文件被读过一次后，再覆盖写、再读，很可能拿到的还是上一版——表现为
「保存成功，但自己和访客都看不到变化」。所以云函数读取时统一走 CDN 源地址并缀上
一次性时间戳跳过缓存。**如果以后要改这块，别把这一句删掉。**

### 「到底谁能改我的页面」

**目前：任何知道接口地址的人。** 接口地址写在前端 HTML 里，等于公开。
这也是为什么服务端必须守住字段白名单和长度上限——至少保证没人能往桶里塞垃圾、
或者塞一条 `javascript:` 链接进来。

给自己的清单：上线前先用「管理」面板把内容改一遍，确认链路通；如果哪天这个站点
开始承担真实求职流量，按上面「一道需要自己权衡的选择」加回写校验。

> 上一版用「每次写操作附上用户名与口令、服务端重算 PBKDF2 哈希比对」的方式保护写入。
> 那段历史完整记录在 git 提交里（`fifth` 仓库的 `cloudfunctions/content/index.js`），
> 想接回来随时可以找得到。

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

- [ ] 给 `content` 的写入加一道校验（`WRITE_KEY` 环境变量即可），现在接口是完全开放的
- [ ] 在线用管理面板把自我介绍写完整（现在是通用文案，建议写清求职方向与技术栈）
- [ ] 把作品集里的两条占位项目换成真实项目，补上年份、简介与仓库链接
- [ ] 把 `og-image.svg` 换成 1200×630 的 **PNG**（多数社交平台不解析 SVG 预览图）
- [ ] 「关于我」板块补充一张真实头像（删掉占位图后 `#about` 已改为单栏居中）
- [ ] 联系表单加一层人机校验（云函数侧接入验证码或做 IP 频率限制）
- [ ] 有新留言时发通知（邮件或 Serverless 定时扫描 `site/messages/`）
