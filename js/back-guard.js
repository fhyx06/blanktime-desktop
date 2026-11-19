// 移动端返回键按窗口逐个处理：历史记录中的每一条都归属于某个窗口，
//   - window：打开某个窗口时写入（地址不变），返回时关闭该窗口；
//   - nav：阅读窗口切换文章时写入（地址随文章变化），返回时回到上一篇，交给文章路由处理。
// 窗口最小化或关闭时，它名下的记录一并失效：位于栈顶的立即回退回收，其余的在返回时自动跳过，
// 因此一个窗口的历史不会影响到其他窗口。
// 必须在 browser.js 之前加载，才能在需要时拦下文章路由的 popstate。
(() => {
  'use strict';
  const KEY = 'blanktimeGuard';
  const mobile = matchMedia('(max-width: 760px)');
  const indexOf = state => {
    const value = state && typeof state === 'object' ? state[KEY]?.index : 0;
    return Number.isInteger(value) && value > 0 ? value : 0;
  };
  // 给记录状态写入或去掉本脚本的序号，其余字段原样保留。
  const tag = (state, index) => {
    const base = state && typeof state === 'object' ? {...state} : null;
    if (index) return {...(base || {}), [KEY]:{index}};
    if (base && KEY in base) { delete base[KEY]; return base; }
    return state;
  };
  // entries[i] 对应第 i + 1 条记录（第 0 条是进入页面时的记录）；current 是当前所在位置。
  let current = indexOf(history.state);
  // 刷新页面后无法得知旧记录的归属，一律视为失效。
  let entries = Array.from({length:current}, () => ({kind:'window', id:'', stale:true}));
  let ignore = 0, fromBack = false, trimQueued = false;
  const pending = new Set();
  const nativePush = history.pushState.bind(history), nativeReplace = history.replaceState.bind(history);
  function push(entry, state, title, url) {
    entries.length = current;
    entries.push({...entry, stale:false});
    current = entries.length;
    nativePush(tag(state, current), title, url);
  }
  // 目前只有阅读窗口会写入新的历史记录（切换文章）。
  history.pushState = function (state, title, url) { push({kind:'nav', id:'browser'}, state, title, url); };
  history.replaceState = function (state, title, url) { nativeReplace(tag(state, current), title, url); };

  const windowOf = id => document.getElementById(id);
  const isOpen = id => windowOf(id)?.dataset.state === 'open';
  const hasWindowEntry = id => entries.slice(0, current).some(entry => !entry.stale && entry.kind === 'window' && entry.id === id);
  // 没有用户手势时写入的记录会被浏览器的返回键直接跳过，先记下，等下一次点按再补。
  const activated = () => !navigator.userActivation || navigator.userActivation.isActive;
  function rewind(steps) {
    if (steps <= 0) return;
    ignore++; current -= steps;
    history.go(-steps);
  }
  // 回收栈顶已经失效的记录。同一任务里多个窗口一起隐藏（例如“显示桌面”）时合并成一次回退。
  function trim() {
    if (trimQueued) return;
    trimQueued = true;
    queueMicrotask(() => {
      trimQueued = false;
      let steps = 0;
      while (current - steps > 0 && entries[current - steps - 1].stale) steps++;
      rewind(steps);
    });
  }
  function opened(win) {
    if (!mobile.matches || !win.id || hasWindowEntry(win.id)) return;
    if (!activated()) { pending.add(win.id); return; }
    pending.delete(win.id);
    push({kind:'window', id:win.id}, history.state, '', location.href);
  }
  function hidden(win) {
    pending.delete(win.id);
    if (!mobile.matches) return;
    entries.forEach((entry, index) => { if (index < current && entry.id === win.id) entry.stale = true; });
    if (!fromBack) trim();
  }

  addEventListener('popstate', event => {
    const from = current, target = indexOf(event.state);
    current = target;
    if (ignore) { ignore--; event.stopImmediatePropagation(); return; }
    if (target > from) {
      // 前进：不会重新打开已关闭的窗口；文章记录照常交给文章路由。
      const entry = entries[target - 1];
      if (entry && (entry.stale || entry.kind === 'window')) event.stopImmediatePropagation();
      return;
    }
    if (target === from) return;
    // 后退：从上往下处理被越过的记录。
    const popped = entries.slice(target, from).reverse().filter(entry => !entry.stale);
    popped.forEach(entry => { entry.stale = true; });
    // 宽屏下文章前进后退保持浏览器原生行为。
    if (!mobile.matches && popped.length && popped.every(entry => entry.kind === 'nav')) return;
    let closed = false;
    fromBack = true;
    try {
      for (const entry of popped) {
        if (entry.kind === 'window' && isOpen(entry.id)) { window.blanktimeDesktop.closeWindow(windowOf(entry.id)); closed = true; }
      }
    } finally { fromBack = false; }
    const navigated = popped.some(entry => entry.kind === 'nav');
    if (!closed && navigated && isOpen('browser')) {
      // 回到阅读窗口的上一篇文章：交给 browser.js 的 popstate 处理。
      trim();
      return;
    }
    event.stopImmediatePropagation();
    // 只越过了失效记录：继续后退，保证每次按返回都有可见的效果。
    if (!closed && !navigated) { if (target > 0) history.back(); return; }
    trim();
  });
  document.addEventListener('blanktime:window-opened', event => opened(event.target), true);
  document.addEventListener('blanktime:window-hidden', event => hidden(event.target), true);
  for (const type of ['click', 'keydown', 'pointerup']) document.addEventListener(type, () => {
    if (!pending.size || !activated()) return;
    for (const id of [...pending]) {
      pending.delete(id);
      if (isOpen(id)) opened(windowOf(id));
    }
  }, true);
  mobile.addEventListener?.('change', () => {
    if (mobile.matches) {
      document.querySelectorAll('.app-window').forEach(win => { if (win.dataset.state === 'open') opened(win); });
    } else {
      // 切到宽屏后不再用返回键关窗口，回收窗口记录；文章记录保留原生行为。
      pending.clear();
      entries.forEach((entry, index) => { if (index < current && entry.kind === 'window') entry.stale = true; });
      trim();
    }
  });
})();
