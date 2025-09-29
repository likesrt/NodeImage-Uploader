/**
 * 站点上下文 Cookie 代理（内容脚本）：
 * 注入到 https://*.nodeimage.com/* 页面，代为执行携带 Cookie 的 fetch。
 */
(function(){
  'use strict';
  // 注入页面世界的 fetch 桥脚本（仅一次）
  try {
    if (!document.getElementById('ni-page-fetch-bridge')) {
      const s = document.createElement('script');
      s.id = 'ni-page-fetch-bridge';
      s.src = chrome.runtime.getURL('page-fetch-bridge.js');
      (document.head || document.documentElement).appendChild(s);
    }
  } catch {}

  // 接收后台指令，转发给页面桥，并等待回包
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.__ni_site_fetch !== true) return false;
      const id = 'pf_' + Math.random().toString(36).slice(2);
      const opts = msg.opts || {};
      const onMessage = (evt) => {
        const data = evt && evt.data;
        if (!data || data.__ni_page_fetch_res !== true || data.id !== id) return;
        window.removeEventListener('message', onMessage, true);
        try { sendResponse(data.res || {}); } catch {}
      };
      window.addEventListener('message', onMessage, true);
      try { window.postMessage({ __ni_page_fetch_req: true, id, opts }, '*'); }
      catch (e) {
        window.removeEventListener('message', onMessage, true);
        try { sendResponse({ error: String(e && e.message || e) }); } catch {}
      }
      return true; // 异步响应
    });
  } catch {}
})();
