(function (root) {
  'use strict';
  class Minesweeper {
    constructor(rows, cols, mines, random = Math.random) {
      if (![rows, cols, mines].every(Number.isInteger) || rows < 4 || cols < 4 || mines < 1 || mines > rows * cols - 9) {
        throw new RangeError('Invalid board dimensions or mine count');
      }
      Object.assign(this, { rows, cols, mines, random, status: 'ready', flags: 0, opened: 0 });
      this.cells = Array.from({ length: rows * cols }, () => ({ mine: false, open: false, flag: false, count: 0 }));
      this.exploded = -1;
    }
    neighbors(index) {
      const row = Math.floor(index / this.cols), col = index % this.cols, result = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr, c = col + dc;
        if ((dr || dc) && r >= 0 && r < this.rows && c >= 0 && c < this.cols) result.push(r * this.cols + c);
      }
      return result;
    }
    seed(first) {
      const safe = new Set([first, ...this.neighbors(first)]);
      const pool = this.cells.map((_, i) => i).filter(i => !safe.has(i));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.slice(0, this.mines).forEach(i => { this.cells[i].mine = true; });
      this.cells.forEach((cell, i) => { cell.count = this.neighbors(i).filter(n => this.cells[n].mine).length; });
      this.status = 'playing';
    }
    toggleFlag(index) {
      const cell = this.cells[index];
      if (!cell || cell.open || ['won', 'lost'].includes(this.status)) return;
      if (!cell.flag && this.flags >= this.mines) return;
      cell.flag = !cell.flag;
      this.flags += cell.flag ? 1 : -1;
    }
    reveal(index) {
      const cell = this.cells[index];
      if (!cell || cell.flag || ['won', 'lost'].includes(this.status)) return;
      if (this.status === 'ready') this.seed(index);
      if (cell.open) {
        const around = this.neighbors(index);
        if (cell.count > 0 && around.filter(n => this.cells[n].flag).length === cell.count) {
          for (const n of around) if (!this.cells[n].open && !this.cells[n].flag) this.expand(n);
        }
      } else this.expand(index);
      if (this.status === 'playing' && this.opened === this.cells.length - this.mines) {
        this.status = 'won';
        this.cells.forEach(c => { if (c.mine) c.flag = true; });
        this.flags = this.mines;
      }
    }
    expand(index) {
      const queue = [index];
      while (queue.length && this.status === 'playing') {
        const i = queue.pop(), cell = this.cells[i];
        if (cell.open || cell.flag) continue;
        cell.open = true;
        if (cell.mine) { this.status = 'lost'; this.exploded = i; return; }
        this.opened++;
        if (!cell.count) queue.push(...this.neighbors(i).filter(n => !this.cells[n].open));
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Minesweeper;
  else root.BlanktimeMinesweeperEngine = Minesweeper;
})(globalThis);
