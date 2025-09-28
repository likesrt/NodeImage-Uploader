;(function () {
  /**
   * @module utils
   * 通用工具函数集合。
   */
  const NI = (window.NI = window.NI || {});

  NI.utils = {
    /** 判断当前是否 nodeimage 站点 */
    isNodeImageSite() {
      return /(^|\.)nodeimage\.com$/i.test(location.hostname);
    },
    /**
     * 等待选择器元素出现。
     * @param {string} sel CSS 选择器
     * @returns {Promise<Element>}
     */
    wait(sel) {
      return new Promise((r) => {
        const x = document.querySelector(sel);
        if (x) return r(x);
        const mo = new MutationObserver(() => {
          const y = document.querySelector(sel);
          if (y) {
            mo.disconnect();
            r(y);
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
      });
    },
    /** 当前是否处于编辑态（CodeMirror 或 textarea 聚焦） */
    isEditing() {
      const a = document.activeElement;
      return (
        a &&
        (a.classList?.contains("CodeMirror") ||
          a.closest?.(".CodeMirror") ||
          a.tagName === "TEXTAREA")
      );
    },
    /**
     * 在文本域光标处插入文本。
     * @param {HTMLTextAreaElement} ta 文本域
     * @param {string} text 插入文本
     */
    insertAtCursor(ta, text) {
      const s = ta.selectionStart ?? 0,
        e = ta.selectionEnd ?? 0;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      const p = s + text.length;
      ta.selectionStart = ta.selectionEnd = p;
    },
    /** Promise 版 sleep */
    delay(ms) {
      return new Promise((res) => setTimeout(res, ms));
    },
    /** 格式化文件大小 */
    fmtSize(bytes) {
      if (!bytes) return "0 Bytes";
      const k = 1024,
        u = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${u[i]}`;
    },
    /**
     * 以 Canvas 压缩位图文件（SVG/ICO/AVIF/TIFF 不在压缩范围）。
     * @param {File} file 原文件
     * @param {string} mime 目标 MIME 类型
     * @returns {Promise<File>} 压缩后的新文件
     */
    compress(file, mime) {
      return new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            c.toBlob(
              (b) => {
                if (b) res(new File([b], file.name, { type: mime }));
                else rej(new Error("图片压缩失败"));
              },
              mime,
              0.85
            );
          };
          img.onerror = () => rej(new Error("图片加载失败"));
          img.src = e.target.result;
        };
        rd.onerror = () => rej(new Error("文件读取失败"));
        rd.readAsDataURL(file);
      });
    },
    /**
     * 在面板顶部中心显示临时消息（旧版样式）。
     * 优先挂载到 #nodeimage-panel 内，使用 #panel-message 样式。
     * @param {string} text 文本
     * @param {number} [duration=1800] 显示时长（毫秒）
     */
    showPanelMessage(text, duration = 1800) {
      const panel = document.getElementById("nodeimage-panel");
      if (!panel) return false;
      let msgEl = document.getElementById("panel-message");
      if (!msgEl) {
        msgEl = document.createElement("div");
        msgEl.id = "panel-message";
        panel.appendChild(msgEl);
      }
      msgEl.textContent = text;
      msgEl.classList.add("show");
      clearTimeout(msgEl._t);
      msgEl._t = setTimeout(() => msgEl.classList.remove("show"), duration);
      return true;
    },
    /**
     * 简易 Toast 提示：在面板打开时优先使用旧版面板提示位置，否则使用底部悬浮。
     * @param {string} msg 文本
     */
    toast(msg) {
      // 面板存在时使用面板内提示（旧版位置/样式）
      const used = this.showPanelMessage(msg);
      if (used) return;
      // 回退：底部居中悬浮提示
      let el = document.getElementById("ni-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "ni-toast";
        el.style.cssText =
          "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#111827;color:#fff;padding:8px 12px;border-radius:8px;opacity:0;transition:.2s;z-index:99999;";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.style.opacity = "0";
      }, 1800);
    },
  };
})();
