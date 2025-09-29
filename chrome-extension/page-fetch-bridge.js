/**
 * 注入到页面上下文的桥：在页面世界执行 fetch（携带页面 Cookie 与正确的 sec-fetch-* 语义），
 * 通过 window.postMessage 收发数据。
 */
(function(){
  try {
    if (window.__NI_PAGE_FETCH_BRIDGE__) return; // 幂等
    window.__NI_PAGE_FETCH_BRIDGE__ = true;
    window.addEventListener('message', async function(evt){
      const data = evt && evt.data;
      if (!data || data.__ni_page_fetch_req !== true) return;
      const id = data.id;
      const opts = data.opts || {};
      const method = opts.method || 'GET';
      const url = opts.url;
      const headers = opts.headers || {};
      const responseType = opts.responseType || 'json';
      let body = opts.data || undefined;
      try {
        // 页面上下文 fetch，自动携带当前站点 Cookie（SameSite 规则生效）
        const resp = await fetch(url, {
          method,
          headers,
          credentials: 'include',
          cache: 'no-cache',
          mode: 'cors',
          body,
          referrerPolicy: 'strict-origin-when-cross-origin',
        });
        const ct = resp.headers.get('content-type') || '';
        let payloadText = '';
        let payloadJson = null;
        try {
          if (responseType === 'json' || ct.includes('application/json')) payloadJson = await resp.json();
          else payloadText = await resp.text();
        } catch (e) { try { payloadText = await resp.text(); } catch {} }
        window.postMessage({ __ni_page_fetch_res: true, id, res: {
          status: resp.status,
          statusText: resp.statusText,
          response: payloadJson,
          responseText: payloadText,
          responseHeaders: Array.from(resp.headers?.entries?.() || []).map(([name, value]) => ({ name, value })),
        } }, '*');
      } catch (e) {
        window.postMessage({ __ni_page_fetch_res: true, id, res: { error: String(e && e.message || e) } }, '*');
      }
    });
  } catch {}
})();

