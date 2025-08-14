import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import { generateZipName, calculateModeSize, buildPatterns, getVaultBasePath } from './src/utils';
import { createArchive, restoreArchive, expandGlobs, RestorePolicy } from './src/archive';

interface ModeEntry {
	id: string;
	name: string;
	include: string[];
	exclude?: string[];
	description?: string;
	active?: boolean;
}

interface ModeShifterSettings {
	archiveFolder: string;
	modes: ModeEntry[];
	lastActiveModeId?: string;
	lastArchives?: Record<string,string>;
	restorePolicy: RestorePolicy;
}

const DEFAULT_SETTINGS: ModeShifterSettings = {
	archiveFolder: 'Mode Shifter Archive',
	modes: [],
	restorePolicy: 'overwrite'
};

export default class ModeShifterPlugin extends Plugin {
	settings: ModeShifterSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'mode-shifter-preview',
			name: 'Preview Current Mode',
			callback: async () => {
				const current = this.settings.modes.find(m => m.active);
				if (!current) { new Notice('No active mode'); return; }
				const patterns = await buildPatterns(this.app, current);
				const vaultBase = getVaultBasePath(this.app);
				const files = patterns.length ? await expandGlobs(vaultBase, patterns) : [];
				new PreviewModal(this.app, current.name, files).open();
			}
		});

		this.addCommand({
			id: 'mode-shifter-activate',
			name: 'Activate Current Mode',
			callback: async () => {
				const mode = this.settings.modes.find(m => m.active) || this.settings.modes[0];
				if (!mode) { new Notice('No modes configured'); return; }
				const cmdPatterns = await buildPatterns(this.app, mode);
				const vaultBase = getVaultBasePath(this.app);
				const files = cmdPatterns.length ? await expandGlobs(vaultBase, cmdPatterns) : [];
				try {
					const res = await createArchive(this.app, vaultBase, this.settings.archiveFolder, mode.name || 'mode', files, { perFileTimeoutMs: 30000, overallTimeoutMs: 10*60*1000, deleteOriginals: true, onProgress: (d,t)=>{} });
					// record last archive for this mode id
					this.settings.lastArchives = Object.assign({}, this.settings.lastArchives || {});
					this.settings.lastArchives[mode.id] = res.zipPath;
					// mark this mode active and deactivate others
					this.settings.modes = this.settings.modes.map(m => ({ ...m, active: m.id === mode.id }));
					await this.saveSettings();
					new Notice(`Archive created and originals deleted: ${res.zipPath}`);
				} catch (e:any) {
					new Notice('Archive failed: ' + (e && e.message));
				}
			}
		});

		this.addCommand({
			id: 'mode-shifter-unapply',
			name: 'Unapply Current Mode',
			callback: async () => {
				const mode = this.settings.modes.find(m => m.active);
				if (!mode) { new Notice('No active mode'); return; }
				const last = this.settings.lastArchives && this.settings.lastArchives[mode.id];
				if (!last) { new Notice('No archive to restore for current mode'); return; }
				try {
					await restoreArchive(this.app, last, { policy: this.settings.restorePolicy });
					this.settings.modes = this.settings.modes.map(m => ({ ...m, active: false }));
					await this.saveSettings();
					new Notice(`Mode unapplied: ${mode.name}`);
				} catch (e:any) {
					new Notice('Unapply failed: ' + (e && e.message));
				}
			}
		});

		this.addCommand({
			id: 'mode-shifter-restore-last',
			name: 'Restore Last Archive',
			callback: async () => {
				// find latest zip in archive folder by name (simple approach)
				const folder = this.settings.archiveFolder;
				try {
					const children = await this.app.vault.adapter.list(folder);
					const files = (children.files || []).filter((f:string)=>f.endsWith('.zip'));
					if (!files.length) { new Notice('No archives found'); return; }
					files.sort();
					const latest = files[files.length-1];
					const path = `${folder}/${latest}`;
					await restoreArchive(this.app, path, { policy: this.settings.restorePolicy });
					new Notice(`Restored ${path} using ${this.settings.restorePolicy} policy`);
				} catch (e) {
					new Notice('Restore failed: ' + (e && e.message));
				}
			}
		});

		this.addSettingTab(new ModeShifterSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migration: remove legacy "normal" mode if it exists
		this.settings.modes = this.settings.modes.filter(m => m.id !== 'normal');
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ModeShifterSettingTab extends PluginSettingTab {
	plugin: ModeShifterPlugin;

	constructor(app: App, plugin: ModeShifterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Mode Shifter Settings'});

		// Archive folder setting
		new Setting(containerEl)
			.setName('Archive folder')
			.setDesc('Folder inside vault where mode archives (zip) are stored')
			.addText(text => text
				.setPlaceholder('Mode Shifter Archive')
				.setValue(this.plugin.settings.archiveFolder)
				.onChange(async (value) => {
					this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
					await this.plugin.saveSettings();
				}));

		// Restore policy setting
		new Setting(containerEl)
			.setName('Restore policy')
			.setDesc('How to handle conflicts when restoring files')
			.addDropdown(dropdown => dropdown
				.addOption('overwrite', 'Overwrite existing files')
				.addOption('skip', 'Skip existing files')
				.addOption('conflict-copy', 'Create conflict copies')
				.setValue(this.plugin.settings.restorePolicy)
				.onChange(async (value: RestorePolicy) => {
					this.plugin.settings.restorePolicy = value;
					await this.plugin.saveSettings();
				}));

		// Modes section
		containerEl.createEl('h3', {text: 'Modes'});
		containerEl.createEl('p', {text: 'Define different modes by specifying which files/folders to include. Files matching the patterns will be archived when the mode is activated.'});

		// Add new mode button
		new Setting(containerEl)
			.setName('Add new mode')
			.setDesc('Create a new mode definition')
			.addButton(btn => btn
				.setButtonText('Add Mode')
				.setCta()
				.onClick(() => {
					new ModeEditModal(this.app, this.plugin, null, () => this.display()).open();
				}));

		// Display existing modes
		this.displayModes(containerEl);

		// Demo/test actions
		containerEl.createEl('h3', {text: 'Testing & Demo'});
		
		new Setting(containerEl)
			.setName('Create demo archive')
			.setDesc('Creates a proper empty zip file in the archive folder for testing')
			.addButton(btn => btn
				.setButtonText('Create')
				.onClick(async () => {
					const name = generateZipName('demo');
					const path = `${this.plugin.settings.archiveFolder}/${name}`;
					await this.app.vault.createFolder(this.plugin.settings.archiveFolder).catch(()=>{});
					
					// Create a proper empty ZIP file using JSZip
					const JSZip = require('jszip');
					const zip = new JSZip();
					const content = await zip.generateAsync({ type: 'uint8array' });
					await this.app.vault.adapter.writeBinary(path, content.buffer as ArrayBuffer);
					new Notice(`Created empty demo archive: ${path}`);
				}));
	}

	private displayModes(containerEl: HTMLElement) {
		this.plugin.settings.modes.forEach((mode, index) => {
			const modeContainer = containerEl.createDiv('mode-setting-item');
			modeContainer.style.border = '1px solid var(--background-modifier-border)';
			modeContainer.style.borderRadius = '8px';
			modeContainer.style.padding = '16px';
			modeContainer.style.marginBottom = '12px';
			modeContainer.style.backgroundColor = 'var(--background-secondary)';

			const headerDiv = modeContainer.createDiv();
			headerDiv.style.display = 'flex';
			headerDiv.style.justifyContent = 'space-between';
			headerDiv.style.alignItems = 'center';
			headerDiv.style.marginBottom = '8px';

			const titleDiv = headerDiv.createDiv();
			titleDiv.createEl('strong', {text: mode.name});
			if (mode.description) {
				titleDiv.createEl('div', {text: mode.description, cls: 'setting-item-description'});
			}

			const actionsDiv = headerDiv.createDiv();
			actionsDiv.style.display = 'flex';
			actionsDiv.style.gap = '8px';

			// Edit button
			if (mode.id !== 'normal') { // Can't edit normal mode
				const editBtn = actionsDiv.createEl('button', {text: 'Edit', cls: 'mod-cta'});
				editBtn.onclick = () => {
					new ModeEditModal(this.app, this.plugin, mode, () => this.display()).open();
				};
			}

			// Delete button (except for normal mode)
			if (mode.id !== 'normal') {
				const deleteBtn = actionsDiv.createEl('button', {text: 'Delete', cls: 'mod-warning'});
				deleteBtn.onclick = async () => {
					this.plugin.settings.modes = this.plugin.settings.modes.filter(m => m.id !== mode.id);
					await this.plugin.saveSettings();
					this.display();
					new Notice(`Deleted mode: ${mode.name}`);
				};
			}

			// Mode details
			const detailsDiv = modeContainer.createDiv();
			detailsDiv.style.fontSize = '0.9em';
			detailsDiv.style.color = 'var(--text-muted)';

			if (mode.include && mode.include.length > 0) {
				detailsDiv.createEl('div', {text: `Include patterns: ${mode.include.join(', ')}`});
			}
			if (mode.exclude && mode.exclude.length > 0) {
				detailsDiv.createEl('div', {text: `Exclude patterns: ${mode.exclude.join(', ')}`});
			}

			// Size calculation and preview
			const actionsRowDiv = modeContainer.createDiv();
			actionsRowDiv.style.marginTop = '12px';
			actionsRowDiv.style.display = 'flex';
			actionsRowDiv.style.gap = '8px';
			actionsRowDiv.style.flexWrap = 'wrap';

			const previewBtn = actionsRowDiv.createEl('button', {text: 'Preview Files'});
			previewBtn.onclick = async () => {
				try {
					const files = await expandGlobs('.', mode.include || []);
					new PreviewModal(this.app, mode.name, files).open();
				} catch (error) {
					new Notice(`Preview failed: ${error}`);
				}
			};

			const sizeBtn = actionsRowDiv.createEl('button', {text: 'Calculate Size'});
			sizeBtn.onclick = async () => {
				try {
					const files = await expandGlobs('.', mode.include || []);
					const sizeInfo = await calculateModeSize(this.app, files);
					new Notice(`${mode.name}: ${sizeInfo.fileCount} files, ${sizeInfo.formattedSize}`);
				} catch (error) {
					new Notice(`Size calculation failed: ${error}`);
				}
			};

			if (mode.id !== 'normal' && mode.include && mode.include.length > 0) {
				const activateBtn = actionsRowDiv.createEl('button', {text: 'Activate Mode', cls: 'mod-cta'});
				activateBtn.onclick = async () => {
					try {
						const files = await expandGlobs('.', mode.include || []);
						const res = await createArchive(this.app, '.', this.plugin.settings.archiveFolder, mode.name, files, { 
							perFileTimeoutMs: 30000, 
							overallTimeoutMs: 10*60*1000, 
							deleteOriginals: true, 
							onProgress: (d,t) => {}
						});
						new Notice(`Mode activated: ${res.zipPath}`);
					} catch (error) {
						new Notice(`Mode activation failed: ${error}`);
					}
				};
			}
		});
	}
}

class ModeEditModal extends Modal {
	private mode: ModeEntry | null;
	private plugin: ModeShifterPlugin;
	private onSave: () => void;
	private nameInput: TextComponent;
	private descInput: TextComponent;
	private includeInput: TextComponent;
	private excludeInput: TextComponent;

	constructor(app: App, plugin: ModeShifterPlugin, mode: ModeEntry | null, onSave: () => void) {
		super(app);
		this.mode = mode;
		this.plugin = plugin;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.mode ? 'Edit Mode' : 'Create New Mode' });

		// Name
		new Setting(contentEl)
			.setName('Mode name')
			.setDesc('Display name for this mode')
			.addText(text => {
				this.nameInput = text;
				text.setPlaceholder('My Mode')
					.setValue(this.mode?.name || '')
					.inputEl.focus();
			});

		// Description
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Optional description of what this mode does')
			.addText(text => {
				this.descInput = text;
				text.setPlaceholder('Description...')
					.setValue(this.mode?.description || '');
			});

		// Include patterns
		new Setting(contentEl)
			.setName('Include patterns')
			.setDesc('Glob patterns for files to include (comma-separated). Example: *.md, folder/**, !temp/**')
			.addTextArea(text => {
				this.includeInput = text as any;
				text.setPlaceholder('*.md, folder/**')
					.setValue(this.mode?.include?.join(', ') || '');
				text.inputEl.rows = 3;
			});

		// Exclude patterns
		new Setting(contentEl)
			.setName('Exclude patterns')
			.setDesc('Glob patterns for files to exclude (comma-separated, optional)')
			.addTextArea(text => {
				this.excludeInput = text as any;
				text.setPlaceholder('temp/**, *.tmp')
					.setValue(this.mode?.exclude?.join(', ') || '');
				text.inputEl.rows = 2;
			});

		// Buttons
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.justifyContent = 'flex-end';
		buttonDiv.style.gap = '8px';
		buttonDiv.style.marginTop = '16px';

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.onclick = () => this.save();
	}

	private async save() {
		const name = this.nameInput.getValue().trim();
		if (!name) {
			new Notice('Mode name is required');
			return;
		}

		const include = this.includeInput.getValue()
			.split(',')
			.map(p => p.trim())
			.filter(p => p.length > 0);

		const exclude = this.excludeInput.getValue()
			.split(',')
			.map(p => p.trim())
			.filter(p => p.length > 0);

		if (this.mode) {
			// Edit existing mode
			this.mode.name = name;
			this.mode.description = this.descInput.getValue().trim() || undefined;
			this.mode.include = include;
			this.mode.exclude = exclude.length > 0 ? exclude : undefined;
		} else {
			// Create new mode
			const newMode: ModeEntry = {
				id: Date.now().toString(),
				name,
				description: this.descInput.getValue().trim() || undefined,
				include,
				exclude: exclude.length > 0 ? exclude : undefined
			};
			this.plugin.settings.modes.push(newMode);
		}

		await this.plugin.saveSettings();
		this.onSave();
		this.close();
		new Notice(`Mode ${this.mode ? 'updated' : 'created'}: ${name}`);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class PreviewModal extends Modal {
	private modeName: string;
	private files: string[];

	constructor(app: App, modeName: string, files: string[]) {
		super(app);
		this.modeName = modeName;
		this.files = files;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: `Preview: ${this.modeName}` });
		contentEl.createEl('p', { text: `${this.files.length} files will be affected:` });

		const listEl = contentEl.createEl('ul');
		listEl.style.maxHeight = '400px';
		listEl.style.overflow = 'auto';
		listEl.style.border = '1px solid var(--background-modifier-border)';
		listEl.style.padding = '8px';
		listEl.style.borderRadius = '4px';

		this.files.slice(0, 100).forEach(file => {
			listEl.createEl('li', { text: file });
		});

		if (this.files.length > 100) {
			contentEl.createEl('p', { text: `... and ${this.files.length - 100} more files` });
		}

		const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.style.marginTop = '16px';
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
