(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlanktimeMusic = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  function playlistId(value) {
    const text = String(value || '').trim();
    if (/^\d+$/.test(text)) return text;
    try {
      const url = new URL(text);
      if (!/(^|\.)music\.163\.com$/.test(url.hostname)) return '';
      const match = (url.search + '&' + url.hash).match(/[?&]id=(\d+)(?:[&#]|$)/);
      return match ? match[1] : '';
    } catch { return ''; }
  }
  function safeURL(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function tracks(data) {
    if (!Array.isArray(data)) return [];
    return data.map(item => {
      if (!item || typeof item !== 'object') return null;
      const url = safeURL(item.url);
      return url ? {
        name: String(item.name || item.title || '未命名歌曲'),
        artist: String(item.artist || item.author || '未知歌手'),
        url, cover: safeURL(item.cover || item.pic), lrc: safeURL(item.lrc)
      } : null;
    }).filter(Boolean);
  }
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {playlistId, safeURL, tracks, escapeHTML};
});
