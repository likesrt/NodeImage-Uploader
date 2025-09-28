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
      for (const f of files) {
        try {
          const r = await api.upload(f);
          const md =
            r?.links?.markdown ||
            (r?.links?.direct ? `![](${r.links.direct})` : "");
          // 仅当 insert=true 时才插入到编辑器（面板上传应为 false）
          if (md && insert) ui.insertMarkdown(md);
        } catch (e) {
          utils.toast(e.message || "上传失败");
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
