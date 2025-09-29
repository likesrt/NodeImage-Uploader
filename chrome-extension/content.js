/**
 * 内容脚本入口：
 * - 提供 GM_* 兼容层（同步 API：get/set/delete、addStyle、xmlhttpRequest）
 * - 顺序加载本扩展内置的 modules/*.js，并调用 NI.boot()
 * - 目标：在 Edge/Chrome 上实现与油猴脚本一致的界面、样式与功能
 */

/* global chrome */

(function () {
  'use strict';
  try { console.info('[NodeImage-Ext] content script loaded'); } catch {}

  /**
   * GM_addStyle 兼容：将 CSS 文本注入到页面 <head>
   * @param {string} css 样式文本
   */
  function GM_addStyle(css) {
    try {
      const style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.textContent = String(css || '');
      (document.head || document.documentElement).appendChild(style);
    } catch {}
  }

  /**
   * GM_setValue/GM_getValue/GM_deleteValue 兼容：使用页面 localStorage 实现同步能力。
   * 说明：与油猴脚本的 KV 行为一致（同步 API），避免异步 storage 带来的改造成本。
   */
  function GM_setValue(key, value) {
    try {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, v);
    } catch {}
  }
  function GM_getValue(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return def;
      try { return JSON.parse(v); } catch { return v; }
    } catch { return def; }
  }
  function GM_deleteValue(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  /**
   * GM_xmlhttpRequest 兼容（基于 fetch，实现跨域请求；配合 DNR/webRequest 绕过 CORS）。
   * 仅实现本项目所需字段：method/url/headers/data/withCredentials/responseType/onload/onerror。
   * @param {Object} opts 请求参数
   */
  async function GM_xmlhttpRequest(opts) {
    const {
      method = 'GET', url,
      headers = {}, data = null,
      withCredentials = false,
      responseType = 'json',
      onload, onerror,
    } = opts || {};
    if (!url) return;
    // 统一后台代理：所有请求均通过后台执行，以稳定绕过 CORS，并结合 DNR 自定义 Origin
    const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
    let formParts = null;
    let raw = null;
    if (isForm) {
      const toBase64 = (ab) => {
        let b = '';
        const bytes = new Uint8Array(ab);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) b += String.fromCharCode(bytes[i]);
        return btoa(b);
      };
      formParts = [];
      for (const [k, v] of data.entries()) {
        if (v instanceof File || (typeof Blob !== 'undefined' && v instanceof Blob)) {
          const fileName = (v && v.name) || 'blob';
          const mime = v.type || 'application/octet-stream';
          const ab = await v.arrayBuffer();
          formParts.push({ kind: 'file', key: k, fileName, mime, base64: toBase64(ab), lastModified: v.lastModified || Date.now() });
        } else {
          formParts.push({ kind: 'text', key: k, value: String(v) });
        }
      }
    } else if (data != null) {
      raw = data;
    }
    try {
      // 发送到后台脚本处理
      chrome.runtime.sendMessage({ __ni_gm_xhr: true, opts: { method, url, headers, responseType, withCredentials, formParts, data: raw } }, (res) => {
        const err = (chrome.runtime && chrome.runtime.lastError) || null;
        if (err) {
          console.log('[NodeImage-Ext Content] Runtime error:', err.message || err);
          try { if (typeof onerror === 'function') onerror(err.message || err); } catch {}
          return;
        }
        if (!res || res.error) {
          console.log('[NodeImage-Ext Content] Request error:', res && res.error);
          try { if (typeof onerror === 'function') onerror(res && res.error); } catch {}
          return;
        }
        console.log('[NodeImage-Ext Content] Request success:', method, url, res.status || 'OK');
        try { if (typeof onload === 'function') onload(res); } catch {}
      });
    } catch (e) {
      console.error('[NodeImage-Ext Content] Send message error:', e);
      try { if (typeof onerror === 'function') onerror(e); } catch {}
    }
    return;
  }

  // 暴露到隔离环境全局，供 modules 使用
  // 说明：直接在 window 挂载以便 IIFE 模块可见。
  try {
    // eslint-disable-next-line no-undef
    window.GM_addStyle = GM_addStyle;
    window.GM_setValue = GM_setValue;
    window.GM_getValue = GM_getValue;
    window.GM_deleteValue = GM_deleteValue;
    window.GM_xmlhttpRequest = GM_xmlhttpRequest;
    window.GM_registerMenuCommand = function () {};
  } catch {}

  // 模块通过 manifest 的 content_scripts 依次注入。
  // 这里仅在其准备好后调用 NI.boot，并做可压缩类型兜底。
  function bootWhenReady() {
    const MAX_WAIT = 5000;
    const start = Date.now();
    const tick = () => {
      if (window.NI && typeof window.NI.boot === 'function') {
        try {
          if (window.NI.filetype && typeof window.NI.filetype.canCompress !== 'function') {
            window.NI.filetype.canCompress = function (ext) {
              return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(String(ext || '').toLowerCase());
            };
          }
        } catch {}
        try { window.NI.boot(); } catch (e) { console.error('[NodeImage-Ext] 启动失败:', e); }
        return;
      }
      if (Date.now() - start < MAX_WAIT) setTimeout(tick, 50);
      else console.error('[NodeImage-Ext] NI 未准备就绪，启动超时');
    };
    tick();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') bootWhenReady();
  else document.addEventListener('DOMContentLoaded', bootWhenReady, { once: true });

  // 接收后台点击图标的打开面板指令
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // 处理打开面板指令
      if (msg && msg.__ni_open_panel) {
        try {
          if (window.NI && window.NI.ui && typeof window.NI.ui.openPanel === 'function') {
            window.NI.ui.openPanel();
            try { sendResponse({ ok: true }); } catch {}
          } else {
            try { sendResponse({ ok: false, error: 'NI not ready' }); } catch {}
          }
        } catch (e) {
          try { sendResponse({ ok: false, error: e.message }); } catch {}
        }
        return;
      }

      // 处理右键菜单保存图片指令
      if (msg && msg.__ni_save_image && msg.imageUrl) {
        (async () => {
          let toastShown = false;
          try {
            console.log('[NodeImage-Ext] 收到保存图片指令:', msg.imageUrl);

            // 等待NI模块加载完成
            let retryCount = 0;
            const maxRetries = 50;

            while ((!window.NI || !window.NI.handler || typeof window.NI.handler.handleFiles !== 'function' || !window.NI.utils) && retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retryCount++;
            }

            if (!window.NI || !window.NI.handler || typeof window.NI.handler.handleFiles !== 'function') {
              console.error('[NodeImage-Ext] NI模块未准备好');
              alert('NodeImage 模块未准备好，请稍后重试');
              try { sendResponse({ ok: false, error: 'NI not ready' }); } catch {}
              return;
            }

            // 显示开始上传提示
            if (window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast('正在下载并上传图片...', 'info');
              toastShown = true;
            }

            // 清理URL参数（移除?和!后面的参数）
            let cleanUrl = msg.imageUrl;
            try {
              const url = new URL(msg.imageUrl);
              // 移除query参数
              url.search = '';
              cleanUrl = url.toString();
              // 移除感叹号参数（如 !wp5）
              const exclamationIndex = cleanUrl.indexOf('!');
              if (exclamationIndex !== -1) {
                cleanUrl = cleanUrl.substring(0, exclamationIndex);
              }
            } catch (e) {
              console.warn('[NodeImage-Ext] URL清理失败，使用原URL:', e);
            }

            console.log('[NodeImage-Ext] 清理后的URL:', cleanUrl);

            // 下载图片并转换为File对象
            const response = await fetch(cleanUrl);
            if (!response.ok) {
              throw new Error(`下载失败: ${response.status} ${response.statusText}`);
            }
            const blob = await response.blob();

            console.log('[NodeImage-Ext] 下载完成，文件大小:', blob.size, 'bytes, MIME类型:', blob.type);

            // 智能文件名和格式检测
            let filename = 'image';
            let finalExtension = '';

            // 1. 首先从实际MIME类型确定正确的扩展名
            const actualMimeType = blob.type || '';
            if (actualMimeType.includes('svg')) {
              finalExtension = '.svg';
            } else if (actualMimeType.includes('png')) {
              finalExtension = '.png';
            } else if (actualMimeType.includes('gif')) {
              finalExtension = '.gif';
            } else if (actualMimeType.includes('webp')) {
              finalExtension = '.webp';
            } else if (actualMimeType.includes('jpeg') || actualMimeType.includes('jpg')) {
              finalExtension = '.jpg';
            } else {
              // 如果MIME类型不明确，从URL推断
              finalExtension = '.jpg'; // 默认
            }

            // 2. 从URL中提取基础文件名
            try {
              const url = new URL(cleanUrl);
              const pathname = url.pathname;
              const lastSlash = pathname.lastIndexOf('/');
              if (lastSlash !== -1) {
                const nameWithExt = pathname.substring(lastSlash + 1);
                if (nameWithExt) {
                  // 移除原有扩展名，使用检测到的正确扩展名
                  const dotIndex = nameWithExt.lastIndexOf('.');
                  if (dotIndex !== -1) {
                    filename = nameWithExt.substring(0, dotIndex);
                  } else {
                    filename = nameWithExt;
                  }
                }
              }
            } catch (e) {
              console.warn('[NodeImage-Ext] 文件名解析失败:', e);
              filename = 'downloaded_image';
            }

            // 3. 组合最终文件名
            const finalFilename = filename + finalExtension;
            console.log('[NodeImage-Ext] 最终文件名:', finalFilename, '实际格式:', actualMimeType);

            // 创建File对象，使用检测到的正确MIME类型
            const file = new File([blob], finalFilename, {
              type: actualMimeType || 'image/jpeg',
              lastModified: Date.now()
            });

            console.log('[NodeImage-Ext] 开始上传图片:', finalFilename, file.size, 'bytes', 'MIME:', file.type);

            // 使用NI的文件处理函数上传图片，设置insert=false不自动插入到编辑器
            await window.NI.handler.handleFiles([file], { insert: false });

            console.log('[NodeImage-Ext] 图片上传完成');

            // 显示成功提示
            if (window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast(`图片已保存到图库：${finalFilename}`, 'success');
            } else if (!toastShown) {
              alert('图片上传成功！');
            }

            try { sendResponse({ ok: true, filename: finalFilename }); } catch {}

          } catch (error) {
            console.error('[NodeImage-Ext] 保存图片失败:', error);

            // 显示失败提示
            const errorMsg = error.message || '上传失败';
            if (window.NI && window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast(`图片保存失败：${errorMsg}`, 'error');
            } else {
              alert(`图片保存失败：${errorMsg}`);
            }

            try { sendResponse({ ok: false, error: error.message }); } catch {}
          }
        })();
        return true; // 异步响应
      }

      // 处理快捷键上传选中图片指令
      if (msg && msg.__ni_upload_selected) {
        (async () => {
          let toastShown = false;
          try {
            console.log('[NodeImage-Ext] 收到快捷键上传指令');

            // 等待NI模块加载完成
            let retryCount = 0;
            const maxRetries = 50;

            while ((!window.NI || !window.NI.handler || typeof window.NI.handler.handleFiles !== 'function' || !window.NI.utils) && retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retryCount++;
            }

            if (!window.NI || !window.NI.handler || typeof window.NI.handler.handleFiles !== 'function') {
              console.error('[NodeImage-Ext] NI模块未准备好');
              alert('NodeImage 模块未准备好，请稍后重试');
              try { sendResponse({ ok: false, error: 'NI not ready' }); } catch {}
              return;
            }

            // 检测当前选中或聚焦的图片元素
            const targetImages = findTargetImages();

            if (targetImages.length === 0) {
              // 没有找到目标图片时的提示
              if (window.NI.utils && typeof window.NI.utils.toast === 'function') {
                window.NI.utils.toast('未找到可上传的图片，请先点击或选中图片', 'warning');
              } else {
                alert('未找到可上传的图片\\n\\n请先：\\n1. 左键点击图片选中\\n2. 或右键点击图片\\n3. 然后使用快捷键');
              }
              try { sendResponse({ ok: false, error: 'No target image found' }); } catch {}
              return;
            }

            // 显示开始上传提示
            if (window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast(`正在上传 ${targetImages.length} 张图片...`, 'info');
              toastShown = true;
            }

            let successCount = 0;
            let failCount = 0;

            // 批量处理所有找到的图片
            for (const img of targetImages) {
              try {
                console.log('[NodeImage-Ext] 处理图片:', img.src);
                await uploadImageElement(img);
                successCount++;
              } catch (error) {
                console.error('[NodeImage-Ext] 上传图片失败:', img.src, error);
                failCount++;
              }
            }

            // 显示结果提示
            const resultMsg = targetImages.length === 1
              ? (successCount > 0 ? '图片上传成功！' : '图片上传失败')
              : `上传完成：成功 ${successCount} 张，失败 ${failCount} 张`;

            if (window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast(resultMsg, successCount > 0 ? 'success' : 'error');
            } else if (!toastShown) {
              alert(resultMsg);
            }

            console.log('[NodeImage-Ext] 快捷键上传完成，成功:', successCount, '失败:', failCount);
            try { sendResponse({ ok: true, successCount, failCount }); } catch {}

          } catch (error) {
            console.error('[NodeImage-Ext] 快捷键上传处理失败:', error);

            const errorMsg = error.message || '上传失败';
            if (window.NI && window.NI.utils && typeof window.NI.utils.toast === 'function') {
              window.NI.utils.toast(`快捷键上传失败：${errorMsg}`, 'error');
            } else {
              alert(`快捷键上传失败：${errorMsg}`);
            }

            try { sendResponse({ ok: false, error: error.message }); } catch {}
          }
        })();
        return true; // 异步响应
      }

      return false;
    });
  } catch {}

  /**
   * 查找当前页面中的目标图片（选中的、聚焦的、或最近交互的）
   * @returns {HTMLImageElement[]} 图片元素数组
   */
  function findTargetImages() {
    const targetImages = [];

    // 1. 检查当前活动元素（聚焦的）
    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName === 'IMG' && activeElement.src) {
      targetImages.push(activeElement);
      console.log('[NodeImage-Ext] 找到聚焦的图片:', activeElement.src);
    }

    // 2. 检查选中的内容
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // 如果选中的是图片节点
      if (container.nodeType === Node.ELEMENT_NODE) {
        const images = container.querySelectorAll ?
          container.querySelectorAll('img') :
          (container.tagName === 'IMG' ? [container] : []);

        for (const img of images) {
          if (img.src && !targetImages.includes(img)) {
            targetImages.push(img);
            console.log('[NodeImage-Ext] 找到选中范围内的图片:', img.src);
          }
        }
      }
      // 如果选中内容包含图片
      else if (container.parentElement) {
        const parentImages = container.parentElement.querySelectorAll('img');
        for (const img of parentImages) {
          if (img.src && selection.containsNode(img, true) && !targetImages.includes(img)) {
            targetImages.push(img);
            console.log('[NodeImage-Ext] 找到选中内容中的图片:', img.src);
          }
        }
      }
    }

    // 3. 检查最近点击/悬停的图片（使用事件监听记录）
    const recentImage = getRecentInteractionImage();
    if (recentImage && !targetImages.includes(recentImage)) {
      targetImages.push(recentImage);
      console.log('[NodeImage-Ext] 找到最近交互的图片:', recentImage.src);
    }

    // 4. 如果前面都没找到，检查鼠标指针下的元素
    if (targetImages.length === 0) {
      const elementUnderMouse = getElementUnderMouse();
      if (elementUnderMouse && elementUnderMouse.tagName === 'IMG' && elementUnderMouse.src) {
        targetImages.push(elementUnderMouse);
        console.log('[NodeImage-Ext] 找到鼠标下的图片:', elementUnderMouse.src);
      }
    }

    // 5. 最后的备选：查找当前可见区域内的图片
    if (targetImages.length === 0) {
      const visibleImages = getVisibleImages();
      if (visibleImages.length > 0) {
        // 优先选择较大的图片
        visibleImages.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
        const largestImage = visibleImages[0];
        if (largestImage.naturalWidth >= 100 && largestImage.naturalHeight >= 100) {
          targetImages.push(largestImage);
          console.log('[NodeImage-Ext] 找到可见区域内的大图片:', largestImage.src);
        }
      }
    }

    console.log('[NodeImage-Ext] 总共找到', targetImages.length, '张目标图片');
    return targetImages;
  }

  /**
   * 获取最近交互过的图片元素
   */
  let recentInteractionImage = null;
  let recentInteractionTime = 0;

  function getRecentInteractionImage() {
    // 如果最近的交互时间超过30秒，则认为无效
    if (Date.now() - recentInteractionTime > 30000) {
      return null;
    }
    return recentInteractionImage;
  }

  /**
   * 获取鼠标指针下的元素
   */
  let lastMousePosition = { x: 0, y: 0 };

  function getElementUnderMouse() {
    try {
      return document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取当前可见区域内的图片
   */
  function getVisibleImages() {
    const images = document.querySelectorAll('img[src]');
    const visibleImages = [];

    for (const img of images) {
      if (isElementVisible(img)) {
        visibleImages.push(img);
      }
    }

    return visibleImages;
  }

  /**
   * 检查元素是否在可见区域内
   */
  function isElementVisible(element) {
    try {
      const rect = element.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight
      };

      return rect.top >= 0 &&
             rect.left >= 0 &&
             rect.bottom <= viewport.height &&
             rect.right <= viewport.width &&
             rect.width > 0 &&
             rect.height > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * 上传指定的图片元素
   */
  async function uploadImageElement(imgElement) {
    if (!imgElement || !imgElement.src) {
      throw new Error('无效的图片元素');
    }

    // 清理URL参数
    let cleanUrl = imgElement.src;
    try {
      const url = new URL(imgElement.src);
      url.search = '';
      cleanUrl = url.toString();
      const exclamationIndex = cleanUrl.indexOf('!');
      if (exclamationIndex !== -1) {
        cleanUrl = cleanUrl.substring(0, exclamationIndex);
      }
    } catch (e) {
      console.warn('[NodeImage-Ext] URL清理失败，使用原URL:', e);
    }

    console.log('[NodeImage-Ext] 清理后的URL:', cleanUrl);

    // 下载图片并转换为File对象
    const response = await fetch(cleanUrl);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();

    console.log('[NodeImage-Ext] 下载完成，文件大小:', blob.size, 'bytes, MIME类型:', blob.type);

    // 智能文件名和格式检测（复用之前的逻辑）
    let filename = 'image';
    let finalExtension = '';

    const actualMimeType = blob.type || '';
    if (actualMimeType.includes('svg')) {
      finalExtension = '.svg';
    } else if (actualMimeType.includes('png')) {
      finalExtension = '.png';
    } else if (actualMimeType.includes('gif')) {
      finalExtension = '.gif';
    } else if (actualMimeType.includes('webp')) {
      finalExtension = '.webp';
    } else if (actualMimeType.includes('jpeg') || actualMimeType.includes('jpg')) {
      finalExtension = '.jpg';
    } else {
      finalExtension = '.jpg';
    }

    try {
      const url = new URL(cleanUrl);
      const pathname = url.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      if (lastSlash !== -1) {
        const nameWithExt = pathname.substring(lastSlash + 1);
        if (nameWithExt) {
          const dotIndex = nameWithExt.lastIndexOf('.');
          if (dotIndex !== -1) {
            filename = nameWithExt.substring(0, dotIndex);
          } else {
            filename = nameWithExt;
          }
        }
      }
    } catch (e) {
      console.warn('[NodeImage-Ext] 文件名解析失败:', e);
      filename = 'uploaded_image';
    }

    const finalFilename = filename + finalExtension;
    console.log('[NodeImage-Ext] 最终文件名:', finalFilename, '实际格式:', actualMimeType);

    // 创建File对象
    const file = new File([blob], finalFilename, {
      type: actualMimeType || 'image/jpeg',
      lastModified: Date.now()
    });

    console.log('[NodeImage-Ext] 开始上传图片:', finalFilename, file.size, 'bytes', 'MIME:', file.type);

    // 使用NI的文件处理函数上传图片
    await window.NI.handler.handleFiles([file], { insert: false });

    console.log('[NodeImage-Ext] 图片上传完成');
    return finalFilename;
  }

  // 添加事件监听器来跟踪用户的图片交互
  try {
    document.addEventListener('click', (e) => {
      if (e.target && e.target.tagName === 'IMG' && e.target.src) {
        recentInteractionImage = e.target;
        recentInteractionTime = Date.now();
        console.log('[NodeImage-Ext] 记录点击的图片:', e.target.src);
      }
    }, true);

    document.addEventListener('contextmenu', (e) => {
      if (e.target && e.target.tagName === 'IMG' && e.target.src) {
        recentInteractionImage = e.target;
        recentInteractionTime = Date.now();
        console.log('[NodeImage-Ext] 记录右键的图片:', e.target.src);
      }
    }, true);

    document.addEventListener('mousemove', (e) => {
      lastMousePosition = { x: e.clientX, y: e.clientY };
    }, true);

    console.log('[NodeImage-Ext] 图片交互事件监听器已添加');
  } catch (e) {
    console.warn('[NodeImage-Ext] 添加事件监听器失败:', e);
  }

})();