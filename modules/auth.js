(function () {
  /**
   * @module auth
   * 登录状态校验、监听与登录窗口自动关闭策略。
   */
  const NI = (window.NI = window.NI || {});
  const { api, storage: ST, utils, state, config } = NI;

  NI.auth = {
    /**
     * 如果未持有 API Key，则尝试刷新。
     * @param {boolean} [force=false] 是否强制刷新
     * @returns {Promise<boolean>} 是否有效登录
     */
    async checkLoginIfNeeded(force = false) {
      if (state.apiKey && !force) return true;
      const ok = await api.refreshApiKey();
      if (!ok && state.apiKey) NI.ui.setStatus("warning", "登录已失效");
      NI.ui.updateState();
      return ok;
    },
    /** 处理登出标记 */
    checkLogoutFlag() {
      if (ST.get(ST.keys.logout) === "true") {
        state.apiKey = "";
        if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", "");
        NI.ui.updateState();
        ST.remove(ST.keys.logout);
        NI.ui.setStatus("warning", "已退出登录");
      }
    },
    /** 跨标签页登录/登出联动 */
    setupStorageListener() {
      window.addEventListener("storage", (ev) => {
        if (ev.key === ST.keys.loginStatus && ev.newValue === "login_success") {
          api.refreshApiKey();
          localStorage.removeItem(ST.keys.loginStatus);
        }
        if (ev.key === ST.keys.logout && ev.newValue === "true") {
          state.apiKey = "";
          if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", "");
          NI.ui.updateState();
          localStorage.removeItem(ST.keys.logout);
        }
      });
    },
    /** 监听页面内的登出按钮 */
    monitorLogout() {
      document.addEventListener("click", (e) => {
        const b = e.target.closest("#logoutBtn,.logout-btn");
        if (
          b ||
          /登出|注销|退出|logout|sign out/i.test(e.target.textContent || "")
        )
          ST.set(ST.keys.logout, "true");
      });
    },
    /** 登录页轮询：发现登录后仅关闭脚本发起的窗口 */
    startLoginStatusCheck() {
      const t = setInterval(async () => {
        try {
          const ok = await api.refreshApiKey();
          if (ok) {
            clearInterval(t);
            ST.remove(ST.keys.loginStatus);
            ST.set(ST.keys.loginCheck, Date.now() + "");
            if (this.shouldAutoClose()) setTimeout(() => window.close(), 800);
          }
        } catch {}
      }, 3000);
      setTimeout(() => clearInterval(t), 300000);
    },
    /** 当前窗口是否为脚本发起的登录窗口 */
    shouldAutoClose() {
      try {
        const p = new URLSearchParams(location.search || "");
        if (window.name === "nodeimage-login") return true;
        if (p.get("ni_from") === "userscript") return true;
      } catch {}
      return false;
    },
    /** NodeImage 站点入口处理 */
    handleNodeImageSite() {
      if (["/login", "/register", "/"].includes(location.pathname))
        this.startLoginStatusCheck();
      else if (ST.get(ST.keys.loginStatus) === "login_pending")
        this.checkLoginIfNeeded(true);
      this.monitorLogout();
    },
    /**
     * 手动设置 API Key（回退方案）。
     * 用途：无法通过 Cookie 自动获取时，允许用户手动粘贴保存。
     * @returns {Promise<boolean>} 是否保存成功
     */
    async promptManualApiKey() {
      try {
        const cur = NI.state.apiKey || (NI.kv && NI.kv.get && NI.kv.get('nodeimage_apiKey','')) || '';
        const v = prompt('请输入 NodeImage API Key', cur);
        if (!v) return false;
        NI.state.apiKey = v.trim();
        if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set('nodeimage_apiKey', NI.state.apiKey);
        if (NI.ui && NI.ui.updateState) NI.ui.updateState();
        if (NI.ui && NI.ui.setStatus) NI.ui.setStatus('success', 'API Key 已更新', 1500);
        return true;
      } catch {
        return false;
      }
    },
  };
})();
