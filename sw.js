self.BLANKTIME_SW = {"version":"35264ae84443","precache":["/css/album.css","/css/browser.css","/css/calendar.css","/css/comments.css","/css/context-menu.css","/css/cursors.css","/css/desktop-shortcuts.css","/css/desktop.css","/css/file-details.css","/css/files.css","/css/image-viewer.css","/css/jiangshan.css","/css/live-wallpaper.css","/css/lock-screen.css","/css/markdown.css","/css/math.css","/css/minesweeper.css","/css/mobile.css","/css/music.css","/css/post-encryption.css","/css/pwa.css","/css/reader.css","/css/reading-aids.css","/css/search.css","/css/settings.css","/css/site-record.css","/css/system-info.css","/css/system-theme.css","/css/terminal.css","/css/thoughts.css","/css/typography.css","/css/wallpaper.css","/css/welcome.css","/fonts/welcome-serif.woff2","/images/app/apple-touch-icon.png","/images/app/icon-192.png","/images/app/icon-512.png","/images/app/icon.svg","/images/app/maskable-512.png","/images/cursors/dgn1.png","/images/cursors/dgn2.png","/images/cursors/horz.png","/images/cursors/link.png","/images/cursors/move.png","/images/cursors/pointer.png","/images/cursors/text.png","/images/cursors/vert.png","/images/icons/album-flower.svg","/images/icons/browser-plane.svg","/images/icons/fnos-music.jpg","/images/icons/jiangshan-scroll.svg","/images/icons/minesweeper-mine.svg","/images/icons/music-doodle.svg","/images/icons/thoughts.png","/js/album.js","/js/appearance.js","/js/back-guard.js","/js/browser-motion.js","/js/browser.js","/js/calendar.js","/js/comments.js","/js/context-menu.js","/js/desktop-shortcuts.js","/js/desktop.js","/js/file-details.js","/js/files.js","/js/filesystem-core.js","/js/filesystem.js","/js/image-viewer.js","/js/jiangshan.js","/js/koi-pond.js","/js/live-wallpaper.js","/js/lock-screen.js","/js/memos-client.js","/js/mermaid.js","/js/minesweeper-app.js","/js/minesweeper-engine.js","/js/minesweeper.js","/js/music-utils.js","/js/music.js","/js/poetry.js","/js/post-encryption.js","/js/public-ip.js","/js/pwa.js","/js/reading-position.js","/js/reading.js","/js/search.js","/js/settings.js","/js/system-info.js","/js/terminal-core.js","/js/terminal.js","/js/thoughts.js","/js/wallpaper.js","/js/welcome-info.js"],"offline":"/","imageLimit":80,"networkTimeout":4000};
// 离线与缓存（Service Worker）。由 scripts/pwa.js 在构建时生成 /sw.js：在本文件前注入 self.BLANKTIME_SW（版本号与预缓存清单）。
// 策略：
// - 主题自身的 CSS / JS / 字体 / 图标：安装时按版本预缓存，之后直接读缓存（主题更新会换新版本号）；
// - 页面与文章（HTML）：优先联网，网络慢或断网时用缓存，读过的文章离线也能打开；
// - 站内其他静态文件与外站图片：先给缓存再在后台更新；外站图片限量，避免占满存储；
// - 音乐（分段请求）、评论、接口等其余外站请求：不经过缓存。
'use strict';
const CONFIG = self.BLANKTIME_SW || {version:'dev', precache:[], offline:'/'};
const PREFIX = 'blanktime-';
const PRECACHE = `${PREFIX}precache-${CONFIG.version}`;
const PAGES = `${PREFIX}pages`, STATIC = `${PREFIX}static`, IMAGES = `${PREFIX}images`;
const LIMITS = {[PAGES]:80, [STATIC]:120, [IMAGES]:CONFIG.imageLimit || 80};
const NETWORK_TIMEOUT = CONFIG.networkTimeout || 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // 逐个缓存：个别文件失败不影响整体安装。
    await Promise.allSettled(CONFIG.precache.map(async url => {
      const response = await fetch(new Request(url, {cache:'reload'}));
      if (response.ok) await cache.put(url, response);
    }));
    // 首页放进页面缓存（而不是按版本的预缓存），之后联网打开时随时更新，断网时作为离线入口。
    try {
      const shell = await fetch(new Request(CONFIG.offline, {cache:'reload'}));
      if (shell.ok) await (await caches.open(PAGES)).put(CONFIG.offline, shell);
    } catch {}
    // 新版本装好后立即接管；已打开的页面不会被刷新，由页面提示访客刷新。
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE, PAGES, STATIC, IMAGES]);
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'blanktime:sw-version') event.ports?.[0]?.postMessage({version:CONFIG.version});
});

// 只保留最近的若干条（Cache 的 keys 按写入顺序返回）。
async function trim(name) {
  const cache = await caches.open(name), keys = await cache.keys(), extra = keys.length - (LIMITS[name] || 100);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}
async function remember(name, request, response) {
  // 外站图片多为不透明响应（status 0），同样可以缓存。
  if (!response || !(response.ok || response.type === 'opaque')) return;
  const cache = await caches.open(name);
  await cache.delete(request);
  await cache.put(request, response);
  await trim(name);
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

async function networkFirst(event, request) {
  const network = fetch(request);
  // waitUntil 必须在事件处理期间同步登记；先于返回给页面复制一份，写入缓存。
  event.waitUntil(network.then(response => response.ok && remember(PAGES, request, response.clone())).catch(() => {}));
  try {
    return await withTimeout(network, NETWORK_TIMEOUT);
  } catch {
    const cached = await caches.match(request, {cacheName:PAGES, ignoreVary:true});
    if (cached) return cached;
    // 没有缓存过的页面：网络只是慢就继续等；真的断网则退回首页（桌面本身可以离线使用）。
    try { return await network; } catch {}
    const shell = await caches.match(CONFIG.offline, {cacheName:PAGES, ignoreSearch:true});
    if (shell && request.mode === 'navigate') return shell;
    return new Response('离线状态，暂时无法打开这个页面。', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
}
async function cacheFirst(request) {
  const cached = await caches.match(request, {cacheName:PRECACHE, ignoreSearch:true});
  return cached || fetch(request);
}
async function staleWhileRevalidate(event, request, name) {
  const cached = await caches.match(request, {cacheName:name});
  const network = fetch(request);
  event.waitUntil(network.then(response => remember(name, request, response.clone())).catch(() => {}));
  return cached || network;
}

function isPage(request, url) {
  return request.mode === 'navigate' || /\/$|\.html$/.test(url.pathname) || (request.headers.get('accept') || '').includes('text/html');
}
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.origin === self.location.origin) {
    if (url.pathname === new URL('sw.js', self.registration?.scope || self.location.href).pathname) return;
    if (isPage(request, url)) return event.respondWith(networkFirst(event, request));
    if (CONFIG.precache.includes(url.pathname)) return event.respondWith(cacheFirst(request));
    if (['audio', 'video'].includes(request.destination)) return;
    return event.respondWith(staleWhileRevalidate(event, request, STATIC));
  }
  if (request.destination === 'image') event.respondWith(staleWhileRevalidate(event, request, IMAGES));
});
