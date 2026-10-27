(() => {
  'use strict';
  const element = document.getElementById('filesystem-config');
  if (!element || !window.blanktimeFilesystemCore) return;
  const config = JSON.parse(element.textContent);
  window.blanktimeFS = window.blanktimeFilesystemCore.create(config);
  window.blanktimeFileConfig = Object.freeze({
    root:config.files?.root || '~',
    default_path:config.files?.default_path || '~'
  });
  const fs = window.blanktimeFS, musicPath = fs.home + '/Music', music = fs.resolve(musicPath);
  const enabled = Boolean(document.getElementById('music'));
  music.loadState = enabled ? 'idle' : 'disabled';
  music.loadMessage = enabled ? '正在等待歌单加载…' : '音乐功能未启用。';
  let trackSignature = '[]';
  function syncMusic(snapshot) {
    if (!enabled || !snapshot || !Array.isArray(snapshot.tracks)
      || !['idle', 'loading', 'ready', 'error'].includes(snapshot.state)) return;
    const signature = JSON.stringify(snapshot.tracks.map(track => track &&
      [track.key, track.name, track.artist, track.url, track.cover]));
    const message = typeof snapshot.status === 'string' ? snapshot.status : '';
    const changed = signature !== trackSignature;
    if (!changed && music.loadState === snapshot.state && music.loadMessage === message) return;
    if (changed) { fs.setMusicTracks(snapshot.tracks); trackSignature = signature; }
    music.loadState = snapshot.state;
    music.loadMessage = message;
    document.dispatchEvent(new CustomEvent('blanktime:filesystem-changed', {detail:{path:musicPath}}));
  }
  document.addEventListener('blanktime:music-playlist', event => syncMusic(event.detail));
  // Also supports loading this bridge after the player has already cached its playlist.
  if (window.blanktimeMusic?.getPlaylist) syncMusic(window.blanktimeMusic.getPlaylist());
})();
