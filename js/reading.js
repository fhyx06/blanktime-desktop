(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  function toast(message) {
    const el = $('#announcement'); el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 5000);
  }
  async function copyCode(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    // HTTP LAN previews have no Clipboard API; retain a user-gesture fallback.
    const previous = document.activeElement;
    const selection = document.getSelection();
    const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(field);
    try {
      field.focus({preventScroll: true}); field.select();
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      field.remove(); previous?.focus({preventScroll: true});
      if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
    }
  }
  function setupCodeBlocks(article, prefix = "", onChange = () => {}) {
    article.querySelectorAll('.post-content pre').forEach((original, index) => {
      if (original.closest('.code-block')) return;
      const source = original.querySelector('code') || original;
      const code = document.createElement('code');
      code.className = source.className;
      code.innerHTML = source.innerHTML;
      code.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
      const text = code.textContent;
      const lines = text.replace(/\n$/, '').split('\n').length;
      const language = [...source.classList].find(name => name !== 'hljs')?.replace(/^language-/, '') || 'text';
      const block = document.createElement('div'); block.className = 'code-block';
      const header = document.createElement('div'); header.className = 'code-block-header';
      const dots = document.createElement('span'); dots.className = 'code-traffic-lights'; dots.setAttribute('aria-hidden','true'); dots.innerHTML = '<i></i><i></i><i></i>';
      const label = document.createElement('span'); label.className = 'code-language'; label.textContent = language;
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'code-copy'; copy.textContent = '复制代码'; copy.setAttribute('aria-label', `复制第 ${index + 1} 个代码块`);
      copy.addEventListener('click', async () => {
        try { await copyCode(text); copy.textContent = '已复制'; toast('复制好了 :)'); }
        catch { copy.textContent = '复制失败'; toast('浏览器未允许复制，请选中代码手动复制 :('); }
        clearTimeout(copy.resetTimer); copy.resetTimer = setTimeout(() => copy.textContent = '复制代码', 2000);
      });
      const body = document.createElement('div'); body.className = 'code-block-body'; body.id = `${prefix}code-body-${index}`;
      const numbers = document.createElement('div'); numbers.className = 'code-line-numbers'; numbers.setAttribute('aria-hidden', 'true'); numbers.textContent = Array.from({length:lines}, (_, i) => i+1).join('\n');
      const pre = document.createElement('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', `${language} 代码，可横向滚动`); pre.append(code); body.append(numbers, pre);
      const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'code-collapse'; collapse.setAttribute('aria-expanded','true'); collapse.setAttribute('aria-controls', body.id); collapse.setAttribute('aria-label','折叠代码');
      collapse.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m7 9 3 3 3-3"/></svg>';
      collapse.addEventListener('click', () => {
        body.hidden = !body.hidden;
        collapse.setAttribute('aria-expanded', String(!body.hidden)); collapse.setAttribute('aria-label', body.hidden ? '展开代码' : '折叠代码');
        onChange();
      });
      header.append(dots, label, copy, collapse); block.append(header, body);
      (original.closest('figure.highlight') || original).replaceWith(block);
      if (language.toLowerCase() === 'mermaid') window.blanktimeMermaid.setup(block, text, onChange);
    });
  }
  window.blanktimeReading = {setupCodeBlocks};
})();
