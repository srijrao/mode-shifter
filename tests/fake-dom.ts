// Shared lightweight fake DOM helper used by tests that exercise UI-like
// components without depending on a real browser DOM. Export a minimal
// FakeEl class with the small API expected by our ProgressModal tests.
export class FakeEl {
  style: Record<string, any> = {};
  textContent: string = '';
  disabled = false;
  listeners: Record<string, ((...args: any[]) => void)[]> = {};
  onclick?: () => void;
  constructor(public tag?: string) {}
  empty() { this.textContent = ''; }
  createEl(_tag: string, opts?: any) { const e = new FakeEl(_tag); if (opts?.text) e.textContent = opts.text; return e; }
  createDiv(_cls?: string) { return new FakeEl('div'); }
  addEventListener(ev: string, h: (...args: any[]) => void) { (this.listeners[ev] ||= []).push(h); }
  // helper to trigger event handlers stored by addEventListener
  trigger(ev: string, ...args: any[]) { (this.listeners[ev] || []).forEach(h => h(...args)); }
}

export default FakeEl;
