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
        Referer: "https://www.nodeimage.com/",
        Origin: "https://www.nodeimage.com",
        ...(withAuth && state.apiKey ? { "X-API-Key": state.apiKey } : {}),
        ...headers,
      };

      // Debug 日志：请求开始
      if (config.DEBUG) {
        console.group(`🔗 [NodeImage API] ${method} ${url}`);
        console.log("📤 请求详情:", {
          method,
          url,
          headers: h,
          withAuth,
          withCredentials,
          dataType: data instanceof FormData ? 'FormData' : typeof data,
          dataSize: data instanceof FormData ? '[FormData]' : data ? JSON.stringify(data).length + ' bytes' : 0
        });
        if (data instanceof FormData) {
          console.log("📎 FormData 内容:");
          for (const [key, value] of data.entries()) {
            if (value instanceof File) {
              console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
            } else {
              console.log(`  ${key}: ${value}`);
            }
          }
        }
      }

      GM_xmlhttpRequest({
        method,
        url,
        headers: h,
        data,
        withCredentials,
        responseType: "json",
        onload: (r) => {
          // Debug 日志：响应接收
          if (config.DEBUG) {
            console.log("📥 响应详情:", {
              status: r.status,
              statusText: r.statusText,
              response: r.response,
              responseText: r.responseText?.substring(0, 500) + (r.responseText?.length > 500 ? '...' : ''),
            });
          }

          // 放宽判断：2xx 均视为成功；优先使用 r.response，否则尝试解析 responseText；都没有时返回空对象
          if (r.status >= 200 && r.status < 300) {
            if (config.DEBUG) {
              console.log("✅ 请求成功");
              console.groupEnd();
            }
            if (r.response != null) return resolve(r.response);
            try { return resolve(JSON.parse(r.responseText || "{}")); } catch { return resolve({}); }
          }

          if (config.DEBUG) {
            console.error("❌ 请求失败:", r);
            console.groupEnd();
          }
          reject(r);
        },
        onerror: (err) => {
          if (config.DEBUG) {
            console.error("❌ 请求错误:", err);
            console.groupEnd();
          }
          reject(err);
        },
      });
    });
  }

  NI.api = {
    /**
     * 刷新并缓存 API Key（需登录 Cookie）。
     * @returns {Promise<boolean>} 是否成功
     */
    async refreshApiKey() {
      if (config.DEBUG) {
        console.log("🔑 [NodeImage] 开始刷新 API Key");
      }
      try {
        const r = await request({ url: config.ENDPOINTS.apiKey, withCredentials: true });
        if (r && r.api_key) {
          state.apiKey = r.api_key;
          // 使用 KV 封装，避免直接依赖 GM_setValue
          if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", state.apiKey);
          if (config.DEBUG) {
            console.log("✅ [NodeImage] API Key 刷新成功:", state.apiKey.substring(0, 10) + "...");
          }
          return true;
        }
        if (config.DEBUG) {
          console.warn("⚠️ [NodeImage] API Key 响应无效:", r);
        }
        return false;
      } catch (e) {
        if (config.DEBUG) {
          console.error("❌ [NodeImage] API Key 刷新失败:", e);
        }
        return false;
      }
    },
    /**
     * 上传单个图片文件（自动根据魔数纠正扩展名与 MIME）。
     * @param {File} file 原始文件
     * @returns {Promise<any>} 服务端返回对象
     */
    async upload(file) {
      if (config.DEBUG) {
        console.group("📤 [NodeImage] 开始上传文件");
        console.log("原始文件:", file.name, file.size, "bytes", file.type);
      }

      const det = await NI.filetype.detect(file);
      if (!det) throw new Error("无法识别的图片格式");
      const { ext, mime } = det;
      const newName = NI.filetype.normalizeName(file.name, ext);

      if (config.DEBUG) {
        console.log("文件类型检测:", { ext, mime, newName });
      }

      if (file.type !== mime || file.name.toLowerCase() !== newName.toLowerCase()) {
        const buf = await file.arrayBuffer();
        file = new File([buf], newName, { type: mime });
        if (config.DEBUG) {
          console.log("文件已标准化:", file.name, file.type);
        }
      }

      let up = file;
      // Only attempt canvas-based compression for raster formats we support
      if (up.size > config.MAX_FILE_SIZE && NI.filetype.canCompress(ext)) {
        if (config.DEBUG) {
          console.log("开始压缩文件 (大小超过", config.MAX_FILE_SIZE, "bytes)");
        }
        up = await NI.utils.compress(up, mime);
        if (config.DEBUG) {
          console.log("压缩完成:", up.size, "bytes (压缩率:", Math.round((1 - up.size/file.size) * 100), "%)");
        }
      }

      const fd = new FormData();
      fd.append("image", up, up.name);

      if (config.DEBUG) {
        console.log("FormData 准备完成:", up.name, up.size, "bytes");
      }
      
      // 优先使用 Cookie 模式（页面桥 withCredentials: true，不附加 X-API-Key）
      try {
        if (config.DEBUG) {
          console.log("🍪 尝试 Cookie 认证模式上传...");
        }
        const cookieEndpoint = 'https://api.nodeimage.com/upload';
        const res = await request({
          url: cookieEndpoint,
          method: "POST",
          data: fd,
          withAuth: false,
          withCredentials: true,
        });
        if (res && (res.success || res.links)) {
          if (config.DEBUG) {
            console.log("✅ Cookie 模式上传成功!");
            console.groupEnd();
          }
          return res;
        }
        const msg = (res && (res.error || res.message)) || "上传失败";
        throw new Error(msg);
      } catch (e) {
        if (config.DEBUG) {
          console.warn("⚠️ Cookie 模式失败:", e.message, "尝试 API Key 模式...");
        }
        // 备用：尝试 API Key 模式
        try {
          const res2 = await request({
            url: config.ENDPOINTS.upload,
            method: "POST",
            data: fd,
            withAuth: true,
            withCredentials: false,
          });
          if (res2 && (res2.success || res2.links)) {
            if (config.DEBUG) {
              console.log("✅ API Key 模式上传成功!");
              console.groupEnd();
            }
            return res2;
          }
          const msg = (res2 && (res2.error || res2.message)) || "上传失败";
          if (/unauthorized|invalid api key|未授权|无效/i.test(msg)) {
            state.apiKey = "";
            if (NI.kv && typeof NI.kv.set === 'function') NI.kv.set("nodeimage_apiKey", "");
            if (config.DEBUG) {
              console.warn("🔑 API Key 已失效，已清空");
            }
          }
          throw new Error(msg);
        } catch (e2) {
          if (config.DEBUG) {
            console.error("❌ API Key 模式也失败:", e2.message);
            console.groupEnd();
          }
        }
        throw e;
      }
    },
    /**
     * 获取图片列表。
     * @returns {Promise<Array>} 图片数组
     */
    async list() {
      if (config.DEBUG) {
        console.log("📋 [NodeImage] 获取图片列表...");
      }
      try {
        const r = await request({
          url: config.ENDPOINTS.list,
          method: "GET",
          withAuth: true,
          withCredentials: false,
        });
        if (Array.isArray(r?.images)) {
          if (config.DEBUG) {
            console.log("✅ [NodeImage] 获取图片列表成功:", r.images.length, "张图片");
          }
          return r.images;
        }
        if (config.DEBUG) {
          console.warn("⚠️ [NodeImage] 图片列表响应格式异常:", r);
        }
        return [];
      } catch (e) {
        if (config.DEBUG) {
          console.error("❌ [NodeImage] 获取图片列表失败:", e);
        }
        return [];
      }
    },
    /**
     * 删除图片。
     * @param {string} id 图片 ID
     * @returns {Promise<boolean>} 是否成功
     */
    async del(id) {
      if (config.DEBUG) {
        console.group("🗑️ [NodeImage] 删除图片:", id);
      }
      // 优先使用 Cookie 模式：使用 /api/images/:id 端点
      try {
        if (config.DEBUG) {
          console.log("🍪 尝试 Cookie 认证模式删除...");
        }
        const cookieDel = `https://api.nodeimage.com/api/images/${encodeURIComponent(id)}`;
        const r = await request({ url: cookieDel, method: "DELETE", withAuth: false, withCredentials: true });
        if (r?.success) {
          if (config.DEBUG) {
            console.log("✅ Cookie 模式删除成功!");
            console.groupEnd();
          }
          return true;
        }
        if (r?.error) throw new Error(r.error);
        return false;
      } catch (e) {
        if (config.DEBUG) {
          console.warn("⚠️ Cookie 模式失败:", e.message, "尝试 API Key 模式...");
        }
        // 备用 API Key 模式
        try {
          const url = config.ENDPOINTS.del(id);
          const r2 = await request({ url, method: "DELETE", withAuth: true, withCredentials: false });
          if (r2?.success) {
            if (config.DEBUG) {
              console.log("✅ API Key 模式删除成功!");
              console.groupEnd();
            }
            return true;
          }
          if (r2?.error) throw new Error(r2.error);
          if (config.DEBUG) {
            console.warn("⚠️ API Key 模式删除失败");
            console.groupEnd();
          }
          return false;
        } catch (e2) {
          if (config.DEBUG) {
            console.error("❌ API Key 模式也失败:", e2.message);
            console.groupEnd();
          }
        }
        throw e;
      }
    },
    /**
     * 基于 Cookie 的分页列表接口（优先尝试Cookie接口，失败回退API Key接口）。
     * 使用场景：当用户已登录（浏览器 Cookie 可用）时，直接按页获取，减少数据量。
     * 若返回 401/非 200 或数据格式不符，则回退至旧接口 NI.api.list() 并在前端分页。
     *
     * @param {number} [page=1] 页码（从 1 开始）
     * @param {number} [limit=config.LIST_PAGE_SIZE] 每页数量
     * @returns {Promise<{images: Array, pagination: {currentPage:number,totalPages:number,totalCount:number,hasNextPage:boolean,hasPrevPage:boolean}}>} 兼容结构
     */
    async listViaCookieOrFallback(page = 1, limit = config.LIST_PAGE_SIZE) {
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
        // 备用：使用 API Key 接口（无 Cookie、无临时页面），在前端分页
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
            // Continue to fallback
          }
        }
        // 彻底失败：返回空集
        return {
          images: [],
          pagination: { currentPage: 1, totalPages: 1, totalCount: 0, hasNextPage: false, hasPrevPage: false },
        };
      }
    },
  };
})();
