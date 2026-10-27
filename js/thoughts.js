(() => {
  'use strict';
  const win = document.getElementById('thoughts');
  if (!win) return;
  const $ = id => document.getElementById('thoughts-' + id);
  let config = {};
  try { config = JSON.parse($('config').textContent); } catch {}
  const feed = $('feed'), status = $('feed-status'), message = $('feed-message');
  const retry = $('retry'), more = $('more'), refresh = $('refresh');
  const tabs = [...win.querySelectorAll('[data-thoughts-tab]')];
  const fontKey = 'blanktime-thoughts-font-size';
  const defaultFontSize = 14, minFontSize = 12, maxFontSize = 22;
  let fontSize = defaultFontSize;
  try {
    const saved = Number(localStorage.getItem(fontKey));
    if (Number.isInteger(saved) && saved >= minFontSize && saved <= maxFontSize) fontSize = saved;
  } catch {}
  function setFontSize(value, persist = true) {
    fontSize = Math.max(minFontSize, Math.min(maxFontSize, value));
    win.style.setProperty('--thoughts-font-size', fontSize + 'px');
    $('font-value').textContent = fontSize + 'px';
    $('font-decrease').disabled = fontSize === minFontSize;
    $('font-increase').disabled = fontSize === maxFontSize;
    if (persist) {
      try { localStorage.setItem(fontKey, String(fontSize)); } catch {}
    }
  }
  setFontSize(fontSize, false);
  $('font-decrease').addEventListener('click', () => setFontSize(fontSize - 1));
  $('font-increase').addEventListener('click', () => setFontSize(fontSize + 1));
  $('font-reset').addEventListener('click', () => setFontSize(defaultFontSize));
  let client, configError;
  try { client = window.blanktimeMemos.create(config.memos); } catch (error) { configError = error; }
  let activeTab = 'feed', loaded = false, nextPageToken = '', pending = null, generation = 0, guestbook;
  let failedReset = false;
  const seen = new Set(), consumedTokens = new Set();
  const commentCards = new Map();
  const feedPath = new URL(config.feed_url || '/thoughts/', location.href).pathname;
  let selectedMemo = win.dataset.initialTab === 'feed' ? new URL(location.href).searchParams.get('memo') || '' : '';
  const memoKey = id => feedPath + '?memo=' + encodeURIComponent(id);
  const theme = () => document.documentElement.dataset.systemTheme === 'dark' ? 'dark' : 'light';
  const active = () => !win.hidden && win.dataset.state === 'open';
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const safeURL = value => window.blanktimeMemos.safeURL(value, client?.server || location.href);
  function link(url, text, className) {
    const anchor = node('a', className, text);
    anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function setStatus(text, failed = false) {
    status.hidden = !text; message.textContent = text;
    retry.hidden = !failed;
  }
  function syncControls() {
    refresh.disabled = Boolean(pending);
    more.disabled = Boolean(pending);
    more.hidden = !nextPageToken || Boolean(pending) || !loaded;
    feed.setAttribute('aria-busy', String(Boolean(pending)));
    $('count').textContent = seen.size ? `已显示 ${seen.size} 条` : '';
  }
  function cancel() {
    generation++;
    const request = pending; pending = null;
    request?.abort();
    if (request) setStatus('');
    syncControls();
  }
  function syncComments() {
    commentCards.forEach(entry => entry.thread?.setActive(active() && activeTab === 'feed' && entry.open));
  }
  function clearFeed() {
    commentCards.forEach(entry => entry.thread?.destroy());
    commentCards.clear(); seen.clear(); consumedTokens.clear(); feed.replaceChildren();
  }
  function toggleComments(entry, open = !entry.open) {
    entry.open = open; entry.mount.hidden = !open;
    entry.toggle.setAttribute('aria-expanded', String(open));
    entry.toggle.textContent = open ? '收起评论' : '评论';
    if (open && !entry.thread) {
      entry.thread = window.blanktimeComments?.createThread({
        mount:entry.mount, scroll:$('feed-scroll'), pageKey:memoKey(entry.item.id),
        pageTitle:(config.title || '碎碎念') + ' · ' + (entry.item.content.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 80) || entry.item.id),
        heading:'评论', placeholder:config.comments?.placeholder, theme:theme()
      });
      if (!entry.thread) entry.mount.textContent = '评论暂未开启。';
    }
    entry.thread?.setTheme(theme());
    syncComments();
  }
  function renderMarkdown(content) {
    const body = node('div', 'thought-content');
    // If local parser assets cannot load, preserve readable text without injecting HTML.
    if (!window.marked?.parse || !window.DOMPurify?.sanitize) {
      body.classList.add('is-plain'); body.textContent = content; return body;
    }
    const fragment = window.DOMPurify.sanitize(window.marked.parse(content, {async:false, gfm:true}), {
      RETURN_DOM_FRAGMENT:true,
      ALLOWED_TAGS:['p','br','strong','em','del','a','code','pre','blockquote','h1','h2','h3','h4','h5','h6','ul','ol','li','hr','table','thead','tbody','tr','th','td','img','input'],
      ALLOWED_ATTR:['href','src','alt','title','type','checked','start'],
      ALLOW_DATA_ATTR:false, ALLOW_ARIA_ATTR:false
    });
    fragment.querySelectorAll('a').forEach(anchor => {
      const url = safeURL(anchor.getAttribute('href'));
      if (url) { anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      else anchor.removeAttribute('href');
    });
    fragment.querySelectorAll('img').forEach(image => {
      const url = safeURL(image.getAttribute('src'));
      if (!url) { image.replaceWith(document.createTextNode(image.alt)); return; }
      image.src = url; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    });
    fragment.querySelectorAll('input').forEach(input => {
      if (input.type !== 'checkbox') input.remove(); else input.disabled = true;
    });
    body.append(fragment);
    return body;
  }
  function render(item, entries) {
    const card = node('article', 'thought-card'); card.dataset.memo = item.name;
    const author = node('header', 'thought-author');
    const avatar = node('img', 'thought-avatar');
    const avatarURL = window.blanktimeMemos.safeURL(config.author?.avatar, location.href);
    if (avatarURL) { avatar.src = avatarURL; avatar.alt = ''; avatar.width = avatar.height = 40; avatar.loading = 'lazy'; avatar.referrerPolicy = 'no-referrer'; avatar.addEventListener('error', () => avatar.hidden = true, {once:true}); author.append(avatar); }
    const identity = node('div', 'thought-identity');
    identity.append(node('strong', '', config.author?.name || item.creator.replace(/^users\//,'')));
    const date = new Date(item.createdAt);
    if (Number.isFinite(date.getTime())) {
      const time = node('time', 'thought-time', date.toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));
      time.dateTime = date.toISOString();
      const permalink = node('a', 'thought-time-link'); permalink.href = memoKey(item.id); permalink.title = '打开这条碎碎念';
      permalink.append(time); identity.append(permalink);
    }
    author.append(identity);
    if (item.pinned) author.append(node('span', 'thought-pinned', '置顶'));
    const body = renderMarkdown(item.content);
    card.append(author,body);
    if (!selectedMemo && (item.content.length > 360 || item.content.split('\n').length > 12)) {
      body.classList.add('is-collapsed');
      const toggle = node('button', 'thought-expand', '展开全文'); toggle.type = 'button'; toggle.setAttribute('aria-expanded','false');
      toggle.addEventListener('click', () => {
        const collapsed = body.classList.toggle('is-collapsed');
        toggle.textContent = collapsed ? '展开全文' : '收起'; toggle.setAttribute('aria-expanded',String(!collapsed));
      });
      card.append(toggle);
    }
    const media = node('div', 'thought-media');
    item.attachments.forEach(attachment => {
      if (!attachment.url) return;
      if (attachment.type.startsWith('image/')) {
        const button = node('button', 'thought-image'); button.type = 'button';
        button.setAttribute('aria-label', '查看图片：' + attachment.name);
        const image = node('img'); image.src = attachment.url; image.alt = attachment.name;
        image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
        const fallback = node('span', 'thought-image-fallback', '图片加载失败，点击查看'); fallback.hidden = true;
        image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
        button.append(image,fallback); media.append(button);
      } else media.append(link(attachment.url,attachment.name,'thought-attachment'));
    });
    if (media.children.length) card.append(media);
    const footer = node('footer', 'thought-card-footer');
    if (item.tags.length) {
      const tags = node('div', 'thought-tags');
      item.tags.forEach(tag => tags.append(node('span', '', '#' + tag))); footer.append(tags);
    }
    let commentEntry;
    if (config.comments?.enable === true) {
      const toggle = node('button', 'thought-comment-toggle', '评论'); toggle.type = 'button';
      const mount = node('div', 'thought-comments'); mount.id = 'thought-comments-' + item.id; mount.hidden = true;
      toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', mount.id);
      commentEntry = {item, mount, toggle, open:false, thread:null};
      toggle.addEventListener('click', () => toggleComments(commentEntry));
      footer.append(toggle);
    }
    footer.append(link(item.url,'查看原文','thought-permalink')); card.append(footer);
    if (commentEntry) card.append(commentEntry.mount);
    const images = [...body.querySelectorAll('img'), ...media.querySelectorAll('img')];
    images.forEach((image, index) => {
      const trigger = image.closest('button') || image.closest('a[href]') || image;
      if (trigger === image) { image.tabIndex = 0; image.setAttribute('role','button'); image.setAttribute('aria-label','查看图片：' + (image.alt || '碎碎念图片')); }
      const launch = event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented || !window.blanktimeImages) return;
        event.preventDefault();
        window.blanktimeImages.open(images.map(img => ({url:img.src,name:img.alt || '碎碎念图片',wallpaper:false})),index,{kind:'post',source:config.title || '碎碎念',trigger});
      };
      trigger.addEventListener('click', launch);
      if (trigger === image) image.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') launch(event); });
    });
    if (commentEntry) entries.set(item.name, commentEntry);
    return card;
  }
  async function load(reset = false) {
    if (!active() || activeTab !== 'feed' || pending) return;
    if (configError) { setStatus('碎碎念暂时无法连接，请稍后重试。',true); return; }
    if (loaded && !reset && !nextPageToken) return;
    const token = reset ? '' : nextPageToken;
    const request = new AbortController(), run = ++generation;
    pending = request; failedReset = reset;
    setStatus('正在加载碎碎念…'); syncControls();
    try {
      const result = selectedMemo
        ? {items:[await client.get(selectedMemo, {signal:request.signal})], nextPageToken:''}
        : await client.list({pageToken:token,signal:request.signal});
      if (run !== generation || request.signal.aborted) return;
      // Finish rendering before replacing the feed: a failed refresh must not
      // discard existing comment editors and their unsent drafts.
      const fragment = document.createDocumentFragment(), entries = new Map(), names = new Set();
      for (const item of result.items) {
        if ((!reset && seen.has(item.name)) || names.has(item.name)) continue;
        fragment.append(render(item, entries)); names.add(item.name);
      }
      if (reset) clearFeed();
      consumedTokens.add(token);
      names.forEach(name => seen.add(name));
      entries.forEach((entry, name) => commentCards.set(name, entry));
      feed.append(fragment);
      if (selectedMemo) entries.forEach(entry => toggleComments(entry, true));
      loaded = true;
      // A repeated cursor must never turn "load more" into an endless duplicate request.
      nextPageToken = consumedTokens.has(result.nextPageToken) ? '' : result.nextPageToken;
      setStatus(seen.size ? '' : nextPageToken ? '这一页暂无公开内容，可以继续加载。' : '还没有公开的碎碎念。');
    } catch (error) {
      if (run !== generation || error.name === 'AbortError') return;
      setStatus(selectedMemo && ['NOT_FOUND','PERMISSION'].includes(error.code) ? '这条碎碎念不存在或暂未公开。' : error.code === 'PERMISSION' ? '暂时无法读取公开内容，请稍后重试。' : error.code === 'TIMEOUT' ? '加载超时，请重试。' : '碎碎念加载失败，请检查连接后重试。',true);
    } finally {
      if (run === generation) { pending = null; syncControls(); }
    }
  }
  function showGuestbook() {
    if (!guestbook) {
      guestbook = window.blanktimeComments?.createThread({
        mount:$('guestbook-mount'),scroll:$('guestbook-scroll'),
        pageKey:config.guestbook?.page_key || '/guestbook/',pageTitle:config.guestbook?.title || '留言板',
        heading:'留言与回复',placeholder:config.guestbook?.placeholder,theme:theme()
      });
      $('guestbook-status').hidden = Boolean(guestbook);
      if (!guestbook) $('guestbook-status').textContent = '留言板暂未开启。';
    }
    guestbook?.setTheme(theme()); guestbook?.setActive(active());
  }
  function selectTab(name, focus = false) {
    if (!tabs.some(tab => tab.dataset.thoughtsTab === name)) name = 'feed';
    if (activeTab !== name) cancel();
    activeTab = name;
    refresh.hidden = name !== 'feed';
    $('font-controls').hidden = name !== 'feed';
    $('count').hidden = name !== 'feed';
    tabs.forEach(tab => {
      const selected = tab.dataset.thoughtsTab === name;
      tab.setAttribute('aria-selected',String(selected)); tab.tabIndex = selected ? 0 : -1;
      $( 'panel-' + tab.dataset.thoughtsTab).hidden = !selected;
      if (selected && focus) tab.focus();
    });
    guestbook?.setActive(active() && name === 'guestbook');
    syncComments();
    if (name === 'guestbook' && active()) showGuestbook();
    else if (active() && !loaded) load();
  }
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.thoughtsTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next].dataset.thoughtsTab,true);
    });
  });
  retry.addEventListener('click', () => load(failedReset));
  more.addEventListener('click', () => load());
  refresh.addEventListener('click', () => load(true));
  $('back-to-feed').hidden = !selectedMemo;
  $('back-to-feed').addEventListener('click', () => {
    cancel(); clearFeed(); selectedMemo = ''; loaded = false; nextPageToken = ''; failedReset = false;
    $('back-to-feed').hidden = true;
    if (location.pathname === feedPath) history.replaceState(history.state, '', feedPath);
    $('feed-scroll').scrollTop = 0;
    load();
  });
  win.addEventListener('blanktime:window-opened', () => selectTab(activeTab));
  win.addEventListener('blanktime:window-hidden', () => { cancel(); guestbook?.setActive(false); syncComments(); });
  document.addEventListener('blanktime:system-theme', () => {
    guestbook?.setTheme(theme());
    commentCards.forEach(entry => entry.thread?.setTheme(theme()));
  });
  // Dedicated static routes make the guestbook link in Artalk notifications usable.
  if (win.dataset.initialTab) {
    activeTab = win.dataset.initialTab;
    const welcome = document.getElementById('welcome');
    if (welcome?.dataset.state === 'open') window.blanktimeDesktop.closeWindow(welcome);
    window.blanktimeDesktop.openWindow(win);
  }
})();
