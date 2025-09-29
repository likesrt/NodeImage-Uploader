;(function () {
  /**
   * @module config
   * 提供脚本运行时配置、常量与全局状态（NI.config/NI.state）。
   */
  const NI = (window.NI = window.NI || {});

  /**
   * 脚本常量与端点配置。
   * @property {string} SITE_URL NodeImage 站点首页地址
   * @property {number} RETRY_MAX 上传失败最大重试次数
   * @property {number} RETRY_DELAY 每次重试基础等待毫秒
   * @property {number} LIST_PAGE_SIZE 面板每页显示数量
   * @property {number} MAX_FILE_SIZE 触发压缩的文件大小阈值（字节）
   * @property {Object} ENDPOINTS API 端点集合
   */
  NI.config = {
    SITE_URL: "https://www.nodeimage.com",
    RETRY_MAX: 2,
    RETRY_DELAY: 1000,
    LIST_PAGE_SIZE: 10,
    MAX_FILE_SIZE: 30 * 1024 * 1024,
    // 调试模式：启用后在控制台显示详细操作日志
    DEBUG: true, // 设置为 false / true 启用调试模式
    ENDPOINTS: {
      upload: "https://api.nodeimage.com/api/upload",
      apiKey: "https://api.nodeimage.com/api/user/api-key",
      del: (id) =>
        `https://api.nodeimage.com/api/v1/delete/${encodeURIComponent(id)}`,
      list: "https://api.nodeimage.com/api/v1/list",
    },
    /**
     * 站点适配配置（可扩展多个站点）。
     * @type {SiteConfig[]}
     */
     SITES: [
       {
         host: /(^|\.)nodeseek\.com$/i,
         toolbarContainer: '.mde-toolbar',
         // 更精确的编辑器选择器，基于实际的DOM结构
         editorSelector: '#cm-editor-wrapper, .CodeMirror-wrap, textarea',
        //  hotkeys: { 'Ctrl+Shift+U': 'openPanel' },
       },
     ],
  };

  /**
   * 运行时状态。
   * @property {string} apiKey 当前账户的 API Key（由服务端获取）
   */
  // 注意：为兼容不支持 GM_* 的管理器，这里不要在顶层直接调用 GM_getValue。
  // 在 boot 阶段由 storage 模块（NI.kv）进行读取与填充。
  NI.state = {
    apiKey: "",
  };
})();
