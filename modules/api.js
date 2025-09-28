(function () {
  /**
   * @module api
   * 与 NodeImage 服务端的 API 通讯封装。
   */
  const NI = (window.NI = window.NI || {});
  const { config, state } = NI;

  /**
   * 低层请求封装（基于 GM_xmlhttpRequest）。
   * @param {Object} opts
   * @param {string} opts.url 请求地址
   * @param {('GET'|'POST'|'DELETE')} [opts.method='GET'] 方法
   * @param {Object|FormData|null} [opts.data=null] 数据
   * @param {Object} [opts.headers={}] 额外请求头
   * @param {boolean} [opts.withAuth=false] 是否附加 X-API-Key
   * @returns {Promise<any>} JSON 响应体
   */
  function request({
    url,
    method = "GET",
    data = null,
    headers = {},
    withAuth = false,
  }) {
    return new Promise((resolve, reject) => {
      const h = {
        Accept: "application/json",
        ...(withAuth && state.apiKey ? { "X-API-Key": state.apiKey } : {}),
        ...headers,
      };
      GM_xmlhttpRequest({
        method,
        url,
        headers: h,
        data,
        withCredentials: true,
        responseType: "json",
        onload: (r) => {
          if (r.status === 200 && r.response) resolve(r.response);
          else reject(r);
        },
        onerror: reject,
      });
    });
  }

  NI.api = {
    /**
     * 刷新并缓存 API Key（需登录 Cookie）。
     * @returns {Promise<boolean>} 是否成功
     */
    async refreshApiKey() {
      try {
        const r = await request({ url: config.ENDPOINTS.apiKey });
        if (r && r.api_key) {
          state.apiKey = r.api_key;
          // 使用 KV 封装，避免直接依赖 GM_setValue
          if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", state.apiKey);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    /**
     * 上传单个图片文件（自动根据魔数纠正扩展名与 MIME）。
     * @param {File} file 原始文件
     * @returns {Promise<any>} 服务端返回对象
     */
    async upload(file) {
      const det = await NI.filetype.detect(file);
      if (!det) throw new Error("无法识别的图片格式");
      const { ext, mime } = det;
      const newName = NI.filetype.normalizeName(file.name, ext);
      if (file.type !== mime || file.name.toLowerCase() !== newName.toLowerCase()) {
        const buf = await file.arrayBuffer();
        file = new File([buf], newName, { type: mime });
      }
      let up = file;
      // Only attempt canvas-based compression for raster formats we support
      if (up.size > config.MAX_FILE_SIZE && NI.filetype.canCompress(ext)) {
        up = await NI.utils.compress(up, mime);
      }
      const fd = new FormData();
      fd.append("image", up, up.name);
      const res = await request({
        url: config.ENDPOINTS.upload,
        method: "POST",
        data: fd,
        withAuth: true,
      });
      if (res && (res.success || res.links)) return res;
      const msg = (res && (res.error || res.message)) || "上传失败";
      if (/unauthorized|invalid api key|未授权|无效/i.test(msg)) {
        state.apiKey = "";
        if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", "");
      }
      throw new Error(msg);
    },
    /**
     * 获取图片列表。
     * @returns {Promise<Array>} 图片数组
     */
    async list() {
      try {
        const r = await request({
          url: config.ENDPOINTS.list,
          method: "GET",
          withAuth: true,
        });
        if (Array.isArray(r?.images)) return r.images;
        return [];
      } catch {
        return [];
      }
    },
    /**
     * 删除图片。
     * @param {string} id 图片 ID
     * @returns {Promise<boolean>} 是否成功
     */
    async del(id) {
      const url = config.ENDPOINTS.del(id);
      const r = await request({ url, method: "DELETE", withAuth: true });
      if (r?.success) return true;
      if (r?.error) throw new Error(r.error);
      return false;
    },
  };
})();
