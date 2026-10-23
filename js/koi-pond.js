/* Adapted from Koi Pond by Rezaye Rabbi (RzX), Copyright (c) 2026.
 * https://steamcommunity.com/sharedfiles/filedetails/?id=3692215641
 * https://github.com/rzrabbi/interactive-koi-pond
 * MIT License: /vendor/koi-pond/LICENSE
 */
(() => {
  'use strict';
  const SIZES = [12, 14, 15, 14, 12, 9, 6, 4, 3, 2, 1, 1];
  const COLORS = ['#ff5e00', '#e6e6e6', '#ffd700', '#ff2a00'];
  const clamp = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('当前浏览器无法绘制锦鲤壁纸。');
    let fps = clamp(options.fps, 30, 10, 120);
    const count = Math.round(clamp(options.fishCount, 12, 1, 24));
    let fishSize = clamp(options.fishSize, 1, 0.25, 3);
    let fishSpeed = clamp(options.fishSpeed, 1, 0.25, 3);
    let nativeResolution = options.nativeResolution === true;
    let maxDpr = clamp(options.maxDpr, 1.25, 0.5, 2);
    let maxPixels = clamp(options.maxPixels, nativeResolution ? 16000000 : 4000000, 100000, nativeResolution ? 16000000 : 6000000);
    let shadows = options.shadows !== false, caustics = options.caustics !== false;
    let interval = 1000 / fps;
    const fish = [], foods = [], ripples = [];
    const mouse = {x:0, y:0, active:false};
    let width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
    let running = false, destroyed = false, raf = null, generation = 0;
    let causticTime = 0, lastRipple = -Infinity;

    function addRipple(x, y, power) {
      if (ripples.length >= 24) ripples.shift();
      ripples.push({x, y, power, radius:1, life:1});
    }

    class Koi {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        const angle = Math.random() * Math.PI * 2;
        this.baseSpeed = 0.4 + Math.random() * 0.4;
        this.vx = Math.cos(angle) * this.baseSpeed * fishSpeed;
        this.vy = Math.sin(angle) * this.baseSpeed * fishSpeed;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.spotColor = Math.random() > 0.5 ? '#222' : '#fff';
        this.segments = SIZES.map((_, index) => ({
          x:this.x - Math.cos(angle) * index * 5 * fishSize,
          y:this.y - Math.sin(angle) * index * 5 * fishSize
        }));
        this.fedTimer = 0;
      }
      update(dt) {
        const step = dt * 60, speed = this.baseSpeed * 1.5 * fishSpeed;
        this.fedTimer = Math.max(0, this.fedTimer - step);
        let target = null, nearest = Infinity, ax = 0, ay = 0, afraid = false;
        for (const food of foods) {
          const distance = distanceSq(this, food);
          if (distance < nearest) { nearest = distance; target = food; }
        }
        if (target && nearest < 90000) {
          const dx = target.x - this.x, dy = target.y - this.y, length = Math.sqrt(nearest);
          if (length > 0) {
            ax = (dx / length * speed * 2 - this.vx) * 0.06;
            ay = (dy / length * speed * 2 - this.vy) * 0.06;
          }
          if (nearest < 400) {
            foods.splice(foods.indexOf(target), 1);
            addRipple(this.x, this.y, 0.8);
            this.fedTimer = 180;
          }
        } else {
          if (!this.fedTimer && mouse.active) {
            const distance = distanceSq(this, mouse);
            if (distance > 0 && distance < 40000) {
              const length = Math.sqrt(distance);
              ax = ((this.x - mouse.x) / length * speed * 2.5 - this.vx) * 0.09;
              ay = ((this.y - mouse.y) / length * speed * 2.5 - this.vy) * 0.09;
              afraid = true;
            }
          }
          if (!afraid) {
            const angle = Math.atan2(this.vy, this.vx) + (Math.random() - 0.5) * 0.5 * step;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
          }
        }
        const margin = target && nearest < 90000 ? 0 : Math.min(100, width / 4, height / 4);
        if (this.x < margin) ax += 0.1;
        if (this.x > width - margin) ax -= 0.1;
        if (this.y < margin) ay += 0.1;
        if (this.y > height - margin) ay -= 0.1;
        this.vx += ax * step; this.vy += ay * step;
        const velocity = Math.hypot(this.vx, this.vy);
        const limit = speed * (target && nearest < 90000 ? 2 : afraid ? 2.5 : 1);
        if (velocity > limit) { this.vx *= limit / velocity; this.vy *= limit / velocity; }
        this.x = Math.min(width + 150, Math.max(-150, this.x + this.vx * step));
        this.y = Math.min(height + 150, Math.max(-150, this.y + this.vy * step));
        this.segments[0].x = this.x; this.segments[0].y = this.y;
        for (let i = 1; i < this.segments.length; i++) {
          const previous = this.segments[i - 1], current = this.segments[i];
          const dx = previous.x - current.x, dy = previous.y - current.y;
          const distance = Math.hypot(dx, dy);
          if (distance) { current.x = previous.x - dx / distance * 5 * fishSize; current.y = previous.y - dy / distance * 5 * fishSize; }
        }
      }
      draw() {
        const mid = this.segments[3], next = this.segments[4];
        const angle = Math.atan2(mid.y - next.y, mid.x - next.x);
        if (shadows) {
          ctx.shadowBlur = 12 * fishSize; ctx.shadowColor = 'rgba(0,0,0,.4)';
          ctx.shadowOffsetX = 10 * fishSize; ctx.shadowOffsetY = 15 * fishSize;
        }
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(mid.x, mid.y);
          ctx.lineTo(mid.x + Math.cos(angle + side * 1.5) * 30 * fishSize, mid.y + Math.sin(angle + side * 1.5) * 30 * fishSize);
          ctx.lineTo(mid.x + Math.cos(angle + side * 2.5) * 15 * fishSize, mid.y + Math.sin(angle + side * 2.5) * 15 * fishSize);
          ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        for (let i = 0; i < this.segments.length - 1; i++) {
          const a = this.segments[i], b = this.segments[i + 1];
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.lineWidth = SIZES[i] * 2 * fishSize;
          ctx.strokeStyle = i === 4 || i === 7 ? this.spotColor : this.color;
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(this.x, this.y, SIZES[0] * 0.8 * fishSize, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
        const tail = this.segments[11], before = this.segments[10];
        const tailAngle = Math.atan2(tail.y - before.y, tail.x - before.x);
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(tail.x + Math.cos(tailAngle + 0.5) * 15 * fishSize, tail.y + Math.sin(tailAngle + 0.5) * 15 * fishSize);
        ctx.lineTo(tail.x + Math.cos(tailAngle + Math.PI) * 5 * fishSize, tail.y + Math.sin(tailAngle + Math.PI) * 5 * fishSize);
        ctx.lineTo(tail.x + Math.cos(tailAngle - 0.5) * 15 * fishSize, tail.y + Math.sin(tailAngle - 0.5) * 15 * fishSize);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      }
    }

    function draw(dt) {
      ctx.fillStyle = '#0b3d4f'; ctx.fillRect(0, 0, width, height);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (caustics) {
        causticTime += dt * 0.45;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,255,255,.03)';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(Math.sin(causticTime + i) * 200 + width / 2,
            Math.cos(causticTime - i) * 200 + height / 2, 400 + Math.sin(causticTime) * 100, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i]; food.life -= dt;
        if (food.life <= 0) { foods.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(food.x, food.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f4a460'; ctx.fill();
      }
      for (const koi of fish) { if (dt) koi.update(dt); koi.draw(); }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        ripple.radius += ripple.power * dt * 60; ripple.life -= dt * 0.6;
        if (ripple.life <= 0) { ripples.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${ripple.life * 0.3})`;
        ctx.lineWidth = 2 * ripple.life; ctx.stroke();
      }
    }
    function resize(nextWidth = innerWidth, nextHeight = innerHeight) {
      if (destroyed) return;
      width = clamp(nextWidth, 1, 1, 20000); height = clamp(nextHeight, 1, 1, 20000);
      const ratio = Math.min(clamp(window.devicePixelRatio, 1, 0.1, 8), nativeResolution ? 4 : maxDpr, Math.sqrt(maxPixels / (width * height)));
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      for (const koi of fish) {
        const x = Math.min(width, Math.max(0, koi.x)), y = Math.min(height, Math.max(0, koi.y));
        const dx = x - koi.x, dy = y - koi.y;
        koi.x = x; koi.y = y;
        for (const segment of koi.segments) { segment.x += dx; segment.y += dy; }
      }
      draw(0);
    }
    function start() {
      if (running || destroyed) return;
      running = true;
      const token = ++generation;
      let previous = performance.now(), drawn = previous, accumulator = 0;
      const frame = now => {
        if (!running || destroyed || token !== generation) return;
        const elapsed = Math.max(0, now - previous); previous = now;
        accumulator += elapsed;
        // Retain the fractional frame remainder rather than rounding a 60 Hz screen down to 20 fps.
        if (accumulator + 0.05 >= interval) {
          draw(Math.min(0.1, Math.max(0, now - drawn) / 1000));
          drawn = now;
          accumulator = Math.max(0, accumulator - Math.floor((accumulator + 0.05) / interval) * interval);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      running = false; generation++;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null; mouse.active = false; lastRipple = -Infinity;
    }
    function updateOptions(next = {}) {
      if (destroyed || !next || typeof next !== 'object') return;
      fps = clamp(next.fps ?? fps, fps, 10, 120);
      interval = 1000 / fps;
      const nextSize = clamp(next.fishSize ?? fishSize, fishSize, 0.25, 3);
      const nextSpeed = clamp(next.fishSpeed ?? fishSpeed, fishSpeed, 0.25, 3);
      const nextNative = next.nativeResolution === undefined ? nativeResolution : next.nativeResolution === true;
      const nextDpr = clamp(next.maxDpr ?? maxDpr, maxDpr, 0.5, 2);
      const pixelFallback = nextNative !== nativeResolution ? (nextNative ? 16000000 : 4000000) : maxPixels;
      const nextPixels = clamp(next.maxPixels ?? pixelFallback, pixelFallback, 100000, nextNative ? 16000000 : 6000000);
      const nextCount = Math.round(clamp(next.fishCount ?? fish.length, fish.length, 1, 24));
      const nextShadows = next.shadows === undefined ? shadows : next.shadows !== false;
      const nextCaustics = next.caustics === undefined ? caustics : next.caustics !== false;
      const resizeNeeded = nextDpr !== maxDpr || nextPixels !== maxPixels || nextNative !== nativeResolution;
      const redraw = nextCount !== fish.length || nextShadows !== shadows || nextCaustics !== caustics || nextSize !== fishSize;
      // Scale around each head so the entire articulated fish keeps its position and orientation.
      for (const koi of fish) {
        if (nextSize !== fishSize) for (const segment of koi.segments) {
          segment.x = koi.x + (segment.x - koi.x) * nextSize / fishSize;
          segment.y = koi.y + (segment.y - koi.y) * nextSize / fishSize;
        }
        if (nextSpeed !== fishSpeed) { koi.vx *= nextSpeed / fishSpeed; koi.vy *= nextSpeed / fishSpeed; }
      }
      fishSize = nextSize; fishSpeed = nextSpeed; nativeResolution = nextNative;
      maxDpr = nextDpr; maxPixels = nextPixels; shadows = nextShadows; caustics = nextCaustics;
      // Retain existing fish and their positions when changing the population or quality.
      while (fish.length < nextCount) fish.push(new Koi());
      if (fish.length > nextCount) fish.length = nextCount;
      if (resizeNeeded) resize(width, height);
      else if (redraw) draw(0);
    }
    function destroy() {
      if (destroyed) return;
      pause(); destroyed = true;
      fish.length = foods.length = ripples.length = 0;
      canvas.width = canvas.height = 1;
    }
    function inBounds(x, y) { return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= width && y <= height; }
    function pointerMove(x, y) {
      if (!running || destroyed || !inBounds(x, y)) return;
      mouse.x = x; mouse.y = y; mouse.active = true;
      const now = performance.now();
      if (now - lastRipple >= 120) { addRipple(x, y, 0.5); lastRipple = now; }
    }
    function pointerLeave() { mouse.active = false; }
    function feed(x, y) {
      if (!running || destroyed || !inBounds(x, y)) return;
      if (foods.length >= 12) foods.shift();
      foods.push({x, y, life:1000 / 60});
      addRipple(x, y, 1.5);
    }
    for (let i = 0; i < count; i++) fish.push(new Koi());
    resize(width, height);
    return {start, pause, resize, destroy, pointerMove, pointerLeave, feed, updateOptions};
  }
  window.blanktimeKoi = {create};
})();
