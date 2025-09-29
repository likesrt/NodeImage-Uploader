;(function(){
  /**
   * @module integration
   * 站点适配与编辑器桥接：抽离插入、监听与挂载逻辑，便于多站点/多浏览器复用。
   */
  const NI = (window.NI = window.NI || {});

  /**
   * @typedef {Object} SiteConfig
   * @property {RegExp} host 匹配站点 host 的正则
   * @property {string} [toolbarContainer] 工具栏容器选择器
   * @property {string} [editorSelector] 编辑器区域选择器（如 .CodeMirror, textarea, [contenteditable=true]）
   * @property {Object.<string,string>} [hotkeys] 快捷键映射（如 {'Ctrl+Shift+U':'openPanel'}）
   */

  /**
   * 编辑器：统一不同编辑器的插入行为。
   * - 优先 CodeMirror
   * - 其次 textarea
   * - 最后 contenteditable 或 execCommand 兜底（移动端适配）
   */
  NI.editor = {
    // 保存编辑器DOM元素的引用（类似old.js的DOM.editor）
    editorElement: null,

    /** 查找并缓存 CodeMirror 实例 - 使用old.js的有效方式 */
    getCodeMirror(){
      // 如果已经缓存了编辑器元素，直接返回其CodeMirror实例
      if(this.editorElement && this.editorElement.CodeMirror) {
        return this.editorElement.CodeMirror;
      }

      // 查找CodeMirror元素
      const el = document.querySelector('.CodeMirror');
      if(el){
        // 保存元素引用（类似old.js的DOM.editor）
        this.editorElement = el;
        // 尝试多种方式获取CodeMirror实例
        const cm = el.CodeMirror || el.__cm || el._cm;
        return cm;
      }
      return null;
    },
    /** 获取当前激活的 textarea - 增强查找逻辑 */
    activeTextarea(){
      // 优先返回当前焦点的 textarea
      if(document.activeElement?.tagName==='TEXTAREA') return document.activeElement;

      // 查找CodeMirror内部的textarea（隐藏的但是实际使用的）
      const cmTextarea = document.querySelector('.CodeMirror textarea');
      if(cmTextarea) return cmTextarea;

      // 其次查找可见的 textarea
      const textareas = document.querySelectorAll('textarea');
      for(const ta of textareas){
        const style = getComputedStyle(ta);
        if(style.display !== 'none' && style.visibility !== 'hidden' && ta.offsetParent !== null){
          return ta;
        }
      }
      // 最后返回第一个 textarea
      return document.querySelector('textarea');
    },
    /** 获取 contenteditable 元素 */
    contentEditable(){ return document.querySelector('[contenteditable="true"]'); },
    /**
     * 插入 Markdown 文本到编辑器。
     * @param {string} md Markdown 字符串
     * @returns {boolean} 是否成功
     */
    insertMarkdown(md){
      if(!md) return false;

      // 使用和old.js相同的简单逻辑
      const cm = this.getCodeMirror();
      if (cm && typeof cm.getCursor === 'function' && typeof cm.replaceRange === 'function') {
        const cursor = cm.getCursor();
        cm.replaceRange(`\n${md}\n`, cursor);
        if (typeof cm.focus === 'function') {
          cm.focus();
        }
        return true;
      }

      // 备用方案：textarea
      const ta = this.activeTextarea();
      if (ta) {
        NI.utils.insertAtCursor(ta, `\n${md}\n`);
        ta.focus();
        return true;
      }

      return false;
    },

  };

  /** 绑定集合：快捷键/粘贴/拖拽 */
  NI.bindings = {
    /** 绑定快捷键 */
    shortcut(target, map){
      if(!target) target=document;
      target.addEventListener('keydown', (e)=>{
        const parts=[]; if(e.ctrlKey||e.metaKey) parts.push('Ctrl'); if(e.shiftKey) parts.push('Shift'); if(e.altKey) parts.push('Alt'); parts.push((e.key||'').toUpperCase());
        const key=parts.join('+');
        const action=map[key];
        if(action){ e.preventDefault(); if(action==='openPanel') NI.ui.openPanel(); if(typeof action==='function') action(e); }
      }, true);
    },
    /** 将粘贴事件委派到通用处理 */
    paste(target){
      const t = target || document;
      if (t.__ni_paste_bound__) return;
      t.__ni_paste_bound__ = true; // 简易标记，防止重复 addEventListener
      t.addEventListener('paste', NI.handler.onPaste, true);
    },
    /** 绑定拖拽上传 */
    drop(target){ if(!target) return; NI.handler.bindDrag(target); },
  };

  /**
   * 自动初始化站点适配：
   * - 根据 NI.config.SITES 查找匹配项
   * - 在 toolbarContainer 挂载状态/按钮
   * - 将粘贴/拖拽绑定到 editorSelector 或 fallback
   */
  NI.integration = {
    /**
     * 一次性启动 SPA 观察器：
     * - 监听 history.pushState/replaceState 与 popstate 触发 URL 变化
     * - 监听 DOM 变化以在目标容器/编辑器出现时自动挂载
     * 备注：避免重复安装，使用 _watching 作为幂等保护。
     */
    ensureWatchers(){
      if (this._watching) return;
      this._watching = true;
      this._lastUrl = location.href;
      const fireReinit = () => {
        clearTimeout(this._t);
        // 轻微防抖，等待路由完成渲染
        this._t = setTimeout(() => this.autoInit(), 120);
      };
      // patch history 以捕获单页路由跳转
      try {
        if (!history.__ni_patched) {
          const wrap = (fn) => function(){
            const ret = fn.apply(this, arguments);
            const cur = location.href;
            if (cur !== NI.integration._lastUrl) {
              NI.integration._lastUrl = cur;
              window.dispatchEvent(new Event('ni:locationchange'));
            }
            return ret;
          };
          history.pushState = wrap(history.pushState);
          history.replaceState = wrap(history.replaceState);
          history.__ni_patched = true;
        }
      } catch {}
      window.addEventListener('popstate', () => {
        const cur = location.href;
        if (cur !== this._lastUrl) {
          this._lastUrl = cur;
          window.dispatchEvent(new Event('ni:locationchange'));
        }
      }, true);
      window.addEventListener('ni:locationchange', fireReinit, true);

      // 观察 DOM 以在元素被替换/重建后重新挂载
      try {
        const mo = new MutationObserver(() => {
          const cfg = NI.integration.getSiteConfig();
          const tSel = (cfg && cfg.toolbarContainer) || '.mde-toolbar';
          const tb = document.querySelector(tSel);
          if (tb && !tb.querySelector('#nodeimage-toolbar-container')) {
            try { NI.ui.setupToolbar(tb); } catch {}
          }
          // CodeMirror 可能在 SPA 渲染后被替换，需重新缓存和绑定
          const cm = document.querySelector('.CodeMirror');
          if (cm) {
            // 如果是新的CodeMirror元素，更新缓存
            if (cm !== NI.editor.editorElement) {
              NI.editor.editorElement = cm;
            }
            try { NI.handler.bindDrag(cm); } catch {}
          }
          // 粘贴绑定委派到目标根（带幂等标记），在编辑器根出现时补一次
          if (cfg && cfg.editorSelector) {
            const root = document.querySelector(cfg.editorSelector);
            if (root) { try { NI.bindings.paste(root); } catch {} }
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
        this._mo = mo;
      } catch {}
    },
    /** 获取站点配置（支持 GM 覆盖） */
    getSiteConfig(){
      const sites = (NI.config && NI.config.SITES) || [];
      const host = location.host;
      for(const s of sites){ try{ if(s.host && s.host.test && s.host.test(host)) return s; }catch{} }
      // GM 覆盖（按需）
      return null;
    },
    /** 自动挂载工具栏与绑定编辑器事件 */
    async autoInit(){
      // 确保已安装 SPA 观察器（只安装一次）
      try { this.ensureWatchers(); } catch {}
      const cfg=this.getSiteConfig();
      if (cfg && cfg.toolbarContainer){
        try{ const tb = await NI.utils.wait(cfg.toolbarContainer); NI.ui.setupToolbar(tb); }catch{}
      } else {
        // 回退到默认逻辑（兼容 NodeSeek）
        try{ const tb=await NI.utils.wait('.mde-toolbar'); NI.ui.setupToolbar(tb); }catch{}
      }
      // 绑定编辑器区域事件 - 使用和old.js类似的逻辑
      NI.bindings.paste(document);

      // 等待CodeMirror元素并保存引用
      NI.utils.wait('.CodeMirror').then(editor => {
        // 保存编辑器元素引用
        NI.editor.editorElement = editor;
        // 绑定拖拽事件
        NI.handler.bindDrag(editor);
      }).catch(() => {
        // 如果没有找到CodeMirror，尝试其他编辑器
        if (cfg && cfg.editorSelector){
          const root = document.querySelector(cfg.editorSelector);
          if (root) NI.handler.bindDrag(root);
        }
      });

      // 快捷键
      if (cfg && cfg.hotkeys) NI.bindings.shortcut(document, cfg.hotkeys);
    }
  };
})();
