(() => {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const themeSwitch = document.getElementById('settings-reader-theme');
  const reader = document.getElementById('reader');
  const sync = () => themeSwitch.setAttribute('aria-checked',String(reader.dataset.theme === 'dark'));
  function show(open, restoreFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded',String(open));
    if (open) { sync(); themeSwitch.focus(); }
    else if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click',() => show(panel.hidden));
  document.addEventListener('pointerdown',event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) show(false);
  });
  document.addEventListener('focusin',event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) show(false);
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !panel.hidden) {event.preventDefault();show(false,true);}
  });
  themeSwitch.addEventListener('click',() => {
    document.getElementById('reader-theme-toggle').click();
    sync();
  });
  new MutationObserver(sync).observe(reader,{attributes:true,attributeFilter:['data-theme']});
  document.getElementById('settings-desktop').addEventListener('click',() => {
    show(false,true);
    document.querySelector('.desktop-toggle').click();
  });
  document.getElementById('settings-about').addEventListener('click',() => {
    show(false);
    document.querySelector('.dock-button[data-open="welcome"]').click();
  });
  sync();
})();
