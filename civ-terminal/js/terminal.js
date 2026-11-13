// The terminal: DOM text output (selectable, readable by screen readers)
// and an input line with history, tab completion and a block cursor.

const SPEEDS = { instant: 0, normal: 16, slow: 45 };
const MAX_LINES = 1500;

export class Terminal {
  constructor({ out, line, input, mirror, ps1, captureClicks = true }) {
    this.out = out; this.line = line; this.input = input; this.mirror = mirror; this.ps1 = ps1;
    this.queue = []; this.timer = null; this.delay = SPEEDS.normal;
    this.history = []; this.hIndex = 0; this.draft = '';
    this.useHistory = false;
    this.onSubmit = () => {}; this.completer = null; this.idleWaiters = [];

    input.addEventListener('keydown', (e) => this.onKey(e));
    input.addEventListener('input', () => this.renderInput());
    for (const ev of ['keyup', 'click', 'select', 'focus']) input.addEventListener(ev, () => this.renderInput());
    input.addEventListener('focus', () => line.classList.remove('blurred'));
    input.addEventListener('blur', () => line.classList.add('blurred'));
    // On the start screen, clicking anywhere focuses the input (unless the
    // player is selecting text). The console drawer turns this off and only
    // reacts to clicks inside itself.
    this.onMouseUp = (e) => {
      if (e.target.closest('a, button')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (!input.disabled) input.focus({ preventScroll: true });
    };
    if (captureClicks) document.addEventListener('mouseup', this.onMouseUp);
    this.renderInput();
  }

  dispose() {
    this.flush();
    document.removeEventListener('mouseup', this.onMouseUp);
    this.disableInput();
  }

  setSpeed(name) { if (name in SPEEDS) this.delay = SPEEDS[name]; }

  // ---- output ----
  addLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'ln' + (cls ? ' ' + cls : '');
    div.textContent = text;
    this.out.appendChild(div);
    while (this.out.childElementCount > MAX_LINES) this.out.firstElementChild.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }

  // Queue lines to appear one at a time. `text` may contain newlines.
  print(text = '', cls = '') {
    for (const part of String(text).split('\n')) this.queue.push([part, cls]);
    this.pump();
  }

  printNow(text = '', cls = '') {
    this.flush();
    for (const part of String(text).split('\n')) this.addLine(part, cls);
  }

  pump() {
    if (this.timer) return;
    const step = () => {
      this.timer = null;
      if (!this.queue.length) { this.resolveIdle(); return; }
      if (this.delay === 0) { this.flush(); return; }
      const [text, cls] = this.queue.shift();
      this.addLine(text, cls);
      this.timer = setTimeout(step, this.delay);
    };
    step();
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const [text, cls] of this.queue.splice(0)) this.addLine(text, cls);
    this.resolveIdle();
  }

  resolveIdle() { for (const r of this.idleWaiters.splice(0)) r(); }
  whenIdle() { return this.queue.length || this.timer ? new Promise((r) => this.idleWaiters.push(r)) : Promise.resolve(); }

  clear() {
    this.flush();
    this.out.textContent = '';
  }

  // ---- input ----
  enableInput({ prompt = '> ', history = true, label = 'Terminal input', maxLength = 80 } = {}) {
    this.ps1.textContent = prompt;
    this.useHistory = history;
    this.input.maxLength = maxLength;
    this.input.setAttribute('aria-label', label);
    this.input.disabled = false;
    this.line.classList.remove('off');
    this.input.value = '';
    this.input.focus({ preventScroll: true });
    this.renderInput();
  }

  disableInput() {
    this.input.disabled = true;
    this.line.classList.add('off');
  }

  setValue(v) {
    this.input.value = v;
    this.input.setSelectionRange(v.length, v.length);
    this.renderInput();
  }

  renderInput() {
    const v = this.input.value;
    const pos = Math.min(this.input.selectionStart ?? v.length, v.length);
    this.mirror.textContent = '';
    const before = document.createTextNode(v.slice(0, pos));
    const cur = document.createElement('span');
    cur.className = 'cur';
    cur.textContent = v[pos] || ' ';
    const after = document.createTextNode(v.slice(pos + 1));
    this.mirror.append(before, cur, after);
  }

  onKey(e) {
    const input = this.input;
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value;
      this.flush();
      if (this.useHistory && value.trim() && this.history[this.history.length - 1] !== value) this.history.push(value);
      this.hIndex = this.history.length;
      this.draft = '';
      this.setValue('');
      this.onSubmit(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.setValue('');
      this.hIndex = this.history.length;
    } else if (e.key === 'ArrowUp' && this.useHistory) {
      e.preventDefault();
      if (this.hIndex === this.history.length) this.draft = input.value;
      if (this.hIndex > 0) { this.hIndex -= 1; this.setValue(this.history[this.hIndex]); }
    } else if (e.key === 'ArrowDown' && this.useHistory) {
      e.preventDefault();
      if (this.hIndex < this.history.length) {
        this.hIndex += 1;
        this.setValue(this.hIndex === this.history.length ? this.draft : this.history[this.hIndex]);
      }
    } else if (e.key === 'Tab' && !e.shiftKey && this.completer && input.value.length) {
      // With an empty line, Tab is left alone so keyboard users can move focus.
      e.preventDefault();
      const { value, options } = this.completer(input.value);
      if (value !== undefined && value !== input.value) this.setValue(value);
      else if (options && options.length > 1) { this.printNow(this.ps1.textContent + input.value, 'cmd'); this.printNow(options.join('   '), 'dim'); }
    }
    // Arrow left/right, Home, End and Backspace are handled by the input itself.
    requestAnimationFrame(() => this.renderInput());
  }
}
