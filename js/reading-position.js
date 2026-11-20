// 继续阅读：记住每篇文章读到的位置（按最近的小标题 + 偏移记录，换设备、换字号也能对上），
// 下次打开时在阅读区底部提示“从上次的位置继续”，不自动跳转；博客浏览器的文章卡片上标出读到的百分比。
// 记录只存在当前浏览器（localStorage），最多 50 篇，90 天过期；读到 95% 以上视为读完并清除。
(() => {
  'use strict';
  const KEY = 'blanktime-reading-position';
  const MAX = 50, TTL = 90 * 864e5, START = 5, FINISH = 95, PROMPT_MS = 8000;
  const BOOKMARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-4-5 4z"/></svg>';

  function readAll() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  }
  function writeAll(data) {
    const now = Date.now();
    // 过期的丢掉，超出上限时保留最近的。
    const entries = Object.entries(data).filter(([, entry]) => entry && now - entry.time < TTL).sort((a, b) => b[1].time - a[1].time).slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries))); } catch {}
    refreshCards();
  }
  const get = path => { const entry = readAll()[path]; return entry && Date.now() - entry.time < TTL ? entry : null; };
  function set(path, entry) { const data = readAll(); data[path] = {...entry, time:Date.now()}; writeAll(data); }
  function remove(path) { const data = readAll(); if (path in data) { delete data[path]; writeAll(data); } }

  // ---------- 文章卡片：读到一半的文章把“阅读全文 →”换成“读到 62% →” ----------
  function refreshCards() {
    const data = readAll();
    document.querySelectorAll('#browser .browser-card').forEach(card => {
      let path = '';
      try { path = new URL(card.href, location.href).pathname; } catch {}
      const label = card.querySelector('footer > span:last-child');
      if (!label) return;
      label.dataset.label ??= label.textContent;
      const entry = data[path];
      const reading = entry && Date.now() - entry.time < TTL;
      card.classList.toggle('is-reading', Boolean(reading));
      label.textContent = reading ? `读到 ${entry.percent}% →` : label.dataset.label;
    });
  }
  addEventListener('storage', event => { if (event.key === KEY) refreshCards(); });

  // ---------- 阅读器：由 browser.js 在文章渲染完成后调用 ----------
  function attach({path, article, scroll, page, prefix = '', hash = ''}) {
    const headings = [...article.querySelectorAll('.post-content :is(h1,h2,h3,h4,h5,h6)')];
    // 小标题在正文里的位置。窗口打开、最小化等动画期间整个窗口带着缩放，屏幕上的距离要按缩放比例换算回来。
    const top = element => {
      const box = scroll.getBoundingClientRect();
      const scale = box.height && scroll.clientHeight ? box.height / scroll.offsetHeight || 1 : 1;
      return (element.getBoundingClientRect().top - box.top) / scale + scroll.scrollTop;
    };
    const percentOf = () => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      return max <= 1 ? 100 : Math.min(100, Math.round(scroll.scrollTop / max * 100));
    };
    let timer = 0, prompt = null, promptTimer = 0, restoring = false, detached = false;

    function save() {
      clearTimeout(timer);
      // 窗口最小化或标签页不在前台时量不到尺寸，跳过，免得误判为读完。
      if (detached || !scroll.isConnected || !scroll.clientHeight) return;
      const percent = percentOf();
      if (percent >= FINISH) return remove(path);
      // 刚开始读（或又回到开头）时不覆盖之前的记录。
      if (percent < START) return;
      let anchor = null;
      for (const heading of headings) { if (top(heading) <= scroll.scrollTop + 8) anchor = heading; else break; }
      set(path, {heading:anchor ? anchor.id.slice(anchor.id.startsWith(prefix) ? prefix.length : 0) : '', title:anchor?.textContent.trim() || '',
        offset:Math.round(scroll.scrollTop - (anchor ? top(anchor) : 0)), percent});
    }
    function restore(entry) {
      const byId = id => [...article.querySelectorAll('[id]')].find(node => node.id === id);
      const heading = entry.heading ? byId(prefix + entry.heading) || byId(entry.heading) : null;
      const max = scroll.scrollHeight - scroll.clientHeight;
      restoring = true;
      const target = heading ? top(heading) + entry.offset : Math.round(max * entry.percent / 100);
      // 直接跳到位置，不走阅读区的平滑滚动（长距离的平滑滚动既慢又晃眼）。
      if (scroll.scrollTo) scroll.scrollTo({top:target, behavior:'instant'}); else scroll.scrollTop = target;
      requestAnimationFrame(() => { restoring = false; });
    }
    function hidePrompt() {
      clearTimeout(promptTimer);
      if (!prompt) return;
      prompt.classList.add('is-leaving');
      const node = prompt; prompt = null;
      setTimeout(() => node.remove(), 200);
    }
    function showPrompt(entry) {
      prompt = document.createElement('div');
      prompt.className = 'resume-reading';
      prompt.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.className = 'resume-reading-text';
      text.textContent = entry.title ? `上次读到「${entry.title}」· ${entry.percent}%` : `上次读到 ${entry.percent}%`;
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'resume-reading-go';
      go.textContent = '继续阅读';
      go.addEventListener('click', () => { hidePrompt(); restore(entry); scroll.focus({preventScroll:true}); });
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'resume-reading-close';
      dismiss.setAttribute('aria-label', '不用了');
      dismiss.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      dismiss.addEventListener('click', hidePrompt);
      prompt.insertAdjacentHTML('afterbegin', BOOKMARK);
      prompt.append(text, go, dismiss);
      page.append(prompt);
      promptTimer = setTimeout(hidePrompt, PROMPT_MS);
    }

    const onScroll = () => {
      if (restoring) return;
      // 自己往下读了，就收起提示。
      if (prompt && percentOf() >= START) hidePrompt();
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    };
    scroll.addEventListener('scroll', onScroll, {passive:true});
    const entry = get(path);
    // 链接带锚点时以锚点为准，不提示。
    if (entry && !hash && entry.percent >= START && entry.percent < FINISH) showPrompt(entry);
    return {
      save,
      detach() {
        if (timer) save();
        detached = true;
        scroll.removeEventListener('scroll', onScroll);
        hidePrompt();
      }
    };
  }

  // 离开页面前把正在读的位置存下来。
  const sessions = new Set();
  addEventListener('pagehide', () => sessions.forEach(session => session.save()));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sessions.forEach(session => session.save()); });
  window.blanktimeReadingPosition = {
    attach(options) {
      const session = attach(options);
      sessions.add(session);
      const detach = session.detach;
      session.detach = () => { detach(); sessions.delete(session); };
      return session;
    },
    get, remove, refreshCards
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshCards, {once:true}); else refreshCards();
})();
