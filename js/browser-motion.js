(() => {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rectOf = element => {
    const r = element.getBoundingClientRect();
    return {left:r.left, top:r.top, width:r.width, height:r.height, right:r.left+r.width, bottom:r.top+r.height};
  };
  const intersect = (...rects) => {
    const left = Math.max(...rects.map(r => r.left)), top = Math.max(...rects.map(r => r.top));
    const right = Math.min(...rects.map(r => r.right)), bottom = Math.min(...rects.map(r => r.bottom));
    return {left, top, right, bottom, width:Math.max(0,right-left), height:Math.max(0,bottom-top)};
  };
  function coverSnapshot(source, width) {
    if (!source) return null;
    const cover = document.createElement('div'); cover.className = 'browser-cover';
    const image = source.querySelector('img');
    if (image && !image.hidden && image.complete && image.naturalWidth && image.naturalHeight) {
      // Copy decoded pixels only. Assigning an image URL here would start another request.
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(800, Math.ceil(width * Math.min(devicePixelRatio || 1, 2)));
        canvas.height = Math.round(canvas.width / 2.25);
        const context = canvas.getContext('2d');
        if (context) {
          const ratio = canvas.width / canvas.height;
          const sw = Math.min(image.naturalWidth, image.naturalHeight * ratio), sh = sw / ratio;
          context.drawImage(image, (image.naturalWidth-sw)/2, (image.naturalHeight-sh)/2, sw, sh, 0, 0, canvas.width, canvas.height);
          cover.append(canvas); return cover;
        }
      } catch { /* Keep a paper cover if a canvas is unavailable. */ }
    }
    const fallback = document.createElement('span');
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const symbol = document.createElementNS('http://www.w3.org/2000/svg','use');
    symbol.setAttribute('href','#i-book'); icon.append(symbol); fallback.append(icon); cover.append(fallback);
    return cover;
  }
  function paper({source, box, title, excerpt, meta, article}) {
    const card = document.createElement('div');
    card.className = 'browser-card browser-flight-card';
    if (article) card.classList.add('browser-flight-article');
    Object.assign(card.style, {left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    const cover = coverSnapshot(source?.querySelector(article ? '.article-cover' : '.browser-cover'), box.width);
    if (cover) card.append(cover);
    const text = document.createElement('div'); text.className = 'browser-card-text';
    const heading = document.createElement('h2'); heading.textContent = title;
    const cardHeading = document.createElement('div'); cardHeading.className = 'browser-card-heading';
    cardHeading.append(heading);
    const pin = !article && source?.querySelector('.browser-pin');
    if (pin) cardHeading.append(pin.cloneNode(true));
    const summary = document.createElement('p'); summary.textContent = excerpt;
    const footer = document.createElement('footer');
    const label = document.createElement('span'); label.textContent = meta;
    const action = document.createElement('span'); action.textContent = article ? 'BLANKTIME / NOTES' : '阅读全文 →';
    footer.append(label, action); text.append(cardHeading, summary, footer); card.append(text);
    return card;
  }
  function create(win, {closing = false, duration = closing ? 460 : 700, from = null} = {}) {
    if (!win || typeof win.animate !== 'function') return null;
    const bounds = rectOf(win), pages = win.querySelector('.browser-pages');
    const page = win.querySelector('.browser-page:not([hidden])');
    if (!bounds.width || !bounds.height || !pages || !page) return null;
    const compact = matchMedia('(max-width: 760px)').matches;
    const viewport = {left:0,top:0,right:innerWidth,bottom:innerHeight};
    const area = intersect(bounds, rectOf(pages), rectOf(page), viewport);
    const home = page.matches('.browser-home'), entries = [];
    const transformText = from?.transform?.replace(/\s+/g,'') || '';
    const interrupted = closing && !['','none','scale(1)','matrix(1,0,0,1,0,0)','matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)'].includes(transformText);
    if (home && !interrupted) {
      for (const source of page.querySelectorAll('.browser-card:not([hidden])')) {
        const box = rectOf(source), shown = intersect(box, area);
        if (!box.width || shown.width < Math.min(80,box.width*.35) || shown.height < Math.min(80,box.height*.35)) continue;
        entries.push({source, box, shown, title:source.querySelector('h2')?.textContent || '',
          excerpt:source.querySelector('p')?.textContent || '', meta:source.querySelector('footer span')?.textContent || ''});
        if (entries.length === (compact ? 2 : 3)) break;
      }
    } else if (!home && !interrupted && area.width > 40 && area.height > 60) {
      const source = page.querySelector('[data-article]');
      const width = Math.min(area.width-24, compact ? 360 : 540), height = Math.min(area.height-24, source?.querySelector('.article-cover') ? 350 : 240);
      const box = {left:area.left+(area.width-width)/2,top:area.top+Math.max(12,(area.height-height)*.22),width,height};
      box.right=box.left+width;box.bottom=box.top+height;
      entries.push({source,box,shown:box,article:true,
        title:source?.querySelector('.post-title')?.textContent || win.querySelector('.browser-tab[aria-selected="true"]')?.textContent || '',
        excerpt:source?.querySelector('.post-content p')?.textContent?.slice(0,180) || '',
        meta:source?.querySelector('.article-meta time')?.textContent || ''});
    }
    const scene = document.createElement('div');
    scene.className = `browser-flight${closing ? ' browser-flight-closing' : ''}`;
    scene.dataset.view = home ? 'home' : 'article';
    scene.setAttribute('aria-hidden','true'); scene.inert = true;
    scene.style.zIndex = win.style.zIndex;
    const style = getComputedStyle(win);
    for (const name of ['--browser-paper','--browser-bg','--browser-muted','--browser-border','--browser-text','--accent']) {
      scene.style.setProperty(name, style.getPropertyValue(name));
    }
    if (win.dataset.theme) scene.dataset.theme = win.dataset.theme;
    win.after(scene);
    // Give the reveal its own time budget instead of squeezing it into the flight's last frames.
    const revealDuration = compact ? 200 : 280;
    const totalDuration = closing ? duration : duration + revealDuration;
    // An empty or entirely scrolled-out list only reveals the shell; never invent posts.
    const options = {duration:entries.length ? totalDuration : Math.min(duration, closing ? 220 : 280),easing:'linear',fill:'both'};
    const animations = [];
    const add = (element, frames, extra = {}) => {
      if (!element) return null;
      const animation = element.animate(frames,{...options,...extra}); animations.push(animation); return animation;
    };
    const ease = 'cubic-bezier(.2, .8, .2, 1)';
    const fadeEase = 'cubic-bezier(.4, 0, .6, 1)';
    // Land every card before revealing the stationary window beneath it.
    const revealAt = duration * .78 / options.duration;
    const revealedAt = (duration * .78 + revealDuration) / options.duration;
    const flightScale = revealAt / (.92 + Math.max(0, entries.length - 1) * .015);
    const baseTransform = from?.transform && from.transform !== 'none' ? from.transform : 'scale(1)';
    const departure = interrupted ? `${baseTransform} scale(.94)` : 'scale(.94)';
    const animation = add(win, closing ? [
      {opacity:from?.opacity ?? 1,transform:baseTransform,offset:0,easing:fadeEase},
      {opacity:0,transform:departure,offset:.8},{opacity:0,transform:departure,offset:1}
    ] : entries.length ? [
      {opacity:0,transform:'scale(1)',offset:0},
      {opacity:0,transform:'scale(1)',offset:revealAt,easing:fadeEase},
      {opacity:1,transform:'scale(1)',offset:revealedAt},{opacity:1,transform:'scale(1)',offset:1}
    ] : [
      {opacity:0,transform:'scale(.98)',offset:0,easing:fadeEase},
      {opacity:1,transform:'scale(1)',offset:1}
    ],{id:closing ? 'browser-close' : 'browser-launch'});
    entries.forEach((entry,index) => {
      const ghost = paper(entry); scene.append(ghost);
      const {box,shown} = entry, cx=box.left+box.width/2, cy=box.top+box.height/2;
      const scale = compact ? .7 : .58;
      const edge = compact ? 40 : 65;
      const destinations = [
        {x:bounds.left-edge,y:bounds.top+bounds.height*.2,angle:-13},
        {x:bounds.right+edge,y:bounds.top+bounds.height*.36,angle:12},
        {x:bounds.left+bounds.width*.67,y:bounds.bottom+edge,angle:8}
      ];
      const location = destinations[index];
      // Keep a substantial piece visible even when the browser occupies the whole screen.
      const x = clamp(location.x,box.width*scale*.25,innerWidth-box.width*scale*.25)-cx;
      const y = clamp(location.y,box.height*scale*.25,innerHeight-box.height*scale*.25)-cy;
      const tilt = compact ? location.angle*.6 : location.angle;
      const transform = (dx,dy,angle,s) => `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${s})`;
      const outside = transform(x,y,tilt,scale);
      const returning = transform(x*.55,y*.3-(compact?12:32),tilt*.48,.84);
      const escaped = transform(x+(x<0?-18:18),y-10,tilt*1.12,scale*.96);
      const final = 'translate(0px, 0px) rotate(0deg) scale(1)';
      const clip = `inset(${Math.max(0,shown.top-box.top)}px ${Math.max(0,box.right-shown.right)}px ${Math.max(0,box.bottom-shown.bottom)}px ${Math.max(0,shown.left-box.left)}px round 12px)`;
      const lag = index*.055, land = .78+lag;
      add(ghost, closing ? [
        {opacity:0,transform:final,clipPath:clip,offset:0},
        {opacity:1,transform:final,clipPath:clip,offset:.08+lag,easing:'cubic-bezier(.4, 0, .7, .4)'},
        {opacity:1,transform:returning,clipPath:'inset(0px round 12px)',offset:.52+lag,easing:'ease-out'},
        {opacity:.9,transform:outside,clipPath:'inset(0px round 12px)',offset:.8+lag},
        {opacity:0,transform:escaped,clipPath:'inset(0px round 12px)',offset:1}
      ] : [
        {opacity:0,transform:outside,clipPath:'inset(0px round 12px)',offset:0},
        {opacity:1,transform:outside,clipPath:'inset(0px round 12px)',offset:(.12+lag)*flightScale},
        {opacity:1,transform:entries.length>1 && index===entries.length-1 ? escaped : outside,clipPath:'inset(0px round 12px)',offset:(.24+lag)*flightScale,easing:ease},
        {opacity:1,transform:returning,clipPath:'inset(0px round 12px)',offset:(.5+lag)*flightScale,easing:ease},
        {opacity:1,transform:transform(x<0?3:-3,2,0,1),clipPath:clip,offset:land*flightScale,easing:'ease-out'},
        {opacity:1,transform:final,clipPath:clip,offset:(.92+index*.015)*flightScale},
        {opacity:1,transform:final,clipPath:clip,offset:revealedAt,easing:fadeEase},
        {opacity:0,transform:final,clipPath:clip,offset:1}
      ],{id:'browser-flight-card'});
      if (home && closing) add(entry.source, [
        {opacity:1,offset:0},{opacity:0,offset:.08+lag},{opacity:0,offset:1}
      ]);
    });
    // Share a clock so building the later cards cannot delay their landing past the reveal.
    const startTime = document.timeline?.currentTime;
    if (typeof startTime === 'number') animations.forEach(item => { item.startTime = startTime; });
    return {animation,animations,scene};
  }
  window.blanktimeBrowserMotion = {create};
})();
