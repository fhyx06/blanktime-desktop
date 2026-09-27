(() => {
  'use strict';
  function updateSiteInfo() {
    const runtime = document.getElementById('site-runtime');
    const start = Date.parse(runtime?.dataset.start || '');
    if (Number.isFinite(start)) runtime.textContent = Math.max(0, Math.floor((Date.now() - start) / 86400000)) + ' 天';
    const update = document.getElementById('site-last-update');
    if (!update) return;
    const timestamp = Date.parse(update.dateTime);
    if (!Number.isFinite(timestamp)) return;
    const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
    update.title = '最近文章更新于 ' + new Date(timestamp).toLocaleString('zh-CN');
    update.textContent = days === 0 ? '今天' : days < 30 ? days + ' 天前' : days < 365 ? Math.floor(days / 30) + ' 个月前' : Math.floor(days / 365) + ' 年前';
  }
  updateSiteInfo();
  setInterval(updateSiteInfo, 60000);
})();
