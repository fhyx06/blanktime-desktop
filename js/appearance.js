(() => {
  'use strict';
  const key = 'blanktime-system-theme';
  let theme = 'light';
  try { theme = localStorage.getItem(key) === 'dark' ? 'dark' : 'light'; } catch {}
  function apply(value, persist = true) {
    theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.systemTheme = theme;
    if (persist) { try { localStorage.setItem(key, theme); } catch {} }
    document.dispatchEvent(new CustomEvent('blanktime:system-theme', {detail: {theme}}));
  }
  window.blanktimeAppearance = {getTheme: () => theme, setTheme: apply};
  apply(theme, false);
  addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue, false); });
})();
