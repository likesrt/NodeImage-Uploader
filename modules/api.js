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
    withCredentials = false,
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
        withCredentials,
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
        const r = await request({ url: config.ENDPOINTS.apiKey, withCredentials: true });
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
      try {
        const res = await request({
          url: config.ENDPOINTS.upload,
          method: "POST",
          data: fd,
          withAuth: true,
          withCredentials: false,
        });
        if (res && (res.success || res.links)) return res;
        const msg = (res && (res.error || res.message)) || "上传失败";
        if (/unauthorized|invalid api key|未授权|无效/i.test(msg)) {
          state.apiKey = "";
          if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", "");
        }
        throw new Error(msg);
      } catch (e) {
        // 备用：尝试 Cookie 模式（页面桥 withCredentials: true，不附加 X-API-Key）
        try {
          const res2 = await request({
            url: config.ENDPOINTS.upload,
            method: "POST",
            data: fd,
            withAuth: false,
            withCredentials: true,
          });
          if (res2 && (res2.success || res2.links)) return res2;
        } catch {}
        throw e;
      }
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
          withCredentials: false,
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
      try {
        const r = await request({ url, method: "DELETE", withAuth: true, withCredentials: false });
        if (r?.success) return true;
        if (r?.error) throw new Error(r.error);
        return false;
      } catch (e) {
        // 备用 Cookie 模式
        try {
          const r2 = await request({ url, method: "DELETE", withAuth: false, withCredentials: true });
          if (r2?.success) return true;
        } catch {}
        throw e;
      }
    },
    /**
     * 基于 Cookie 的分页列表接口（优先尝试新接口，失败回退旧接口）。
     * 使用场景：当用户已登录（浏览器 Cookie 可用）时，直接按页获取，减少数据量。
     * 若返回 401/非 200 或数据格式不符，则回退至旧接口 NI.api.list() 并在前端分页。
     *
     * @param {number} [page=1] 页码（从 1 开始）
     * @param {number} [limit=config.LIST_PAGE_SIZE] 每页数量
     * @returns {Promise<{images: Array, pagination: {currentPage:number,totalPages:number,totalCount:number,hasNextPage:boolean,hasPrevPage:boolean}}>} 兼容结构
     */
    async listViaCookieOrFallback(page = 1, limit = config.LIST_PAGE_SIZE) {
      // 优先使用 API Key 接口（无 Cookie、无临时页面），仅当无 API Key 或失败时才使用 Cookie 分页接口。
      if (NI.state && NI.state.apiKey) {
        try {
          const all = await NI.api.list();
          const totalCount = Array.isArray(all) ? all.length : 0;
          const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, limit)));
          const safePage = Math.min(Math.max(1, page), totalPages);
          const start = (safePage - 1) * limit;
          const images = (all || []).slice(start, start + limit);
          return {
            images,
            pagination: {
              currentPage: safePage,
              totalPages,
              totalCount,
              hasNextPage: safePage < totalPages,
              hasPrevPage: safePage > 1,
            },
          };
        } catch (e) {
          // Fall through to cookie path
        }
      }
      // Cookie 分页（由页面桥发起，携带本地 Cookie；仅定制 Origin）
      const ts = Date.now();
      const url = `https://api.nodeimage.com/api/images?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}&_t=${ts}`;
      try {
        const data = await new Promise((resolve, reject) => {
          try {
            GM_xmlhttpRequest({
              method: 'GET',
              url,
              withCredentials: true,
              responseType: 'json',
              onload: (r) => {
                if (r && r.status >= 200 && r.status < 300) {
                  resolve(r.response || (()=>{ try { return JSON.parse(r.responseText||''); } catch { return null; } })());
                } else reject(new Error('http ' + (r && r.status)));
              },
              onerror: (e) => reject(e || new Error('network error')),
            });
          } catch (e) { reject(e); }
        });
        if (!data || !Array.isArray(data.images)) throw new Error('bad format');
        const images = data.images.map((it) => ({
          image_id: it.imageId || it.image_id || it.id || '',
          filename: it.filename || '',
          size: it.size ?? 0,
          url: it.url || '',
          links: it.url ? { direct: it.url, markdown: `![](${it.url})` } : undefined,
          upload_time: it.uploadTime || it.upload_time || undefined,
          mimetype: it.mimetype || it.mime || undefined,
          user_id: it.userId || it.user_id || undefined,
        }));
        const p = data.pagination || {};
        const totalCount = Number(p.totalCount ?? images.length) || 0;
        const totalPages = Number(p.totalPages ?? Math.max(1, Math.ceil(totalCount / Math.max(1, limit))));
        const currentPage = Number(p.currentPage ?? page) || 1;
        return {
          images,
          pagination: {
            currentPage,
            totalPages,
            totalCount,
            hasNextPage: Boolean(p.hasNextPage ?? currentPage < totalPages),
            hasPrevPage: Boolean(p.hasPrevPage ?? currentPage > 1),
          },
        };
      } catch (err) {
        // 彻底失败：返回空集
        return {
          images: [],
          pagination: { currentPage: 1, totalPages: 1, totalCount: 0, hasNextPage: false, hasPrevPage: false },
        };
      }
    },
  };
})();
