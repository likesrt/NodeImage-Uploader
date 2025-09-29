(function () {
  /**
   * @module ui
   * UI 相关：工具栏、登录按钮、管理面板、分页/删除/复制/插入等。
   */
  const NI = (window.NI = window.NI || {});
  const { utils, api, config, state } = NI;

  NI.ui = {
    /** 状态展示元素集合 */
    statusEls: new Set(),
    /** 登录按钮集合 */
    loginBtns: new Set(),
    /** 当前图片列表 */
    images: [],
    /** 选择集 */
    selected: new Set(),
    /** 当前页 */
    page: 1,
    /** 总页数（服务端/回退计算） */
    totalPages: 1,
    /** 总数量（服务端/回退计算） */
    totalCount: 0,
    /**
     * 生成缩略图链接（旧版逻辑）：将 /i/ 替换为 /thumb/，并使用 _thumb_medium.webp
     * @param {string} directUrl 原图直链
     * @returns {string} 缩略图链接
     */
    getThumbnailUrl(directUrl) {
      if (!directUrl) return "";
      try {
        let u = directUrl.replace("/i/", "/thumb/");
        u = u.replace(/\/([^\/]+)\.\w+$/, "/$1_thumb_medium.webp");
        return u;
      } catch {
        return directUrl;
      }
    },

    /** 设置状态并弹 Toast */
    setStatus(cls, msg, ttl) {
      for (const el of this.statusEls) {
        el.className = cls;
        el.textContent = msg;
      }
      if (ttl) setTimeout(() => this.updateState(), ttl);
      utils.toast(msg);
    },
    /** 根据登录状态刷新工具栏显示 */
    updateState() {
      const logged = !!state.apiKey;
      for (const b of this.loginBtns) {
        b.style.display = logged ? "none" : "inline-block";
      }
      const m = document.getElementById("nodeimage-manage-btn");
      if (m) m.style.display = logged ? "inline-block" : "none";
      for (const el of this.statusEls) {
        el.className = logged ? "success" : "info";
        el.textContent = logged ? "NodeImage已就绪" : "";
      }
    },
    /** 打开登录页（带来源标记） */
    openLogin() {
      const u =
        config.SITE_URL +
        (config.SITE_URL.includes("?") ? "&" : "?") +
        "ni_from=userscript";
      window.open(u, "nodeimage-login");
    },

    /** 打开面板并刷新列表 */
    async openPanel() {
      if (config.DEBUG) {
        console.group("🖼️ [NodeImage UI] 打开管理面板");
      }
      if (!document.getElementById("nodeimage-panel")) {
        if (config.DEBUG) {
          console.log("创建面板DOM结构...");
        }
        this.createPanel();
      }
      document.getElementById("nodeimage-panel").classList.add("show");
      document.querySelector(".panel-overlay").classList.add("show");
      if (config.DEBUG) {
        console.log("面板已显示，开始加载图片列表...");
      }
      await this.loadImages();
      if (config.DEBUG) {
        console.log("✅ 面板打开完成");
        console.groupEnd();
      }
    },
    /** 关闭面板并清理选择集 */
    closePanel() {
      const p = document.getElementById("nodeimage-panel");
      if (p) p.classList.remove("show");
      const o = document.querySelector(".panel-overlay");
      if (o) o.classList.remove("show");
      this.selected.clear();
      const sa = document.getElementById("select-all-btn");
      if (sa) sa.textContent = "全选";
    },

    /** 注入工具栏按钮与状态 */
    setupToolbar(tb) {
      if (!tb || tb.querySelector("#nodeimage-toolbar-container")) return;
      const c = document.createElement("div");
      c.id = "nodeimage-toolbar-container";
      c.className = "nodeimage-toolbar-container";
      tb.appendChild(c);
      const imgBtn = tb.querySelector(
        '.toolbar-item.i-icon.i-icon-pic[title="图片"]'
      );
      if (imgBtn) {
        const nb = imgBtn.cloneNode(true);
        imgBtn.parentNode.replaceChild(nb, imgBtn);
        nb.addEventListener("click", async () => {
          if (!state.apiKey && !(await NI.auth.checkLoginIfNeeded())) {
            this.openLogin();
            return;
          }
          const ip = document.createElement("input");
          ip.type = "file";
          ip.multiple = true;
          ip.accept = "image/*";
          ip.onchange = (e) =>
            NI.handler.handleFiles(Array.from(e.target.files || []));
          ip.click();
        });
      }
      const st = document.createElement("div");
      st.id = "nodeimage-status";
      st.className = "info";
      c.appendChild(st);
      this.statusEls.add(st);
      const lb = document.createElement("div");
      lb.className = "nodeimage-login-btn";
      lb.textContent = "点击登录NodeImage";
      lb.style.display = "none";
      lb.onclick = () => this.openLogin();
      c.appendChild(lb);
      this.loginBtns.add(lb);
      const mb = document.createElement("div");
      mb.id = "nodeimage-manage-btn";
      mb.className = "mdui-btn";
      mb.textContent = "打开管理面板";
      mb.style.display = "none";
      mb.onclick = () => this.openPanel();
      c.appendChild(mb);
      this.updateState();
    },

    /** 创建面板骨架与行为 */
    createPanel() {
      const ov = document.createElement("div");
      ov.className = "panel-overlay";
      ov.onclick = () => this.closePanel();
      document.body.appendChild(ov);
      const p = document.createElement("div");
      p.id = "nodeimage-panel";
      p.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">NodeImage 图片管理</div>
          <div class="panel-close" title="关闭">&times;</div>
        </div>
        <div id="panel-message"></div>
        <div class="panel-toolbar">
          <button class="mdui-btn mdui-btn-primary" id="upload-btn">上传图片</button>
          <button class="mdui-btn mdui-btn-primary" id="select-all-btn">全选</button>
          <button class="mdui-btn mdui-btn-danger" id="delete-selected-btn" disabled>批量删除</button>
          <div class="copy-dropdown" style="position: relative;">
            <button class="mdui-btn mdui-btn-success" id="copy-selected-btn" disabled>批量复制链接</button>
            <button class="mdui-btn mdui-btn-primary" id="refresh-list-btn">刷新图片列表</button>

            <button class="mdui-btn" id="open-login-btn" title="打开 NodeImage 登录页">登录</button>
            <div class="dropdown-content" id="copy-format-dropdown" style="position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; border-radius: 4px; display: none; z-index: 10000;">
              <div class="dropdown-item" data-format="direct" style="padding: 8px 12px; cursor: pointer;">直接链接</div>
              <div class="dropdown-item" data-format="markdown" style="padding: 8px 12px; cursor: pointer;">Markdown</div>
              <div class="dropdown-item" data-format="html" style="padding: 8px 12px; cursor: pointer;">HTML</div>
              <div class="dropdown-item" data-format="bbcode" style="padding: 8px 12px; cursor: pointer;">BBCode</div>
            </div>
          </div>
        </div>
        <div class="panel-content">
          <div class="images-grid" id="images-grid"></div>
          <div class="pagination" id="pagination"></div>
        </div>`;
      document.body.appendChild(p);
      p.querySelector(".panel-close").onclick = () => this.closePanel();
      document.getElementById("upload-btn").onclick = () => {
        const ip = document.createElement("input");
        ip.type = "file";
        ip.multiple = true;
        ip.accept = "image/*";
        ip.onchange = async (e) => {
          // 面板内上传：不应自动插入到编辑器，只刷新列表
          await NI.handler.handleFiles(Array.from(e.target.files || []), {
            insert: false,
          });
          await this.loadImages();
          NI.utils.toast("上传完成");
        };
        ip.click();
      };
      document.getElementById("select-all-btn").onclick = () => {
        const list = this.images;
        const all = list.every((i) => this.selected.has(i.image_id));
        list.forEach((i) => {
          if (all) this.selected.delete(i.image_id);
          else this.selected.add(i.image_id);
        });
        this.renderImages();
        this.renderPagination();
        this.updateBatchButtons();
      };
      document.getElementById("delete-selected-btn").onclick = async () => {
        const ids = Array.from(this.selected);
        const total = ids.length;
        if (!total) return;
        if (!confirm(`确定删除选中的 ${total} 张图片吗？`)) return;
        const concurrency = 2;
        let idx = 0,
          active = 0,
          ok = 0,
          fail = 0;
        await new Promise((resolve) => {
          const next = () => {
            if (idx >= total && active === 0) return resolve();
            while (active < concurrency && idx < total) {
              const id = ids[idx++];
              active++;
              NI.utils.showPanelMessage(`正在删除第 ${idx} 张图片...`);
              api
                .del(id)
                .then(() => {
                  ok++;
                  NI.utils.showPanelMessage(`第 ${idx} 张图片删除成功`);
                })
                .catch(() => {
                  fail++;
                  NI.utils.showPanelMessage(`第 ${idx} 张图片删除失败`);
                })
                .finally(() => {
                  active--;
                  next();
                });
            }
          };
          next();
        });
        this.selected.clear();
        await this.loadImages();
        NI.utils.showPanelMessage(`删除完成，成功${ok}张，失败${fail}张`, 3000);
      };
      document.getElementById("refresh-list-btn").onclick = () => this.loadImages();

      const lbtn = document.getElementById('open-login-btn');
      if (lbtn) lbtn.onclick = () => { try { NI.ui.openLogin(); } catch {} };
      // 批量复制：下拉选择格式
      document.getElementById("copy-selected-btn").onclick = (e) => {
        e.stopPropagation();
        const dd = document.getElementById("copy-format-dropdown");
        dd.classList.toggle('show');
      };
      document.getElementById("copy-format-dropdown").onclick = (e) => {
        if (!e.target.classList.contains("dropdown-item")) return;
        const fmt = e.target.getAttribute("data-format");
        this.copySelectedUrls(fmt);
        document.getElementById("copy-format-dropdown").classList.remove('show');
      };
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".copy-dropdown")) {
          const dd = document.getElementById("copy-format-dropdown");
          if (dd) dd.classList.remove('show');
        }
      });
    },

    async loadImages() {
      if (config.DEBUG) {
        console.log("📋 [NodeImage UI] 开始加载图片列表, 第", this.page || 1, "页");
      }
      const g = document.getElementById("images-grid");
      const pg = document.getElementById("pagination");
      if (g)
        g.innerHTML =
          '<div style="padding:40px;text-align:center;">加载中...</div>';
      try {
        const { images, pagination } = await api.listViaCookieOrFallback(
          this.page || 1,
          config.LIST_PAGE_SIZE
        );
        if (config.DEBUG) {
          console.log("✅ [NodeImage UI] 图片列表加载成功:", {
            images: images.length,
            pagination,
            currentPage: this.page || 1
          });
        }
        this.images = images || [];
        this.totalPages = Number(pagination?.totalPages || 1) || 1;
        this.totalCount = Number(pagination?.totalCount || this.images.length) || 0;
        this.page = Number(pagination?.currentPage || this.page || 1) || 1;
      } catch {
        const all = await api.list();
        this.totalCount = Array.isArray(all) ? all.length : 0;
        this.totalPages = Math.max(1, Math.ceil(this.totalCount / Math.max(1, config.LIST_PAGE_SIZE)));
        const safePage = Math.min(Math.max(1, this.page || 1), this.totalPages);
        const start = (safePage - 1) * config.LIST_PAGE_SIZE;
        this.images = (all || []).slice(start, start + config.LIST_PAGE_SIZE);
        this.page = safePage;
      }
      this.renderImages();
      this.renderPagination();
      this.updateBatchButtons();
    },
    renderImages() {
      const g = document.getElementById("images-grid");
      if (!g) return;
      g.innerHTML = "";
      if (!this.images.length) {
        g.innerHTML =
          '<div style="padding:40px;text-align:center;color:#999;">暂无图片</div>';
        return;
      }
      const cur = this.images;
      // 更新“全选/取消全选”按钮文本
      const selectAllBtn = document.getElementById("select-all-btn");
      if (selectAllBtn) {
        const all = cur.every((i) => this.selected.has(i.image_id));
        selectAllBtn.textContent = all ? "取消全选" : "全选";
      }
      // 检测是否在popup环境中（popup 环境移除插入功能）
      const isInPopup = typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function';

      cur.forEach((img) => {
        const card = document.createElement("div");
        card.className = "image-card";
        const url = img.links?.direct || img.url || "";
        const thumb = this.getThumbnailUrl(url) || url;
        const md = img.links?.markdown || (url ? `![](${url})` : "");

        // 根据环境决定预览图片的标题和按钮
        const previewTitle = isInPopup ? "点击预览" : "点击插入编辑器";
        const insertButton = isInPopup ? '' : '<button class="ins">插入</button>';

        card.innerHTML = `<img class=\"image-preview\" src=\"${thumb}\" alt=\"\" title=\"${previewTitle}\" style=\"width:100%;height:140px;object-fit:cover;background:#f0f0f0;cursor:pointer;\"/>
          <div class="image-info"><div class="image-filename" title="${
            img.filename || img.image_id
          }">${
          img.filename || img.image_id
        }</div><div class="image-size">${NI.utils.fmtSize(
          img.size || 0
        )}</div></div>
          <div class="image-actions">
            <input type="checkbox" class="sel" ${
              this.selected.has(img.image_id) ? "checked" : ""
            } />
            ${insertButton}
            <div class=\"copy-dropdown-single-container\" style=\"position:relative;display:inline-block;\">
              <button class=\"copy-btn\">复制▼</button>
              <div class=\"copy-dropdown-single\">
                <div data-format=\"direct\">直接链接</div>
                <div data-format=\"markdown\">Markdown</div>
                <div data-format=\"html\">HTML</div>
                <div data-format=\"bbcode\">BBCode</div>
              </div>
            </div>
            <button class="del" style="color:#d32f2f">删除</button>
          </div>`;

        // 根据环境设置预览点击行为
        const previewEl = card.querySelector(".image-preview");
        if (isInPopup) {
          // Popup环境：点击预览显示灯箱
          previewEl.onclick = () => this.showLightbox(url, img.filename || img.image_id);
        } else {
          // 普通环境：点击预览直接插入
          previewEl.onclick = () => this.insertMarkdown(md);
        }

        card.querySelector(".sel").onchange = (e) => {
          if (e.target.checked) this.selected.add(img.image_id);
          else this.selected.delete(img.image_id);
          this.updateBatchButtons();
          // 同步"全选/取消全选"按钮文本
          const all = this.images.every((i) => this.selected.has(i.image_id));
          const sa = document.getElementById("select-all-btn");
          if (sa) sa.textContent = all ? "取消全选" : "全选";
        };

        // 只在非popup环境中添加插入按钮事件
        if (!isInPopup) {
          const insBtn = card.querySelector(".ins");
          if (insBtn) {
            insBtn.onclick = async () => {
              try {
                await this.insertMarkdown(md);
              } catch (e) {
                if (config.DEBUG) {
                  console.error("❌ [NodeImage UI] 插入失败:", e);
                }
                utils.toast("插入失败: " + (e.message || e));
              }
            };
          }
        }
        // 单图复制下拉
        const copyBtn = card.querySelector(".copy-btn");
        const copyDropdown = card.querySelector(".copy-dropdown-single");
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".copy-dropdown-single").forEach((dd) => {
            if (dd !== copyDropdown) dd.classList.remove("show");
          });
          copyDropdown.classList.toggle("show");
        });
        copyDropdown.addEventListener("click", (e) => {
          const fmt = e.target?.dataset?.format;
          if (!fmt) return;
          this.copySingleUrl(img, fmt);
          copyDropdown.classList.remove("show");
        });
        card.querySelector(".del").onclick = async () => {
          if (!confirm("确认删除这张图片？")) return;
          try {
            await api.del(img.image_id);
            utils.toast("删除成功");
            await this.loadImages();
          } catch {
            utils.toast("删除失败");
          }
        };
        g.appendChild(card);
      });
      document.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(".copy-dropdown-single")
            .forEach((dd) => dd.classList.remove("show"));
        },
        { once: true }
      );
    },
    renderPagination() {
      const p = document.getElementById("pagination");
      if (!p) return;
      p.innerHTML = "";
      const total = Math.max(1, Number(this.totalPages || 1));
      const prev = document.createElement("button");
      prev.className = "page-btn";
      prev.textContent = "上一页";
      prev.disabled = this.page === 1;
      prev.onclick = () => { if (this.page > 1) { this.page--; this.selected.clear(); this.loadImages(); } };
      p.appendChild(prev);
      const info = document.createElement("span");
      info.textContent = `第 ${this.page} 页，共 ${total} 页，总计 ${this.totalCount} 张图片。`;
      info.style.margin = "0 12px";
      p.appendChild(info);
      const next = document.createElement("button");
      next.className = "page-btn";
      next.textContent = "下一页";
      next.disabled = this.page >= total;
      next.onclick = () => { if (this.page < total) { this.page++; this.selected.clear(); this.loadImages(); } };
      p.appendChild(next);
    },
    /** 尝试插入 Markdown 到编辑器（通过 NI.editor 统一桥接） */
    async insertMarkdown(md) {
      try {
        // 检测是否在popup环境中（popup 环境不再支持插入功能）
        const isInPopup = typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function';

        if (isInPopup) {
          if (config.DEBUG) {
            console.warn("⚠️ [NodeImage UI] Popup 环境不支持插入功能");
          }
          utils.toast("Popup 环境不支持插入功能");
          return false;
        }

        // 普通环境：直接插入
        if (config.DEBUG) {
          console.log("📝 [NodeImage UI] 使用普通环境直接插入");
        }

        if (NI.editor && NI.editor.insertMarkdown) {
          const ok = NI.editor.insertMarkdown(md);
          if (ok) {
            utils.toast("图片已插入编辑器");
            this.closePanel();
            return true;
          } else {
            utils.toast("无法找到编辑器或插入失败");
            return false;
          }
        } else {
          throw new Error("编辑器模块未加载或方法不可用");
        }
      } catch (e) {
        if (config.DEBUG) {
          console.error("❌ [NodeImage UI] insertMarkdown异常:", e);
        }
        utils.toast("插入异常: " + (e.message || e));
        return false;
      }
    },
    updateBatchButtons() {
      const del = document.getElementById("delete-selected-btn");
      if (del) del.disabled = this.selected.size === 0;
      const copyBtn = document.getElementById("copy-selected-btn");
      if (copyBtn) copyBtn.disabled = this.selected.size === 0;
    },
    /** 复制单张链接（支持 direct/markdown/html/bbcode） */
    copySingleUrl(img, format) {
      const url = img.links?.direct || img.url || "";
      const md = img.links?.markdown || (url ? `![](${url})` : "");
      const formats = {
        direct: url,
        markdown: md,
        html: url ? `<img src="${url}" alt="">` : "",
        bbcode: url ? `[img]${url}[/img]` : "",
      };
      const text = formats[format] || url;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => utils.toast("链接已复制"))
          .catch(() => this.fallbackCopy(text));
      } else this.fallbackCopy(text);
    },
    /** 复制选中多张图片链接，按行拼接 */
    copySelectedUrls(format) {
      if (!this.selected.size) {
        utils.toast("未选择图片");
        return;
      }
      const selectedImgs = this.images.filter((i) =>
        this.selected.has(i.image_id)
      );
      const texts = selectedImgs.map((img) => {
        const url = img.links?.direct || img.url || "";
        const md = img.links?.markdown || (url ? `![](${url})` : "");
        const map = {
          direct: url,
          markdown: md,
          html: url ? `<img src="${url}" alt="">` : "",
          bbcode: url ? `[img]${url}[/img]` : "",
        };
        return map[format] || url;
      });
      const text = texts.join("\n");
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => utils.toast(`已复制 ${texts.length} 个链接`))
          .catch(() => this.fallbackCopy(text));
      } else this.fallbackCopy(text);
    },
    /** 兼容复制方案 */
    fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        utils.toast("链接已复制");
      } catch {
        utils.toast("复制失败");
      }
      document.body.removeChild(ta);
    },

    /** 显示图片灯箱预览（仅popup环境使用） */
    showLightbox(imageUrl, filename) {
      if (config.DEBUG) {
        console.log("📸 [NodeImage UI] 显示图片灯箱:", filename, imageUrl);
      }

      // 创建灯箱遮罩层
      const lightbox = document.createElement('div');
      lightbox.className = 'ni-lightbox';
      lightbox.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;

      // 创建图片容器
      const container = document.createElement('div');
      container.style.cssText = `
        position: relative;
        max-width: 90%;
        max-height: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
      `;

      // 创建图片元素
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = filename;
      img.style.cssText = `
        max-width: 100%;
        max-height: 80vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      `;

      // 创建文件名标签
      const label = document.createElement('div');
      label.textContent = filename;
      label.style.cssText = `
        color: white;
        background: rgba(0, 0, 0, 0.7);
        padding: 8px 16px;
        border-radius: 4px;
        margin-top: 12px;
        font-size: 14px;
        text-align: center;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;

      // 创建关闭按钮
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: -40px;
        right: -20px;
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease;
      `;

      // 关闭按钮悬停效果
      closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255, 255, 255, 1)';
      closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.9)';

      // 组装元素
      container.appendChild(img);
      container.appendChild(label);
      container.appendChild(closeBtn);
      lightbox.appendChild(container);

      // 关闭灯箱的函数
      const closeLightbox = () => {
        lightbox.style.opacity = '0';
        setTimeout(() => {
          if (lightbox.parentNode) {
            document.body.removeChild(lightbox);
          }
        }, 300);
      };

      // 绑定关闭事件
      closeBtn.onclick = closeLightbox;
      lightbox.onclick = (e) => {
        if (e.target === lightbox) {
          closeLightbox();
        }
      };

      // ESC键关闭
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          closeLightbox();
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
      document.addEventListener('keydown', handleKeyDown);

      // 显示灯箱
      document.body.appendChild(lightbox);

      // 渐入动画
      setTimeout(() => {
        lightbox.style.opacity = '1';
      }, 10);

      // 图片加载失败处理
      img.onerror = () => {
        label.textContent = `${filename} (加载失败)`;
        label.style.color = '#ffcdd2';
      };
    },
  };
})();
