(() => {
  'use strict';
  const win = document.getElementById('minesweeper');
  const host = document.getElementById('minesweeper-game');
  if (!win || !host || !window.BlanktimeMinesweeper) return;
  let game = null;
  // Mount lazily so the board is measured inside a visible window and costs nothing until opened.
  win.addEventListener('blanktime:window-opened', () => {
    if (!game) game = window.BlanktimeMinesweeper.mount(host);
  });
  // Minimizing keeps the current round; closing ends it and releases timers and listeners.
  win.addEventListener('blanktime:window-hidden', event => {
    if (event.detail?.state !== 'closed' || !game) return;
    game.destroy();
    game = null;
  });
})();
