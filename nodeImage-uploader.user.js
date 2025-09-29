// ==UserScript==
// @name         NodeImage图片上传助手
// @namespace    https://api.nodeimage.com/
// @version      3.0.1
// @description  获取/保存 API Key、粘贴/拖拽上传、图片列表与删除、Markdown 插入（通过远程模块加载）
// @author       yuyan
// @match        *://www.nodeseek.com/*
// @match        *://nodeimage.com/*
// @match        *://*.nodeimage.com/*
// @match        *://*.deepflood.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @connect      cnb.cool
// @connect      api.nodeimage.com
// @connect      raw.githubusercontent.com
// @connect      localhost
// @homepageURL  https://github.com/likesrt/NodeImage-Uploader
// @supportURL   https://github.com/likesrt/NodeImage-Uploader/issues
// @downloadURL  https://raw.githubusercontent.com/likesrt/NodeImage-Uploader/main/nodeImage-uploader.user.js
// @updateURL    https://raw.githubusercontent.com/likesrt/NodeImage-Uploader/main/nodeImage-uploader.user.js
// ==/UserScript==

(function(){
  'use strict';

  const DEFAULT_BASE = 'https://raw.githubusercontent.com/likesrt/NodeImage-Uploader/refs/heads/main/modules/';
  // 缓存相关：仅自动更新，TTL 720 小时（≈30 天）
  const CACHE_TTL_MS = 720 * 60 * 60 * 1000;
  const MODULES = [
    'config.js',
    'storage.js',
    'utils.js',
    'filetype.js',
    'api.js',
    // 站点集成与编辑器桥接（提供 NI.editor/NI.integration）
    'integration.js',
    'ui.js',
    'handler.js',
    'auth.js',
    'boot.js',
  ];

  const getBase = () => GM_getValue('ni_module_base', DEFAULT_BASE);
  const setBase = (base) => GM_setValue('ni_module_base', base);

  /**
   * 生成模块缓存键（按基地址+模块名唯一区分）。
   * @param {string} base 模块基地址（以 / 结尾）
   * @param {string} mod 模块文件名
   */
  function cacheKey(base, mod){ return 'ni_cache:'+base.replace(/\/+$/, '/')+mod; }

  /**
   * 读取缓存。
   * @param {string} base 
   * @param {string} mod 
   * @returns {{text:string, ts:number}|null}
   */
  function getCache(base, mod){
    try { const raw = GM_getValue(cacheKey(base, mod), ''); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  /**
   * 写入缓存。
   * @param {string} base 
   * @param {string} mod 
   * @param {string} text 模块源码
   */
  function setCache(base, mod, text){
    try { GM_setValue(cacheKey(base, mod), JSON.stringify({ text, ts: Date.now() })); } catch {}
  }

  /**
   * 清空当前基地址下的模块缓存。
   * 注意：仅清理 MODULES 集合内的文件，避免误删其他数据。
   */
  // 已不提供全量清空菜单；使用“从远程拉取最新模块（覆盖缓存）”触发强制刷新。

  /**
   * 动态加载模块并在脚本沙箱内执行（带本地缓存）。
   * 策略：
   * - 命中“新鲜缓存”（未过期）则优先 eval 缓存并返回（零网络等待）
   * - 缓存缺失/过期：尝试网络拉取，成功则 eval 并写入缓存；失败则回退到缓存（若存在）
   * @param {string} base 模块基地址（以 / 结尾）
   * @param {string} mod 模块文件名
   * @returns {Promise<void>}
   */
  function loadModule(base, mod){
    const url = base.replace(/\/+$/, '/') + mod;
    return new Promise((resolve, reject) => {
      const cached = getCache(base, mod);
      const forceUpdate = !!GM_getValue('ni_force_update', 0);
      const fresh = cached && (Date.now() - (cached.ts||0) < CACHE_TTL_MS);

      // 自动更新：命中新鲜缓存直接执行（零网络等待）
      if (!forceUpdate && fresh && cached?.text) {
        try { eval(cached.text); return resolve(); } catch (e) {}
      }

      // 走网络拉取（首次无缓存，或手动强制更新，或自动更新且已过期）
      GM_xmlhttpRequest({
        method: 'GET', url,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300 && r.responseText) {
            try {
              eval(r.responseText);
              setCache(base, mod, r.responseText);
              resolve();
            } catch (e) {
              // 网络获取但执行失败：若有缓存则回退
              if (cached?.text) {
                try { eval(cached.text); return resolve(); } catch {}
              }
              reject(e);
            }
          } else {
            // 网络错误：若有缓存则回退
            if (cached?.text) {
              try { eval(cached.text); return resolve(); } catch {}
            }
            reject(new Error('HTTP '+r.status));
          }
        },
        onerror: () => {
          // 网络异常：若有缓存则回退
          if (cached?.text) {
            try { eval(cached.text); return resolve(); } catch {}
          }
          reject(new Error('Network error'));
        },
      });
    });
  }

  async function boot(){
    const base = getBase();
    for (const m of MODULES) {
      try { await loadModule(base, m); }
      catch (e) {
        console.error('[NodeImage] 模块加载失败:', m, e);
        alert('NodeImage 模块加载失败: '+m+'\n请检查模块仓库地址或网络');
        return;
      }
    }
    // 若为“强制更新”一次性拉取，完成后清除标记
    if (GM_getValue('ni_force_update', 0)) { try { GM_deleteValue('ni_force_update'); } catch {} }
    if (window.NI && typeof window.NI.boot === 'function') {
      window.NI.boot();
    } else if (typeof window.init === 'function') {
      // 兼容旧版全局 init
      window.init();
    }
  }

  GM_registerMenuCommand('设置模块仓库地址', () => {
    const cur = getBase();
    const v = prompt('请输入模块基地址（以 / 结尾）', cur);
    if (v) { setBase(v); location.reload(); }
  });

  // 已移除：切换缓存策略、清空缓存菜单（统一使用自动更新 TTL=720h）

  GM_registerMenuCommand('从远程拉取最新模块（覆盖缓存）', () => {
    if (confirm('将从远程拉取最新模块并覆盖缓存，随后刷新页面。\n是否继续？')) {
      try { GM_setValue('ni_force_update', Date.now()); } catch {}
      location.reload();
    }
  });

  // 主脚本更新：打开安装地址以触发管理器更新流程
  GM_registerMenuCommand('检查主脚本更新', () => {
    window.open('https://raw.githubusercontent.com/likesrt/NodeImage-Uploader/main/nodeImage-uploader.user.js', '_blank');
  });

  boot();
})();
