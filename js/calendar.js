// 日历：点状态栏时钟弹出。月视图带农历、节气与传统节日，有文章的日子带圆点，下方列出所选日期的文章。
// 农历与节气都来自内置的紧凑数据表（1900–2100），不依赖浏览器的 Intl 中国历：
// 实测 ICU 的农历在 2027、2030 等年份与官方历法差一天（例如把 2027 年春节算成 2 月 5 日）。
(() => {
  'use strict';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const FIRST_YEAR = 1900, LAST_YEAR = 2100, DAY = 864e5;

  // ---------- 节气：每年 24 个节气各占 2 位（相对当月最早日期的偏移），3 个一组编成一个字符 ----------
  const TERM_NAMES = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
  const TERM_BASE = [4,19,3,18,4,19,4,19,4,20,4,20,6,22,6,22,6,22,7,22,6,21,6,21];
  const TERMS = 'WplplZqWappqmqqaqpquqqqqq+6u6uqqrqlplZqWappqmqqaqpqqqqqqq+6u6uqqrqlplZqWappqmqqaqpqqqqqqq+6u6uqqrqlplZqVWppqmaqaappqqqqqq6ququqqqqlplZpVWpppmaqaappqqqqaq6ququqqqqlplZpVWplpmaqWappqqqqaqpququqqqqlplZpVWplpmaqWappqmqqaqpququqqqqlplZVVWplplZqWappqmqqaqpquqqqqqqlZlZVVWplplZqWappqmqqaqpqqqqqqqqlZlZVVWplplZqWappqmqqaqpqqqqqqqqlZlZVVWplplZqWappqmqqaqpqqqqqqqqVZlZVVWplplZpVWppqmaqaappqqqqqqmVZVZVVVplplZpVWplpmaqaappqqqqqqmVZVZVVVplplZpVWplpmaqWappqmqqaqWVZVZVVVplplZpVWplplZqWappqmqqaqVVZVVVVVplZlZVVWplplZqWappqmqqaqVVZVVVVVplZlZVVWplplZqWappqmqqaqVVVVVVVVplZlZVVWplplZqWappqmqqaqVVVVVVVVpVZlZVVWplplZqWappqmaqaqVUVVVVVVpVZVZVVWplplZpWWpppmaqaqVUVVVVVVpVZVZVVWplplZpVWplpmaqaaVUVRVVVVlVZVZVVVplplZpVWplplaqWaVUVRVVFVVVZVVVVVplZlZpVWplplZqWaVUVRVVFVUVZVVVVVplZlZVVWplplZqWaVUVRVVFVUVVVVVVVplZlZVVWplplZqWaVUVRVVFVUVVVVVVVplZlZVVWplplZqWaVUVRVVFVUVVVVVVVpVZVZVVWplplZqWaVUVRFVFVUUVVVVVVpVZVZVVWplplZpWaVUURFVFVUUVRVVVVpVZVZVVWplplZpVWVQURFVFFUUVRVVVVlVZVZVVVplZlZpVWVQUQEVFFUUVRVVFVVVZVVVVVplZlZpVWVQUQEVBFUUVRVVFVUVVVVVVVplZlZVVWVQUQEVBFUUVRVVFVUVVVVVVVplZlZVVWVQUQEVBFUUVRVVFVUVVVVVVVpVZVZVVWVQUQEVBFUUVRVVFVUVVVVVVVpVZVZVVWVQUQEVBFUUURFVFVUUVVVVVVpVZVZVVWVQUQEUBFUQURFVFVUUVRVVVVpVZVZVVWVQEQEUABUQUQEVFFUUVRVVVVVVZVVVVVVQEQEUABUQUQEVFFUUVRVVVVVVVVVVVVVQEQEUABUQUQEVBFUUVRVVFVVVVVVVVVVQEQEAABUQUQEVBFUUVRVVFVUVVVVVVVVQEQEAABUQUQEVBFUUVRVVFVUVVVVVVVVAEAEAABUQUQEVBFUUURFVFVUVVVVVVVVAEAEAABUQUQEUBFUUURFVFVUUVRVVVVVAEAEAABUQUQEUBFUQUQFVFVUUVRVVVVVAEAEAABUQEQEUAFUQUQEVFFUUVRVVVVBAEAAAAAUQEQEUABUQUQEVFFUUVRVVVVBAAAAAAAUQEQEUABUQUQEVBFUUVRVVFVBAAAAAAAUQEQEAABUQUQEVBFUUVRVVFVAAAAAAAAUQEAEAABUQUQEVBFUUVRVVFVUVVVVVV';
  function solarTerm(date) {
    const year = date.getFullYear(), month = date.getMonth(), day = date.getDate();
    if (year < FIRST_YEAR || year > LAST_YEAR) return '';
    for (const k of [month * 2, month * 2 + 1]) {
      const packed = B64.indexOf(TERMS[(year - FIRST_YEAR) * 8 + Math.floor(k / 3)]);
      if (TERM_BASE[k] + ((packed >> (k % 3 * 2)) & 3) === day) return TERM_NAMES[k];
    }
    return '';
  }

  // ---------- 农历：每年 4 个字符 = 正月初一距 1 月 21 日的天数（5 位）+ 闰月（4 位）+ 各月大小（13 位） ----------
  const LUNAR = 'KUaLdQqDSoUHoSJLaYJDOYTFEyqKXQtCMIrFBRqLUQqDJrkNcokFQYJFlaVKYoVBNYtCCJtFVI1GrTyOeQSHSokGnqJNawKFPwWBDq2KXgaDMIVHCRSPUQSHJzkGbYlCQ4KFlyWJYQrFOgaDjJZHVIpDqbSLdYSFSYlCGbLFZoVFPQtCEqqNXg0FMIpFBZSNUoSForlKbwmCQoVFmS1KYQ2CNo0GjRpOWQpGKsSFc4SFSwqCHrWFZoaFPQaDEqUHXoUHMQJDg5SGTYTFpTrKbQtCQItFmSqLZQqFNokFCaJLVYJFKcVKcoVBRotCHLtFaI1GPQyGEqkOXokGMtJNewKFTwWBIr2CboaDQIVHmSSPZQSHOwkGixKFU4KFK0aKdQrBRoaDnKZLaIpDPYSDDalKWYlCLYLFBRrKTQtCorqNcg0FRIpFlaSNYoSFNolCCqVFUoWFqU1KdQ6CSo0GHTpOaQpGPoSGEylKWwqCLoWFBR2KUQaDIrUHbokDQYJDl6SGXYVGNQrCixaFVItFqVqLdQqFSokFHbJNZYJFOYVCjarCWo1CLQtFBRqNUQyGprkObokGQoKFlqVKYwWCMo2CiR1GVIZHLUSPdQSHSwkGHzKFZ4KFOwaCDqaDWoqDMIpDgZSHTYSDoblKbYlCPYLFlSrKYQtCNosFCSpLVQpFKsSNdoSFRolCGrVFZoWFPQ1CDq0FWo0GMQpGhpSOTwSGozpMbwqCQoWFlS2KYQaDNoUHDSJHUYRDJ8SGcYVCRYrCGzaFZQtFPQqDEqkLWooFLYRFAZTKTYVC';
  const MONTH_NAMES = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
  const DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const STEMS = '甲乙丙丁戊己庚辛壬癸', BRANCHES = '子丑寅卯辰巳午未申酉戌亥', ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
  const FESTIVALS = {'1-1':'春节', '1-15':'元宵', '5-5':'端午', '7-7':'七夕', '8-15':'中秋', '9-9':'重阳', '12-8':'腊八'};
  function lunarYear(year) {
    const at = (year - FIRST_YEAR) * 4;
    let packed = 0;
    for (let i = 0; i < 4; i++) packed |= B64.indexOf(LUNAR[at + i]) << (i * 6);
    const leap = (packed >> 5) & 15, months = [];
    for (let month = 1; month <= 12; month++) {
      months.push({month, leap:false});
      if (month === leap) months.push({month, leap:true});
    }
    months.forEach((entry, index) => { entry.days = (packed >> (9 + index)) & 1 ? 30 : 29; });
    return {start:Date.UTC(year, 0, 21) + (packed & 31) * DAY, months};
  }
  function lunar(date) {
    const time = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    let year = date.getFullYear();
    if (year > LAST_YEAR + 1 || year < FIRST_YEAR) return null;
    let info = year <= LAST_YEAR ? lunarYear(year) : null;
    if (!info || time < info.start) { year -= 1; if (year < FIRST_YEAR) return null; info = lunarYear(year); }
    let offset = Math.round((time - info.start) / DAY);
    for (let index = 0; index < info.months.length; index++) {
      const entry = info.months[index];
      if (offset < entry.days) {
        const day = offset + 1, isLast = index === info.months.length - 1;
        const monthName = (entry.leap ? '闰' : '') + MONTH_NAMES[entry.month - 1];
        const festival = entry.leap ? '' : isLast && day === entry.days ? '除夕' : FESTIVALS[`${entry.month}-${day}`] || '';
        const cycle = (year - 4) % 60;
        return {year, month:entry.month, leap:entry.leap, day, monthName, dayName:DAY_NAMES[day - 1], festival,
          yearName:STEMS[cycle % 10] + BRANCHES[cycle % 12] + '年', zodiac:ZODIAC[cycle % 12]};
      }
      offset -= entry.days;
    }
    return null;
  }

  const api = {lunar, solarTerm};
  window.blanktimeCalendar = api;

  // ---------- 弹出层 ----------
  const root = document.getElementById('calendar');
  const trigger = document.getElementById('desktop-clock-button');
  if (!root || !trigger) return;
  const html = document.documentElement;
  const $ = selector => root.querySelector(selector);
  const panel = $('.calendar-panel'), grid = $('.calendar-grid'), list = $('.calendar-posts');
  const weekStart = root.dataset.weekStart === '0' ? 0 : 1;
  const showTerms = root.dataset.solarTerms !== 'false', showFestivals = root.dataset.festivals !== 'false';
  const WEEKDAYS = ['日','一','二','三','四','五','六'];
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const ARTICLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>';
  let view = null, selected = null, today = null, posts = new Map(), tick = 0, popClose = false, previousFocus = null, wheel = 0, wheelAt = 0, swipe = null, swiped = false;

  const pad = value => String(value).padStart(2, '0');
  const key = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sameDay = (a, b) => a && b && key(a) === key(b);
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const lunarText = date => { const info = lunar(date); return info ? `${info.yearName}${info.monthName}${info.dayName}` : ''; };
  // 格子里的小字：传统节日 > 节气 > 初一显示月份 > 农历日期。
  function label(date) {
    const info = lunar(date), term = showTerms ? solarTerm(date) : '';
    if (showFestivals && info?.festival) return {text:info.festival, kind:'festival'};
    if (term) return {text:term, kind:'term'};
    if (!info) return {text:'', kind:''};
    if (info.day === 1) return {text:info.monthName, kind:'month'};
    return {text:info.dayName, kind:''};
  }

  function indexPosts() {
    posts = new Map();
    for (const node of window.blanktimeFS?.nodes?.values?.() || []) {
      if (node.type !== 'article' || !(node.date instanceof Date) || !Number.isFinite(node.date.valueOf())) continue;
      const day = key(node.date);
      if (!posts.has(day)) posts.set(day, []);
      posts.get(day).push(node);
    }
    for (const day of posts.values()) day.sort((a, b) => b.date - a.date);
  }

  function renderClock() {
    const now = new Date();
    $('.calendar-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    $('.calendar-today').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}${lunarText(now) ? ` · ${lunarText(now)}` : ''}`;
    // 跨过零点时刷新“今天”。
    if (today && !sameDay(today, now)) { today = startOfDay(now); render(); }
  }

  function render(focus = false) {
    $('.calendar-month').textContent = `${view.getFullYear()}年${view.getMonth() + 1}月`;
    const lead = (view.getDay() - weekStart + 7) % 7, first = addDays(view, -lead);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const head = document.createElement('span');
      head.className = 'calendar-weekday';
      head.setAttribute('aria-hidden', 'true');
      const weekday = (weekStart + i) % 7;
      head.textContent = WEEKDAYS[weekday];
      if (weekday === 0 || weekday === 6) head.classList.add('is-weekend');
      cells.push(head);
    }
    // 固定 6 行，翻月时面板高度不跳动。
    for (let i = 0; i < 42; i++) {
      const date = addDays(first, i), dayKey = key(date), count = posts.get(dayKey)?.length || 0, tag = label(date);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar-day';
      cell.dataset.date = dayKey;
      if (date.getMonth() !== view.getMonth()) cell.classList.add('is-outside');
      if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add('is-weekend');
      if (tag.kind) cell.classList.add(`is-${tag.kind}`);
      if (count) cell.classList.add('has-posts');
      if (sameDay(date, today)) { cell.classList.add('is-today'); cell.setAttribute('aria-current', 'date'); }
      const isSelected = sameDay(date, selected);
      cell.setAttribute('aria-pressed', String(isSelected));
      cell.tabIndex = isSelected ? 0 : -1;
      cell.setAttribute('aria-label', [`${date.getMonth() + 1}月${date.getDate()}日 星期${WEEKDAYS[date.getDay()]}`, lunarText(date), tag.kind === 'festival' || tag.kind === 'term' ? tag.text : '', count ? `${count} 篇文章` : ''].filter(Boolean).join('，'));
      const number = document.createElement('span');
      number.className = 'calendar-number';
      number.textContent = date.getDate();
      const small = document.createElement('span');
      small.className = 'calendar-lunar';
      small.textContent = tag.text;
      cell.append(number, small);
      cells.push(cell);
    }
    grid.replaceChildren(...cells);
    renderPosts();
    if (focus) grid.querySelector('.calendar-day[tabindex="0"]')?.focus({preventScroll:true});
  }

  function renderPosts() {
    const day = posts.get(key(selected)) || [];
    const heading = document.createElement('p');
    heading.className = 'calendar-posts-heading';
    heading.textContent = `${selected.getMonth() + 1}月${selected.getDate()}日 星期${WEEKDAYS[selected.getDay()]}${lunarText(selected) ? ` · ${lunar(selected).monthName}${lunar(selected).dayName}` : ''}${sameDay(selected, today) ? '（今天）' : ''}`;
    const items = day.map(node => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'calendar-post';
      row.innerHTML = ARTICLE;
      const title = document.createElement('span');
      title.textContent = node.title || node.name;
      row.append(title);
      if (node.encrypted) row.insertAdjacentHTML('beforeend', `<span class="calendar-lock" aria-label="已加密">${LOCK}</span>`);
      row.addEventListener('click', () => {
        hide(false);
        document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href:new URL(node.url, location.href).href}}));
      });
      return row;
    });
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '这一天没有文章';
      items.push(empty);
    }
    // 本月文章数与归档入口。
    const monthPrefix = `${view.getFullYear()}-${pad(view.getMonth() + 1)}-`;
    let monthCount = 0;
    for (const [dayKey, nodes] of posts) if (dayKey.startsWith(monthPrefix)) monthCount += nodes.length;
    const footer = document.createElement('div');
    footer.className = 'calendar-footer';
    const summary = document.createElement('span');
    summary.textContent = monthCount ? `本月 ${monthCount} 篇文章` : '本月还没有文章';
    footer.append(summary);
    if (document.querySelector('#browser [data-browser-view="archive"]')) {
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'calendar-archive';
      archive.textContent = '查看归档';
      archive.addEventListener('click', () => {
        hide(false);
        const browser = document.getElementById('browser');
        if (browser) window.blanktimeDesktop?.openWindow(browser);
        document.querySelector('#browser .browser-home-button')?.click();
        document.querySelector('#browser [data-browser-view="archive"]')?.click();
      });
      footer.append(archive);
    }
    list.replaceChildren(heading, ...items, footer);
  }

  function select(date, focus = false) {
    selected = startOfDay(date);
    if (selected.getFullYear() !== view.getFullYear() || selected.getMonth() !== view.getMonth()) view = new Date(selected.getFullYear(), selected.getMonth(), 1);
    render(focus);
  }
  // 翻月时尽量停在同一天（31 日翻到 2 月则停在月末）。
  function shiftMonth(step, focus = false) {
    const target = new Date(view.getFullYear(), view.getMonth() + step, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    select(new Date(target.getFullYear(), target.getMonth(), Math.min(selected.getDate(), last)), focus);
  }

  function show() {
    if (!root.hidden || window.blanktimeLock?.isLocked?.()) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    today = startOfDay(new Date());
    view = new Date(today.getFullYear(), today.getMonth(), 1);
    selected = today;
    indexPosts();
    root.hidden = false;
    html.dataset.overlay = 'calendar';
    trigger.setAttribute('aria-expanded', 'true');
    renderClock();
    render();
    clearInterval(tick);
    tick = setInterval(renderClock, 1000);
    panel.focus({preventScroll:true});
  }
  function hide(restore = true) {
    if (root.hidden) return;
    root.hidden = true;
    clearInterval(tick);
    trigger.setAttribute('aria-expanded', 'false');
    const release = () => { if (root.hidden && html.dataset.overlay === 'calendar') delete html.dataset.overlay; };
    // 由返回键触发时，等返回键逻辑先看到“日历打开中”再清除标记，避免误关下面的窗口。
    if (popClose) setTimeout(release); else release();
    if (restore && previousFocus?.isConnected && !previousFocus.closest('[hidden], [inert]')) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }
  const toggle = () => root.hidden ? show() : hide();

  trigger.addEventListener('click', toggle);
  root.addEventListener('click', event => {
    if (event.target.closest('[data-calendar-close]')) return hide();
    const nav = event.target.closest('[data-calendar-nav]');
    if (nav) {
      const step = nav.dataset.calendarNav;
      if (step === 'today') select(new Date());
      else shiftMonth(Number(step));
      return;
    }
    const cell = event.target.closest('.calendar-day');
    if (cell && !swiped) {
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      select(new Date(y, m - 1, d), true);
    }
    swiped = false;
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
      return;
    }
    if (!event.target.closest?.('.calendar-day')) return;
    const moves = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7};
    if (event.key in moves) { event.preventDefault(); select(addDays(selected, moves[event.key]), true); }
    else if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); shiftMonth(event.key === 'PageUp' ? -1 : 1, true); }
    else if (event.key === 'Home') { event.preventDefault(); select(new Date(), true); }
  });
  // 在月视图上滚动滚轮翻月；触控板的连续滚动累积到一定距离才翻一页。
  grid.addEventListener('wheel', event => {
    event.preventDefault();
    const now = Date.now();
    if (now - wheelAt > 400) wheel = 0;
    wheelAt = now;
    wheel += event.deltaY || event.deltaX;
    if (Math.abs(wheel) >= 60) { shiftMonth(wheel > 0 ? 1 : -1); wheel = 0; wheelAt = now + 250; }
  }, {passive:false});
  // 手机上左右滑动翻月。
  grid.addEventListener('pointerdown', event => {
    swiped = false;
    if (event.pointerType !== 'mouse') swipe = {x:event.clientX, y:event.clientY};
  });
  grid.addEventListener('pointerup', event => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; shiftMonth(dx < 0 ? 1 : -1); }
  });
  grid.addEventListener('pointercancel', () => { swipe = null; });
  // 点到日历与时钟以外的地方、或焦点移到别处时收起。
  document.addEventListener('pointerdown', event => {
    if (!root.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) hide(false);
  }, true);
  document.addEventListener('focusin', event => {
    if (!root.hidden && !root.contains(event.target) && !trigger.contains(event.target)) hide(false);
  });
  // 手机返回键：只关闭日历，不关闭下面的窗口。
  addEventListener('popstate', () => {
    if (root.hidden) return;
    popClose = true;
    hide(false);
    popClose = false;
  }, true);
  document.addEventListener('blanktime:lock-change', event => { if (event.detail?.locked) hide(false); });

  Object.assign(api, {open:show, close:hide, toggle, isOpen:() => !root.hidden});
})();
