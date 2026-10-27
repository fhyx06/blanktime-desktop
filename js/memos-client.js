(function (root, factory) {
  'use strict';
  const client = factory();
  if (typeof module === 'object' && module.exports) module.exports = client;
  else root.blanktimeMemos = client;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RESOURCE_ID = '[A-Za-z0-9_-]+';
  const MEMO_ID = new RegExp('^' + RESOURCE_ID + '$');
  const MEMO_NAME = new RegExp('^memos/' + RESOURCE_ID + '$');
  const USER_NAME = new RegExp('^users/' + RESOURCE_ID + '$');
  const ATTACHMENT_NAME = new RegExp('^attachments/' + RESOURCE_ID + '$');
  const MAX_TOKEN_LENGTH = 8192;
  const MAX_CONTENT_LENGTH = 100000;

  function error(code, message) {
    const result = new Error(message);
    result.code = code;
    if (code === 'ABORTED') result.name = 'AbortError';
    return result;
  }

  function pageURL() {
    return typeof location === 'object' ? location.href : undefined;
  }

  // Shared by attachments and the Markdown renderer. Never return executable URLs.
  function safeURL(value, base) {
    if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\u0000-\u001f\u007f\\]/.test(value)) return '';
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*@/i.test(value.trim())) return '';
    try {
      const url = new URL(value.trim(), base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  }

  function configuredNumber(value, fallback, minimum, maximum, label) {
    if (value === undefined) return fallback;
    const number = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw error('CONFIG', label + '需为 ' + minimum + '–' + maximum + ' 之间的整数。');
    }
    return number;
  }

  function normalizeServer(value, baseURL) {
    const message = '请填写有效的 Memos 服务地址（HTTPS；本地测试可使用同源 HTTP），且不包含账号、查询参数或锚点。';
    if (typeof value !== 'string' || value.length > 2048 || /[?#]/.test(value)) throw error('CONFIG', message);
    const href = safeURL(value, baseURL);
    if (!href) throw error('CONFIG', message);
    const url = new URL(href);
    let sameOrigin = false;
    try { sameOrigin = url.origin === new URL(baseURL).origin; } catch {}
    if (url.protocol !== 'https:' && !sameOrigin) throw error('CONFIG', message);
    return url.href.replace(/\/+$/, '');
  }

  function timestamp(value) {
    return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)) ? value : '';
  }

  function normalizeAttachment(value, server) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const filename = typeof value.filename === 'string' ? value.filename.slice(0, 1000) : '';
    let url = '';
    if (typeof value.externalLink === 'string' && value.externalLink) {
      url = safeURL(value.externalLink, server + '/');
    } else if (typeof value.name === 'string' && ATTACHMENT_NAME.test(value.name) && filename && filename !== '.' && filename !== '..') {
      // Memos v0.31.0: web/src/utils/attachment.ts, getAttachmentUrl().
      // Encoding the filename keeps slashes, fragments and query text within that segment.
      try { url = safeURL(server + '/file/' + value.name + '/' + encodeURIComponent(filename)); } catch {}
    }
    if (!url) return null;
    const size = typeof value.size === 'number' || (typeof value.size === 'string' && /^\d+$/.test(value.size)) ? Number(value.size) : 0;
    return {
      url,
      name: filename || '附件',
      type: typeof value.type === 'string' ? value.type.slice(0, 200).toLowerCase() : '',
      size: Number.isSafeInteger(size) && size >= 0 ? size : 0
    };
  }

  function normalizeMemo(value, server, creator) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.visibility !== 'PUBLIC' || value.state !== 'NORMAL') return null;
    if (typeof value.name !== 'string' || !MEMO_NAME.test(value.name) || value.name.length > 256) return null;
    if (typeof value.creator !== 'string' || !USER_NAME.test(value.creator) || (creator && value.creator !== creator)) return null;
    if (value.parent !== undefined && value.parent !== null && value.parent !== '') return null;
    if (typeof value.content !== 'string') return null;
    const id = value.name.slice('memos/'.length);
    return {
      id,
      name: value.name,
      creator: value.creator,
      content: value.content.slice(0, MAX_CONTENT_LENGTH),
      createdAt: timestamp(value.createTime),
      updatedAt: timestamp(value.updateTime),
      pinned: value.pinned === true,
      tags: Array.isArray(value.tags) ? [...new Set(value.tags.filter(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 512))].slice(0, 100) : [],
      attachments: Array.isArray(value.attachments) ? value.attachments.slice(0, 100).map(attachment => normalizeAttachment(attachment, server)).filter(Boolean) : [],
      url: server + '/memos/' + id
    };
  }

  function normalizeResponse(body, server, creator) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.memos)) {
      throw error('INVALID_RESPONSE', 'Memos 返回的数据格式不正确，请稍后重试。');
    }
    const nextPageToken = body.nextPageToken === undefined ? '' : body.nextPageToken;
    if (typeof nextPageToken !== 'string' || nextPageToken.length > MAX_TOKEN_LENGTH) {
      throw error('INVALID_RESPONSE', 'Memos 返回的分页信息不正确，请刷新重试。');
    }
    return {items:body.memos.map(memo => normalizeMemo(memo, server, creator)).filter(Boolean), nextPageToken};
  }

  function create(options, dependencies = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw error('CONFIG', 'Memos 配置不正确，请检查服务地址和作者设置。');
    const baseURL = dependencies.baseURL === undefined ? pageURL() : dependencies.baseURL;
    const fetchRequest = dependencies.fetch === undefined ? globalThis.fetch : dependencies.fetch;
    const server = normalizeServer(options.server, baseURL);
    const creator = options.creator === undefined ? '' : options.creator;
    if (typeof creator !== 'string' || (creator && (!USER_NAME.test(creator) || creator.length > 256))) {
      throw error('CONFIG', 'Memos 作者需填写 users/用户名，留空则显示所有公开随记。');
    }
    const pageSize = configuredNumber(options.page_size, 10, 1, 50, 'Memos 每页条数');
    const timeout = configuredNumber(options.timeout, 10000, 1000, 30000, 'Memos 请求超时（毫秒）');
    if (typeof fetchRequest !== 'function' || typeof AbortController !== 'function') throw error('CONFIG', '当前浏览器暂不支持读取 Memos，请升级浏览器后重试。');

    function request(url, signal, normalize, missingIsNotFound = false) {
      if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) return Promise.reject(error('CONFIG', 'Memos 请求的取消信号不正确。'));
      if (signal?.aborted) return Promise.reject(error('ABORTED', '已取消读取随记。'));
      return new Promise((resolve, reject) => {
        const controller = new AbortController();
        let settled = false, timer;
        const finish = (failure, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (failure) reject(failure);
          else resolve(value);
        };
        const abort = () => {
          finish(error('ABORTED', '已取消读取随记。'));
          controller.abort();
        };
        signal?.addEventListener('abort', abort, {once:true});
        if (signal?.aborted) { abort(); return; }
        // Settle independently: a fetch implementation or body reader may ignore abort.
        timer = setTimeout(() => {
          finish(error('TIMEOUT', '读取随记超时，请稍后重试。'));
          controller.abort();
        }, timeout);

        (async () => {
          let response;
          try {
            response = await fetchRequest(url.href, {
              method:'GET', signal:controller.signal, credentials:'omit',
              referrerPolicy:'no-referrer', cache:'no-store', headers:{Accept:'application/json'}
            });
          } catch {
            finish(error('NETWORK', '无法连接 Memos，请检查网络连接或服务的跨域设置。'));
            return;
          }
          if (settled) return;
          if (!response || typeof response.ok !== 'boolean') {
            finish(error('INVALID_RESPONSE', 'Memos 返回的数据格式不正确，请稍后重试。'));
            return;
          }
          if (!response.ok) {
            finish(response.status === 401 || response.status === 403
              ? error('PERMISSION', 'Memos 暂不允许匿名读取，请检查服务的公开访问设置。')
              : response.status === 404 && missingIsNotFound
              ? error('NOT_FOUND', '这条随记不存在或暂不可公开查看。')
              : error('HTTP', 'Memos 服务暂时不可用，请稍后重试。'));
            return;
          }
          if (typeof response.json !== 'function') {
            finish(error('INVALID_RESPONSE', 'Memos 返回的数据格式不正确，请稍后重试。'));
            return;
          }
          try {
            const body = await response.json();
            if (!settled) finish(null, normalize(body));
          } catch (failure) {
            finish(['INVALID_RESPONSE', 'NOT_FOUND'].includes(failure?.code) ? failure : error('INVALID_RESPONSE', 'Memos 返回的数据格式不正确，请稍后重试。'));
          }
        })();
      });
    }

    function list({pageToken = '', signal} = {}) {
      if (typeof pageToken !== 'string' || pageToken.length > MAX_TOKEN_LENGTH) return Promise.reject(error('INVALID_RESPONSE', 'Memos 分页信息不正确，请刷新重试。'));
      const url = new URL(server + '/api/v1/memos');
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('state', 'NORMAL');
      url.searchParams.set('orderBy', 'pinned desc, create_time desc');
      url.searchParams.set('filter', 'visibility == "PUBLIC"' + (creator ? ' && creator == "' + creator + '"' : ''));
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      return request(url, signal, body => normalizeResponse(body, server, creator));
    }

    function get(id, {signal} = {}) {
      if (typeof id !== 'string' || !MEMO_ID.test(id) || id.length > 250) {
        return Promise.reject(error('INVALID_RESPONSE', '随记链接不正确，请检查后重试。'));
      }
      // GetMemo returns the Memo itself in v0.31.0. A direct link must never
      // enumerate the feed or bypass the same public/author checks as list().
      return request(new URL(server + '/api/v1/memos/' + id), signal, body => {
        if (!body || typeof body !== 'object' || Array.isArray(body) || body.name !== 'memos/' + id) {
          throw error('INVALID_RESPONSE', 'Memos 返回的随记与链接不匹配，请稍后重试。');
        }
        const item = normalizeMemo(body, server, creator);
        if (!item) throw error('NOT_FOUND', '这条随记不存在或暂不可公开查看。');
        return item;
      }, true);
    }

    return {server, creator, pageSize, list, get};
  }

  return {create, safeURL};
});
