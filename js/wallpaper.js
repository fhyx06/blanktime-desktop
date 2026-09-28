(() => {
  'use strict';
  const feedback = document.getElementById('album-status');
  const wallpaper = document.querySelector('.wallpaper');
  let revision = 0, activeObjectURL = '';
  // Blobs stay in this browser; local images are never uploaded to a server.
  const database = new Promise((resolve,reject) => {
    const request = indexedDB.open('blanktime-appearance',1);
    request.onupgradeneeded = () => request.result.createObjectStore('preferences');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function storage(value, write = false) {
    const db = await database;
    return new Promise((resolve,reject) => {
      const tx = db.transaction('preferences',write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('preferences');
      const request = write ? (value === null ? store.delete('wallpaper') : store.put(value,'wallpaper')) : store.get('wallpaper');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function imageURL(text) {
    if (!/^https?:\/\//i.test(text) && !/^\/(?!\/)/.test(text)) throw new Error('请输入 HTTP(S) 图片链接或以 / 开头的本站图片路径。');
    const url = new URL(text,location.origin);
    if (!/^https?:$/.test(url.protocol)) throw new Error('图片地址无效。');
    return url.href;
  }
  function checkImage(src) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      const timer = setTimeout(() => {img.src='';reject(new Error('图片加载超时，请检查链接。'));},15000);
      img.onload = () => {clearTimeout(timer);resolve();};
      img.onerror = () => {clearTimeout(timer);reject(new Error('图片无法加载，请检查地址或图片格式。'));};
      img.src = src;
    });
  }
  async function apply(value, persist = true) {
    const request = ++revision;
    let objectURL = '';
    if (persist) feedback.textContent='正在加载图片…';
    try {
      const src = value.kind === 'file' && value.blob instanceof Blob
        ? (objectURL=URL.createObjectURL(value.blob)) : imageURL(value.url);
      await checkImage(src);
      if (request !== revision) {if(objectURL)URL.revokeObjectURL(objectURL);return;}
      wallpaper.style.backgroundImage='url('+JSON.stringify(src)+')';
      if(activeObjectURL) URL.revokeObjectURL(activeObjectURL);
      activeObjectURL=objectURL;
      if (persist) {
        try {await storage(value,true);if(request===revision)feedback.textContent='壁纸已更换并保存在当前浏览器。';}
        catch {if(request===revision)feedback.textContent='壁纸已更换，但浏览器无法保存，下次刷新后会恢复默认。';}
      }
    } catch(error) {
      if(objectURL)URL.revokeObjectURL(objectURL);
      if(request===revision)feedback.textContent=error.message;
    }
  }
  window.addEventListener('blanktime:set-wallpaper',event => {
    if (event.detail) apply(event.detail);
  });
  document.getElementById('wallpaper-reset').addEventListener('click',async () => {
    const request=++revision;
    wallpaper.style.removeProperty('background-image');
    if(activeObjectURL)URL.revokeObjectURL(activeObjectURL);
    activeObjectURL='';
    try {await storage(null,true);if(request===revision)feedback.textContent='已恢复默认壁纸。';}
    catch {if(request===revision)feedback.textContent='已恢复默认，但浏览器无法清除保存的偏好。';}
  });
  const initialRevision=revision;
  storage().then(value => {if(value && revision===initialRevision)apply(value,false);}).catch(() => {});
})();
