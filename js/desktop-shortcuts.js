(() => {
  'use strict';
  const desktop = document.querySelector('.desktop');
  const icons = [...document.querySelectorAll('.desktop > [data-shortcut]')];
  if (!desktop || !icons.length) return;
  function arrange() {
    // Mobile keeps its two-column, row-first layout through separate CSS variables.
    if (matchMedia('(max-width: 760px)').matches) return;
    const style = getComputedStyle(desktop);
    const top = parseFloat(style.getPropertyValue('--shortcut-top')) || 51;
    const step = parseFloat(style.getPropertyValue('--shortcut-step')) || 104;
    const bottom = parseFloat(style.getPropertyValue('--shortcut-bottom')) || 24;
    const height = Math.max(88, ...icons.map(icon => icon.offsetHeight));
    const rows = Math.max(1, Math.floor((window.innerHeight - top - bottom - height) / step) + 1);
    icons.forEach((icon, index) => {
      icon.style.setProperty('--shortcut-col', Math.floor(index / rows));
      icon.style.setProperty('--shortcut-row', index % rows);
    });
  }
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(arrange);
  });
  arrange();
  document.fonts?.ready.then(arrange);
})();
