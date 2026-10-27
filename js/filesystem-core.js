(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.blanktimeFilesystemCore = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cleanText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  function failure(key, values = {}) {
    const error = new Error(key);
    error.terminalKey = key; error.terminalValues = values;
    return error;
  }
  function fileName(value, fallback) {
    const name = cleanText(value).replace(/\//g, '／').replace(/\\/g, '＼').trim().slice(0, 200);
    return name && name !== '.' && name !== '..' ? name : fallback;
  }
  function imageName(name, url) {
    const extension = /\.(jpe?g|png|webp|gif|avif|bmp|svg|ico|tiff?)$/i;
    const label = fileName(name, '未命名图片');
    if (extension.test(label)) return label;
    try {
      const pathname = new URL(String(url), 'https://filesystem.invalid/').pathname;
      const suffix = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)).match(extension);
      if (suffix) return label + '.' + suffix[1].toLowerCase();
    } catch {}
    return label;
  }
  function validDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(typeof value === 'string' && /^\d{11,}$/.test(value) ? Number(value) : value);
    return Number.isFinite(date.valueOf()) ? date : null;
  }
  function mediaURL(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function create(options = {}) {
    options = record(options);
    const candidate = String(options.username || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
    const username = candidate && candidate !== '.' && candidate !== '..' ? candidate : 'visitor';
    const home = '/home/' + username;
    const createdAt = validDate(options.createdAt) || new Date();
    const root = {id:'directory:/', name:'', type:'directory', parent:null, children:new Map(), size:0,
      date:createdAt, owner:'root', mode:'drwxr-xr-x', readonly:true};
    const nodes = new Map([['/', root]]);
    const articles = new Map();
    function pathOf(node) {
      if (!node.parent) return '/';
      return pathOf(node.parent).replace(/\/$/, '') + '/' + node.name;
    }
    function insert(parent, proposedName, type, data = {}) {
      let name = proposedName, count = 2;
      const dot = type === 'music' ? -1 : proposedName.lastIndexOf('.');
      const stem = dot > 0 ? proposedName.slice(0, dot) : proposedName;
      const extension = dot > 0 ? proposedName.slice(dot) : '';
      while (parent.children.has(name)) name = stem + ' (' + count++ + ')' + extension;
      const node = {name, type, parent, size:null, date:null, readonly:true, ...data};
      if (type === 'directory') {
        node.children = new Map(); node.size = 0; node.date = createdAt;
        node.owner = 'root'; node.mode = 'drwxr-xr-x';
      }
      const path = pathOf(node);
      if (!node.id) node.id = type + ':' + path;
      parent.children.set(name, node); nodes.set(path, node);
      return node;
    }
    const homes = insert(root, 'home', 'directory');
    const rootHome = options.rootEnabled === true ? insert(root, 'root', 'directory') : null;
    if (rootHome) rootHome.mode = 'drwx------';
    const userHome = insert(homes, username, 'directory');
    const desktop = insert(userHome, 'Desktop', 'directory');
    const documents = insert(userHome, 'Documents', 'directory');
    const postsRoot = insert(documents, 'Posts', 'directory');
    const pictures = insert(userHome, 'Pictures', 'directory');
    const albumsRoot = insert(pictures, 'Albums', 'directory');
    const music = insert(userHome, 'Music', 'directory');
    (Array.isArray(options.apps) ? options.apps : []).forEach(app => {
      if (!app || !app.id) return;
      insert(desktop, fileName(app.name, String(app.id)).replace(/\.desktop$/i, '') + '.desktop', 'app', {appId:String(app.id),icon:typeof app.icon === 'string' ? app.icon : ''});
    });
    // Stable source order keeps duplicate display names identical in every application.
    (Array.isArray(options.posts) ? options.posts : []).filter(post => post && post.url).slice()
      .sort((a, b) => String(a.url).localeCompare(String(b.url))).forEach(post => {
        const url = String(post.url);
        const node = insert(postsRoot, fileName(post.title, '未命名文章').replace(/\.md$/i, '') + '.md', 'article', {
          id:'article:' + url, url, title:cleanText(post.title), date:validDate(post.date), search:cleanText(post.search || post.title),
          categories:(Array.isArray(post.categories) ? post.categories : []).map(category => ({id:String(category.id ?? ''), name:cleanText(category.name)})),
          tags:(Array.isArray(post.tags) ? post.tags : []).map(cleanText), encrypted:post.encrypted === true
        });
        articles.set(url, node);
        try { articles.set(new URL(url, 'https://filesystem.invalid/').pathname, node); } catch {}
      });
    (Array.isArray(options.albums) ? options.albums : []).filter(Boolean).slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(album => {
        const folder = insert(albumsRoot, fileName(album.name, String(album.id || '未命名相册')), 'directory', {folderId:String(album.id || '')});
        folder.images = [];
        (Array.isArray(album.images) ? album.images : []).forEach(image => {
          if (!image || !image.url) return;
          const item = {name:imageName(image.name, image.url), url:String(image.url), wallpaper:image.wallpaper === true,
            size:image.size !== '' && image.size !== null && image.size !== undefined && Number.isSafeInteger(Number(image.size)) && Number(image.size) >= 0 ? Number(image.size) : null};
          const index = folder.images.length;
          folder.images.push(item);
          const node = insert(folder, item.name, 'image', {size:item.size, url:item.url, imageIndex:index,
            thumbnail:typeof image.thumbnail === 'string' ? image.thumbnail : ''});
          item.name = node.name;
        });
      });
    function setMusicTracks(tracks) {
      // Replace only mapped songs; keep the directory and any other files shared by consumers.
      for (const [name, node] of music.children) {
        if (node.type !== 'music') continue;
        nodes.delete(pathOf(node)); music.children.delete(name);
      }
      const result = [], keys = new Set();
      (Array.isArray(tracks) ? tracks : []).forEach(track => {
        if (!track || typeof track.key !== 'string' || !track.key || keys.has(track.key)) return;
        const url = mediaURL(track.url);
        if (!url) return;
        keys.add(track.key);
        const title = cleanText(track.name).trim() || '未命名歌曲';
        const artist = cleanText(track.artist).trim() || '未知歌手';
        result.push(insert(music, fileName(title + ' - ' + artist, '未命名歌曲'), 'music', {
          id:'music:' + track.key, trackKey:track.key, title, artist, url, cover:mediaURL(track.cover),
          search:title + ' ' + artist
        }));
      });
      return result;
    }
    function resolve(value = '.', context = {}) {
      const cwd = context.cwd || home, userHomePath = context.home || home;
      let path = String(value);
      if (!path) throw failure('no_such_path', {path:value});
      if (path === '~') path = userHomePath;
      else if (path.startsWith('~/')) path = userHomePath + path.slice(1);
      let node = path.startsWith('/') ? root : nodes.get(cwd);
      if (!node) throw failure('no_such_path', {path:value});
      // Traverse each segment instead of normalizing first: missing/.. and file/.. stay invalid.
      for (const part of path.split('/').filter(Boolean)) {
        if (node.type !== 'directory') throw failure('not_directory', {path:value});
        if (node === rootHome && !context.isRoot) throw failure('permission_denied', {path:value});
        if (part === '.') continue;
        if (part === '..') node = node.parent || root;
        else {
          node = node.children.get(part);
          if (!node) throw failure('no_such_path', {path:value});
        }
      }
      if (node === rootHome && !context.isRoot) throw failure('permission_denied', {path:value});
      if (path.endsWith('/') && node.type !== 'directory') throw failure('not_directory', {path:value});
      return node;
    }
    function list(node) {
      if (typeof node === 'string') node = resolve(node);
      if (!node || node.type !== 'directory') throw failure('not_directory', {path:typeof node === 'string' ? node : node?.name || ''});
      return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }
    function articlePath(url) {
      let node = articles.get(String(url));
      if (!node) try { node = articles.get(new URL(String(url), 'https://filesystem.invalid/').pathname); } catch {}
      return node ? pathOf(node) : null;
    }
    function contains(path, managedRoot) {
      // Resolve first so traversal rules and exact path-component boundaries both apply.
      try {
        const base = resolve(managedRoot), target = resolve(path);
        if (base.type !== 'directory') return false;
        const basePath = pathOf(base), targetPath = pathOf(target);
        return basePath === '/' || targetPath === basePath || targetPath.startsWith(basePath + '/');
      } catch { return false; }
    }
    return {home, username, root, nodes, pathOf, resolve, list, articlePath, contains, setMusicTracks};
  }
  return {create};
});
