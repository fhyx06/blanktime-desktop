(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const windows = [...document.querySelectorAll('.app-window')];
  const welcome = $('#welcome');
  const mobile = () => matchMedia('(max-width: 760px)').matches;
  const dockApps = $('.dock-apps');
  let suppressDockReveal = false;
  let topZ = 10, activeWindow, desktopRestore = [];
  const loadArticle = href => document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href}}));
  let welcomeDismissed = false;
  try { welcomeDismissed = sessionStorage.getItem('welcome-dismissed') === 'yes'; } catch {}
  function dismissWelcome() {
    welcomeDismissed = true;
    try { sessionStorage.setItem('welcome-dismissed', 'yes'); } catch {}
  }
  function updateDockOverflow(clamp = false) {
    if (!dockApps) return;
    if (!mobile()) {
      dockApps.classList.remove('can-scroll-left', 'can-scroll-right');
      return;
    }
    const maximum = Math.max(0, dockApps.scrollWidth - dockApps.clientWidth);
    const position = Math.max(0, Math.min(maximum, dockApps.scrollLeft));
    // Clamp when icons disappear or the viewport changes, but leave touch overscroll alone.
    if (clamp && position !== dockApps.scrollLeft) dockApps.scrollLeft = position;
    dockApps.classList.toggle('can-scroll-left', position > 1);
    dockApps.classList.toggle('can-scroll-right', maximum - position > 1);
  }
  function revealDockButton(button) {
    if (!mobile() || !dockApps?.contains(button) || button.hidden) return;
    const area = dockApps.getBoundingClientRect(), target = button.getBoundingClientRect();
    if (!area.width || !target.width) return;
    const inset = 6;
    let offset = 0;
    if (target.left < area.left + inset) offset = target.left - area.left - inset;
    else if (target.right > area.right - inset) offset = target.right - area.right + inset;
    if (offset) {
      const maximum = Math.max(0, dockApps.scrollWidth - dockApps.clientWidth);
      dockApps.scrollLeft = Math.max(0, Math.min(maximum, dockApps.scrollLeft + offset));
    }
    updateDockOverflow();
  }
  dockApps?.addEventListener('scroll', () => updateDockOverflow(), {passive:true});
  dockApps?.addEventListener('focusin', event => {
    const button = event.target.closest('.dock-button[data-open]');
    if (!suppressDockReveal && button?.matches(':focus-visible')) revealDockButton(button);
  });
  function syncDock() {
    document.querySelectorAll('[data-open]').forEach(button => {
      const win = document.getElementById(button.dataset.open);
      if (button.hasAttribute('data-running-only')) button.hidden = win.dataset.state === 'closed';
      button.classList.toggle('is-running', win.dataset.state !== 'closed');
      button.classList.toggle('is-focused', activeWindow === win && win.dataset.state === 'open');
    });
    updateDockOverflow(true);
  }
  function focusWindow(win, raise = true) {
    activeWindow = win;
    windows.forEach(other => other.classList.toggle('is-focused', other === win));
    if (raise) win.style.zIndex = ++topZ;
    const decoration = windowLaunch.get(win) || windowClose.get(win);
    if (decoration) decoration.scene.style.zIndex = win.style.zIndex;
    syncDock();
  }
  // Keep logical window state separate from its short visual transition.
  const windowMotion = new WeakMap();
  const windowLayerCleanup = new WeakMap();
  const windowLaunch = new WeakMap();
  const musicLaunched = new WeakSet();
  const albumLaunched = new WeakSet();
  const filesLaunched = new WeakSet();
  const browserLaunched = new WeakSet();
  const windowClose = new WeakMap();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function settleLaunch(win, finished = false) {
    const launch = windowLaunch.get(win);
    if (!launch) return;
    windowLaunch.delete(win);
    (launch.animations || [launch.animation]).forEach(animation => {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    });
    launch.scene.remove();
    launch.cleanup?.();
    win.classList.remove('music-is-starting', 'album-is-starting', 'files-is-starting', 'browser-is-starting');
    win.style.removeProperty('--music-launch-duration');
    if (win.id === 'files' || win.id === 'browser') {
      if (finished && win.dataset.state === 'open') {
        // Release the window's layer after the landing, not on the text's final frame.
        scheduleWindowLayerRelease(win);
      } else releaseWindowLayer(win);
    }
  }
  function vinylScene(win, rect, duration) {
    const size = Math.min(152, rect.width * .36, rect.height * .36);
    const scene = document.createElement('div');
    scene.className = 'music-launch';
    scene.setAttribute('aria-hidden', 'true');
    Object.assign(scene.style, {
      left:`${rect.left + rect.width / 2 - size / 2}px`,
      top:`${rect.top + rect.height / 2 - size / 2}px`,
      width:`${size}px`, height:`${size}px`, zIndex:win.style.zIndex
    });
    scene.style.setProperty('--music-launch-duration', `${duration}ms`);
    scene.style.setProperty('--launch-accent', getComputedStyle(win).getPropertyValue('--accent-rgb').trim() || '236,65,65');
    scene.innerHTML = '<span class="music-launch-wave"></span><span class="music-launch-wave music-launch-wave-outer"></span><span class="music-launch-record"><span class="music-launch-label"></span></span>';
    // Only use artwork already decoded by the player: starting never waits for a network request.
    const cover = $('#music-cover', win);
    const artwork = cover?.complete && cover.naturalWidth > 0 && !cover.hidden ? cover : $('.music-icon-art', win);
    if (artwork) {
      const image = document.createElement('img');
      image.src = artwork.currentSrc || artwork.src;
      image.alt = '';
      image.addEventListener('error', () => image.remove(), {once:true});
      $('.music-launch-label', scene).append(image);
    }
    win.after(scene);
    return {scene,
      inset:`inset(${(rect.height-size)/2}px ${(rect.width-size)/2}px round ${size/2}px)`,
      radius:getComputedStyle(win).borderRadius || '13px'};
  }
  function settleClose(win) {
    const closing = windowClose.get(win);
    if (!closing) return;
    windowClose.delete(win);
    closing.animations.forEach(animation => {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    });
    closing.scene.remove();
    closing.cleanup?.();
    win.classList.remove('album-is-starting', 'album-is-closing', 'files-is-starting', 'files-is-closing', 'browser-is-starting', 'browser-is-closing');
    win.inert = false;
    win.hidden = win.dataset.state !== 'open';
    if (win.id === 'files' || win.id === 'browser') {
      if (win.hidden) releaseWindowLayer(win);
      else scheduleWindowLayerRelease(win);
    }
  }
  function directClose(win, closing) {
    const motion = windowClose.get(win);
    if (!motion) return false;
    motion.animations.forEach(animation => {
      animation.updatePlaybackRate((closing ? 1 : -1) * (motion.closingRate || 1));
      animation.play();
    });
    win.inert = closing;
    if (win.id === 'files') {
      win.classList.toggle('files-is-closing', closing);
      // A reversed introduction resumes its loading illustration only when reopened.
      if (motion.closingRate === -1) motion.scene.classList.toggle('files-close', closing);
    }
    if (win.id === 'browser') win.classList.toggle('browser-is-closing', closing);
    return true;
  }
  function launchBrowser(win) {
    if (win.id !== 'browser' || reducedMotion.matches || typeof win.animate !== 'function' || !window.blanktimeBrowserMotion) return;
    const repeated = browserLaunched.has(win);
    releaseWindowLayer(win);
    const motion = window.blanktimeBrowserMotion.create(win, {duration:mobile() ? (repeated ? 300 : 450) : (repeated ? 420 : 700)});
    if (!motion) return;
    browserLaunched.add(win);
    win.classList.add('browser-is-starting', 'browser-flight-layer');
    windowLaunch.set(win, motion);
    motion.animation.onfinish = () => {
      if (windowLaunch.get(win) === motion) settleLaunch(win, true);
    };
    motion.animation.oncancel = () => {
      if (windowLaunch.get(win) === motion) settleLaunch(win);
    };
  }
  function closeBrowser(win) {
    if (win.id !== 'browser') return false;
    if (reducedMotion.matches || typeof win.animate !== 'function' || !window.blanktimeBrowserMotion) {
      settleMotion(win);
      return false;
    }
    if (directClose(win, true)) return true;
    const launch = windowLaunch.get(win);
    if (launch) {
      if (!(launch.animation.currentTime > 0)) { settleLaunch(win); return false; }
      windowLaunch.delete(win);
      windowClose.set(win, {...launch, closingRate:-1});
      launch.animation.onfinish = launch.animation.oncancel = () => {
        if (windowClose.get(win)?.animation === launch.animation) settleClose(win);
      };
      directClose(win, true);
      return true;
    }
    const style = getComputedStyle(win), from = {transform:style.transform, opacity:style.opacity};
    settleMotion(win);
    win.hidden = false;
    const motion = window.blanktimeBrowserMotion.create(win, {closing:true, duration:mobile() ? 320 : 460, from});
    if (!motion) return false;
    win.classList.add('browser-is-closing', 'browser-flight-layer');
    windowClose.set(win, motion);
    win.inert = true;
    motion.animation.onfinish = motion.animation.oncancel = () => {
      if (windowClose.get(win) === motion) settleClose(win);
    };
    return true;
  }
  function closeMusic(win) {
    if (win.id !== 'music') return false;
    if (reducedMotion.matches || typeof win.animate !== 'function') {
      settleMotion(win);
      return false;
    }
    if (directClose(win, true)) return true;
    // Preserve the current appearance if close interrupts startup or restoration.
    const style = getComputedStyle(win);
    const from = {clipPath:style.clipPath, transform:style.transform, opacity:style.opacity};
    settleMotion(win);
    win.hidden = false;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const duration = 360;
    const {scene, inset, radius} = vinylScene(win, rect, duration);
    scene.classList.add('music-close');
    const options = {duration, easing:'linear', fill:'both'};
    const animation = win.animate([
      {clipPath:from.clipPath && from.clipPath !== 'none' ? from.clipPath : `inset(0px 0px round ${radius})`,
        transform:from.transform || 'none', opacity:from.opacity || 1, offset:0, easing:'cubic-bezier(.4, 0, .6, 1)'},
      {clipPath:inset, transform:'scale(1)', opacity:1, offset:.68},
      {clipPath:inset, transform:'scale(.9)', opacity:0, offset:.84},
      {clipPath:inset, transform:'scale(.9)', opacity:0, offset:1}
    ], {...options, id:'music-close'});
    const animations = [animation];
    const add = (element, frames) => {
      if (element) animations.push(element.animate(frames, options));
    };
    add($('.music-workspace', win), [
      {opacity:1,offset:0},{opacity:0,offset:.28},{opacity:0,offset:1}
    ]);
    add($('.music-launch-record', scene), [
      {opacity:0,transform:'scale(1) rotate(-6deg)',offset:0},
      {opacity:0,transform:'scale(1) rotate(-6deg)',offset:.3},
      {opacity:1,transform:'scale(1) rotate(0deg)',offset:.6},
      {opacity:1,transform:'scale(.97) rotate(5deg)',offset:.76},
      {opacity:0,transform:'scale(.78) rotate(15deg)',offset:1}
    ]);
    add($('.music-launch-wave', scene), [
      {opacity:0,transform:'scale(.95)',offset:0},
      {opacity:0,transform:'scale(.95)',offset:.55},
      {opacity:.4,transform:'scale(1.1)',offset:.72},
      {opacity:0,transform:'scale(1.65)',offset:1}
    ]);
    windowClose.set(win, {animation, animations, scene});
    win.inert = true;
    animation.onfinish = () => {
      if (windowClose.get(win)?.animation === animation) settleClose(win);
    };
    return true;
  }
  function launchMusic(win) {
    if (win.id !== 'music' || reducedMotion.matches || typeof win.animate !== 'function') return;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const duration = musicLaunched.has(win) ? 420 : 640;
    musicLaunched.add(win);
    const {scene, inset, radius} = vinylScene(win, rect, duration);
    win.classList.add('music-is-starting');
    win.style.setProperty('--music-launch-duration', `${duration}ms`);
    const animation = win.animate([
      {clipPath:inset, transform:'scale(.94)', opacity:0, offset:0},
      {clipPath:inset, transform:'scale(.94)', opacity:0, offset:.22},
      {clipPath:inset, transform:'scale(.94)', opacity:1, offset:.3, easing:'cubic-bezier(.22, .7, .25, 1)'},
      {clipPath:`inset(0px 0px round ${radius})`, transform:'scale(1)', opacity:1, offset:1}
    ], {id:'music-launch', duration, easing:'linear', fill:'both'});
    windowLaunch.set(win, {animation, scene});
    animation.onfinish = () => {
      if (windowLaunch.get(win)?.animation === animation) settleLaunch(win);
    };
  }
  function albumScene(win, rect) {
    const compact = mobile();
    const size = Math.min(compact ? 116 : 148, rect.width * .3, rect.height * .26);
    const scene = document.createElement('div');
    scene.className = 'album-launch';
    scene.setAttribute('aria-hidden', 'true');
    Object.assign(scene.style, {
      left:`${rect.left + rect.width / 2 - size / 2}px`,
      top:`${rect.top + rect.height / 2 - size * .56}px`,
      width:`${size}px`, height:`${size * 1.12}px`, zIndex:win.style.zIndex
    });
    const sources = [], seen = new Set();
    for (const image of win.querySelectorAll('.album-folder-cover img, .album-card[data-load-state="loaded"] img')) {
      const src = image.currentSrc || image.getAttribute('src');
      if (!src || seen.has(src) || image.hidden || !image.complete || !image.naturalWidth || !image.naturalHeight) continue;
      sources.push(image); seen.add(src);
      if (sources.length === 3) break;
    }
    // A canvas copies already decoded pixels, including cross-origin covers,
    // without assigning new image URLs or fetching an original for the animation.
    function photo(index) {
      const card = document.createElement('span'); card.className = 'album-launch-photo';
      const paper = document.createElement('span'); paper.className = 'album-launch-picture';
      card.append(paper); scene.append(card);
      const source = sources[index];
      if (source) {
        try {
          const canvas = document.createElement('canvas');
          const edge = Math.ceil(size * Math.min(devicePixelRatio || 1, 2));
          canvas.width = canvas.height = edge;
          const context = canvas.getContext('2d');
          if (context) {
            const crop = Math.min(source.naturalWidth, source.naturalHeight);
            context.drawImage(source, (source.naturalWidth-crop)/2, (source.naturalHeight-crop)/2, crop, crop, 0, 0, edge, edge);
            paper.append(canvas);
          }
        } catch { /* Keep the colorful paper when drawing is unavailable. */ }
      }
      return card;
    }
    const spread = compact ? 22 : 40, tilt = compact ? 8 : 13;
    // Add the front photo last so the first available cover remains on top.
    const photos = [[1,-spread,-tilt,1],[2,spread,tilt,-2],[0,0,0,-12]].map(([index,x,angle,y]) => ({element:photo(index),x,angle,y}));
    win.after(scene);
    return {scene, photos};
  }
  function launchAlbum(win) {
    if (win.id !== 'album' || reducedMotion.matches || typeof win.animate !== 'function') return;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const duration = albumLaunched.has(win) ? 400 : 600;
    albumLaunched.add(win);
    const {scene, photos} = albumScene(win, rect);
    const options = {duration, easing:'linear', fill:'both'};
    const animations = [];
    const add = (element, frames, extra = {}) => {
      const animation = element.animate(frames, {...options, ...extra});
      animations.push(animation); return animation;
    };
    for (const {element, x, angle, y} of photos) {
      add(element, [
        {opacity:0, transform:`translateY(18px) rotate(${angle/3}deg) scale(.76)`, offset:0, easing:'cubic-bezier(.2, .7, .3, 1)'},
        {opacity:1, transform:`translateY(0) rotate(${angle/3}deg) scale(.98)`, offset:.2, easing:'cubic-bezier(.22, .8, .3, 1)'},
        {opacity:1, transform:`translate(${x}px, ${y}px) rotate(${angle}deg) scale(1)`, offset:.46},
        {opacity:1, transform:`translate(${x}px, ${y-3}px) rotate(${angle}deg) scale(1.02)`, offset:.57, easing:'ease-out'},
        {opacity:0, transform:`translate(${x*1.15}px, ${y-10}px) rotate(${angle}deg) scale(1.08)`, offset:.84},
        {opacity:0, transform:`translate(${x*1.15}px, ${y-10}px) rotate(${angle}deg) scale(1.08)`, offset:1}
      ]);
    }
    win.classList.add('album-is-starting');
    const animation = add(win, [
      {opacity:0, transform:'scale(.9)', offset:0},
      {opacity:0, transform:'scale(.9)', offset:.3, easing:'cubic-bezier(.22, 1, .36, 1)'},
      {opacity:1, transform:'scale(1)', offset:1}
    ], {id:'album-launch'});
    add($('.album-content', win), [
      {opacity:0, transform:'translateY(8px)', offset:0},
      {opacity:0, transform:'translateY(8px)', offset:.42, easing:'ease-out'},
      {opacity:1, transform:'translateY(0)', offset:1}
    ]);
    const grid = $('#album-folders', win).hidden ? $('#album-grid', win) : $('#album-folders', win);
    let order = 0;
    for (const card of grid.querySelectorAll(':scope > button:not([hidden])')) {
      const bounds = card.getBoundingClientRect();
      if (!bounds.width || bounds.top >= rect.bottom || bounds.bottom <= rect.top) continue;
      add(card, [
        {opacity:0, transform:'translateY(12px)', offset:0},
        {opacity:0, transform:'translateY(12px)', offset:.5 + order * .035, easing:'ease-out'},
        {opacity:1, transform:'translateY(0)', offset:1}
      ]);
      if (++order === 6) break;
    }
    windowLaunch.set(win, {animation, animations, scene});
    animation.onfinish = animation.oncancel = () => {
      if (windowLaunch.get(win)?.animation === animation) settleLaunch(win);
    };
  }
  function filesScene(win, rect) {
    const compact = mobile();
    const size = Math.min(compact ? 112 : 144, rect.width * .34, rect.height * .3);
    const sceneHeight = size * .94;
    const initialWindowScale = `scale(${size / rect.width}, ${sceneHeight / rect.height})`;
    const expandedFolderScale = `scale(${rect.width / size}, ${rect.height / sceneHeight})`;
    const scene = document.createElement('div');
    scene.className = 'files-launch';
    scene.setAttribute('aria-hidden', 'true');
    Object.assign(scene.style, {
      left:`${rect.left + rect.width / 2 - size / 2}px`,
      top:`${rect.top + (rect.height - sceneHeight) / 2}px`,
      width:`${size}px`, height:`${sceneHeight}px`, zIndex:win.style.zIndex
    });
    // A brief illustration of reading files; the real list is already present.
    scene.innerHTML = '<span class="files-launch-folder"><span class="files-launch-back"></span><span class="files-launch-paper"><span class="files-launch-caption">加载文件…</span><i class="files-launch-line"></i><i class="files-launch-line"></i><i class="files-launch-line"></i></span><span class="files-launch-front"></span></span>';
    win.after(scene);
    return {scene, initialWindowScale, expandedFolderScale, rise:compact ? 24 : 36};
  }
  function launchFiles(win) {
    if (win.id !== 'files' || reducedMotion.matches || typeof win.animate !== 'function') return;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const compact = mobile(), repeated = filesLaunched.has(win);
    const duration = compact ? (repeated ? 300 : 480) : (repeated ? 360 : 600);
    const expandAt = .48, settleAt = .96, expandEase = 'cubic-bezier(.22, .8, .25, 1)';
    filesLaunched.add(win);
    releaseWindowLayer(win);
    const {scene, initialWindowScale, expandedFolderScale, rise} = filesScene(win, rect);
    win.classList.add('files-is-starting', 'files-launch-layer');
    const options = {duration, easing:'linear', fill:'both'}, animations = [];
    const add = (element, frames, extra = {}) => {
      const animation = element.animate(frames, {...options, ...extra});
      animations.push(animation); return animation;
    };
    // Reciprocal scales keep the illustration and window bounds aligned throughout expansion.
    add(scene, [
      {transform:'scale(1, 1)', offset:0},
      {transform:'scale(1, 1)', offset:expandAt, easing:expandEase},
      {transform:expandedFolderScale, offset:settleAt},
      {transform:expandedFolderScale, offset:1}
    ], {id:'files-launch-expand'});
    add($('.files-launch-folder', scene), [
      {opacity:0, transform:'translateY(12px) scale(.8)', offset:0, easing:'cubic-bezier(.2, .7, .3, 1)'},
      {opacity:1, transform:'translateY(0) scale(1)', offset:.2},
      {opacity:1, transform:'translateY(0) scale(1)', offset:expandAt, easing:'ease-out'},
      {opacity:0, transform:'translateY(0) scale(1)', offset:.8},
      {opacity:0, transform:'translateY(0) scale(1)', offset:1}
    ]);
    add($('.files-launch-front', scene), [
      {transform:'perspective(480px) rotateX(0deg)', offset:0},
      {transform:'perspective(480px) rotateX(0deg)', offset:.18, easing:'cubic-bezier(.22, .8, .3, 1)'},
      {transform:'perspective(480px) rotateX(-32deg)', offset:.48},
      {transform:'perspective(480px) rotateX(-32deg)', offset:1}
    ]);
    add($('.files-launch-paper', scene), [
      {opacity:0, transform:'translateY(10px)', offset:0},
      {opacity:0, transform:'translateY(10px)', offset:.18, easing:'cubic-bezier(.22, .8, .3, 1)'},
      {opacity:1, transform:`translateY(-${rise}px)`, offset:.42},
      {opacity:1, transform:`translateY(-${rise}px)`, offset:1}
    ]);
    add($('.files-launch-caption', scene), [
      {opacity:1, offset:0}, {opacity:1, offset:expandAt, easing:'ease-out'},
      {opacity:0, offset:.6}, {opacity:0, offset:1}
    ]);
    scene.querySelectorAll('.files-launch-line').forEach((line, index) => add(line, [
      {opacity:0, transform:'scaleX(.2)', offset:0},
      {opacity:0, transform:'scaleX(.2)', offset:.28 + index * .07, easing:'ease-out'},
      {opacity:1, transform:'scaleX(1)', offset:.43 + index * .07},
      {opacity:0, transform:'scaleX(1)', offset:.7},
      {opacity:0, transform:'scaleX(1)', offset:1}
    ]));
    const animation = add(win, [
      {opacity:0, transform:initialWindowScale, offset:0},
      {opacity:0, transform:initialWindowScale, offset:expandAt, easing:expandEase},
      {opacity:1, transform:'scale(1, 1)', offset:settleAt},
      {opacity:1, transform:'scale(1, 1)', offset:1}
    ], {id:'files-launch'});
    add($('.files-layout', win), [
      {opacity:0, offset:0},
      {opacity:0, offset:.62, easing:'ease-out'},
      {opacity:1, offset:settleAt},
      {opacity:1, offset:1}
    ]);
    windowLaunch.set(win, {animation, animations, scene});
    animation.onfinish = () => {
      if (windowLaunch.get(win)?.animation === animation) settleLaunch(win, true);
    };
    animation.oncancel = () => {
      if (windowLaunch.get(win)?.animation === animation) settleLaunch(win);
    };
  }
  function closeFiles(win) {
    if (win.id !== 'files') return false;
    if (reducedMotion.matches || typeof win.animate !== 'function') {
      settleMotion(win);
      return false;
    }
    if (directClose(win, true)) return true;
    const launch = windowLaunch.get(win);
    if (launch) {
      // Retrace the same folder and window from their currently displayed size.
      if (!(launch.animation.currentTime > 0)) { settleLaunch(win); return false; }
      windowLaunch.delete(win);
      windowClose.set(win, {...launch, closingRate:-1});
      launch.animation.onfinish = launch.animation.oncancel = () => {
        if (windowClose.get(win)?.animation === launch.animation) settleClose(win);
      };
      directClose(win, true);
      return true;
    }
    const content = $('.files-layout', win), style = getComputedStyle(win);
    const from = {transform:style.transform, opacity:style.opacity, contentOpacity:getComputedStyle(content).opacity};
    settleMotion(win);
    win.hidden = false;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const {scene, initialWindowScale, expandedFolderScale, rise} = filesScene(win, rect);
    scene.classList.add('files-close');
    win.classList.add('files-is-closing', 'files-launch-layer');
    const options = {duration:mobile() ? 300 : 380, easing:'linear', fill:'both'}, animations = [];
    const add = (element, frames, extra = {}) => {
      const animation = element.animate(frames, {...options, ...extra});
      animations.push(animation); return animation;
    };
    const foldAt = .64, foldEase = 'cubic-bezier(.4, 0, .2, 1)';
    const fromTransform = from.transform && from.transform !== 'none' ? from.transform : '';
    // Reciprocal scales also align the folder when close interrupts a Dock restoration.
    add(scene, [
      {transform:`${fromTransform} ${expandedFolderScale}`.trim(), offset:0, easing:foldEase},
      {transform:'scale(1, 1)', offset:foldAt},
      {transform:'scale(1, 1)', offset:1}
    ], {id:'files-close-contract'});
    add($('.files-launch-folder', scene), [
      {opacity:0, transform:'translateY(0) scale(1)', offset:0},
      {opacity:0, transform:'translateY(0) scale(1)', offset:.08, easing:'ease-out'},
      {opacity:1, transform:'translateY(0) scale(1)', offset:.4},
      {opacity:1, transform:'translateY(0) scale(1)', offset:.8, easing:'ease-in'},
      {opacity:0, transform:'translateY(8px) scale(.82)', offset:1}
    ]);
    add($('.files-launch-paper', scene), [
      {opacity:1, transform:`translateY(-${rise}px)`, offset:0},
      {opacity:1, transform:`translateY(-${rise}px)`, offset:.46, easing:foldEase},
      {opacity:0, transform:'translateY(10px)', offset:.84},
      {opacity:0, transform:'translateY(10px)', offset:1}
    ]);
    add($('.files-launch-front', scene), [
      {transform:'perspective(480px) rotateX(-32deg)', offset:0},
      {transform:'perspective(480px) rotateX(-32deg)', offset:.58, easing:foldEase},
      {transform:'perspective(480px) rotateX(0deg)', offset:.84},
      {transform:'perspective(480px) rotateX(0deg)', offset:1}
    ]);
    add(content, [
      {opacity:from.contentOpacity || 1, offset:0, easing:'ease-out'},
      {opacity:0, offset:.3}, {opacity:0, offset:1}
    ]);
    const animation = add(win, [
      {opacity:from.opacity || 1, transform:fromTransform || 'scale(1, 1)', offset:0, easing:foldEase},
      {opacity:0, transform:initialWindowScale, offset:foldAt},
      {opacity:0, transform:initialWindowScale, offset:1}
    ], {id:'files-close'});
    windowClose.set(win, {animation, animations, scene});
    win.inert = true;
    animation.onfinish = animation.oncancel = () => {
      if (windowClose.get(win)?.animation === animation) settleClose(win);
    };
    return true;
  }
  function closeAlbum(win) {
    if (win.id !== 'album') return false;
    if (reducedMotion.matches || typeof win.animate !== 'function') {
      settleMotion(win);
      return false;
    }
    if (directClose(win, true)) return true;
    const launch = windowLaunch.get(win);
    if (launch) {
      // Fold an unfinished introduction back in place without swapping its photos.
      if (!(launch.animation.currentTime > 0)) { settleLaunch(win); return false; }
      windowLaunch.delete(win);
      windowClose.set(win, {...launch, closingRate:-1});
      launch.animation.onfinish = launch.animation.oncancel = () => {
        if (windowClose.get(win)?.animation === launch.animation) settleClose(win);
      };
      directClose(win, true);
      return true;
    }
    const style = getComputedStyle(win), content = $('.album-content', win);
    const from = {transform:style.transform, opacity:style.opacity, contentOpacity:getComputedStyle(content).opacity};
    settleMotion(win);
    win.hidden = false;
    const rect = win.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const {scene, photos} = albumScene(win, rect);
    scene.classList.add('album-close');
    win.classList.add('album-is-closing');
    const options = {duration:mobile() ? 360 : 420, easing:'linear', fill:'both'};
    const animation = win.animate([
      {opacity:from.opacity || 1, transform:from.transform || 'none', offset:0, easing:'cubic-bezier(.4, 0, .6, 1)'},
      {opacity:0, transform:'scale(.9)', offset:.58},
      {opacity:0, transform:'scale(.9)', offset:1}
    ], {...options, id:'album-close'});
    const animations = [animation];
    animations.push(content.animate([
      {opacity:from.contentOpacity || 1, offset:0}, {opacity:0, offset:.35}, {opacity:0, offset:1}
    ], options));
    for (const {element, x, angle, y} of photos) {
      animations.push(element.animate([
        {opacity:0, transform:`translate(${x}px, ${y-10}px) rotate(${angle}deg) scale(1.08)`, offset:0},
        {opacity:0, transform:`translate(${x}px, ${y-10}px) rotate(${angle}deg) scale(1.08)`, offset:.14, easing:'ease-out'},
        {opacity:1, transform:`translate(${x}px, ${y}px) rotate(${angle}deg) scale(1)`, offset:.4, easing:'cubic-bezier(.4, 0, .2, 1)'},
        {opacity:1, transform:`translateY(4px) rotate(${angle/4}deg) scale(.94)`, offset:.7, easing:'ease-in'},
        {opacity:0, transform:`translateY(24px) rotate(${angle/5}deg) scale(.72)`, offset:1}
      ], options));
    }
    windowClose.set(win, {animation, animations, scene});
    win.inert = true;
    animation.onfinish = animation.oncancel = () => {
      if (windowClose.get(win)?.animation === animation) settleClose(win);
    };
    return true;
  }
  function scheduleWindowLayerRelease(win) {
    clearTimeout(windowLayerCleanup.get(win));
    const timer = setTimeout(() => {
      if (windowLayerCleanup.get(win) === timer) releaseWindowLayer(win);
    }, 120);
    windowLayerCleanup.set(win, timer);
  }
  function releaseWindowLayer(win) {
    clearTimeout(windowLayerCleanup.get(win));
    windowLayerCleanup.delete(win);
    win.classList.remove('is-window-moving', 'files-launch-layer', 'browser-flight-layer');
  }
  function settleMotion(win, finished = false) {
    delete win.dataset.windowMotion;
    settleLaunch(win);
    settleClose(win);
    const animation = windowMotion.get(win);
    if (!animation) { releaseWindowLayer(win); return; }
    windowMotion.delete(win);
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
    win.inert = false;
    win.hidden = win.dataset.state !== 'open';
    if (finished && !win.hidden && win.classList.contains('is-window-moving')) {
      // Keep the restored card grid composited briefly beyond the final frame.
      // Dropping its layer at the same time as the transform can hitch the landing.
      const timer = setTimeout(() => {
        if (windowLayerCleanup.get(win) === timer) releaseWindowLayer(win);
      }, 120);
      windowLayerCleanup.set(win, timer);
    } else releaseWindowLayer(win);
  }
  function animateWindow(win, minimizing) {
    const interruptedScene = minimizing && (win.id === 'files' || win.id === 'browser') && (windowLaunch.has(win) || windowClose.has(win));
    settleClose(win);
    settleLaunch(win);
    if (win.id === 'files' || win.id === 'browser') releaseWindowLayer(win);
    // Dismiss an unfinished scene without flashing a full-size window.
    if (interruptedScene) return false;
    if (reducedMotion.matches || typeof win.animate !== 'function' || document.fullscreenElement === win) {
      settleMotion(win);
      return false;
    }
    const running = windowMotion.get(win);
    if (running) {
      win.dataset.windowMotion = 'true';
      // Reverse the current journey instead of jumping back to either endpoint.
      running.updatePlaybackRate(minimizing ? 1 : -1);
      running.play();
      win.inert = minimizing;
      return true;
    }
    const dock = $(`.dock [data-open="${win.id}"]`);
    const rect = win.getBoundingClientRect(), target = dock?.getBoundingClientRect();
    if (!target?.width || !target.height || !rect.width || !rect.height) return false;
    const scale = Math.min(target.width / rect.width, target.height / rect.height);
    let x = target.left + target.width / 2, y = target.top + target.height / 2;
    const appArea = mobile() && dockApps?.getBoundingClientRect();
    const bar = appArea?.width && appArea.height ? appArea : dock.closest('.dock').getBoundingClientRect();
    // Scrolled-out applications land at the app strip's edge, never on the fixed tools.
    if (bar.width && bar.height) {
      x = Math.max(bar.left + target.width / 2, Math.min(bar.right - target.width / 2, x));
      y = Math.max(bar.top + target.height / 2, Math.min(bar.bottom - target.height / 2, y));
    }
    const dx = x - rect.left - rect.width / 2;
    const dy = y - rect.top - rect.height / 2;
    const desktopBrowser = win.id === 'browser' && !mobile();
    if (desktopBrowser) {
      clearTimeout(windowLayerCleanup.get(win));
      windowLayerCleanup.delete(win);
      win.classList.add('is-window-moving');
    }
    const duration = desktopBrowser && !minimizing ? 320 : 280;
    // Restores play backwards, so mirror the ease-out curve in the timeline.
    // Reversals reuse the running animation to preserve the displayed position.
    const easing = desktopBrowser && !minimizing ? 'cubic-bezier(.64, 0, .78, 0)' : 'cubic-bezier(.4, 0, .2, 1)';
    const animation = win.animate([
      {transform:'translate(0, 0) scale(1)', opacity:1, transformOrigin:'center'},
      {transform:`translate(${dx}px, ${dy}px) scale(${scale})`, opacity:0, transformOrigin:'center'}
    ], {duration, easing, fill:'both'});
    windowMotion.set(win, animation);
    win.dataset.windowMotion = 'true';
    win.inert = minimizing;
    animation.onfinish = () => {
      if (windowMotion.get(win) === animation) settleMotion(win, true);
    };
    animation.oncancel = () => {
      if (windowMotion.get(win) === animation) settleMotion(win);
    };
    if (!minimizing) {
      animation.pause();
      animation.currentTime = duration;
      animation.reverse();
    }
    return true;
  }
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) windows.forEach(win => settleMotion(win));
  });
  function openWindow(win, focus = true, {animate = true} = {}) {
    const restoring = win.dataset.state === 'minimized';
    const starting = win.dataset.state === 'closed';
    if (!animate) settleMotion(win);
    win.hidden = false;
    win.dataset.state = 'open';
    win.inert = false;
    focusWindow(win);
    if (focus) revealDockButton($(`.dock [data-open="${win.id}"]`));
    if (animate && restoring) animateWindow(win, false);
    if (animate && starting && !directClose(win, false)) { launchMusic(win); launchAlbum(win); launchFiles(win); launchBrowser(win); }
    if (focus) win.focus({preventScroll: true});
    win.dispatchEvent(new CustomEvent('blanktime:window-opened'));
  }
  function hideWindow(win, state) {
    if (win.dataset.state === state) return;
    const wasOpen = win.dataset.state === 'open';
    win.dataset.state = state;
    const animating = wasOpen && (state === 'closed' ? closeMusic(win) || closeAlbum(win) || closeFiles(win) || closeBrowser(win) : animateWindow(win, true));
    if (!animating && state === 'closed') settleMotion(win);
    if (!animating) win.hidden = true;
    if (win === welcome) dismissWelcome();
    const visible = windows.filter(other => other.dataset.state === 'open').sort((a,b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    if (visible.length) { focusWindow(visible[0], !animating); visible[0].focus({preventScroll: true}); }
    else {
      activeWindow = null;
      const opener = $(`[data-open="${win.id}"]`);
      // Returning focus after hiding a window must not move the user's chosen dock position.
      suppressDockReveal = true;
      (state === 'closed' && opener?.hasAttribute('data-running-only') ? $('#settings-toggle') : opener)?.focus({preventScroll:true});
      suppressDockReveal = false;
    }
    syncDock();
    win.dispatchEvent(new CustomEvent('blanktime:window-hidden', {detail:{state}}));
  }
  function maximize(win) {
    if (mobile() || document.fullscreenElement === win) return;
    settleMotion(win);
    win.classList.toggle('is-maximized');
    const button = $('[data-action="maximize"]', win);
    button.setAttribute('aria-label', win.classList.contains('is-maximized') ? '还原窗口' : '最大化');
    button.title = button.getAttribute('aria-label');
  }
  windows.forEach(win => {
    win.dataset.state = win.hidden ? 'closed' : 'open';
    win.addEventListener('pointerdown', () => focusWindow(win));
    $('[data-action="minimize"]', win).addEventListener('click', () => hideWindow(win, 'minimized'));
    $('[data-action="close"]', win).addEventListener('click', () => {
      hideWindow(win, 'closed');
    });
    $('[data-action="maximize"]', win).addEventListener('click', () => maximize(win));
    $('.titlebar', win).addEventListener('dblclick', event => {
      if (!event.target.closest('button')) maximize(win);
    });
    for (const direction of ['n','s','e','w','ne','nw','se','sw']) {
      const handle = document.createElement('div');
      handle.className = `resize-handle resize-${direction}`;
      handle.dataset.resize = direction;
      handle.setAttribute('aria-hidden', 'true');
      win.append(handle);
    }
    win.addEventListener('pointerdown', event => {
      const resize = event.target.closest('[data-resize]');
      const title = event.target.closest('.titlebar');
      if (windowClose.has(win) || windowLaunch.has(win) || windowMotion.has(win) || mobile() || document.fullscreenElement === win || win.classList.contains('is-maximized') || event.button !== 0 || (!resize && !title) || event.target.closest('button')) return;
      event.preventDefault();
      const start = win.getBoundingClientRect();
      const windowStyle = getComputedStyle(win);
      const minWidth = parseFloat(windowStyle.minWidth) || 380;
      const minHeight = parseFloat(windowStyle.minHeight) || 320;
      const x = event.clientX, y = event.clientY, dir = resize?.dataset.resize;
      const target = resize || title;
      target.setPointerCapture(event.pointerId);
      const move = e => {
        const dx = e.clientX - x, dy = e.clientY - y;
        const maxRight = innerWidth - 8, maxBottom = innerHeight - 8;
        let left = start.left, top = start.top, width = start.width, height = start.height;
        if (!dir) {
          left = Math.max(70, Math.min(maxRight - width, start.left + dx));
          top = Math.max(8, Math.min(maxBottom - 45, start.top + dy));
        } else {
          if (dir.includes('e')) width = Math.max(minWidth, Math.min(maxRight - left, start.width + dx));
          if (dir.includes('s')) height = Math.max(minHeight, Math.min(maxBottom - top, start.height + dy));
          if (dir.includes('w')) { left = Math.max(70, Math.min(start.right - minWidth, start.left + dx)); width = start.right - left; }
          if (dir.includes('n')) { top = Math.max(8, Math.min(start.bottom - minHeight, start.top + dy)); height = start.bottom - top; }
        }
        Object.assign(win.style, {left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`});
      };
      const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('lostpointercapture', end); };
      target.addEventListener('pointermove', move);
      target.addEventListener('lostpointercapture', end);
    });
  });
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const win = document.getElementById(button.dataset.open);
    openWindow(win);
  }));
  const filesWindow = $('#files'), desktopFiles = $('#desktop-files');
  desktopFiles.addEventListener('click', () => openWindow(filesWindow));
  $('#welcome-start-reading').addEventListener('click', () => {
    if (window.blanktimeFiles?.openPath(window.blanktimeFS.home + '/Documents/Posts')) {
      const sort = $('#files-sort'); sort.value = 'newest'; sort.dispatchEvent(new Event('change'));
    } else openWindow($('#browser'));
  });
  $('.desktop-toggle').addEventListener('click', () => {
    const visible = windows.filter(win => win.dataset.state === 'open');
    if (visible.length) {
      desktopRestore = visible.sort((a,b) => Number(a.style.zIndex)-Number(b.style.zIndex));
      visible.forEach(win => hideWindow(win, 'minimized'));
    } else desktopRestore.forEach(win => openWindow(win, false));
  });
  addEventListener('resize', () => {
    windows.forEach(win => settleMotion(win));
    updateDockOverflow(true);
    if (mobile()) return;
    windows.forEach(win => {
      if (document.fullscreenElement === win || !win.style.width || win.classList.contains('is-maximized')) return;
      const rect = win.getBoundingClientRect();
      const width = Math.min(rect.width, innerWidth - 88), height = Math.min(rect.height, innerHeight - 20);
      Object.assign(win.style, {width: `${width}px`,height:`${height}px`,left:`${Math.max(76, Math.min(rect.left, innerWidth-width-8))}px`,top:`${Math.max(8, Math.min(rect.top,innerHeight-height-8))}px`});
    });
  });
  function clock() { $('#clock').textContent = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()); }
  clock(); setInterval(clock, 30000);
  window.blanktimeDesktop = {
    openWindow, closeWindow: win => hideWindow(win, 'closed'),
    settleWindowMotion: settleMotion,
    selectFile: row => window.blanktimeFiles?.selectFile(row)
  };
  const initialArticle = document.getElementById('article-source')?.content.querySelector('[data-article]');
  if (initialArticle || welcomeDismissed) { welcome.hidden = true; welcome.dataset.state = 'closed'; syncDock(); }
  else openWindow(welcome, false);
})();
