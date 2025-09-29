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
    /** 查找 CodeMirror 实例 */
    getCodeMirror(){ const el=document.querySelector('.CodeMirror'); return el && (el.CodeMirror||el.__cm||el._cm); },
    /** 获取当前激活的 textarea */
    activeTextarea(){ return document.activeElement?.tagName==='TEXTAREA'?document.activeElement:document.querySelector('textarea'); },
    /** 获取 contenteditable 元素 */
    contentEditable(){ return document.querySelector('[contenteditable="true"]'); },
    /**
     * 插入 Markdown 文本到编辑器。
     * @param {string} md Markdown 字符串
     * @returns {boolean} 是否成功
     */
    insertMarkdown(md){
      if(!md) return false;
      const cm=this.getCodeMirror();
      if (cm && typeof cm.replaceSelection==='function'){ cm.replaceSelection(`\n${md}\n`); return true; }
      const ta=this.activeTextarea(); if (ta){ NI.utils.insertAtCursor(ta, `\n${md}\n`); return true; }
      const ce=this.contentEditable(); if (ce){
        try{ document.execCommand('insertText', false, `\n${md}\n`); return true; }catch{}
        try{ const node=document.createTextNode(`\n${md}\n`); const sel=window.getSelection(); if(sel&&sel.rangeCount){ const r=sel.getRangeAt(0); r.deleteContents(); r.insertNode(node); r.setStartAfter(node); r.setEndAfter(node); return true; } }catch{}
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
      const cfg=this.getSiteConfig();
      if (cfg && cfg.toolbarContainer){
        try{ const tb = await NI.utils.wait(cfg.toolbarContainer); NI.ui.setupToolbar(tb); }catch{}
      } else {
        // 回退到默认逻辑（兼容 NodeSeek）
        try{ const tb=await NI.utils.wait('.mde-toolbar'); NI.ui.setupToolbar(tb); }catch{}
      }
      // 绑定编辑器区域事件
      if (cfg && cfg.editorSelector){
        const root = document.querySelector(cfg.editorSelector) || document;
        NI.bindings.paste(root);
        NI.bindings.drop(root);
      } else {
        NI.bindings.paste(document);
        const cm = await (async()=>{ try{ return await NI.utils.wait('.CodeMirror'); }catch{} return null; })();
        if (cm) NI.handler.bindDrag(cm);
      }
      // 快捷键
      if (cfg && cfg.hotkeys) NI.bindings.shortcut(document, cfg.hotkeys);
    }
  };
})();
