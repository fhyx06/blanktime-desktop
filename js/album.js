(() => {
  'use strict';
  const grid = document.getElementById('album-grid');
  const preview = document.getElementById('album-preview');
  const photo = document.getElementById('album-image');
  const status = document.getElementById('album-status');
  let selected, origin;
  function showImage(button) {
    const value= {kind:'url',url:new URL(button.dataset.src,location.href).href,name:button.dataset.name};
    selected=value;origin=button;
    document.getElementById('album-name').textContent=value.name;
    photo.src=button.querySelector('img').src;photo.alt=value.name;
    preview.hidden=false;grid.parentElement.scrollTop=0;
    document.getElementById('album-wallpaper').disabled=false;
    document.getElementById('album-back').focus();
    status.textContent=value.name;
  }
  grid.addEventListener('click',event => {
    const button=event.target.closest('.album-card');if(button)showImage(button);
  });
  function back() {preview.hidden=true;photo.removeAttribute('src');origin?.focus();status.textContent='选择图片查看大图';}
  document.getElementById('album-back').addEventListener('click',back);
  document.getElementById('album').addEventListener('keydown',event => {
    if(event.key==='Escape' && !preview.hidden) {event.preventDefault();back();}
  });
  photo.addEventListener('error',() => {
    if(!photo.getAttribute('src'))return;
    status.textContent='图片无法加载，请检查文件或链接。';
    document.getElementById('album-wallpaper').disabled=true;
  });
  document.getElementById('album-wallpaper').addEventListener('click',() => {
    if(selected)window.dispatchEvent(new CustomEvent('blanktime:set-wallpaper',{detail:selected}));
  });
})();
