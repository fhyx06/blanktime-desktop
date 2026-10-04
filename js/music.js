(() => {
  'use strict';
  const win = document.getElementById('music');
  if (!win) return;
  var svg = function (inner, opt) {
    opt = opt || {};
    return '<svg viewBox="0 0 24 24" width="' + (opt.size || 18) + '" height="' + (opt.size || 18) + '" ' +
      'fill="' + (opt.fill || 'none') + '" stroke="' + (opt.stroke || 'currentColor') + '" ' +
      'stroke-width="' + (opt.sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + '</svg>';
  };

  var ICON = {
    play:  svg('<path d="M8.6 5.3v13.4L19.2 12z" fill="currentColor" stroke="none"/>', { size: 18 }),
    pause: svg('<rect x="8.2" y="5.4" width="2.8" height="13.2" rx="1" fill="currentColor" stroke="none"/>' +
               '<rect x="13" y="5.4" width="2.8" height="13.2" rx="1" fill="currentColor" stroke="none"/>', { size: 18 }),
    prev:  svg('<rect x="6.6" y="5.4" width="2.2" height="13.2" rx="1" fill="currentColor" stroke="none"/>' +
               '<path d="M19 6.6v10.8L10.3 12z" fill="currentColor" stroke="none"/>', { size: 18 }),
    next:  svg('<rect x="15.2" y="5.4" width="2.2" height="13.2" rx="1" fill="currentColor" stroke="none"/>' +
               '<path d="M5 6.6v10.8L13.7 12z" fill="currentColor" stroke="none"/>', { size: 18 }),
    loopList: svg('<path d="M17 3.6 20 6.6l-3 3"/><path d="M20 6.6H7.6A3.6 3.6 0 0 0 4 10.2v.9"/>' +
                  '<path d="M7 20.4 4 17.4l3-3"/><path d="M4 17.4h12.4a3.6 3.6 0 0 0 3.6-3.6v-.9"/>'),
    loopOne: svg('<path d="M17 3.6 20 6.6l-3 3"/><path d="M20 6.6H7.6A3.6 3.6 0 0 0 4 10.2v.9"/>' +
                 '<path d="M7 20.4 4 17.4l3-3"/><path d="M4 17.4h12.4a3.6 3.6 0 0 0 3.6-3.6v-.9"/>' +
                 '<path d="M11.4 9.7l1.6-1v6.6" stroke-width="1.6"/>'),
    shuffle: svg('<path d="M16 3.6 19.5 7 16 10.4"/><path d="M16 13.6 19.5 17 16 20.4"/>' +
                 '<path d="M19.5 7h-2.9c-1.1 0-2.1.5-2.8 1.4L8.7 15.6c-.7.9-1.7 1.4-2.8 1.4H4"/>' +
                 '<path d="M4 7h1.9c1.1 0 2.1.5 2.8 1.4l.6.8"/>' +
                 '<path d="M14.3 15.3c.7.8 1.7 1.3 2.8 1.3h2.4"/>'),
    link: svg('<path d="M14 4h6v6"/><path d="M20 4l-8.6 8.6"/>' +
              '<path d="M18 14.6V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19V8.2a1.6 1.6 0 0 1 1.6-1.6H10"/>'),
    volHigh: svg('<path d="M11.2 5.3 7 8.7H4.4a.9.9 0 0 0-.9.9v4.8a.9.9 0 0 0 .9.9H7l4.2 3.4z" fill="currentColor" stroke="none"/>' +
                 '<path d="M14.6 9.4a3.9 3.9 0 0 1 0 5.2"/><path d="M17.4 6.8a7.6 7.6 0 0 1 0 10.4"/>', { size: 17 }),
    volLow:  svg('<path d="M11.2 5.3 7 8.7H4.4a.9.9 0 0 0-.9.9v4.8a.9.9 0 0 0 .9.9H7l4.2 3.4z" fill="currentColor" stroke="none"/>' +
                 '<path d="M14.6 9.4a3.9 3.9 0 0 1 0 5.2"/>', { size: 17 }),
    volMute: svg('<path d="M11.2 5.3 7 8.7H4.4a.9.9 0 0 0-.9.9v4.8a.9.9 0 0 0 .9.9H7l4.2 3.4z" fill="currentColor" stroke="none"/>' +
                 '<path d="M15 9.6l4.4 4.8M19.4 9.6 15 14.4"/>', { size: 17 }),
    min:   svg('<path d="M6 12h12"/>', { size: 15, sw: 1.7 }),
    max:   svg('<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="1.6"/>', { size: 14, sw: 1.7 }),
    close: svg('<path d="M7 7l10 10M17 7 7 17"/>', { size: 15, sw: 1.7 })
  };

  const {playlistId, safeURL, tracks, parseLrc, formatTime, nextIndex} = window.BlanktimeMusic;
  const $ = id => document.getElementById('music-' + id);
  const audio = $('audio'), status = $('status'), list = $('playlist'), empty = $('lyricsEmpty');
  const lyricScroll = $('lyricsScroll'), lyricInner = $('lyricsInner');
  const dock = document.querySelector('.dock-button[data-open="music"]');
  const store = {
    get(key) { try { return localStorage.getItem('blanktime-music:' + key); } catch { return null; } },
    set(key,value) { try { localStorage.setItem('blanktime-music:' + key, value); } catch {} }
  };
  let songs = [], index = -1, lyrics = [], lyricIndex = -1, loop = 'list';
  let buffering = true;
  let loading = false, playlistRequest = 0, trackRequest = 0, lyricController;
  let userScrollUntil = 0, seeking = false, rememberedVolume = 0.5;
  const id = playlistId(win.dataset.playlist);
  const closed = () => win.dataset.state === 'closed';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setStatus = message => { status.textContent = message; };
  function icon(id, name, label) {
    $(id).innerHTML = ICON[name];
    if (label) { $(id).title = label; $(id).setAttribute('aria-label', label); }
  }
  function controlsEnabled(enabled) {
    ['btnPlay','btnPrev','btnNext'].forEach(id => { $(id).disabled = !enabled; });
  }
  function playingUI() {
    const playing = !audio.paused && !audio.ended;
    icon('btnPlay', playing ? 'pause' : 'play', playing ? '暂停' : '播放');
    dock?.classList.toggle('is-playing', playing);
    list.querySelectorAll('.row').forEach((row,i) => {
      row.classList.toggle('active',i === index);
      row.classList.toggle('is-playing',i === index && playing && !buffering);
      row.setAttribute('aria-current',i === index ? 'true' : 'false');
    });
  }
  function listState(message, retry = false) {
    const panel = $('listState');
    panel.replaceChildren();
    panel.classList.toggle('show', Boolean(message));
    if (!message) return;
    const text = document.createElement('div');
    text.className = 'ls-title';
    text.textContent = message;
    panel.append(text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mini-btn primary';
      button.textContent = '重试'; button.addEventListener('click',loadPlaylist);
      panel.append(button);
    }
  }
  function renderList() {
    list.replaceChildren();
    songs.forEach((song,i) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'row'; button.dataset.index = i;
      button.title = song.name + ' · ' + song.artist;
      ['row-idx','row-name','row-artist'].forEach((className,j) => {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = [String(i+1),song.name,song.artist][j];
        if (j === 0) {
          const number = document.createElement('span'); number.className = 'row-number'; number.textContent = span.textContent;
          const bars = document.createElement('span'); bars.className = 'rhythm-bars'; bars.setAttribute('aria-hidden', 'true');
          bars.innerHTML = '<i></i><i></i><i></i><i></i>';
          span.replaceChildren(number, bars);
        }
        button.append(span);
      });
      li.append(button); list.append(li);
    });
    $('count').textContent = songs.length;
  }
  async function loadPlaylist() {
    if (loading) return;
    const url = safeURL(win.dataset.api.replace(/:server/g,'netease').replace(/:type/g,'playlist').replace(/:id/g,id).replace(/:r/g,String(Date.now())));
    if (!id || !url) { listState('请在主题配置中设置有效歌单和接口地址。'); return; }
    loading = true;
    win.dataset.loadState = 'loading';
    $('reload').disabled = true;
    controlsEnabled(false);
    audio.pause();
    const request = ++playlistRequest;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),15000);
    listState('正在加载歌单…'); setStatus('正在加载歌单…');
    try {
      const response = await fetch(url,{signal:controller.signal,credentials:'omit'});
      if (!response.ok) throw new Error('request');
      const result = tracks(await response.json());
      if (request !== playlistRequest) return;
      if (!result.length) throw new Error('empty');
      songs = result;
      index = -1;
      renderList(); listState('');
      controlsEnabled(true);
      // Background loading only caches metadata; no media requests until opened.
      if (!win.hidden && !closed()) selectSong(0,false);
      else setStatus('歌单已就绪');
      win.dataset.loadState = 'ready';
    } catch (error) {
      if (request !== playlistRequest) return;
      const message = error.name === 'AbortError' ? '歌单加载超时，请重试。' : '暂时无法读取歌单，请重试。';
      listState(songs.length ? '' : message,true);
      setStatus(message); controlsEnabled(songs.length > 0);
      win.dataset.loadState = 'error';
    } finally {
      clearTimeout(timer);
      if (request === playlistRequest) { loading = false; $('reload').disabled = false; }
    }
  }
  function selectSong(i, autoplay) {
    if (!songs[i]) return;
    ++trackRequest;
    lyricController?.abort();
    audio.pause(); buffering = true; index = i;
    const song = songs[i];
    $('songName').textContent = song.name; $('songName').title = song.name;
    $('songArtist').textContent = song.artist; $('songArtist').title = song.artist;
    const cover = $('cover');
    cover.hidden = true; $('coverPh').hidden = false;
    cover.removeAttribute('src');
    if (song.cover) cover.src = song.cover;
    lyrics = []; lyricIndex = -1; lyricInner.replaceChildren();
    empty.hidden = false; empty.textContent = '正在加载歌词…';
    audio.src = song.url;
    audio.load();
    updateProgress(); playingUI();
    setStatus('已就绪 · ' + song.name);
    loadLyrics(song,trackRequest);
    if (autoplay) playAudio();
  }
  async function playAudio() {
    if (index < 0 || closed()) return;
    const request = trackRequest;
    try {
      await audio.play();
      if (closed()) audio.pause();
    } catch (error) {
      if (request !== trackRequest || closed() || error.name === 'AbortError') return;
      setStatus(error.name === 'NotAllowedError' ? '请点击播放按钮开始播放。' : '这首歌暂时无法播放，可切换歌曲或在网易云打开。');
      playingUI();
    }
  }
  async function loadLyrics(song, request) {
    if (!song.lrc) { empty.textContent = '暂无歌词'; return; }
    const controller = new AbortController();
    lyricController = controller;
    const timer = setTimeout(() => controller.abort(),12000);
    try {
      let text = song.lrc;
      if (safeURL(text)) {
        const response = await fetch(text,{signal:controller.signal,credentials:'omit'});
        if (!response.ok) throw new Error('lyrics');
        text = await response.text();
        try { const data = JSON.parse(text); text = data.lrc?.lyric || data.lyric || ''; } catch {}
      }
      if (request !== trackRequest) return;
      lyrics = parseLrc(text);
      lyricInner.replaceChildren();
      lyrics.forEach((line,i) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'lyric-line'; button.dataset.index = i;
        button.textContent = line.text; button.title = '跳转到 ' + formatTime(line.time);
        lyricInner.append(button);
      });
      empty.hidden = lyrics.length > 0;
      empty.textContent = '暂无歌词';
      layoutLyrics(); syncLyrics(true);
    } catch {
      if (request === trackRequest) { empty.hidden = false; empty.textContent = '歌词暂时无法加载'; }
    } finally { clearTimeout(timer); }
  }
  function setLyricsVisible(visible) {
    $('lyrics').hidden = !visible;
    win.classList.toggle('lyrics-hidden', !visible);
    const button = $('btnLyrics');
    button.setAttribute('aria-expanded', String(visible));
    button.title = visible ? '收起歌词' : '展开歌词';
    button.setAttribute('aria-label', button.title);
    if (visible) { userScrollUntil = 0; layoutLyrics(); syncLyrics(true); }
  }
  $('btnLyrics').addEventListener('click', () => {
    const visible = $('lyrics').hidden;
    setLyricsVisible(visible); store.set('lyrics-visible', String(visible));
  });
  setLyricsVisible(store.get('lyrics-visible') !== 'false');
  function layoutLyrics() {
    if ($('lyrics').hidden) return;
    lyricInner.style.paddingTop = Math.max(0,lyricScroll.clientHeight / 2 - 16) + 'px';
    lyricInner.style.paddingBottom = lyricScroll.clientHeight / 2 + 'px';
    if (lyricIndex >= 0) centerLine(lyricIndex,true);
  }
  function centerLine(i,instant = false) {
    const line = lyricInner.children[i];
    if ($('lyrics').hidden || !line || Date.now() < userScrollUntil) return;
    lyricScroll.scrollTo({top:Math.max(0,line.offsetTop + line.offsetHeight/2 - lyricScroll.clientHeight/2),behavior:instant || reducedMotion ? 'instant' : 'smooth'});
  }
  function syncLyrics(force = false) {
    let next = -1;
    for (let i=0;i<lyrics.length && lyrics[i].time <= audio.currentTime;i++) next = i;
    if (!force && lyricIndex === next) return;
    lyricIndex = next;
    [...lyricInner.children].forEach((line,i) => {
      line.classList.toggle('active',i === next);
      line.dataset.dist = Math.min(3,Math.abs(i-next));
      if (i === next) line.setAttribute('aria-current','true'); else line.removeAttribute('aria-current');
    });
    centerLine(next,force);
  }
  function duration() { return Number.isFinite(audio.duration) ? audio.duration : 0; }
  function updateProgress() {
    const d = duration(), time = audio.currentTime || 0;
    if (!seeking) {
      const percent = d ? time/d*100 : 0;
      $('fill').style.width = percent+'%'; $('knob').style.left = percent+'%';
      $('timeCur').textContent = formatTime(time);
    }
    $('timeTotal').textContent = formatTime(d);
    $('track').setAttribute('aria-valuemax',Math.round(d));
    $('track').setAttribute('aria-valuenow',Math.round(time));
    $('track').setAttribute('aria-valuetext',formatTime(time)+' / '+formatTime(d));
    let buffered = 0;
    for(let i=0;i<audio.buffered.length;i++) if(audio.buffered.start(i)<=time) buffered=audio.buffered.end(i);
    $('buffer').style.width = (d ? Math.min(100,buffered/d*100) : 0)+'%';
  }
  function seek(ratio) {
    if (!duration()) return;
    audio.currentTime = Math.max(0,Math.min(1,ratio))*duration();
    userScrollUntil = 0; updateProgress(); syncLyrics(true);
  }
  function slider(element,change,preview,end) {
    let dragging = false;
    const ratio = event => {
      const rect = element.getBoundingClientRect();
      return Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    };
    element.addEventListener('pointerdown',event => {
      if (event.button !== 0) return;
      dragging = true; element.setPointerCapture(event.pointerId); element.classList.add('dragging');
      (preview || change)(ratio(event)); event.preventDefault();
    });
    element.addEventListener('pointermove',event => { if (dragging) (preview || change)(ratio(event)); });
    element.addEventListener('pointerup',event => { if (!dragging) return; dragging=false; element.classList.remove('dragging'); end?.(); change(ratio(event)); });
    element.addEventListener('pointercancel',() => { dragging=false; element.classList.remove('dragging'); end?.(); updateProgress(); });
  }
  function setVolume(value) {
    audio.volume = Math.max(0,Math.min(1,value));
    if (audio.volume) rememberedVolume = audio.volume;
    const pct = Math.round(audio.volume*100);
    $('volFill').style.width=pct+'%'; $('volKnob').style.left=pct+'%';
    $('volNum').textContent=pct;
    $('volTrack').setAttribute('aria-valuenow',pct);
    icon('btnVol',pct===0 ? 'volMute' : pct<55 ? 'volLow' : 'volHigh',pct===0 ? '取消静音' : '静音');
    store.set('volume',audio.volume);
  }
  const modes = ['list','one','shuffle'], modeNames = ['列表循环','单曲循环','随机播放'];
  function setLoop(mode) {
    loop = modes.includes(mode) ? mode : 'list';
    icon('btnLoop',{list:'loopList',one:'loopOne',shuffle:'shuffle'}[loop],modeNames[modes.indexOf(loop)]+'（点击切换）');
    $('btnLoop').classList.toggle('on',loop !== 'list');
    store.set('loop',loop);
  }
  const defaultAccent = /^#[a-f\d]{6}$/i.test(win.dataset.accent) ? win.dataset.accent : '#ec4141';
  function accent(hex) {
    if (!/^#[a-f\d]{6}$/i.test(hex)) return;
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
    win.style.setProperty('--accent-rgb',rgb.join(','));
    $('themeDot').style.background=hex; $('tpColor').value=hex; $('tpHex').textContent=hex.toUpperCase();
    $('tpSwatches').querySelectorAll('button').forEach(b => { b.classList.toggle('on',b.dataset.hex === hex.toLowerCase()); });
    store.set('accent',hex);
  }
  [['#ec4141','网易红'],['#f2795b','珊瑚橙'],['#f0a020','琥珀'],['#3aa675','森绿'],['#12a5a5','青碧'],['#3b82f6','天空蓝'],['#6366f1','靛蓝'],['#8b5cf6','紫罗兰'],['#d946a6','品红'],['#52525b','石墨']].forEach(([hex,name]) => {
    const b=document.createElement('button'); b.type='button'; b.className='tp-sw'; b.dataset.hex=hex;
    b.style.background=hex; b.style.setProperty('--sw',hex); b.title=name; b.setAttribute('aria-label',name);
    b.addEventListener('click',() => accent(hex)); $('tpSwatches').append(b);
  });
  function themePopup(open) { $('themePop').hidden=!open; $('btnTheme').setAttribute('aria-expanded',open); }
  $('btnTheme').addEventListener('click',() => themePopup($('themePop').hidden));
  document.addEventListener('click',event => { if (!event.target.closest('#music .theme-wrap')) themePopup(false); });
  win.addEventListener('keydown',event => { if(event.key==='Escape' && !$('themePop').hidden) {themePopup(false); $('btnTheme').focus();event.stopPropagation();} });
  $('tpColor').addEventListener('input',event => accent(event.target.value));
  $('tpReset').addEventListener('click',() => accent(defaultAccent));
  $('btnPlay').addEventListener('click',() => audio.paused ? playAudio() : audio.pause());
  $('btnPrev').addEventListener('click',() => selectSong(nextIndex(index,songs.length,loop,-1),true));
  $('btnNext').addEventListener('click',() => selectSong(nextIndex(index,songs.length,loop,1),true));
  $('btnLoop').addEventListener('click',() => setLoop(modes[(modes.indexOf(loop)+1)%3]));
  $('btnLink').addEventListener('click',() => { if(id) window.open('https://music.163.com/#/playlist?id='+id,'_blank','noopener,noreferrer'); });
  $('reload').addEventListener('click',loadPlaylist);
  list.addEventListener('click',event => {
    const row=event.target.closest('.row'); if(row) selectSong(Number(row.dataset.index),true);
  });
  lyricInner.addEventListener('click',event => {
    const line=event.target.closest('.lyric-line');
    if(line && duration()) seek(lyrics[Number(line.dataset.index)].time/duration());
  });
  ['wheel','touchstart','pointerdown','keydown'].forEach(type => lyricScroll.addEventListener(type,() => {userScrollUntil=Date.now()+4000;},{passive:true}));
  slider($('track'),seek,ratio => { seeking=true; $('fill').style.width=ratio*100+'%';$('knob').style.left=ratio*100+'%';$('timeCur').textContent=formatTime(ratio*duration()); },() => {seeking=false;});
  $('track').addEventListener('keydown',event => {
    if(!duration()) return;
    const step=event.shiftKey ? 30 : 5;
    const values={ArrowRight:audio.currentTime+step,ArrowLeft:audio.currentTime-step,Home:0,End:duration()};
    if(event.key in values) {event.preventDefault();seek(values[event.key]/duration());}
  });
  slider($('volTrack'),setVolume);
  $('volTrack').addEventListener('keydown',event => {
    const step=event.shiftKey ? .1 : .05;
    const values={ArrowRight:audio.volume+step,ArrowUp:audio.volume+step,ArrowLeft:audio.volume-step,ArrowDown:audio.volume-step,Home:0,End:1};
    if(event.key in values) {event.preventDefault();setVolume(values[event.key]);}
  });
  $('btnVol').addEventListener('click',() => setVolume(audio.volume ? 0 : rememberedVolume));
  $('cover').addEventListener('load',() => {$('cover').hidden=false;$('coverPh').hidden=true;});
  $('cover').addEventListener('error',() => {$('cover').hidden=true;$('coverPh').hidden=false;});
  audio.addEventListener('play',() => {
    if(closed()) {audio.pause();return;}
    playingUI();setStatus('正在播放 · '+songs[index].name);
  });
  audio.addEventListener('playing',() => {buffering=false;playingUI();});
  ['waiting','seeking','emptied'].forEach(type => audio.addEventListener(type,() => {buffering=true;playingUI();}));
  audio.addEventListener('pause',() => {buffering=true;playingUI();if(index>=0)setStatus('已暂停 · '+songs[index].name);});
  ['timeupdate','loadedmetadata','durationchange','progress'].forEach(type => audio.addEventListener(type,() => {updateProgress();syncLyrics();}));
  audio.addEventListener('ended',() => {
    buffering=true;playingUI();
    if(closed())return;
    if(loop==='one') {audio.currentTime=0;playAudio();}
    else selectSong(nextIndex(index,songs.length,loop,1),true);
  });
  audio.addEventListener('error',() => {audio.pause();playingUI();setStatus('音源暂时不可用，请切换歌曲或在网易云打开。');});
  new ResizeObserver(layoutLyrics).observe(lyricScroll);
  new MutationObserver(() => {
    if(closed()) {
      // Let metadata finish loading even if the window closes mid-request.
      audio.pause();controlsEnabled(songs.length>0 && !loading);themePopup(false);
    } else if(!win.hidden) {
      if (!songs.length && !loading) loadPlaylist();
      else if (songs.length && index < 0 && !loading) selectSong(0,false);
    }
  }).observe(win,{attributes:true,attributeFilter:['data-state','hidden']});
  icon('btnPrev','prev');icon('btnNext','next');icon('btnLink','link');
  setLoop(store.get('loop'));accent(store.get('accent') || defaultAccent);
  const volume = Number(store.get('volume') ?? win.dataset.volume);
  setVolume(Number.isFinite(volume) ? volume : .5);
  controlsEnabled(false);playingUI();
  if(!win.hidden && !closed()) loadPlaylist();
  function schedulePreload() {
    const preload = () => {
      // Opening first reuses the same request; failed preloads retry on open.
      if (!songs.length && !loading && !win.dataset.loadState) loadPlaylist();
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload,{timeout:3000});
    else setTimeout(preload,1500);
  }
  if (document.readyState === 'complete') schedulePreload();
  else window.addEventListener('load',schedulePreload,{once:true});
})();
