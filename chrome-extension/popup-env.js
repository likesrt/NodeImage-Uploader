/**
 * 扩展弹窗环境 GM_* 兼容层：供 modules 与 NI.boot 使用。
 * 注意：该文件需在 modules 之前加载。
 */

/* global chrome */

(function(){
  'use strict';

  /**
   * 注入样式到弹窗文档。
   * @param {string} css CSS 文本
   */
  function GM_addStyle(css){
    try{
      const s=document.createElement('style');
      s.type='text/css'; s.textContent=String(css||'');
      (document.head||document.documentElement).appendChild(s);
    }catch{}
  }

  /** 本地 KV 存取（同步） */
  function GM_setValue(k,v){ try{ localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); }catch{} }
  function GM_getValue(k,d){ try{ const v=localStorage.getItem(k); if(v==null) return d; try{ return JSON.parse(v);}catch{return v;} }catch{ return d; } }
  function GM_deleteValue(k){ try{ localStorage.removeItem(k);}catch{} }

  /**
   * 统一后台代理 XHR（支持 Cookie 与 FormData）。
   * @param {Object} opts 请求参数
   */
  async function GM_xmlhttpRequest(opts){
    const { method='GET', url, headers={}, data=null, withCredentials=false, responseType='json', onload, onerror } = opts||{};
    if(!url) return;
    const isForm=(typeof FormData!=='undefined') && (data instanceof FormData);
    let formParts=null, raw=null;
    if(isForm){
      const toBase64=(ab)=>{ let b=''; const bytes=new Uint8Array(ab); for(let i=0;i<bytes.byteLength;i++) b+=String.fromCharCode(bytes[i]); return btoa(b); };
      formParts=[];
      for(const [k,v] of data.entries()){
        if(v instanceof File || (typeof Blob!=='undefined' && v instanceof Blob)){
          const fileName=(v&&v.name)||'blob'; const mime=v.type||'application/octet-stream'; const ab=await v.arrayBuffer();
          formParts.push({ kind:'file', key:k, fileName, mime, base64: toBase64(ab), lastModified:v.lastModified||Date.now() });
        }else{ formParts.push({ kind:'text', key:k, value:String(v) }); }
      }
    } else if (data!=null) raw=data;
    try{
      chrome.runtime.sendMessage({ __ni_gm_xhr:true, opts:{ method, url, headers, responseType, withCredentials, formParts, data: raw } }, (res)=>{
        const err = (chrome.runtime && chrome.runtime.lastError) || null;
        if(err){ try{ if(typeof onerror==='function') onerror(err.message||err);}catch{} return; }
        if(!res || res.error){ try{ if(typeof onerror==='function') onerror(res&&res.error);}catch{} return; }
        try{ if(typeof onload==='function') onload(res); }catch{}
      });
    }catch(e){ try{ if(typeof onerror==='function') onerror(e);}catch{} }
  }

  try{
    window.GM_addStyle=GM_addStyle;
    window.GM_setValue=GM_setValue;
    window.GM_getValue=GM_getValue;
    window.GM_deleteValue=GM_deleteValue;
    window.GM_xmlhttpRequest=GM_xmlhttpRequest;
    window.GM_registerMenuCommand=function(){};
  }catch{}
})();
