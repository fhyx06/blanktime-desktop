(() => {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const appearance = window.blanktimeAppearance;
  const choices = [...document.querySelectorAll('#settings-system-theme [data-theme-choice]')];
  // 单选组：只有选中项可 Tab 聚焦，方向键在三项之间移动并立即生效。
  const sync = () => {
    const current = appearance.getPreference();
    choices.forEach(choice => {
      const selected = choice.dataset.themeChoice === current;
      choice.setAttribute('aria-checked', String(selected));
      choice.tabIndex = selected ? 0 : -1;
    });
  };
  const selectedChoice = () => choices.find(choice => choice.getAttribute('aria-checked') === 'true') || choices[0];
  function show(open, restoreFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded',String(open));
    if (open) { sync(); selectedChoice()?.focus(); }
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
  choices.forEach((choice, index) => {
    choice.addEventListener('click',() => { appearance.setPreference(choice.dataset.themeChoice); sync(); });
    choice.addEventListener('keydown',event => {
      const step = {ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1}[event.key];
      if (!step) return;
      event.preventDefault();
      const next = choices[(index + step + choices.length) % choices.length];
      next.click(); next.focus();
    });
  });
  document.addEventListener('blanktime:system-theme', sync);
  document.getElementById('settings-system-info').addEventListener('click',() => show(false));
  document.getElementById('settings-terminal')?.addEventListener('click',() => show(false));
  // 锁屏：先关闭设置面板再锁定，解锁后焦点回到设置按钮。
  document.getElementById('settings-lock')?.addEventListener('click',() => {
    show(false,true);
    window.blanktimeLock?.lock();
  });
  document.getElementById('settings-desktop').addEventListener('click',() => {
    show(false,true);
    document.querySelector('.desktop-toggle').click();
  });
  document.getElementById('settings-about').addEventListener('click',() => {
    show(false);
    document.querySelector('.dock-button[data-open="welcome"]').click();
  });
  // 安装为应用：只在当前浏览器可以安装、且还没有以应用形式打开时出现。
  const install = document.getElementById('settings-install');
  const syncInstall = () => { if (install) install.hidden = !window.blanktimePWA?.canInstall?.(); };
  install?.addEventListener('click',() => {
    show(false,true);
    window.blanktimePWA?.install();
  });
  document.addEventListener('blanktime:pwa-change', syncInstall);
  syncInstall();
  document.getElementById('settings-wallpaper-toggle').addEventListener('click',() => {
    show(false);
  });
  sync();
})();
