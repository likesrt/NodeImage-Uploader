(function () {
  /**
   * @module handler
   * 粘贴/拖拽上传与并发处理。
   */
  const NI = (window.NI = window.NI || {});
  const { api, utils, ui } = NI;

  NI.handler = {
    /**
     * 处理一批文件的上传。
     * @param {File[]} files 文件数组
     * @param {{insert?: boolean}} [options] 选项：是否在成功后插入到编辑器（默认 true）
     */
    async handleFiles(files, options = {}) {
      const { insert = true } = options;
      if (!files || !files.length) return;

      if (NI.config.DEBUG) {
        console.group("📁 [NodeImage Handler] 开始批量处理文件");
        console.log("文件列表:", files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        })));
        console.log("选项:", { insert });
      }

      // 显示上传开始状态
      if (files.length === 1) {
        utils.toast("正在上传...", "info");
      } else {
        utils.toast(`正在上传 ${files.length} 个文件...`, "info");
      }

      let successCount = 0;
      let failCount = 0;

      for (const f of files) {
        if (NI.config.DEBUG) {
          console.log(`📤 开始处理文件: ${f.name}`);
        }
        try {
          const r = await api.upload(f);

          // 解析响应格式 - 只适配两种格式
          let md = "";

          if (r?.links?.markdown) {
            // 格式2: 有 links.markdown 字段
            md = r.links.markdown;
            if (NI.config.DEBUG) {
              console.log(`✅ ${f.name} 上传成功 (格式2):`, md);
            }
          } else if (r?.url) {
            // 格式1: 直接有 url 字段
            md = `![](${r.url})`;
            if (NI.config.DEBUG) {
              console.log(`✅ ${f.name} 上传成功 (格式1):`, md);
            }
          } else {
            if (NI.config.DEBUG) {
              console.warn(`⚠️ ${f.name} 响应格式异常:`, r);
            }
          }

          // 仅当 insert=true 时才插入到编辑器
          if (md && insert) {
            const inserted = NI.editor.insertMarkdown(md);
            if (!inserted) {
              utils.toast("图片上传成功，但无法插入到编辑器", "warning");
              if (NI.config.DEBUG) {
                console.warn(`⚠️ ${f.name} 无法插入到编辑器`);
              }
            } else if (NI.config.DEBUG) {
              console.log(`✅ ${f.name} 已插入到编辑器`);
            }
          }
          successCount++;
        } catch (e) {
          if (NI.config.DEBUG) {
            console.error(`❌ ${f.name} 上传失败:`, e);
          }
          utils.toast(e.message || "上传失败", "error");
          failCount++;
        }
      }

      // 显示最终结果
      if (NI.config.DEBUG) {
        console.log(`📊 处理完成: 成功 ${successCount}, 失败 ${failCount}`);
        console.groupEnd();
      }

      if (files.length === 1) {
        if (successCount > 0) {
          utils.toast(insert ? "上传并插入成功！" : "上传成功！", "success");
        }
      } else {
        if (successCount > 0 && failCount === 0) {
          utils.toast(`全部 ${successCount} 个文件上传成功！`, "success");
        } else if (successCount > 0 && failCount > 0) {
          utils.toast(`${successCount} 个成功，${failCount} 个失败`, "warning");
        }
      }
    },
    /**
     * 粘贴事件处理：提取图片文件并上传。
     * @param {ClipboardEvent} e 粘贴事件
     */
    onPaste(e) {
      // 检查是否正在编辑
      const isEditing = utils.isEditing();
      if (!isEditing) return;

      const dt = e.clipboardData || e.originalEvent?.clipboardData;
      if (!dt) return;

      let files = [];
      if (dt.files && dt.files.length) {
        files = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
      } else if (dt.items && dt.items.length) {
        files = Array.from(dt.items)
          .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
          .map(i => i.getAsFile())
          .filter(Boolean);
      }

      if (files.length) {
        e.preventDefault();
        e.stopPropagation();
        NI.handler.handleFiles(files);
      }
    },

    /**
     * 检查元素是否在编辑器区域内
     * @param {Element} element
     * @returns {boolean}
     */
    isInEditorArea(element) {
      if (!element) return false;
      // 检查是否在编辑器容器内
      return !!(
        element.closest('.CodeMirror') ||
        element.closest('#cm-editor-wrapper') ||
        element.closest('.md-editor') ||
        element.closest('.mde-toolbar') ||
        element.tagName === 'TEXTAREA'
      );
    },
    
    /**
     * 检查是否有可用的编辑器（不依赖焦点状态）
     * @returns {boolean}
     */
    hasAvailableEditor() {
      // 检查 CodeMirror
      const cmEl = document.querySelector('.CodeMirror');
      if (cmEl && (cmEl.CodeMirror || cmEl.__cm || cmEl._cm)) return true;
      
      // 检查可见的 textarea
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        const style = getComputedStyle(ta);
        if (style.display !== 'none' && style.visibility !== 'hidden' && ta.offsetParent !== null) {
          return true;
        }
      }
      
      // 检查 contenteditable
      const ce = document.querySelector('[contenteditable="true"]');
      if (ce) return true;
      
      return false;
    },
    /**
     * 绑定拖拽上传到指定元素。
     * @param {Element} el 目标元素
     */
    bindDrag(el) {
      // 防重复绑定：为元素打标记，避免多次 addEventListener 导致事件触发多次
      if (!el || el.__ni_drop_bound__) return;
      el.__ni_drop_bound__ = true;
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        NI.handler.handleFiles(Array.from(e.dataTransfer.files || []));
      });
    },
  };
})();
