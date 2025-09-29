/**
 * 内容脚本入口：
 * - 提供 GM_* 兼容层（同步 API：get/set/delete、addStyle、xmlhttpRequest）
 * - 顺序加载本扩展内置的 modules/*.js，并调用 NI.boot()
 * - 目标：在 Edge/Chrome 上实现与油猴脚本一致的界面、样式与功能
 */

/* global chrome */

(function () {
  'use strict';
  try { console.info('[NodeImage-Ext] content script loaded'); } catch {}

  /**
   * GM_addStyle 兼容：将 CSS 文本注入到页面 <head>
   * @param {string} css 样式文本
   */
  function GM_addStyle(css) {
    try {
      const style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.textContent = String(css || '');
      (document.head || document.documentElement).appendChild(style);
    } catch {}
  }

  /**
   * GM_setValue/GM_getValue/GM_deleteValue 兼容：使用页面 localStorage 实现同步能力。
   * 说明：与油猴脚本的 KV 行为一致（同步 API），避免异步 storage 带来的改造成本。
   */
  function GM_setValue(key, value) {
    try {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, v);
    } catch {}
  }
  function GM_getValue(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return def;
      try { return JSON.parse(v); } catch { return v; }
    } catch { return def; }
  }
  function GM_deleteValue(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  /**
   * GM_xmlhttpRequest 兼容（基于 fetch，实现跨域请求；配合 DNR/webRequest 绕过 CORS）。
   * 仅实现本项目所需字段：method/url/headers/data/withCredentials/responseType/onload/onerror。
   * @param {Object} opts 请求参数
   */
  async function GM_xmlhttpRequest(opts) {
    const {
      method = 'GET', url,
      headers = {}, data = null,
      withCredentials = false,
      responseType = 'json',
      onload, onerror,
    } = opts || {};
    if (!url) return;
    // 统一后台代理：所有请求均通过后台执行，以稳定绕过 CORS，并结合 DNR 自定义 Origin
    const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
    let formParts = null;
    let raw = null;
    if (isForm) {
      const toBase64 = (ab) => {
        let b = '';
        const bytes = new Uint8Array(ab);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) b += String.fromCharCode(bytes[i]);
        return btoa(b);
      };
      formParts = [];
      for (const [k, v] of data.entries()) {
        if (v instanceof File || (typeof Blob !== 'undefined' && v instanceof Blob)) {
          const fileName = (v && v.name) || 'blob';
          const mime = v.type || 'application/octet-stream';
          const ab = await v.arrayBuffer();
          formParts.push({ kind: 'file', key: k, fileName, mime, base64: toBase64(ab), lastModified: v.lastModified || Date.now() });
        } else {
          formParts.push({ kind: 'text', key: k, value: String(v) });
        }
      }
    } else if (data != null) {
      raw = data;
    }
    try {
      // 发送到后台脚本处理
      chrome.runtime.sendMessage({ __ni_gm_xhr: true, opts: { method, url, headers, responseType, withCredentials, formParts, data: raw } }, (res) => {
        const err = (chrome.runtime && chrome.runtime.lastError) || null;
        if (err) {
          console.log('[NodeImage-Ext Content] Runtime error:', err.message || err);
          try { if (typeof onerror === 'function') onerror(err.message || err); } catch {}
          return;
        }
        if (!res || res.error) {
          console.log('[NodeImage-Ext Content] Request error:', res && res.error);
          try { if (typeof onerror === 'function') onerror(res && res.error); } catch {}
          return;
        }
        console.log('[NodeImage-Ext Content] Request success:', method, url, res.status || 'OK');
        try { if (typeof onload === 'function') onload(res); } catch {}
      });
    } catch (e) {
      console.error('[NodeImage-Ext Content] Send message error:', e);
      try { if (typeof onerror === 'function') onerror(e); } catch {}
    }
    return;
  }

  // 暴露到隔离环境全局，供 modules 使用
  // 说明：直接在 window 挂载以便 IIFE 模块可见。
  try {
    // eslint-disable-next-line no-undef
    window.GM_addStyle = GM_addStyle;
    window.GM_setValue = GM_setValue;
    window.GM_getValue = GM_getValue;
    window.GM_deleteValue = GM_deleteValue;
    window.GM_xmlhttpRequest = GM_xmlhttpRequest;
    window.GM_registerMenuCommand = function () {};
  } catch {}

  // 模块通过 manifest 的 content_scripts 依次注入。
  // 这里仅在其准备好后调用 NI.boot，并做可压缩类型兜底。
  function bootWhenReady() {
    const MAX_WAIT = 5000;
    const start = Date.now();
    const tick = () => {
      if (window.NI && typeof window.NI.boot === 'function') {
        try {
          if (window.NI.filetype && typeof window.NI.filetype.canCompress !== 'function') {
            window.NI.filetype.canCompress = function (ext) {
              return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(String(ext || '').toLowerCase());
            };
          }
        } catch {}
        try { window.NI.boot(); } catch (e) { console.error('[NodeImage-Ext] 启动失败:', e); }
        return;
      }
      if (Date.now() - start < MAX_WAIT) setTimeout(tick, 50);
      else console.error('[NodeImage-Ext] NI 未准备就绪，启动超时');
    };
    tick();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') bootWhenReady();
  else document.addEventListener('DOMContentLoaded', bootWhenReady, { once: true });

  // 接收后台点击图标的打开面板指令
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // 处理打开面板指令
      if (msg && msg.__ni_open_panel) {
        try {
          if (window.NI && window.NI.ui && typeof window.NI.ui.openPanel === 'function') {
            window.NI.ui.openPanel();
            try { sendResponse({ ok: true }); } catch {}
          } else {
            try { sendResponse({ ok: false, error: 'NI not ready' }); } catch {}
          }
        } catch (e) {
          try { sendResponse({ ok: false, error: e.message }); } catch {}
        }
        return;
      }


      return false;
    });
  } catch {}
})();