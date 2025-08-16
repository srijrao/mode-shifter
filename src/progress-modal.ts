import { Modal, App } from 'obsidian';

export interface ProgressOptions {
	title: string;
	showCancel?: boolean;
	onCancel?: () => void;
}

export interface ProgressCallback {
	(current: number, total: number, message?: string): void;
}

export class ProgressModal extends Modal {
	private progressEl: HTMLElement;
	private statusEl: HTMLElement;
	private cancelEl: HTMLButtonElement;
	private progressBarEl: HTMLElement;
	private cancelled = false;
	private onCancel?: () => void;
	
	constructor(app: App, private options: ProgressOptions) {
		super(app);
		this.onCancel = options.onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		// Title
		contentEl.createEl('h2', { text: this.options.title });
		
		// Progress bar container
		const progressContainer = contentEl.createDiv('progress-container');
		progressContainer.style.marginBottom = '16px';
		
		// Progress bar
		this.progressBarEl = progressContainer.createDiv('progress-bar');
		this.progressBarEl.style.width = '100%';
		this.progressBarEl.style.height = '20px';
		this.progressBarEl.style.backgroundColor = 'var(--background-modifier-border)';
		this.progressBarEl.style.borderRadius = '4px';
		this.progressBarEl.style.overflow = 'hidden';
		
		this.progressEl = this.progressBarEl.createDiv('progress-fill');
		this.progressEl.style.width = '0%';
		this.progressEl.style.height = '100%';
		this.progressEl.style.backgroundColor = 'var(--interactive-accent)';
		this.progressEl.style.transition = 'width 0.3s ease';
		
		// Status text
		this.statusEl = contentEl.createDiv('progress-status');
		this.statusEl.style.marginBottom = '16px';
		this.statusEl.textContent = 'Starting...';
		
		// Cancel button (if enabled)
		if (this.options.showCancel && this.onCancel) {
			const buttonContainer = contentEl.createDiv('progress-buttons');
			buttonContainer.style.textAlign = 'center';
			
			this.cancelEl = buttonContainer.createEl('button', { text: 'Cancel' }) as HTMLButtonElement;
			this.cancelEl.style.padding = '8px 16px';
			this.cancelEl.style.backgroundColor = 'var(--interactive-accent)';
			this.cancelEl.style.color = 'var(--text-on-accent)';
			this.cancelEl.style.border = 'none';
			this.cancelEl.style.borderRadius = '4px';
			this.cancelEl.style.cursor = 'pointer';
			
			this.cancelEl.addEventListener('click', () => {
				this.cancelled = true;
				this.cancelEl.textContent = 'Cancelling...';
				this.cancelEl.disabled = true;
				if (this.onCancel) {
					this.onCancel();
				}
			});
		}
	}

	updateProgress(current: number, total: number, message?: string) {
		if (this.cancelled) return;
		
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		this.progressEl.style.width = `${percentage}%`;
		
		if (message) {
			this.statusEl.textContent = message;
		} else {
			this.statusEl.textContent = `Processing ${current} of ${total} files (${percentage}%)`;
		}
	}

	setComplete(message?: string) {
		this.progressEl.style.width = '100%';
		this.statusEl.textContent = message || 'Complete!';
		
		if (this.cancelEl) {
			this.cancelEl.style.display = 'none';
		}
		
		// Auto-close after 2 seconds
		setTimeout(() => {
			this.close();
		}, 2000);
	}

	setError(message: string) {
		this.progressEl.style.backgroundColor = 'var(--text-error)';
		this.statusEl.textContent = `Error: ${message}`;
		
		if (this.cancelEl) {
			this.cancelEl.textContent = 'Close';
			this.cancelEl.disabled = false;
			this.cancelEl.onclick = () => this.close();
		}
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	onClose() {
		this.cancelled = true;
	}
}

// Cancellation token for async operations
export class CancellationToken {
	private _cancelled = false;
	private _callbacks: (() => void)[] = [];

	get isCancelled(): boolean {
		return this._cancelled;
	}

	cancel(): void {
		this._cancelled = true;
		this._callbacks.forEach(cb => {
			try {
				cb();
			} catch (e) {
				console.error('Error in cancellation callback:', e);
			}
		});
		this._callbacks.length = 0;
	}

	onCancelled(callback: () => void): void {
		if (this._cancelled) {
			callback();
		} else {
			this._callbacks.push(callback);
		}
	}

	throwIfCancelled(): void {
		if (this._cancelled) {
			throw new Error('Operation was cancelled');
		}
	}
}
