(function () {
  /**
   * @module boot
   * 入口模块：注入样式并启动脚本。
   */
  const NI = (window.NI = window.NI || {});
  const { utils, ui, auth } = NI;

  /** 注入面板与工具栏样式（使用 old.js 旧版样式） */
  function addStyles() {
    GM_addStyle(`
      #nodeimage-status {
        margin-left: 10px;
        display: inline-block;
        font-size: 14px;
        height: 28px;
        line-height: 28px;
        transition: all 0.3s ease;
      }
      #nodeimage-status.success { color: #42d392; }
      #nodeimage-status.error { color: #f56c6c; }
      #nodeimage-status.warning { color: #e6a23c; }
      #nodeimage-status.info { color: #0078ff; }
      .nodeimage-login-btn {
        cursor: pointer;
        margin-left: 10px;
        color: #e6a23c;
        font-size: 14px;
        background: rgba(230, 162, 60, 0.1);
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid rgba(230, 162, 60, 0.2);
      }
      .nodeimage-toolbar-container {
        display: flex;
        align-items: center;
        margin-left: 10px;
      }
      #nodeimage-manage-btn {
        cursor: pointer;
        margin-left: 10px;
        color: #0078ff;
        font-size: 14px;
        background: rgba(0, 120, 255, 0.1);
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid rgba(0, 120, 255, 0.2);
      }
      #nodeimage-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 1200px;
        height: 90vh;      /* 固定高度，避免加载时面板忽大忽小 */
        max-height: 90vh;  /* 双保险 */
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 11px 15px -7px rgba(0,0,0,.2), 0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12);
        z-index: 9999;
        display: none;
        overflow: hidden; /* 裁剪溢出由内部滚动承担 */
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        flex-direction: column;
      }
      #nodeimage-panel.show { display: flex; }
      .panel-header {
        background: #1976d2;
        color: white;
        padding: 16px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px 0 rgba(0,0,0,.14), 0 1px 10px 0 rgba(0,0,0,.12);
      }
      .panel-title { font-size: 20px; font-weight: 500; }
      .panel-close {
        cursor: pointer;
        font-size: 24px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
      }
      .panel-close:hover { background-color: rgba(255, 255, 255, 0.1); }
      .panel-toolbar {
        padding: 16px 24px;
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        flex-shrink: 0; /* 头部工具栏不参与挤压 */
      }
      .mdui-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .mdui-btn-primary { background: #1976d2; color: white; }
      .mdui-btn-primary:hover { background: #1565c0; }
      .mdui-btn-danger { background: #d32f2f; color: white; }
      .mdui-btn-danger:hover { background: #c62828; }
      .mdui-btn-success { background: #388e3c; color: white; }
      .mdui-btn-success:hover { background: #2e7d32; }
      .mdui-btn:disabled { opacity: .6; cursor: not-allowed; }
      /* 批量复制下拉（旧版样式） */
      .copy-dropdown { position: relative; }
      .dropdown-content {
        position: absolute; top: 100%; left: 0;
        background: white; border: 1px solid #ddd; border-radius: 4px;
        display: none; z-index: 10000; min-width: 140px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .dropdown-content.show { display: block; }
      .dropdown-content .dropdown-item {
        padding: 8px 12px; cursor: pointer; font-size: 13px; user-select: none;
      }
      .dropdown-content .dropdown-item:hover { background-color: #f5f5f5; }
      /* 面板顶部提示（旧版样式） */
      #panel-message {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.75);
        color: white;
        padding: 6px 20px;
        border-radius: 20px;
        font-size: 14px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
        z-index: 10001;
      }
      #panel-message.show {
        opacity: 1;
        pointer-events: auto;
      }
      .panel-content { flex: 1; display: grid; grid-template-rows: 1fr auto; }
      .images-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
        padding: 12px 24px;
        overflow-y: auto;
        flex: 1;       /* 占据剩余空间，开启内部滚动 */
        min-height: 0; /* 防止子元素撑开导致父容器溢出 */
        position: relative;
      }
      .image-card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px 0 rgba(0,0,0,.14), 0 1px 10px 0 rgba(0,0,0,.12);
        position: relative;
        display: flex;
        flex-direction: column;
        cursor: default;
      }
      .image-preview {
        width: 100%;
        height: 150px;
        object-fit: cover;
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
        cursor: pointer;
      }
      .image-info { padding: 8px 12px; font-size: 12px; color: #666; flex-grow: 1; user-select: none; }
      .image-filename { font-weight: 500; color: #333; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .image-size { color: #999; }
      .image-actions {
        display: flex;
        justify-content: space-around;
        padding: 8px;
        border-top: 1px solid #eee;
      }
      .image-actions button {
        border: none; background: none; cursor: pointer; color: #1976d2; font-size: 14px;
        padding: 4px 8px; border-radius: 4px; transition: background-color 0.2s; position: relative;
      }
      .image-actions button:hover { background-color: #e3f2fd; }
      .copy-dropdown-single { position: absolute; top: 26px; left: 0; background: white; border: 1px solid #ddd; border-radius: 4px; display: none; z-index: 10002; min-width: 120px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
      .copy-dropdown-single.show { display: block; }
      .copy-dropdown-single div { padding: 6px 12px; cursor: pointer; font-size: 13px; user-select: none; }
      .copy-dropdown-single div:hover { background-color: #f5f5f5; }
      .pagination { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 12px 0; border-top: 1px solid #e0e0e0; user-select: none; flex-shrink: 0; }
      .page-btn { padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-size: 14px; }
      .page-btn:hover:not(:disabled) { background: #f5f5f5; border-color: #999; }
      .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .page-btn.active { background: #1976d2; color: white; border-color: #1976d2; }
      .panel-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9998; display: none; }
      .panel-overlay.show { display: block; }
    `);
  }

  /** 启动脚本：初始化站点集成、绑定粘贴/拖拽、刷新登录状态 */
  NI.boot = async function () {
    addStyles();
    // 启动前优先从 KV 恢复已保存的 API Key（避免不必要的网络请求）
    try {
      if (NI.kv && typeof NI.kv.get === 'function') {
        NI.state.apiKey = NI.kv.get('nodeimage_apiKey', NI.state.apiKey || '');
      }
    } catch {}
    if (utils.isNodeImageSite()) { auth.handleNodeImageSite(); return; }
    window.addEventListener("focus", () => auth.checkLoginIfNeeded());
    // 使用适配器自动初始化（可扩展多站点）
    if (NI.integration && typeof NI.integration.autoInit==='function') {
      NI.integration.autoInit();
    } else {
      // 兼容：回退 NodeSeek 默认绑定
      // utils.wait(".mde-toolbar").then(ui.setupToolbar.bind(ui));
      // utils.wait(".CodeMirror").then((el) => NI.handler.bindDrag(el));
      // 回退模式下补充粘贴监听，避免重复绑定
      document.addEventListener("paste", NI.handler.onPaste, true);
    }
    auth.checkLogoutFlag(); auth.setupStorageListener(); await auth.checkLoginIfNeeded();
  };
})();
