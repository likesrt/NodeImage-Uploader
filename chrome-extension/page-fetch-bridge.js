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
      
      // 处理 formParts，重建 FormData
      const formParts = Array.isArray(opts.formParts) ? opts.formParts : null;
      if (formParts && formParts.length) {
        const fd = new FormData();
        for (const p of formParts) {
          if (p && p.kind === 'file') {
            if (p.base64) {
              try {
                const bin = atob(p.base64);
                const len = bin.length;
                const bytes = new Uint8Array(len);
                for (let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
                const file = new File([bytes], p.fileName || 'blob', { 
                  type: p.mime || 'application/octet-stream', 
                  lastModified: p.lastModified || Date.now() 
                });
                fd.append(p.key, file);
              } catch (e) {
                console.error('[Page Bridge] Failed to rebuild file from base64:', e);
              }
            } else if (p.buffer) {
              try {
                const u8 = new Uint8Array(p.buffer);
                const file = new File([u8], p.fileName || 'blob', { 
                  type: p.mime || 'application/octet-stream', 
                  lastModified: p.lastModified || Date.now() 
                });
                fd.append(p.key, file);
              } catch (e) {
                console.error('[Page Bridge] Failed to rebuild file from buffer:', e);
              }
            }
          } else if (p && p.kind === 'text') {
            fd.append(p.key, p.value != null ? String(p.value) : '');
          }
        }
        body = fd;
        // FormData 会自动设置正确的 Content-Type，删除可能的手动设置
        delete headers['content-type'];
        delete headers['Content-Type'];
      }
      
      try {
        // 确保设置正确的referer和origin
        const requestHeaders = {
          ...headers,
          'Referer': 'https://www.nodeimage.com/',
          'Origin': 'https://www.nodeimage.com'
        };
        
        // 页面上下文 fetch，自动携带当前站点 Cookie（SameSite 规则生效）
        const resp = await fetch(url, {
          method,
          headers: requestHeaders,
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

