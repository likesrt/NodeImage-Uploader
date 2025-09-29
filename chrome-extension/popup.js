/**
 * 扩展弹窗入口：
 * - 依赖 popup-env.js 提供 GM_* 兼容
 * - 顺序加载 modules 后，调用 NI.boot 并直接打开管理面板
 */

(function(){
  'use strict';
  function ready(fn){ if(document.readyState==='complete' || document.readyState==='interactive') fn(); else document.addEventListener('DOMContentLoaded', fn, { once: true }); }
  ready(function(){
    try{ document.body.style.margin='0'; document.documentElement.style.height='100%'; document.body.style.height='100%'; }catch{}
    // 启动后直接渲染面板为首页内容（不再二次弹出）
    const tickStart=Date.now();
    (function tick(){
      if (window.NI && typeof window.NI.boot==='function'){
        try{ window.NI.boot(); }catch(e){ console.error('[NodeImage-Ext][popup] boot error', e); }
        setTimeout(()=>{
          try{
            if (window.NI && window.NI.ui) {
              // 直接创建面板并以页面布局显示
              if (!document.getElementById('nodeimage-panel')) window.NI.ui.createPanel();
              const p = document.getElementById('nodeimage-panel');
              const ov = document.querySelector('.panel-overlay');
              if (ov) ov.style.display='none';
              if (p) {
                p.classList.add('show');
                // 将面板转为页面内布局
                p.style.position='static';
                p.style.transform='none';
                p.style.left='auto';
                p.style.top='auto';
                p.style.width='100%';
                p.style.height='100%';
                p.style.maxWidth='100%';
                p.style.maxHeight='none';
                p.style.boxShadow='none';
                p.style.borderRadius='0';
                // 覆盖关闭行为：在弹窗中点击 X 直接关闭弹窗窗口
                const closeBtn = p.querySelector('.panel-close');
                if (closeBtn) {
                  closeBtn.onclick = (e) => { e.preventDefault(); try{ window.close(); }catch{} };
                }
              }
              if (typeof window.NI.ui.loadImages==='function') window.NI.ui.loadImages();
            }
          }catch{}
        }, 50);
        return;
      }
      if (Date.now()-tickStart < 5000) return void setTimeout(tick, 50);
      console.error('[NodeImage-Ext][popup] NI not ready');
    })();
  });
})();
