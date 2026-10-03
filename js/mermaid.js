(() => {
  'use strict';
  const moduleURL = new URL('../vendor/mermaid/mermaid.esm.min.mjs', document.currentScript.src).href;
  let library, queue = Promise.resolve(), sequence = 0;
  const states = new WeakMap();
  function load() {
    return library ||= import(moduleURL).then(module => module.default).catch(error => { library = null; throw error; });
  }
  function render(block) {
    const state = states.get(block);
    const theme = block.closest('[data-theme]')?.dataset.theme === 'dark' ? 'dark' : 'default';
    if (!state || state.theme === theme) return;
    state.theme = theme;
    const revision = ++state.revision;
    queue = queue.then(async () => {
      if (!block.isConnected || state.revision !== revision) return;
      let stage;
      try {
        const mermaid = await load();
        await document.fonts.ready;
        if (!block.isConnected || state.revision !== revision) return;
        mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme,
          fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', suppressErrorRendering: true});
        // Measure in a visible offscreen container, even inside a hidden tab/fold.
        stage = document.createElement('div'); stage.className = 'mermaid-stage mermaid-output';
        document.body.append(stage);
        const {svg} = await mermaid.render('blanktime-diagram-' + (++sequence), state.text, stage);
        if (!block.isConnected || state.revision !== revision) return;
        state.output.innerHTML = svg;
        state.output.setAttribute('aria-busy', 'false');
        state.error.hidden = true;
      } catch {
        if (!block.isConnected || state.revision !== revision) return;
        state.output.textContent = '';
        state.output.setAttribute('aria-busy', 'false');
        state.error.hidden = false;
        state.source.hidden = false;
        state.toggle.textContent = '隐藏源码'; state.toggle.setAttribute('aria-expanded', 'true');
      } finally { stage?.remove(); state.onChange(); }
    });
  }
  function setup(block, text, onChange) {
    block.classList.add('mermaid-block');
    const body = block.querySelector('.code-block-body'); body.classList.add('mermaid-body');
    const source = document.createElement('div'); source.className = 'mermaid-source';
    source.append(...body.childNodes); source.hidden = true; source.id = body.id + '-source';
    const output = document.createElement('div'); output.className = 'mermaid-output';
    output.textContent = '正在绘制图表…'; output.setAttribute('aria-busy', 'true');
    const error = document.createElement('div'); error.className = 'mermaid-error'; error.hidden = true;
    const message = document.createElement('span'); message.textContent = '图表未能绘制，请检查 Mermaid 语法或重试。';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
    retry.addEventListener('click', () => { states.get(block).theme = null; render(block); });
    error.append(message, retry); body.append(output, error, source);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'code-copy';
    toggle.textContent = '查看源码'; toggle.setAttribute('aria-controls', source.id); toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      source.hidden = !source.hidden; toggle.textContent = source.hidden ? '查看源码' : '隐藏源码';
      toggle.setAttribute('aria-expanded', String(!source.hidden)); onChange();
    });
    block.querySelector('.code-collapse').before(toggle);
    states.set(block, {text, source, output, error, toggle, onChange, theme: null, revision: 0});
    render(block);
  }
  const browser = document.getElementById('browser');
  if (browser) new MutationObserver(() => browser.querySelectorAll('.mermaid-block').forEach(render))
    .observe(browser, {attributes: true, attributeFilter: ['data-theme']});
  window.blanktimeMermaid = {setup};
})();
