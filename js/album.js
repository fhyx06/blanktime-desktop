(() => {
  'use strict';
  const $ = id => document.getElementById('album-' + id);
  const grid = $('grid'), folders = $('folders'), view = $('folder-view');
  const status = $('status');
  const cards = [...grid.querySelectorAll('.album-card')];
  const folderButtons = [...folders.querySelectorAll('[data-folder]')];
  folderButtons.forEach(button => {
    const cover = button.querySelector('.album-folder-cover img');
    if (!cover) return;
    const showPlaceholder = () => { cover.hidden = true; };
    cover.addEventListener('error', showPlaceholder, {once:true});
    if (cover.complete && !cover.naturalWidth) showPlaceholder();
  });
  let currentFolder;
  const retry = $('retry');
  function updateFailures() {
    const failed = cards.filter(card => !card.hidden && card.dataset.loadState === 'error').length;
    if (retry) { retry.hidden = !failed || view.hidden; retry.textContent = `重试失败图片（${failed}）`; }
  }
  function loadThumbnail(card, reload = false) {
    let img = card.querySelector('img');
    if (!reload && img.hasAttribute('src')) return;
    let placeholder = card.querySelector('.album-image-state');
    if (!placeholder) {
      placeholder = document.createElement('span'); placeholder.className = 'album-image-state';
      card.insertBefore(placeholder,img);
    }
    const preview = card.dataset.previewSrc ?? card.dataset.src;
    if (!preview) {
      card.dataset.loadState = 'placeholder'; card.setAttribute('aria-busy','false');
      card.setAttribute('aria-label',`${card.dataset.name}，点击加载原图`);
      placeholder.textContent = '点击加载原图'; placeholder.hidden = false; img.style.visibility = 'hidden';
      return;
    }
    if (reload) {
      const fresh = img.cloneNode(false); fresh.removeAttribute('src'); fresh.loading = 'eager';
      img.replaceWith(fresh); img = fresh;
    }
    card.dataset.loadState = 'loading'; card.setAttribute('aria-busy','true');
    card.setAttribute('aria-label',`${card.dataset.name}，正在加载`);
    placeholder.textContent = '正在加载…'; placeholder.hidden = false; img.style.visibility = 'hidden';
    const active = () => card.querySelector('img') === img;
    img.addEventListener('load',() => {
      if (!active()) return;
      card.dataset.loadState = 'loaded'; card.setAttribute('aria-busy','false');
      card.setAttribute('aria-label',card.dataset.name);
      placeholder.hidden = true; img.style.visibility = ''; updateFailures();
    },{once:true});
    img.addEventListener('error',() => {
      if (!active()) return;
      card.dataset.loadState = 'error'; card.setAttribute('aria-busy','false');
      card.setAttribute('aria-label',`${card.dataset.name}，加载失败，${card.dataset.thumbnailMode === 'true' ? '点击加载原图' : '点击重试'}`);
      placeholder.textContent = 'Error:俺的图图呢？'; placeholder.hidden = false; img.style.visibility = 'hidden';
      updateFailures();
    },{once:true});
    // Preserve signed URLs and use a new image request rather than altering query parameters.
    img.src = preview; updateFailures();
  }
  retry?.addEventListener('click',() => {
    cards.filter(card => !card.hidden && card.dataset.loadState === 'error').forEach(card => loadThumbnail(card,true));
  });
  function showFolder(id) {
    const button = folderButtons.find(item => item.dataset.folder === id);
    if (!button) return;
    currentFolder = button;
    folders.hidden = true; view.hidden = false;
    $('folder-name').textContent = button.querySelector('strong').textContent;
    let count = 0;
    cards.forEach(card => {
      card.hidden = card.dataset.folder !== id;
      if (!card.hidden) {
        count++;
        loadThumbnail(card);
      }
    });
    $('empty').hidden = count > 0; updateFailures();
    status.textContent = id === 'wallpapers' ? '选择图片预览，可设为桌面壁纸' : '此文件夹仅用于浏览图片';
    $('folders-back').focus();
  }
  function showFolders() {
    view.hidden = true; folders.hidden = false;
    status.textContent = '选择文件夹浏览图片';
    updateFailures(); currentFolder?.focus();
  }
  function showImage(button) {
    const sequence = cards.filter(card => card.dataset.folder === button.dataset.folder);
    window.blanktimeImages.open(sequence.map(card => ({
      url:card.dataset.src, name:card.dataset.name, size:card.dataset.size, wallpaper:card.dataset.wallpaper === 'true'
    })), sequence.indexOf(button), {kind:'album', trigger:button, source:$('folder-name').textContent});
  }
  folders.addEventListener('click', event => {
    const button = event.target.closest('[data-folder]'); if (button) showFolder(button.dataset.folder);
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('.album-card');
    if (!button || button.hidden) return;
    if (button.dataset.loadState === 'error' && button.dataset.thumbnailMode !== 'true') loadThumbnail(button,true);
    else showImage(button);
  });
  $('folders-back').addEventListener('click', showFolders);
  document.getElementById('album').addEventListener('keydown', event => {
    if (event.key === 'Escape' && !view.hidden) { event.preventDefault(); showFolders(); }
  });
})();
