import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressModal, CancellationToken } from '../src/progress-modal';
import { FakeEl } from './fake-dom';

vi.mock('obsidian', () => ({
  Modal: class {},
  App: class {},
}));

describe('CancellationToken', () => {
  it('reports cancellation and invokes callbacks', () => {
    const token = new CancellationToken();
    expect(token.isCancelled).toBe(false);

    const cb = vi.fn();
    token.onCancelled(cb);
    token.cancel();

    expect(token.isCancelled).toBe(true);
    expect(cb).toHaveBeenCalled();

    // throwIfCancelled should throw once cancelled
    expect(() => token.throwIfCancelled()).toThrow(/cancelled/i);
  });

  it('calls callback immediately if already cancelled', () => {
    const token = new CancellationToken();
    token.cancel();
    const cb = vi.fn();
    token.onCancelled(cb);
    expect(cb).toHaveBeenCalled();
  });
});

describe('ProgressModal (lightweight)', () => {
  let modal: any;
  let fakeContent: FakeEl;
  beforeEach(() => {
    const app: any = {};
    modal = new (ProgressModal as any)(app, { title: 'Test', showCancel: true, onCancel: () => {} });

    // Provide a fake contentEl that supplies the small API used by the modal
    fakeContent = new FakeEl('root');
    modal.contentEl = fakeContent;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes elements and updates progress/status', () => {
    modal.onOpen();
    // initial progress fill should be 0%
    expect((modal as any).progressEl.style.width).toBe('0%');

    modal.updateProgress(1, 4, 'Half?');
    expect((modal as any).progressEl.style.width).toBe('25%');
    expect((modal as any).statusEl.textContent).toBe('Half?');
  });

  it('handles total=0 without dividing by zero and leaves progress at 0%', () => {
    modal.onOpen();
    modal.updateProgress(5, 0, 'No total');
    // Implementation sets percentage to 0 when total is 0
    expect((modal as any).progressEl.style.width).toBe('0%');
    expect((modal as any).statusEl.textContent).toBe('No total');
  });

  it('handles very large counts correctly', () => {
    modal.onOpen();
    // large numbers should still compute percentage without overflow
    modal.updateProgress(5_000_000, 10_000_000);
    expect((modal as any).progressEl.style.width).toBe('50%');
    expect((modal as any).statusEl.textContent).toContain('Processing');
  });

  it('updateProgress is a no-op when cancelled', () => {
    modal.onOpen();
    // mark cancelled and try to update
    (modal as any).cancelled = true;
    // set an initial width to ensure it doesn't change
    (modal as any).progressEl.style.width = '10%';
    modal.updateProgress(2, 4, 'Should not change');
    expect((modal as any).progressEl.style.width).toBe('10%');
    // status text should remain unchanged from initialization or prior value
  });

  it('handles cancellation button and onCancel callback', () => {
    const onCancel = vi.fn();
    modal = new (ProgressModal as any)({}, { title: 'T', showCancel: true, onCancel });
    modal.contentEl = fakeContent;
    modal.onOpen();

    // simulate clicking the cancel button
    const cancelEl = (modal as any).cancelEl as FakeEl;
    // ensure addEventListener recorded the handler and trigger it
    cancelEl.trigger('click');

    expect(onCancel).toHaveBeenCalled();
    expect(modal.isCancelled()).toBe(true);
  });

  it('setComplete sets width to 100% and auto-closes', () => {
    vi.useFakeTimers();
    modal.onOpen();
    // stub close to observe calls
    modal.close = vi.fn();

    modal.setComplete('All done');
    expect((modal as any).progressEl.style.width).toBe('100%');
    expect((modal as any).statusEl.textContent).toBe('All done');

    // advance timers to trigger auto-close
    vi.advanceTimersByTime(2000);
    expect(modal.close).toHaveBeenCalled();
  });

  it('setError updates status and wires Close button', () => {
    modal.onOpen();
    modal.close = vi.fn();
    modal.setError('bad');
    expect((modal as any).statusEl.textContent).toBe('Error: bad');

    const cancelEl = (modal as any).cancelEl as FakeEl;
    // After setError the cancel button text becomes 'Close' and onclick should call close
    expect(cancelEl.textContent).toBe('Close');
    // simulate user clicking the close via onclick
    cancelEl.onclick && cancelEl.onclick();
    expect(modal.close).toHaveBeenCalled();
  });
});
