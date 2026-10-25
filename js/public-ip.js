(() => {
  'use strict';
  let options = {};
  try {
    const value = JSON.parse(document.getElementById('public-ip-config')?.textContent || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) options = value;
  } catch {}
  function validate(value) {
    if (typeof value !== 'string') return '';
    const ip = value.trim();
    if (!ip || ip.length > 45) return '';
    if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip)) {
      return ip.split('.').every(part => Number(part) <= 255) ? ip : '';
    }
    if (ip.includes(':') && /^[\da-f:.]+$/i.test(ip)) {
      try { new URL('http://[' + ip + ']/'); return ip; } catch {}
    }
    return '';
  }
  function resolveEndpoint() {
    if (options.enable !== true) return '';
    const value = options.endpoint ?? 'https://api64.ipify.org?format=json';
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) return '';
    try {
      const url = new URL(value,location.href);
      if (url.username || url.password || url.hash) return '';
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin)) return url.href;
    } catch {}
    return '';
  }
  const endpoint = resolveEndpoint();
  const configuredTimeout = Number(options.timeout);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout >= 100 && configuredTimeout <= 15000 ? configuredTimeout : 4000;
  let cached = null, pending = null;

  function finish(request, ip) {
    if (request.done) return;
    request.done = true;
    clearTimeout(request.timer);
    if (pending === request) pending = null;
    if (ip) cached = {ip,time:Date.now()};
    for (const subscriber of request.subscribers) {
      subscriber.signal?.removeEventListener('abort',subscriber.abort);
      subscriber.resolve(ip);
    }
    request.subscribers.clear();
  }
  async function fetchIP(request) {
    request.timer = setTimeout(() => {
      finish(request,'');
      request.controller.abort();
    },timeout);
    try {
      const response = await fetch(endpoint,{signal:request.controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
      const ip = response.ok ? validate((await response.json())?.ip) : '';
      if (!request.controller.signal.aborted) finish(request,ip);
    } catch { finish(request,''); }
  }
  function query({signal} = {}) {
    if (!endpoint || typeof fetch !== 'function' || signal?.aborted) return Promise.resolve('');
    const age = cached ? Date.now() - cached.time : Infinity;
    if (age >= 0 && age < 60000) return Promise.resolve(cached.ip);
    const fresh = !pending;
    const request = pending ||= {controller:new AbortController(),subscribers:new Set(),done:false};
    return new Promise(resolve => {
      const subscriber = {signal,resolve,abort:() => {
        request.subscribers.delete(subscriber);
        signal?.removeEventListener('abort',subscriber.abort);
        resolve('');
        // One closing window must not cancel a lookup that another window still needs.
        if (!request.subscribers.size) {
          finish(request,'');
          request.controller.abort();
        }
      }};
      request.subscribers.add(subscriber);
      signal?.addEventListener('abort',subscriber.abort,{once:true});
      if (fresh) fetchIP(request);
    });
  }
  window.blanktimeIP = {enabled:Boolean(endpoint),validate,query};
})();
