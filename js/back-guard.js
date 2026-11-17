// 移动端返回键关闭窗口：每个打开的窗口在历史记录里对应一条地址不变的"守卫"记录，
// 按返回键时消耗一条守卫并关闭最上层的窗口，而不是直接离开页面或跳回上一篇文章。
// 必须在 browser.js 之前加载，才能在处理守卫时拦下文章路由的 popstate。
(() => {
  'use strict';
  const KEY = 'blanktimeGuard';
  const mobile = matchMedia('(max-width: 760px)');
  const read = state => state && typeof state === 'object' && state[KEY] && typeof state[KEY] === 'object' ? state[KEY] : null;
  // 给记录状态加上或去掉守卫标记，其余字段原样保留。
  const tag = (state, guard) => {
    if (!guard) {
      if (!read(state)) return state;
      const copy = {...state}; delete copy[KEY]; return copy;
    }
    return {...(state && typeof state === 'object' ? state : {}), [KEY]:guard};
  };
  // depth：截至当前记录一共有多少层窗口守卫；run：栈顶连续的纯守卫条数，只有这些能直接回退消耗。
  let current = read(history.state);
  const depth = () => current?.depth || 0, run = () => current?.run || 0;
  let ignore = 0, closingFromBack = false, waiting = false;
  const nativePush = history.pushState.bind(history), nativeReplace = history.replaceState.bind(history);
  // 文章路由等其他脚本写入的记录继承当前层数，但不算纯守卫：回退消耗时不会越过它们。
  history.pushState = function (state, title, url) {
    const guard = depth() ? {depth:depth(), run:0} : null;
    nativePush(tag(state, guard), title, url);
    current = guard;
  };
  history.replaceState = function (state, title, url) {
    nativeReplace(tag(state, current), title, url);
  };
  const openWindows = () => [...document.querySelectorAll('.app-window')].filter(win => win.dataset.state === 'open');
  const topWindow = () => openWindows().sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
  // 没有用户手势时写入的记录会被浏览器的返回键直接跳过，此时先记下，等下一次点按再补。
  const activated = () => !navigator.userActivation || navigator.userActivation.isActive;
  function sync() {
    if (closingFromBack || ignore) return;
    const desired = mobile.matches ? openWindows().length : 0;
    if (depth() < desired) {
      if (!activated()) { waiting = true; return; }
      waiting = false;
      while (depth() < desired) {
        const guard = {depth:depth() + 1, run:run() + 1};
        nativePush(tag(history.state, guard), '', location.href);
        current = guard;
      }
    } else if (depth() > desired && run() > 0) {
      // 用关闭按钮关掉窗口时，顺手回退掉对应的守卫，免得之后按返回"没反应"。
      ignore++;
      history.go(-Math.min(depth() - desired, run()));
    }
  }
  addEventListener('popstate', event => {
    const leaving = current, before = depth();
    current = read(event.state);
    if (ignore) {
      ignore--;
      event.stopImmediatePropagation();
      if (!ignore) sync();
      return;
    }
    // 只看离开的是不是纯守卫，而不比较地址：页内锚点跳转会改写守卫记录的 hash。
    const fromGuard = leaving?.run > 0 && depth() < before;
    const intoGuard = current?.run > 0 && depth() > before;
    // 其余情况是正常的页面导航（文章前进后退），交给其他脚本处理。
    if (!fromGuard && !intoGuard) return;
    // 守卫跳转不能让文章路由把阅读窗口重新打开或切换文章。
    event.stopImmediatePropagation();
    if (intoGuard) return;
    let closed = 0;
    closingFromBack = true;
    try {
      for (let i = depth(); i < before; i++) {
        const win = topWindow();
        if (!win) break;
        window.blanktimeDesktop.closeWindow(win); closed++;
      }
    } finally { closingFromBack = false; }
    // 守卫已经失效（对应窗口早已关闭）时继续后退，保证每次按返回都有可见的效果。
    if (!closed && mobile.matches) history.back();
  });
  document.addEventListener('blanktime:window-opened', sync, true);
  document.addEventListener('blanktime:window-hidden', sync, true);
  for (const type of ['click', 'keydown', 'pointerup']) document.addEventListener(type, () => { if (waiting) sync(); }, true);
  mobile.addEventListener?.('change', sync);
})();
