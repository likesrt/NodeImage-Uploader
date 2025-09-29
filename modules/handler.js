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
      
      // 显示上传开始状态
      if (files.length === 1) {
        utils.toast("正在上传...");
      } else {
        utils.toast(`正在上传 ${files.length} 个文件...`);
      }
      
      let successCount = 0;
      let failCount = 0;
      
      for (const f of files) {
        try {
          const r = await api.upload(f);
          const md =
            r?.links?.markdown ||
            (r?.links?.direct ? `![](${r.links.direct})` : "");
          // 仅当 insert=true 时才插入到编辑器（面板上传应为 false）
          if (md && insert) {
            const inserted = ui.insertMarkdown(md);
            if (!inserted) {
              utils.toast("图片上传成功，但无法插入到编辑器");
            }
          }
          successCount++;
        } catch (e) {
          utils.toast(e.message || "上传失败");
          failCount++;
        }
      }
      
      // 显示最终结果
      if (files.length === 1) {
        if (successCount > 0) {
          utils.toast(insert ? "上传并插入成功！" : "上传成功！");
        }
      } else {
        if (successCount > 0 && failCount === 0) {
          utils.toast(`全部 ${successCount} 个文件上传成功！`);
        } else if (successCount > 0 && failCount > 0) {
          utils.toast(`${successCount} 个成功，${failCount} 个失败`);
        }
      }
    },
    /**
     * 粘贴事件处理：提取图片文件并上传。
     * @param {ClipboardEvent} e 粘贴事件
     */
    onPaste(e) {
      if (!utils.isEditing()) return;
      const dt = e.clipboardData || e.originalEvent?.clipboardData;
      if (!dt) return;
      let files = [];
      if (dt.files?.length)
        files = Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
      else if (dt.items?.length)
        files = Array.from(dt.items)
          .filter((i) => i.kind === "file")
          .map((i) => i.getAsFile())
          .filter((f) => f && f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      NI.handler.handleFiles(files);
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
