/**
 * 后台脚本（MV3 Service Worker）
 * - 仅保留安装日志与未来扩展点
 * - CORS 处理依赖 DNR 规则；不使用阻塞式 webRequest（MV3 受限）
 */

/* global chrome */

/**
 * 安装/更新时日志与（可选）动态规则初始化。
 * 目前主要依赖静态 DNR 规则（rules.json），此处仅留扩展点。
 */
chrome.runtime.onInstalled.addListener(() => {
  // 简单日志，便于排查
  console.log('[NodeImage-Ext] onInstalled');
});

/**
 * 点击扩展图标：尝试通知当前活动页打开管理面板；若页面未注入则回退打开目标站点。
 */
try {
  chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) return;
    const openPanel = () => {
      try {
        chrome.tabs.sendMessage(tab.id, { __ni_open_panel: true }, (res) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            // 没有接收端：动态注入内容脚本与模块，再次尝试
            try {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'content.js',
                  'modules/config.js',
                  'modules/storage.js',
                  'modules/utils.js',
                  'modules/filetype.js',
                  'modules/api.js',
                  'modules/integration.js',
                  'modules/ui.js',
                  'modules/handler.js',
                  'modules/auth.js',
                  'modules/boot.js'
                ],
              }, () => {
                // 注入后再次尝试打开
                setTimeout(() => {
                  try {
                    chrome.tabs.sendMessage(tab.id, { __ni_open_panel: true }, () => void 0);
                  } catch {}
                }, 100);
              });
            } catch {}
          }
        });
      } catch {}
    };
    openPanel();
  });
} catch {}

/**
 * 处理带凭据的跨域请求（仅用于必须携带 Cookie 的接口，例如刷新 API Key）。
 * 内容脚本通过 chrome.runtime.sendMessage 调用。
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.__ni_gm_xhr !== true) return false;
  const opts = msg.opts || {};
  const method = opts.method || 'GET';
  const url = opts.url;
  const headers = opts.headers || {};
  const responseType = opts.responseType || 'json';
  let body = opts.data || undefined;
  if (!url) { try { sendResponse({ error: 'no url' }); } catch {} return false; }
  (async () => {
    try {
      const doSiteFetch = async () => {
        const tabs = await chrome.tabs.query({ url: [
          'https://www.nodeimage.com/*',
          'https://nodeimage.com/*',
          'https://*.nodeimage.com/*'
        ]});
        let tab = tabs && tabs[0];
        let createdTemp = false;
        if (!tab) {
          tab = await chrome.tabs.create({ url: 'https://www.nodeimage.com/?ni_from=extension', active: false });
          createdTemp = true;
          await new Promise((res) => {
            const onUpdated = (tid, info) => { if (tid === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); res(); } };
            chrome.tabs.onUpdated.addListener(onUpdated);
          });
        }
        const formParts = Array.isArray(opts.formParts) ? opts.formParts : null;
        return await new Promise((resolve, reject) => {
          // 传递formParts给页面bridge，让页面重建FormData
          chrome.tabs.sendMessage(tab.id, { __ni_site_fetch: true, opts: { method, url, responseType, formParts } }, async (res) => {
            const err = chrome.runtime && chrome.runtime.lastError;
            if (err) { if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} } return reject(err.message || String(err)); }
            if (!res || res.error) { if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} } return reject(res && res.error); }
            if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} }
            resolve(res);
          });
        });
      };

      if (opts.withCredentials) {
        try {
          const r = await doSiteFetch();
          sendResponse(r);
          return;
        } catch (e) {
          // fallback to background fetch
        }
      }
      // 若收到序列化的 formParts，则在后台重建 FormData（支持 base64 或 ArrayBuffer 两种传输）
      const parts = Array.isArray(opts.formParts) ? opts.formParts : null;
      if (parts && parts.length) {
        const fd = new FormData();
        for (const p of parts) {
          if (p && p.kind === 'file' && p.buffer) {
            try {
              const u8 = new Uint8Array(p.buffer);
              const file = new File([u8], p.fileName || 'blob', { type: p.mime || 'application/octet-stream', lastModified: p.lastModified || Date.now() });
              fd.append(p.key, file, p.fileName || 'blob');
            } catch (e) {
              // 回退为 Blob
              try {
                const u8 = new Uint8Array(p.buffer);
                const blob = new Blob([u8], { type: p.mime || 'application/octet-stream' });
                fd.append(p.key, blob, p.fileName || 'blob');
              } catch {}
            }
          } else if (p && p.kind === 'text') {
            fd.append(p.key, p.value != null ? String(p.value) : '');
          }
        }
        body = fd;
        // 让浏览器自动设置 multipart/form-data 的 boundary，移除可能的手动 content-type
        try { delete headers['content-type']; delete headers['Content-Type']; } catch {}
      }
      // 兼容 base64 文件传输
      if (parts && parts.length && !(body instanceof FormData)) {
        const fd = new FormData();
        for (const p of parts) {
          if (p && p.kind === 'file' && p.base64) {
            try {
              const bin = atob(p.base64);
              const len = bin.length;
              const bytes = new Uint8Array(len);
              for (let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
              const file = new File([bytes], p.fileName || 'blob', { type: p.mime || 'application/octet-stream', lastModified: p.lastModified || Date.now() });
              fd.append(p.key, file, p.fileName || 'blob');
            } catch (e) {}
          } else if (p && p.kind === 'text') {
            fd.append(p.key, p.value != null ? String(p.value) : '');
          }
        }
        body = fd;
        try { delete headers['content-type']; delete headers['Content-Type']; } catch {}
      }
      const resp = await fetch(url, {
        method,
        headers,
        credentials: opts.withCredentials ? 'include' : 'omit',
        cache: 'no-cache',
        mode: 'cors',
        body,
      });
      const ct = resp.headers.get('content-type') || '';
      let payloadText = '';
      let payloadJson = null;
      try {
        if (responseType === 'json' || ct.includes('application/json')) payloadJson = await resp.json();
        else payloadText = await resp.text();
      } catch (e) {
        try { payloadText = await resp.text(); } catch {}
      }
      sendResponse({
        status: resp.status,
        statusText: resp.statusText,
        response: payloadJson,
        responseText: payloadText,
        responseHeaders: Array.from(resp.headers?.entries?.() || []).map(([name, value]) => ({ name, value })),
      });
    } catch (e) {
      sendResponse({ error: String(e && e.message || e) });
    }
  })();
  return true; // 异步响应
});
