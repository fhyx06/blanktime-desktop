(function (root) {
  'use strict';
  const levels = { easy: [9, 9, 10], medium: [16, 16, 40], hard: [16, 30, 99] };
  const mounted = new WeakMap();
  function mount(host) {
    mounted.get(host)?.destroy();
    host.classList.add('ms-game');
    host.innerHTML = `
      <section class="ms-controls" aria-label="扫雷设置与游戏数据">
        <label>难度 <select data-level><option value="easy">初级 · 9 × 9</option><option value="medium">中级 · 16 × 16</option><option value="hard">高级 · 30 × 16</option><option value="screen">全屏 · 自适应</option></select></label>
        <div class="ms-stats" role="group" aria-label="游戏数据"><div><span>剩余雷数</span><strong data-mines>010</strong></div><div><span>用时 / 秒</span><strong data-time>000</strong></div><div><span>最佳 / 秒</span><strong data-best>—</strong></div></div>
        <div class="ms-actions"><button type="button" data-flag aria-pressed="false">⚑ 插旗模式</button><button type="button" data-reset class="ms-primary">重新开始 ↻</button></div>
      </section>
      <div class="ms-playfield"><div class="ms-board" data-board role="group" aria-label="扫雷棋盘"></div></div>
      <div class="ms-status" data-status role="status" aria-live="polite"></div>
      <footer class="ms-help"><span>点击翻开 · 右键插旗 · 点击已打开的数字快速展开</span><span>手机可切换插旗模式；键盘用方向键移动、Enter 翻开、F 插旗。</span><span>首次点击及周围八格安全。数字表示周围八格中的地雷数。</span></footer>`;
    const find = selector => host.querySelector(selector);
    const board = find('[data-board]'), level = find('[data-level]');
    const events = new AbortController();
    let game, buttons, flagMode = false, start = 0, elapsed = 0, timer = null, finished = false;
    let hinted = [], hintTimer = null;
    let recordKey = level.value;
    let bests = {};
    try { bests = JSON.parse(localStorage.getItem('blanktime:minesweeper:bests:v1')) || {}; } catch (_) { /* Storage is optional. */ }
    if (typeof bests !== 'object' || Array.isArray(bests)) bests = {};
    const format = n => String(n).padStart(3, '0');
    function tick() {
      if (start) elapsed = Math.floor((performance.now() - start) / 1000);
      find('[data-time]').textContent = format(elapsed);
    }
    function clearHint() {
      clearTimeout(hintTimer);
      hintTimer = null;
      hinted.forEach(button => button.classList.remove('is-hint'));
      hinted = [];
    }
    function render() {
      clearHint();
      const ended = ['won', 'lost'].includes(game.status);
      buttons.forEach((button, i) => {
        const c = game.cells[i], wrong = ended && c.flag && !c.mine;
        const showMine = ended && c.mine;
        button.className = 'ms-cell' + (c.open ? ' is-open' : '') + (c.flag ? ' is-flag' : '') + (showMine ? ' is-mine' : '') + (i === game.exploded ? ' is-exploded' : '');
        button.dataset.number = c.count;
        button.textContent = wrong ? '×' : showMine ? (game.status === 'won' ? '⚑' : '✹') : c.flag ? '⚑' : c.open && c.count ? c.count : '';
        const description = wrong ? '错误旗帜' : showMine ? '地雷' : c.flag ? '已插旗' : c.open ? (c.count ? `附近 ${c.count} 颗雷` : '空白') : '未翻开';
        button.setAttribute('aria-label', `${Math.floor(i / game.cols) + 1} 行 ${i % game.cols + 1} 列，${description}`);
        button.setAttribute('aria-disabled', String(ended));
      });
      find('[data-mines]').textContent = format(game.mines - game.flags);
      find('[data-best]').textContent = Number.isFinite(bests[recordKey]) ? format(bests[recordKey]) : '—';
      find('[data-status]').textContent = game.status === 'ready' ? '准备好了，就从任意一格开始。' : game.status === 'won' ? `漂亮！用时 ${elapsed} 秒，成功排除所有地雷。` : game.status === 'lost' ? '碰到地雷了。休息一下，再来一局？' : flagMode ? '插旗模式：点击格子放置或取消旗帜。' : '慢慢来，让每一个数字给你线索。';
      host.dataset.state = game.status;
    }
    function act(i, flag = false) {
      const cell = game.cells[i];
      if (!flag && game.status === 'playing' && cell?.open && cell.count > 0) {
        const around = game.neighbors(i);
        const flags = around.filter(n => game.cells[n].flag).length;
        if (flags !== cell.count) {
          clearHint();
          hinted = around.filter(n => !game.cells[n].open && !game.cells[n].flag).map(n => buttons[n]);
          // Commit removal before restarting the animation on repeated clicks.
          void board.offsetWidth;
          hinted.forEach(button => button.classList.add('is-hint'));
          hintTimer = setTimeout(clearHint, 1000);
          find('[data-status]').textContent = `周围需要 ${cell.count} 面旗，当前 ${flags} 面。高亮格可插旗，请根据数字判断位置。`;
          return;
        }
      }
      if (flag) game.toggleFlag(i); else game.reveal(i);
      if (game.status !== 'ready' && !start) { start = performance.now(); timer = setInterval(tick, 250); }
      if (['won', 'lost'].includes(game.status) && !finished) {
        tick(); clearInterval(timer); timer = null; finished = true;
        if (game.status === 'won' && (!Number.isFinite(bests[recordKey]) || elapsed < bests[recordKey])) {
          bests[recordKey] = elapsed;
          try { localStorage.setItem('blanktime:minesweeper:bests:v1', JSON.stringify(bests)); } catch (_) { /* Keep playing without persistence. */ }
        }
      }
      render();
    }
    function screenLevel() {
      const field = find('.ms-playfield');
      const style = getComputedStyle(field);
      const boardStyle = getComputedStyle(board);
      const cellSize = matchMedia('(max-width: 560px)').matches ? 28 : 30;
      const gap = parseFloat(boardStyle.gap) || 3;
      const insetX = parseFloat(boardStyle.paddingLeft) + parseFloat(boardStyle.paddingRight);
      const insetY = parseFloat(boardStyle.paddingTop) + parseFloat(boardStyle.paddingBottom);
      const width = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const footerHeight = find('.ms-status').offsetHeight + find('.ms-help').offsetHeight;
      // Desktop windows give the playfield a bounded flex area; standalone pages fit the viewport.
      const height = host.classList.contains('ms-fill')
        ? field.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        : window.innerHeight - Math.max(0, host.getBoundingClientRect().top)
          - find('.ms-controls').offsetHeight - footerHeight - 26
          - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const cols = Math.max(4, Math.floor((width - insetX + gap) / (cellSize + gap)));
      const rows = Math.max(4, Math.floor((height - insetY + gap) / (cellSize + gap)));
      return [rows, cols, Math.max(1, Math.round(rows * cols * 99 / 480))];
    }
    function reset() {
      clearInterval(timer); timer = null; start = 0; elapsed = 0; finished = false;
      host.classList.toggle('ms-screen-wide', level.value === 'screen');
      // Measure with the normal status text so an earlier message does not change the board size.
      find('[data-status]').textContent = '准备好了，就从任意一格开始。';
      const dimensions = level.value === 'screen' ? screenLevel() : levels[level.value];
      game = new root.BlanktimeMinesweeperEngine(...dimensions);
      recordKey = level.value === 'screen' ? `screen:${dimensions.join('x')}` : level.value;
      level.querySelector('[value="screen"]').textContent = level.value === 'screen'
        ? `全屏 · ${game.cols} × ${game.rows}` : '全屏 · 自适应';
      board.style.setProperty('--ms-cols', game.cols);
      board.replaceChildren();
      buttons = game.cells.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.index = i; b.tabIndex = i === 0 ? 0 : -1;
        board.append(b); return b;
      });
      tick(); render();
    }
    function on(target, name, handler) { target.addEventListener(name, handler, { signal: events.signal }); }
    function cellFrom(event) { return event.target.closest('[data-index]'); }
    on(board, 'click', e => { const b = cellFrom(e); if (b) act(Number(b.dataset.index), flagMode); });
    on(board, 'contextmenu', e => { const b = cellFrom(e); if (b) { e.preventDefault(); act(Number(b.dataset.index), true); } });
    on(board, 'focusin', e => { const b = cellFrom(e); if (b) buttons.forEach(button => { button.tabIndex = button === b ? 0 : -1; }); });
    on(board, 'keydown', e => {
      const b = cellFrom(e); if (!b) return;
      const i = Number(b.dataset.index), row = Math.floor(i / game.cols), col = i % game.cols;
      const next = { ArrowLeft: row * game.cols + Math.max(0, col - 1), ArrowRight: row * game.cols + Math.min(game.cols - 1, col + 1), ArrowUp: Math.max(0, row - 1) * game.cols + col, ArrowDown: Math.min(game.rows - 1, row + 1) * game.cols + col }[e.key];
      if (next !== undefined) { e.preventDefault(); buttons[next].focus(); }
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); act(i, true); }
    });
    on(find('[data-flag]'), 'click', e => { flagMode = !flagMode; e.currentTarget.setAttribute('aria-pressed', String(flagMode)); render(); });
    on(find('[data-reset]'), 'click', reset);
    on(level, 'change', reset);
    reset();
    const api = { reset, destroy() { clearHint(); clearInterval(timer); events.abort(); host.replaceChildren(); host.classList.remove('ms-game', 'ms-screen-wide'); delete host.dataset.state; mounted.delete(host); } };
    mounted.set(host, api);
    return api;
  }
  root.BlanktimeMinesweeper = { mount };
})(globalThis);
