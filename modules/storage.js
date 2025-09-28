;(function () {
  /**
   * @module storage
   * 提供键值存储（Tampermonkey KV 与 localStorage）的统一封装。
   */
  const NI = (window.NI = window.NI || {});

  /**
   * Tampermonkey KV 封装。
   * @namespace NI.kv
   */
  NI.kv = {
    /** 读取键值 */
    get(key, def = "") {
      try { return GM_getValue(key, def); } catch { return def; }
    },
    /** 写入键值 */
    set(key, val) {
      try { GM_setValue(key, val); } catch {}
    },
  };

  /**
   * localStorage 封装与键名常量。
   * @namespace NI.storage
   */
  NI.storage = {
    /** 常用键名常量 */
    keys: {
      loginStatus: "nodeimage_loginStatus",
      logout: "nodeimage_logout",
      loginCheck: "nodeimage_loginCheck",
    },
    /** 读取 */
    get(key) { return localStorage.getItem(key); },
    /** 写入 */
    set(key, v) { localStorage.setItem(key, v); },
    /** 删除 */
    remove(key) { localStorage.removeItem(key); },
  };
})();
