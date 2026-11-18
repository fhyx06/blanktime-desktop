(() => {
  'use strict';
  // 外观偏好：auto 跟随系统或浏览器的 prefers-color-scheme，light / dark 为手动指定。
  // 存储中只记录手动指定的值；未记录（或记录为 auto）时跟随系统，此前手动选择过的用户保持原选择。
  const key = 'blanktime-system-theme';
  const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const normalize = value => value === 'dark' || value === 'light' ? value : 'auto';
  let preference = 'auto', theme = 'light';
  try { preference = normalize(localStorage.getItem(key)); } catch {}
  const resolve = () => preference === 'auto' ? (scheme?.matches ? 'dark' : 'light') : preference;
  function render() {
    const next = resolve();
    const changed = next !== theme || document.documentElement.dataset.systemTheme !== next;
    theme = next;
    document.documentElement.dataset.systemTheme = theme;
    document.documentElement.dataset.themePreference = preference;
    return changed;
  }
  function announce() {
    document.dispatchEvent(new CustomEvent('blanktime:system-theme', {detail: {theme, preference}}));
  }
  // 接受 'light'、'dark' 或 'auto'；persist 为 false 时只应用不保存（例如其他标签页已保存过）。
  function setPreference(value, persist = true) {
    preference = normalize(value);
    if (persist) {
      try { preference === 'auto' ? localStorage.removeItem(key) : localStorage.setItem(key, preference); } catch {}
    }
    render();
    announce();
  }
  window.blanktimeAppearance = {
    getTheme: () => theme,
    getPreference: () => preference,
    setPreference,
    // 兼容旧接口：直接指定浅色或深色。
    setTheme: (value, persist = true) => setPreference(value === 'dark' ? 'dark' : 'light', persist)
  };
  render();
  announce();
  // 跟随系统时，系统或浏览器切换明暗（例如手机夜间自动切换）会实时生效。
  const followSystem = () => { if (preference === 'auto' && render()) announce(); };
  if (scheme?.addEventListener) scheme.addEventListener('change', followSystem);
  else scheme?.addListener?.(followSystem);
  addEventListener('storage', event => { if (event.key === key || event.key === null) setPreference(event.newValue, false); });
})();
