// 锁屏：设置面板“锁定”、桌面右键“锁定”、Alt+L 或闲置超时后锁定；
// 手机上滑、电脑点击或按任意键解锁。锁定期间桌面界面隐藏且不可操作，焦点停留在锁屏上。
(() => {
  'use strict';
  const screen = document.getElementById('lock-screen');
  if (!screen) return;
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const time = $('lock-screen-time'), dateLine = $('lock-screen-date'), poem = $('lock-screen-poem');
  const music = $('lock-screen-music'), post = $('lock-screen-post');
  const media = query => typeof window.matchMedia === 'function' ? window.matchMedia(query) : {matches:false};
  const reducedMotion = media('(prefers-reduced-motion: reduce)');
  const idleMinutes = Math.max(0, Number(screen.dataset.idleMinutes) || 0);
  const showLunar = screen.dataset.lunar !== 'false';
  const showMusic = screen.dataset.music !== 'false';
  let locked = false, clockTimer = 0, idleTimer = 0, lastActivity = 0, motion = null, drag = null, offset = 0, restoreFocus = null;
  const inerted = new Set();

  // 农历：借助浏览器的中国历法格式化，日数转成“初一 / 十五 / 廿三”的写法；不支持时省略。
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function lunarDay(day) {
    if (day <= 10) return '初' + digits[day];
    if (day < 20) return '十' + digits[day - 10];
    if (day === 20) return '二十';
    if (day < 30) return '廿' + digits[day - 20];
    return '三十';
  }
  function lunar(date) {
    try {
      const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {month:'long', day:'numeric'}).formatToParts(date);
      const month = parts.find(part => part.type === 'month')?.value || '';
      const day = Number(parts.find(part => part.type === 'day')?.value);
      if (!/[正一二三四五六七八九十冬腊]/.test(month) || !Number.isInteger(day) || day < 1 || day > 30) return '';
      return month + lunarDay(day);
    } catch { return ''; }
  }
  function updateClock() {
    const now = new Date();
    const text = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (time.textContent !== text) time.textContent = text;
    time.setAttribute('datetime', now.toISOString());
    const weekday = new Intl.DateTimeFormat('zh-CN', {weekday:'long'}).format(now);
    const lunarText = showLunar ? lunar(now) : '';
    dateLine.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${weekday}` + (lunarText ? ` · ${lunarText}` : '');
  }
  // 诗词沿用欢迎窗口已经加载的“今日诗词”，没有时保留模板中的备用诗句。
  function syncPoem() {
    const text = $('welcome-poem')?.textContent.trim();
    if (text) poem.textContent = text;
  }

  // 音乐卡片：有歌曲正在播放或暂停在中途时显示，否则显示最新文章。
  const player = () => showMusic ? window.blanktimeMusic : null;
  function syncCards() {
    const state = player()?.getState?.();
    const active = !!(state && state.ready && state.title && (state.playing || state.currentTime > 0));
    music.hidden = !active;
    if (post) post.hidden = active;
    if (!active) return;
    music.querySelector('strong').textContent = state.title;
    music.querySelector('.lock-screen-music-meta > span').textContent = state.artist || '';
    const toggle = music.querySelector('[data-lock-music="toggle"]');
    const label = state.playing ? '暂停' : '播放';
    if (toggle.getAttribute('aria-label') !== label) {
      toggle.setAttribute('aria-label', label);
      toggle.querySelector('path').setAttribute('d', state.playing ? 'M8 5v14M16 5v14' : 'm8 5 11 7-11 7Z');
    }
    const cover = music.querySelector('.lock-screen-cover img');
    const src = /^https?:\/\//i.test(state.cover || '') ? state.cover : '';
    if ((cover.getAttribute('src') || '') !== src) {
      cover.hidden = true;
      if (src) cover.src = src; else cover.removeAttribute('src');
    }
  }
  music.querySelector('.lock-screen-cover img').addEventListener('load', event => { event.target.hidden = false; });
  music.querySelector('.lock-screen-cover img').addEventListener('error', event => { event.target.hidden = true; });
  music.addEventListener('click', event => {
    const button = event.target.closest('[data-lock-music]');
    if (!button) return;
    event.stopPropagation();
    const controls = player();
    if (!controls) return;
    if (button.dataset.lockMusic === 'next') controls.next(); else controls.togglePlayback();
    syncCards();
  });
  document.addEventListener('blanktime:music-state', () => { if (locked) syncCards(); });
  post?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const href = post.href;
    unlock(() => document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href}})));
  });

  // 锁定期间桌面上的一切都不可聚焦、不可点击；壁纸和备案号除外。
  function setInert(on) {
    if (!on) { inerted.forEach(element => { element.inert = false; }); inerted.clear(); return; }
    for (const element of document.body.children) {
      if (element === screen || element.inert || element.matches('.site-record, .wallpaper, script, template, style, noscript')) continue;
      element.inert = true;
      inerted.add(element);
    }
  }
  function announce() {
    document.dispatchEvent(new CustomEvent('blanktime:lock-change', {detail:{locked}}));
  }
  // 锁屏是一整张不透明的页面：跟随桌面壁纸时，在锁定瞬间把当前壁纸（含竖版与焦点）复制进来；
  // 锦鲤动态壁纸无法用 CSS 复制，改为截取当前画面。这样上滑时整页移走，下方的桌面清晰可辨。
  const sheet = screen.querySelector('.lock-screen-sheet'), shade = screen.querySelector('.lock-screen-shade');
  const backdrop = screen.querySelector('.lock-screen-backdrop'), snapshot = screen.querySelector('.lock-screen-snapshot');
  const SHADE = .55;
  function paintBackdrop() {
    snapshot.hidden = true;
    if (screen.classList.contains('has-own-wallpaper')) return;
    const desktop = document.querySelector('.wallpaper');
    if (!desktop) return;
    const style = getComputedStyle(desktop);
    for (const [from, to] of [['--wallpaper', '--lock-wallpaper'], ['--wallpaper-portrait', '--lock-wallpaper-portrait'], ['--wallpaper-portrait-position', '--lock-wallpaper-portrait-position']]) {
      const value = style.getPropertyValue(from).trim();
      if (value) backdrop.style.setProperty(to, value); else backdrop.style.removeProperty(to);
    }
    const koi = desktop.querySelector('canvas.koi-wallpaper');
    if (koi && koi.width && koi.height && window.blanktimeLiveWallpaper?.getState?.().selected) {
      try {
        snapshot.width = koi.width; snapshot.height = koi.height;
        snapshot.getContext('2d')?.drawImage(koi, 0, 0);
        snapshot.hidden = false;
      } catch { snapshot.hidden = true; }
    }
  }
  const animatable = () => !reducedMotion.matches && typeof sheet.animate === 'function';
  const height = () => window.innerHeight || 800;
  // 整页位置与下方暗层的浓度一起变化：页面移得越远，桌面越亮。
  function place(y) {
    offset = y;
    sheet.style.transform = y ? `translateY(${y}px)` : '';
    shade.style.opacity = String(SHADE * (1 - Math.min(1, Math.abs(y) / height())));
    sheet.classList.toggle('is-moving', y !== 0);
  }
  // 从 from 移到 to 的动画；结束后交给 done。
  function slide(from, to, duration, easing, done) {
    sheet.classList.add('is-moving');
    const shadeAt = y => SHADE * (1 - Math.min(1, Math.abs(y) / height()));
    const options = {duration, easing, fill:'forwards'};
    const page = sheet.animate([{transform:`translateY(${from}px)`}, {transform:`translateY(${to}px)`}], options);
    const dim = shade.animate([{opacity:shadeAt(from)}, {opacity:shadeAt(to)}], options);
    motion = page;
    page.onfinish = () => {
      if (motion !== page) return;
      motion = null;
      place(to);
      page.cancel(); dim.cancel();
      done();
    };
    page.oncancel = () => { if (motion === page) { motion = null; dim.cancel(); place(to); done(); } };
  }
  function lock() {
    if (locked || motion) return false;
    locked = true;
    restoreFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
    setInert(true);
    paintBackdrop();
    syncPoem(); updateClock(); syncCards();
    clearInterval(clockTimer);
    clockTimer = setInterval(updateClock, 1000);
    clearTimeout(idleTimer);
    screen.hidden = false;
    screen.focus({preventScroll:true});
    announce();
    // 锁定动画与解锁相反：整页从上方落下，桌面随之变暗，落定后才隐藏桌面界面。
    if (!animatable()) { place(0); root.dataset.locked = 'true'; return true; }
    root.dataset.locked = 'peek';
    place(-height());
    slide(-height(), 0, 420, 'cubic-bezier(.2, .8, .25, 1)', () => { if (locked) root.dataset.locked = 'true'; });
    return true;
  }
  function unlock(then) {
    if (!locked || motion) return false;
    locked = false;
    clearInterval(clockTimer);
    // 先露出桌面（仍不可操作），再让锁屏整页向上滑走。
    root.dataset.locked = 'peek';
    const finish = () => {
      delete root.dataset.locked;
      screen.hidden = true;
      place(0);
      setInert(false);
      if (restoreFocus?.isConnected && !restoreFocus.closest('[hidden], [inert]')) restoreFocus.focus({preventScroll:true});
      restoreFocus = null;
      armIdle();
      announce();
      then?.();
    };
    if (!animatable()) { finish(); return true; }
    slide(offset, -height(), Math.max(180, 420 * (1 - Math.abs(offset) / height())), 'cubic-bezier(.3, .6, .2, 1)', finish);
    return true;
  }
  function settleBack() {
    // 上滑距离不够时回弹，桌面重新隐藏。
    const from = offset;
    const done = () => { if (locked) root.dataset.locked = 'true'; };
    if (!from || !animatable()) { place(0); done(); return; }
    slide(from, 0, 220, 'cubic-bezier(.2, .8, .3, 1)', done);
  }
  function nudge() {
    if (!animatable()) return;
    screen.querySelector('.lock-screen-content').animate([
      {transform:'translateY(0)'}, {transform:'translateY(-18px)'}, {transform:'translateY(0)'}
    ], {duration:420, easing:'cubic-bezier(.3, .6, .3, 1)'});
  }

  // 手机上滑解锁：整页跟手，松手时距离或速度足够就解锁；鼠标点击直接解锁，触屏轻点只提示上滑。
  screen.addEventListener('pointerdown', event => {
    if (!locked || motion || event.button !== 0 || event.target.closest('button, a')) return;
    drag = {id:event.pointerId, y:event.clientY, type:event.pointerType, moved:false, velocity:0, lastY:event.clientY, lastTime:performance.now()};
    try { screen.setPointerCapture?.(event.pointerId); } catch {}
  });
  screen.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dy = Math.min(0, event.clientY - drag.y);
    if (!drag.moved && Math.abs(event.clientY - drag.y) > 8) { drag.moved = true; root.dataset.locked = 'peek'; }
    if (!drag.moved) return;
    const now = performance.now(), elapsed = now - drag.lastTime;
    if (elapsed > 0) drag.velocity = drag.velocity * .3 + (event.clientY - drag.lastY) / elapsed * .7;
    drag.lastY = event.clientY; drag.lastTime = now;
    place(dy);
  });
  screen.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const state = drag;
    drag = null;
    try { if (screen.hasPointerCapture?.(event.pointerId)) screen.releasePointerCapture(event.pointerId); } catch {}
    if (!state.moved) {
      if (state.type === 'mouse') unlock(); else nudge();
      return;
    }
    if (offset < -Math.min(140, height() * .18) || state.velocity < -.5) unlock();
    else settleBack();
  });
  screen.addEventListener('pointercancel', event => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    settleBack();
  });

  // 键盘：Alt+L 锁定；锁定时 Tab 只在锁屏内循环，其余按键解锁（在锁屏按钮上按 Enter/空格仍执行按钮）。
  const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'Dead', 'Unidentified']);
  document.addEventListener('keydown', event => {
    if (!locked) {
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyL' && lock()) event.preventDefault();
      return;
    }
    event.stopImmediatePropagation();
    if (event.key === 'Tab') {
      event.preventDefault();
      const focusables = [...screen.querySelectorAll('button, a[href]')].filter(element => !element.closest('[hidden]'));
      if (!focusables.length) { screen.focus({preventScroll:true}); return; }
      const index = focusables.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index + 1) % focusables.length;
      focusables[next].focus({preventScroll:true});
      return;
    }
    if (modifierKeys.has(event.key) || motion) return;
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('#lock-screen button, #lock-screen a')) return;
    event.preventDefault();
    unlock();
  }, true);
  // 焦点被移到锁屏之外时拉回来。
  document.addEventListener('focusin', event => {
    if (locked && !screen.contains(event.target)) screen.focus({preventScroll:true});
  });

  // 闲置自动锁屏：idle_minutes 为 0 时关闭；页面中有视频正在播放时推迟。
  const videoPlaying = () => [...document.querySelectorAll('video')].some(video => !video.paused && !video.ended);
  function armIdle() {
    clearTimeout(idleTimer);
    if (!idleMinutes || locked) return;
    idleTimer = setTimeout(() => {
      if (locked) return;
      if (videoPlaying()) armIdle(); else lock();
    }, idleMinutes * 60000);
  }
  if (idleMinutes) {
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
      addEventListener(type, () => {
        const now = Date.now();
        if (locked || now - lastActivity < 1000) return;
        lastActivity = now;
        armIdle();
      }, {capture:true, passive:true});
    }
    armIdle();
  }

  window.blanktimeLock = {lock, unlock, isLocked:() => locked};
})();
