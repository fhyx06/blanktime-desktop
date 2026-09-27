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
        url, cover: safeURL(item.cover || item.pic), lrc: safeURL(item.lrc) || (/\[\d+:\d+/.test(String(item.lrc || '')) ? String(item.lrc) : '')
      } : null;
    }).filter(Boolean);
  }

  function parseLrc(text) {
    const offset = Number(String(text).match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
    const result = [];
    for (const line of String(text).split(/\r?\n/)) {
      const tags = [...line.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g)];
      const words = line.replace(/\[[^\]]*\]/g,'').trim();
      if (!words) continue;
      for (const tag of tags) result.push({time:Math.max(0,Number(tag[1])*60+Number(tag[2])+offset),text:words});
    }
    return result.sort((a,b) => a.time-b.time);
  }
  function formatTime(sec) {
    const value = Number.isFinite(sec) ? Math.max(0,sec) : 0;
    return String(Math.floor(value/60)).padStart(2,'0')+':'+String(Math.floor(value%60)).padStart(2,'0');
  }
  // Manual next/previous in single-repeat mode still navigates through the list.
  function nextIndex(index,length,mode,direction,random = Math.random) {
    if (!length) return -1;
    if (mode === 'shuffle' && length > 1) return (index+1+Math.floor(random()*(length-1)))%length;
    return (index+direction+length)%length;
  }
  return {playlistId, safeURL, tracks, parseLrc, formatTime, nextIndex};
});
