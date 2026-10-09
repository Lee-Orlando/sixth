/**
 * 站点配置模板 —— 复制成 site.config.js，然后把地址换成自己的。
 *
 * site.config.js 里含真实的 CloudBase 环境 ID，已被 .gitignore 排除，不会进公开仓库。
 * 这个文件只是模板，仓库里保留它，方便别人 fork 之后照着填。
 *
 * 三个值都可以留空：
 *   contactEndpoint 空 → 留言表单如实提示「在线留言未开通」，引导邮件联系
 *   contentEndpoint 空 → 只展示源码里的静态内容，管理面板变成只读
 *   siteUrl        空 → 只影响 robots.txt / sitemap.xml 的生成，页面本身不受影响
 */
(function (root) {
    root.SITE_CONFIG = {
        // 联系表单的云函数地址，形如 https://<envId>.service.tcloudbase.com/contact
        contactEndpoint: '',
        // 内容读写的云函数地址，形如 https://<envId>.service.tcloudbase.com/content
        contentEndpoint: '',
        // 站点对外的根地址（静态托管域名），形如 https://<envId>-<appId>.tcloudbaseapp.com
        siteUrl: ''
    };
})(typeof window !== 'undefined' ? window : globalThis);
