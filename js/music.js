(() => {
  'use strict';
  const win = document.getElementById('music');
  if (!win) return;
  const {playlistId, safeURL, tracks, escapeHTML} = window.BlanktimeMusic;
  const status = document.getElementById('music-status');
  const state = document.getElementById('music-state');
  const reload = document.getElementById('music-reload');
  const toggle = document.getElementById('music-toggle');
  const transport = [...win.querySelectorAll('.music-transport button')];
  const container = document.getElementById('music-player');
  const cover = document.getElementById('music-cover');
  const dock = document.querySelector('.dock-button[data-open="music"]');
  let player, controller, loading = false, generation = 0, scriptPromise;
  function loadPlayerScript() {
    if (window.APlayer) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(fail, 12000);
      function fail() { clearTimeout(timer); script.remove(); reject(new Error('播放器未能加载')); }
      script.src = win.dataset.playerSrc;
      script.onload = () => {
        clearTimeout(timer);
        window.APlayer ? resolve() : fail();
      };
      script.onerror = fail;
      document.head.append(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }
  const id = playlistId(win.dataset.playlist);
  const original = document.getElementById('music-original');
  if (id) { original.href = 'https://music.163.com/#/playlist?id=' + id; original.hidden = false; }
  function setPlaying(playing) {
    dock?.classList.toggle('is-playing', playing);
    state.textContent = playing ? '正在播放' : '已暂停';
    toggle.textContent = playing ? '暂停' : '播放';
    toggle.setAttribute('aria-label', playing ? '暂停音乐' : '播放音乐');
    toggle.title = toggle.getAttribute('aria-label');
  }
  async function loadPlaylist() {
    if (loading) return;
    if (!id) {
      win.dataset.loadState = 'error';
      status.textContent = '尚未设置有效的网易云歌单。';
      state.textContent = '暂无歌单';
      return;
    }
    const api = safeURL(win.dataset.api.replace(/:server/g, 'netease').replace(/:type/g, 'playlist').replace(/:id/g, id).replace(/:r/g, String(Date.now())));
    if (!api) { status.textContent = '歌单服务地址无效。'; win.dataset.loadState = 'error'; return; }
    loading = true;
    reload.disabled = true;
    win.dataset.loadState = 'loading';
    status.textContent = '正在加载歌单…';
    player?.pause();
    transport.forEach(button => { button.disabled = true; });
    const activeController = new AbortController();
    controller = activeController;
    const signal = activeController.signal;
    const request = ++generation;
    const timeout = setTimeout(() => activeController.abort(), 15000);
    try {
      const [response] = await Promise.all([fetch(api, {signal, credentials:'omit'}), loadPlayerScript()]);
      if (!response.ok) throw new Error('歌单服务暂不可用');
      const songs = tracks(await response.json());
      if (request !== generation || win.dataset.state === 'closed') return;
      if (!songs.length) throw new Error('歌单为空，或暂时没有可播放歌曲');
      player?.destroy();
      container.replaceChildren();
      const theme = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1270fe';
      player = new window.APlayer({
        container, autoplay:false, preload:'none', theme,
        volume:Math.max(0, Math.min(1, Number.isFinite(Number(win.dataset.volume)) ? Number(win.dataset.volume) : 0.5)),
        loop:'all', order:'list', mutex:true, lrcType:3,
        listFolded:false, listMaxHeight:'320px', storageName:'blanktime-music',
        audio:songs.map(song => ({...song, name:escapeHTML(song.name), artist:escapeHTML(song.artist), type:'normal'}))
      });
      const currentPlayer = player;
      container.append(currentPlayer.audio);
      currentPlayer.audio.setAttribute('aria-label', '音乐播放器音频');
      transport.forEach(button => { button.disabled = false; });
      const labels = {'.aplayer-play':'播放或暂停', '.aplayer-icon-volume-down':'静音或调整音量', '.aplayer-icon-order':'切换顺序或随机播放', '.aplayer-icon-loop':'切换循环模式', '.aplayer-icon-menu':'显示或隐藏歌单', '.aplayer-icon-lrc':'显示或隐藏歌词'};
      for (const [selector, label] of Object.entries(labels)) {
        const control = container.querySelector(selector);
        if (control) { control.setAttribute('aria-label', label); control.title = label; }
      }
      function updateTrack(event) {
        const song = songs[event?.index ?? currentPlayer.list.index];
        document.getElementById('music-name').textContent = song.name;
        document.getElementById('music-artist').textContent = song.artist;
        cover.hidden = true;
        cover.removeAttribute('src');
        if (song.cover) cover.src = song.cover;
        status.textContent = '';
      }
      cover.onload = () => { cover.hidden = false; };
      cover.onerror = () => { cover.hidden = true; };
      currentPlayer.on('listswitch', updateTrack);
      currentPlayer.on('play', () => {
        // Also catches a delayed play request finishing after the window was closed.
        if (win.dataset.state === 'closed') { currentPlayer.pause(); return; }
        setPlaying(true);
        status.textContent = '';
      });
      currentPlayer.on('pause', () => setPlaying(false));
      currentPlayer.on('error', () => { currentPlayer.pause(); status.textContent = '这首歌暂时无法播放，可选择其他歌曲，或在网易云中打开。'; });
      updateTrack();
      document.getElementById('music-count').textContent = songs.length + ' 首歌曲';
      state.textContent = '已就绪';
      status.textContent = '选择歌曲或点击播放';
      win.dataset.loadState = 'ready';
    } catch (error) {
      if (request !== generation) return;
      transport.forEach(button => { button.disabled = !player; });
      win.dataset.loadState = 'error';
      status.textContent = error.name === 'AbortError' ? '加载超时，请点击“刷新歌单”重试。' : '暂时无法读取歌单，请刷新重试，或在网易云中打开。';
      state.textContent = '加载失败';
    } finally {
      clearTimeout(timeout);
      if (request === generation) { loading = false; reload.disabled = false; controller = null; }
    }
  }
  function updateWindowState() {
    if (win.dataset.state === 'closed') {
      ++generation;
      controller?.abort();
      controller = null;
      loading = false;
      reload.disabled = false;
      player?.pause();
      transport.forEach(button => { button.disabled = !player; });
      setPlaying(false);
    } else if (!win.hidden && !player && !loading) loadPlaylist();
  }
  new MutationObserver(updateWindowState).observe(win, {attributes:true, attributeFilter:['data-state', 'hidden']});
  document.getElementById('music-previous').addEventListener('click', () => { player?.skipBack(); });
  document.getElementById('music-next').addEventListener('click', () => { player?.skipForward(); });
  toggle.addEventListener('click', () => player?.toggle());
  reload.addEventListener('click', loadPlaylist);
  updateWindowState();
})();
