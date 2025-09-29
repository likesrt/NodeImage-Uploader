/**
 * 后台脚本（MV3 Service Worker）
 * - 仅保留安装日志与未来扩展点
 * - CORS 处理依赖 DNR 规则；不使用阻塞式 webRequest（MV3 受限）
 */

/* global chrome */

// 扩展配置
const EXTENSION_CONFIG = {
  // 是否启用Cookie认证模式（会创建临时标签页）
  ENABLE_COOKIE_AUTH: false,  // 禁用标签页，直接使用后台fetch + Origin/Referer
  // 是否显示认证相关的调试信息
  DEBUG_AUTH: true,
  // 是否使用静默模式（隐藏标签页，快速关闭）
  SILENT_MODE: true
};

/**
 * 安装/更新时日志与（可选）动态规则初始化。
 * 目前主要依赖静态 DNR 规则（rules.json），此处仅留扩展点。
 */
chrome.runtime.onInstalled.addListener(() => {
  // 简单日志，便于排查
  console.log('[NodeImage-Ext] onInstalled');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: "nodeimage-save-image",
    title: "使用 NodeImage 保存图片",
    contexts: ["image"]
  });
});

/**
 * 点击扩展图标：尝试通知当前活动页打开管理面板；若页面未注入则回退打开目标站点。
 */
try {
  chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) return;
    const openPanel = () => {
      try {
        chrome.tabs.sendMessage(tab.id, { __ni_open_panel: true }, (res) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            // 没有接收端：动态注入内容脚本与模块，再次尝试
            try {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'content.js',
                  'modules/config.js',
                  'modules/storage.js',
                  'modules/utils.js',
                  'modules/filetype.js',
                  'modules/api.js',
                  'modules/integration.js',
                  'modules/ui.js',
                  'modules/handler.js',
                  'modules/auth.js',
                  'modules/boot.js'
                ],
              }, () => {
                // 注入后再次尝试打开
                setTimeout(() => {
                  try {
                    chrome.tabs.sendMessage(tab.id, { __ni_open_panel: true }, () => void 0);
                  } catch {}
                }, 100);
              });
            } catch {}
          }
        });
      } catch {}
    };
    openPanel();
  });
} catch {}

/**
 * 处理带凭据的跨域请求（仅用于必须携带 Cookie 的接口，例如刷新 API Key）。
 * 内容脚本通过 chrome.runtime.sendMessage 调用。
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (!msg || msg.__ni_gm_xhr !== true) return false;
  const opts = msg.opts || {};
  const method = opts.method || 'GET';
  const url = opts.url;
  const headers = opts.headers || {};
  const responseType = opts.responseType || 'json';
  let body = opts.data || undefined;
  if (!url) { try { sendResponse({ error: 'no url' }); } catch {} return false; }
  (async () => {
    try {
      const doSiteFetch = async () => {
        const tabs = await chrome.tabs.query({ url: [
          'https://www.nodeimage.com/*',
          'https://nodeimage.com/*',
          'https://*.nodeimage.com/*'
        ]});
        let tab = tabs && tabs[0];
        let createdTemp = false;
        if (!tab) {
          // 创建隐藏的后台标签页用于Cookie认证请求
          const tabOptions = {
            url: 'https://www.nodeimage.com/?ni_from=extension',
            active: false,
            // 在当前窗口的最后一个位置创建，减少用户感知
            index: 9999
          };

          // 静默模式：尝试创建最小化的标签页
          if (EXTENSION_CONFIG.SILENT_MODE) {
            try {
              // 尝试在新的最小化窗口中创建标签页
              const windows = await chrome.windows.getAll({ populate: false });
              if (windows.length > 0) {
                // 选择一个现有窗口但保持非活动状态
                tabOptions.windowId = windows[0].id;
              }
            } catch {}
          }

          tab = await chrome.tabs.create(tabOptions);
          createdTemp = true;
          await new Promise((res) => {
            const onUpdated = (tid, info) => {
              if (tid === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                // 静默模式下缩短等待时间
                const delay = EXTENSION_CONFIG.SILENT_MODE ? 100 : 200;
                setTimeout(res, delay);
              }
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
          });

          if (EXTENSION_CONFIG.DEBUG_AUTH) {
            console.log('[NodeImage-Ext] 创建临时标签页:', tab.id, '静默模式:', EXTENSION_CONFIG.SILENT_MODE);
          }
        }
        const formParts = Array.isArray(opts.formParts) ? opts.formParts : null;
        return await new Promise((resolve, reject) => {
          // 传递formParts给页面bridge，让页面重建FormData
          chrome.tabs.sendMessage(tab.id, { __ni_site_fetch: true, opts: { method, url, responseType, formParts } }, async (res) => {
            const err = chrome.runtime && chrome.runtime.lastError;
            if (err) { if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} } return reject(err.message || String(err)); }
            if (!res || res.error) { if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} } return reject(res && res.error); }
            if (createdTemp && tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch {} }
            resolve(res);
          });
        });
      };

      // 所有请求都使用后台fetch模式，不创建临时标签页
      // 浏览器会自动携带Cookie，配合Origin/Referer头部模拟
      if (EXTENSION_CONFIG.DEBUG_AUTH) {
        const mode = opts.withCredentials ? 'Cookie认证' : 'API Key认证';
        console.log(`[NodeImage-Ext] 使用后台fetch模式 (${mode}), URL:`, url);
      }
      // 若收到序列化的 formParts，则在后台重建 FormData
      const parts = Array.isArray(opts.formParts) ? opts.formParts : null;
      if (parts && parts.length) {
        const fd = new FormData();
        for (const p of parts) {
          if (p && p.kind === 'file') {
            try {
              let bytes;
              // 支持 ArrayBuffer 传输（p.buffer）
              if (p.buffer) {
                bytes = new Uint8Array(p.buffer);
              }
              // 支持 base64 传输（p.base64）- content.js 使用的格式
              else if (p.base64) {
                const bin = atob(p.base64);
                const len = bin.length;
                bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
              }
              else {
                continue; // 跳过无效的文件条目
              }

              const file = new File([bytes], p.fileName || 'blob', {
                type: p.mime || 'application/octet-stream',
                lastModified: p.lastModified || Date.now()
              });
              fd.append(p.key, file);

              if (EXTENSION_CONFIG.DEBUG_AUTH) {
                console.log('[NodeImage-Ext] 重建文件:', p.key, p.fileName, p.mime, bytes.length, 'bytes');
              }
            } catch (e) {
              console.error('[NodeImage-Ext] 重建文件失败:', p.key, e);
            }
          } else if (p && p.kind === 'text') {
            fd.append(p.key, p.value != null ? String(p.value) : '');
          }
        }
        body = fd;
        // 让浏览器自动设置 multipart/form-data 的 boundary
        try { delete headers['content-type']; delete headers['Content-Type']; } catch {}
      }
      // 确保设置正确的referer和origin
      const requestHeaders = {
        ...headers,
        'Referer': 'https://www.nodeimage.com/',
        'Origin': 'https://www.nodeimage.com'
      };

      const resp = await fetch(url, {
        method,
        headers: requestHeaders,
        credentials: opts.withCredentials ? 'include' : 'omit',
        cache: 'no-cache',
        mode: 'cors',
        body,
      });
      const ct = resp.headers.get('content-type') || '';
      let payloadText = '';
      let payloadJson = null;
      try {
        if (responseType === 'json' || ct.includes('application/json')) payloadJson = await resp.json();
        else payloadText = await resp.text();
      } catch (e) {
        try { payloadText = await resp.text(); } catch {}
      }
      sendResponse({
        status: resp.status,
        statusText: resp.statusText,
        response: payloadJson,
        responseText: payloadText,
        responseHeaders: Array.from(resp.headers?.entries?.() || []).map(([name, value]) => ({ name, value })),
      });
    } catch (e) {
      sendResponse({ error: String(e && e.message || e) });
    }
  })();
  return true; // 异步响应
});

/**
 * 处理右键菜单点击事件
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "nodeimage-save-image" && info.srcUrl) {
    try {
      console.log('[NodeImage-Ext] 右键菜单点击，图片URL:', info.srcUrl);
      console.log('[NodeImage-Ext] 目标标签页ID:', tab.id, '标题:', tab.title);

      // 向当前标签页发送消息，让内容脚本处理图片上传
      chrome.tabs.sendMessage(tab.id, {
        __ni_save_image: true,
        imageUrl: info.srcUrl
      }, (response) => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) {
          console.warn('[NodeImage-Ext] 内容脚本通信失败，尝试注入脚本:', err.message);

          // 检查标签页是否仍然有效
          chrome.tabs.get(tab.id, (tabInfo) => {
            const tabErr = chrome.runtime && chrome.runtime.lastError;
            if (tabErr) {
              console.error('[NodeImage-Ext] 标签页无效:', tabErr.message);
              return;
            }

            // 检查是否是受限页面
            if (tabInfo.url.startsWith('chrome://') || tabInfo.url.startsWith('chrome-extension://') ||
                tabInfo.url.startsWith('edge://') || tabInfo.url.startsWith('about:') ||
                tabInfo.url.startsWith('moz-extension://')) {
              console.warn('[NodeImage-Ext] 受限页面，无法注入脚本:', tabInfo.url);
              // 尝试直接在background下载和处理
              handleImageInBackground(info.srcUrl);
              return;
            }

            // 如果内容脚本未注入，先注入再重试
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [
                'modules/config.js',
                'modules/storage.js',
                'modules/utils.js',
                'modules/filetype.js',
                'modules/api.js',
                'modules/integration.js',
                'modules/ui.js',
                'modules/handler.js',
                'modules/auth.js',
                'modules/boot.js',
                'content.js'
              ],
            }, () => {
              const injectErr = chrome.runtime && chrome.runtime.lastError;
              if (injectErr) {
                console.error('[NodeImage-Ext] 脚本注入失败:', injectErr.message);
                // 注入失败时，尝试在background处理
                handleImageInBackground(info.srcUrl);
                return;
              }

              console.log('[NodeImage-Ext] 脚本注入完成，重新发送消息');
              // 注入后再次尝试发送消息
              setTimeout(() => {
                try {
                  chrome.tabs.sendMessage(tab.id, {
                    __ni_save_image: true,
                    imageUrl: info.srcUrl
                  }, (retryResponse) => {
                    const retryErr = chrome.runtime && chrome.runtime.lastError;
                    if (retryErr) {
                      console.error('[NodeImage-Ext] 重试后仍然失败:', retryErr.message);
                      // 最后的备用方案：在background处理
                      handleImageInBackground(info.srcUrl);
                    } else {
                      console.log('[NodeImage-Ext] 重试成功，响应:', retryResponse);
                    }
                  });
                } catch (e) {
                  console.error('[NodeImage-Ext] 发送消息失败:', e);
                  handleImageInBackground(info.srcUrl);
                }
              }, 200);
            });
          });
        } else {
          console.log('[NodeImage-Ext] 首次发送成功，响应:', response);
        }
      });

    } catch (error) {
      console.error('[NodeImage-Ext] 右键菜单处理失败:', error);
    }
  }
});

/**
 * 在background脚本中直接处理图片下载和上传（备用方案）
 * 用于无法注入内容脚本的页面
 */
async function handleImageInBackground(imageUrl) {
  try {
    console.log('[NodeImage-Ext] 在background处理图片:', imageUrl);

    // 清理URL参数
    let cleanUrl = imageUrl;
    try {
      const url = new URL(imageUrl);
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

    // 下载图片
    const response = await fetch(cleanUrl);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();

    console.log('[NodeImage-Ext] 下载完成，文件大小:', blob.size, 'bytes, MIME类型:', blob.type);

    // 智能文件名和格式检测
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
      filename = 'downloaded_image';
    }

    const finalFilename = filename + finalExtension;
    console.log('[NodeImage-Ext] 最终文件名:', finalFilename);

    // 准备FormData
    const formData = new FormData();
    const file = new File([blob], finalFilename, {
      type: actualMimeType || 'image/jpeg',
      lastModified: Date.now()
    });
    formData.append('file', file);

    // 序列化FormData为formParts格式，供后台fetch使用
    const formParts = [];
    const toBase64 = (ab) => {
      let b = '';
      const bytes = new Uint8Array(ab);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) b += String.fromCharCode(bytes[i]);
      return btoa(b);
    };

    const fileBytes = await file.arrayBuffer();
    formParts.push({
      kind: 'file',
      key: 'file',
      fileName: finalFilename,
      mime: file.type,
      base64: toBase64(fileBytes),
      lastModified: file.lastModified
    });

    // 调用已有的GM_xmlhttpRequest处理逻辑
    console.log('[NodeImage-Ext] 开始上传图片到NodeImage...');

    // 直接调用后台上传逻辑
    const uploadResponse = await new Promise((resolve, reject) => {
      // 模拟从content脚本发送的消息
      const sendResponse = (response) => {
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      };

      // 调用现有的onMessage处理器逻辑
      const msg = {
        __ni_gm_xhr: true,
        opts: {
          method: 'POST',
          url: 'https://api.nodeimage.com/upload',
          headers: {
            'Referer': 'https://www.nodeimage.com/',
            'Origin': 'https://www.nodeimage.com'
          },
          formParts: formParts,
          withCredentials: true,
          responseType: 'json'
        }
      };

      // 异步处理上传
      (async () => {
        try {
          const requestHeaders = {
            ...msg.opts.headers,
            'Referer': 'https://www.nodeimage.com/',
            'Origin': 'https://www.nodeimage.com'
          };

          // 重建FormData
          const fd = new FormData();
          for (const p of formParts) {
            if (p && p.kind === 'file') {
              const bin = atob(p.base64);
              const len = bin.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);

              const file = new File([bytes], p.fileName || 'blob', {
                type: p.mime || 'application/octet-stream',
                lastModified: p.lastModified || Date.now()
              });
              fd.append(p.key, file);
            }
          }

          const resp = await fetch(msg.opts.url, {
            method: msg.opts.method,
            headers: requestHeaders,
            credentials: msg.opts.withCredentials ? 'include' : 'omit',
            cache: 'no-cache',
            mode: 'cors',
            body: fd,
          });

          const ct = resp.headers.get('content-type') || '';
          let payloadJson = null;
          try {
            if (msg.opts.responseType === 'json' || ct.includes('application/json')) {
              payloadJson = await resp.json();
            }
          } catch (e) {
            console.warn('JSON解析失败:', e);
          }

          sendResponse({
            status: resp.status,
            statusText: resp.statusText,
            response: payloadJson,
            responseHeaders: Array.from(resp.headers?.entries?.() || []).map(([name, value]) => ({ name, value })),
          });
        } catch (e) {
          sendResponse({ error: String(e && e.message || e) });
        }
      })();
    });

    console.log('[NodeImage-Ext] 上传成功:', uploadResponse);

    // 显示成功通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'static/ico.png',
      title: 'NodeImage',
      message: `图片已保存到图库：${finalFilename}`
    });

  } catch (error) {
    console.error('[NodeImage-Ext] Background处理图片失败:', error);

    // 显示错误通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'static/ico.png',
      title: 'NodeImage - 错误',
      message: `图片保存失败：${error.message}`
    });
  }
}