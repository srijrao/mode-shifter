import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import { generateZipName, calculateModeSize, buildPatterns, getVaultBasePath } from './src/utils';
import { createArchive, restoreArchive, expandGlobs, RestorePolicy } from './src/archive';

// Interfaces describe the shape of objects used by the plugin.
// These are helpful for TypeScript and for beginners to understand expected fields.
interface ModeEntry {
	// unique identifier (string) for the mode
	id: string;
	// human readable name for UI
	name: string;
	// array of glob patterns that define what to include when archiving
	include: string[];
	// optional array of glob patterns to exclude
	exclude?: string[];
	// optional user-provided description shown in the settings UI
	description?: string;
	// optional flag whether this mode is currently active
	active?: boolean;
}

interface ModeShifterSettings {
	// folder inside vault where archives are stored
	archiveFolder: string;
	// list of user-defined modes
	modes: ModeEntry[];
	// id of the last active mode (optional)
	lastActiveModeId?: string;
	// mapping from mode id to last created archive path (optional)
	lastArchives?: Record<string,string>;
	// how to handle conflicts when restoring
	restorePolicy: RestorePolicy;
}

// Default settings used when plugin has no stored data yet.
const DEFAULT_SETTINGS: ModeShifterSettings = {
	archiveFolder: 'Mode Shifter Archive',
	modes: [],
	restorePolicy: 'overwrite'
};

// Main plugin class. Obsidian loads this class and calls its lifecycle methods.
export default class ModeShifterPlugin extends Plugin {
	settings: ModeShifterSettings;

	// onload is called by Obsidian when the plugin is enabled.
	// This is where we wire up commands, settings UI, and any initialization.
	async onload() {
		// Load persisted settings or use defaults.
		await this.loadSettings();

		// Register a command to preview the currently active mode.
		this.addCommand({
			id: 'mode-shifter-preview',
			name: 'Preview Current Mode',
			callback: async () => {
				// find the active mode in settings
				const current = this.settings.modes.find(m => m.active);
				if (!current) { new Notice('No active mode'); return; }

				// Build the final list of glob patterns for this mode
				const patterns = await buildPatterns(this.app, current);

				// Convert Obsidian app to a vault base path for the file expansion helper
				const vaultBase = getVaultBasePath(this.app);

				// Expand the glob patterns to concrete file paths
				const files = patterns.length ? await expandGlobs(vaultBase, patterns) : [];

				// Show a preview modal listing files that would be affected
				new PreviewModal(this.app, current.name, files).open();
			}
		});

		// Register a command to activate the current mode (archive matched files)
		this.addCommand({
			id: 'mode-shifter-activate',
			name: 'Activate Current Mode',
			callback: async () => {
				// Either the explicitly active mode, or fallback to the first mode defined
				const mode = this.settings.modes.find(m => m.active) || this.settings.modes[0];
				if (!mode) { new Notice('No modes configured'); return; }

				// Build patterns and resolve file list
				const cmdPatterns = await buildPatterns(this.app, mode);
				const vaultBase = getVaultBasePath(this.app);
				const files = cmdPatterns.length ? await expandGlobs(vaultBase, cmdPatterns) : [];

				try {
					// Create an archive. Options include timeouts and whether to delete originals.
					const res = await createArchive(this.app, vaultBase, this.settings.archiveFolder, mode.name || 'mode', files, { perFileTimeoutMs: 30000, overallTimeoutMs: 10*60*1000, deleteOriginals: true, onProgress: (d,t)=>{} });

					// Record the last created archive path for this mode
					this.settings.lastArchives = Object.assign({}, this.settings.lastArchives || {});
					this.settings.lastArchives[mode.id] = res.zipPath;

					// Mark this mode as active and deactivate all others
					this.settings.modes = this.settings.modes.map(m => ({ ...m, active: m.id === mode.id }));

					// Persist updated settings
					await this.saveSettings();

					// Inform the user
					new Notice(`Archive created and originals deleted: ${res.zipPath}`);
				} catch (e:any) {
					// Surface a helpful error notice if anything goes wrong
					new Notice('Archive failed: ' + (e && e.message));
				}
			}
		});

		// Command to unapply (restore) the currently active mode from its last archive
		this.addCommand({
			id: 'mode-shifter-unapply',
			name: 'Unapply Current Mode',
			callback: async () => {
				const mode = this.settings.modes.find(m => m.active);
				if (!mode) { new Notice('No active mode'); return; }

				// Look up the last created archive path for this mode id
				const last = this.settings.lastArchives && this.settings.lastArchives[mode.id];
				if (!last) { new Notice('No archive to restore for current mode'); return; }

				try {
					// Restore from the archive using the configured policy
					await restoreArchive(this.app, last, { policy: this.settings.restorePolicy });

					// Clear the active flag on all modes
					this.settings.modes = this.settings.modes.map(m => ({ ...m, active: false }));
					await this.saveSettings();
					new Notice(`Mode unapplied: ${mode.name}`);
				} catch (e:any) {
					new Notice('Unapply failed: ' + (e && e.message));
				}
			}
		});

		// Command to restore the most-recent ZIP in the archive folder
		this.addCommand({
			id: 'mode-shifter-restore-last',
			name: 'Restore Last Archive',
			callback: async () => {
				// find latest zip in archive folder by name (simple alphabetical approach)
				const folder = this.settings.archiveFolder;
				try {
					// list children in the archive folder using Obsidian's adapter API
					const children = await this.app.vault.adapter.list(folder);

					// filter to only .zip files
					const files = (children.files || []).filter((f:string)=>f.endsWith('.zip'));
					if (!files.length) { new Notice('No archives found'); return; }

					// sort and pick the last (this is a simple but not perfect way to find latest)
					files.sort();
					const latest = files[files.length-1];
					const path = `${folder}/${latest}`;

					// perform the restore
					await restoreArchive(this.app, path, { policy: this.settings.restorePolicy });
					new Notice(`Restored ${path} using ${this.settings.restorePolicy} policy`);
				} catch (e:any) {
					new Notice('Restore failed: ' + (e && e.message));
				}
			}
		});

		// Register the settings tab so the user can configure the plugin
		this.addSettingTab(new ModeShifterSettingTab(this.app, this));
	}

	// onunload is called when the plugin is disabled. If you allocated resources, clean them up here.
	onunload() {}

	// loadSettings reads persisted plugin data and applies defaults as needed.
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migration: remove legacy "normal" mode if it exists to avoid confusion.
		this.settings.modes = this.settings.modes.filter(m => m.id !== 'normal');
	}

	// saveSettings writes the settings back to disk (Obsidian's storage for plugins).
	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Settings tab class: renders the UI shown under Settings -> Community Plugins -> Mode Shifter
class ModeShifterSettingTab extends PluginSettingTab {
	plugin: ModeShifterPlugin;

	constructor(app: App, plugin: ModeShifterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// display is called by Obsidian to construct the settings UI.
	display(): void {
		const {containerEl} = this;
		// Clear previous contents to redraw
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Mode Shifter Settings'});

		// Archive folder setting: simple text input
		new Setting(containerEl)
			.setName('Archive folder')
			.setDesc('Folder inside vault where mode archives (zip) are stored')
			.addText(text => text
				.setPlaceholder('Mode Shifter Archive')
				.setValue(this.plugin.settings.archiveFolder)
				.onChange(async (value) => {
					// Trim whitespace and fall back to default if empty
					this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
					await this.plugin.saveSettings();
				}));

		// Restore policy: dropdown to handle conflict resolution strategies
		new Setting(containerEl)
			.setName('Restore policy')
			.setDesc('How to handle conflicts when restoring files')
			.addDropdown(dropdown => dropdown
				.addOption('overwrite', 'Overwrite existing files')
				.addOption('skip', 'Skip existing files')
				.addOption('conflict-copy', 'Create conflict copies')
				.setValue(this.plugin.settings.restorePolicy)
				.onChange(async (value: RestorePolicy) => {
					// Save the user's choice
					this.plugin.settings.restorePolicy = value;
					await this.plugin.saveSettings();
				}));

		// Modes management header and description
		containerEl.createEl('h3', {text: 'Modes'});
		containerEl.createEl('p', {text: 'Define different modes by specifying which files/folders to include. Files matching the patterns will be archived when the mode is activated.'});

		// "Add new mode" button - opens the edit modal with null to indicate creation.
		new Setting(containerEl)
			.setName('Add new mode')
			.setDesc('Create a new mode definition')
			.addButton(btn => btn
				.setButtonText('Add Mode')
				.setCta()
				.onClick(() => {
					new ModeEditModal(this.app, this.plugin, null, () => this.display()).open();
				}));

		// Render the list of existing modes
		this.displayModes(containerEl);

		// Testing & Demo tools for quick validation while developing or debugging
		containerEl.createEl('h3', {text: 'Testing & Demo'});
		
		new Setting(containerEl)
			.setName('Create demo archive')
			.setDesc('Creates a proper empty zip file in the archive folder for testing')
			.addButton(btn => btn
				.setButtonText('Create')
				.onClick(async () => {
					// generate a timestamped zip name
					const name = generateZipName('demo');
					const path = `${this.plugin.settings.archiveFolder}/${name}`;
					// ensure folder exists (createFolder throws if it already exists, so we ignore errors)
					await this.app.vault.createFolder(this.plugin.settings.archiveFolder).catch(()=>{});
					
					// Create a proper empty ZIP file using JSZip
					// Note: require is used because JSZip may be an optional dependency.
					const JSZip = require('jszip');
					const zip = new JSZip();
					// generateAsync returns a Uint8Array when using type 'uint8array'
					const content = await zip.generateAsync({ type: 'uint8array' });
					// writeBinary expects an ArrayBuffer; the buffer property is available on the Uint8Array
					await this.app.vault.adapter.writeBinary(path, content.buffer as ArrayBuffer);
					new Notice(`Created empty demo archive: ${path}`);
				}));
	}

	// displayModes renders each mode entry with controls to preview, calculate size, edit, delete, and activate.
	private displayModes(containerEl: HTMLElement) {
		this.plugin.settings.modes.forEach((mode, index) => {
			// Create a styled container for each mode entry
			const modeContainer = containerEl.createDiv('mode-setting-item');
			modeContainer.style.border = '1px solid var(--background-modifier-border)';
			modeContainer.style.borderRadius = '8px';
			modeContainer.style.padding = '16px';
			modeContainer.style.marginBottom = '12px';
			modeContainer.style.backgroundColor = 'var(--background-secondary)';

			// Header row with name + actions
			const headerDiv = modeContainer.createDiv();
			headerDiv.style.display = 'flex';
			headerDiv.style.justifyContent = 'space-between';
			headerDiv.style.alignItems = 'center';
			headerDiv.style.marginBottom = '8px';

			const titleDiv = headerDiv.createDiv();
			// Name in bold
			titleDiv.createEl('strong', {text: mode.name});
			// Optional description below the name
			if (mode.description) {
				titleDiv.createEl('div', {text: mode.description, cls: 'setting-item-description'});
			}

			// Action buttons (edit/delete)
			const actionsDiv = headerDiv.createDiv();
			actionsDiv.style.display = 'flex';
			actionsDiv.style.gap = '8px';

			// Edit button (disabled for a special "normal" mode if present)
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
					// Remove the mode from settings and persist
					this.plugin.settings.modes = this.plugin.settings.modes.filter(m => m.id !== mode.id);
					await this.plugin.saveSettings();
					this.display();
					new Notice(`Deleted mode: ${mode.name}`);
				};
			}

			// Details area reporting include/exclude patterns
			const detailsDiv = modeContainer.createDiv();
			detailsDiv.style.fontSize = '0.9em';
			detailsDiv.style.color = 'var(--text-muted)';

			if (mode.include && mode.include.length > 0) {
				detailsDiv.createEl('div', {text: `Include patterns: ${mode.include.join(', ')}`});
			}
			if (mode.exclude && mode.exclude.length > 0) {
				detailsDiv.createEl('div', {text: `Exclude patterns: ${mode.exclude.join(', ')}`});
			}

			// Row for action buttons like preview, size calculation, and activate
			const actionsRowDiv = modeContainer.createDiv();
			actionsRowDiv.style.marginTop = '12px';
			actionsRowDiv.style.display = 'flex';
			actionsRowDiv.style.gap = '8px';
			actionsRowDiv.style.flexWrap = 'wrap';

			// Preview files button - shows the list of files matched by include patterns
			const previewBtn = actionsRowDiv.createEl('button', {text: 'Preview Files'});
			previewBtn.onclick = async () => {
				try {
					// expandGlobs uses a path base; here '.' refers to the vault root in this UI context
					const files = await expandGlobs('.', mode.include || []);
					new PreviewModal(this.app, mode.name, files).open();
				} catch (error:any) {
					new Notice(`Preview failed: ${error}`);
				}
			};

			// Calculate size button - shows number of files and a human-readable size
			const sizeBtn = actionsRowDiv.createEl('button', {text: 'Calculate Size'});
			sizeBtn.onclick = async () => {
				try {
					const files = await expandGlobs('.', mode.include || []);
					const sizeInfo = await calculateModeSize(this.app, files);
					// calculateModeSize returns fileCount and formattedSize for user-friendly output
					new Notice(`${mode.name}: ${sizeInfo.fileCount} files, ${sizeInfo.formattedSize}`);
				} catch (error:any) {
					new Notice(`Size calculation failed: ${error}`);
				}
			};

			// Activate Mode button: creates the archive and deletes originals if configured.
			// Not shown for 'normal' mode or when no include patterns are present.
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
					} catch (error:any) {
						new Notice(`Mode activation failed: ${error}`);
					}
				};
			}
		});
	}
}

// Modal to create or edit a mode. Uses Obsidian's Modal + Setting components.
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

	// onOpen constructs the modal content each time it's opened.
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.mode ? 'Edit Mode' : 'Create New Mode' });

		// Name field: required
		new Setting(contentEl)
			.setName('Mode name')
			.setDesc('Display name for this mode')
			.addText(text => {
				this.nameInput = text;
				text.setPlaceholder('My Mode')
					.setValue(this.mode?.name || '')
					.inputEl.focus(); // focus the input for convenience
			});

		// Description field: optional
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Optional description of what this mode does')
			.addText(text => {
				this.descInput = text;
				text.setPlaceholder('Description...')
					.setValue(this.mode?.description || '');
			});

		// Include patterns: textarea for multiple patterns separated by commas
		new Setting(contentEl)
			.setName('Include patterns')
			.setDesc('Glob patterns for files to include (comma-separated). Example: *.md, folder/**, !temp/**')
			.addTextArea(text => {
				// cast to TextComponent-compatible type for our stored reference
				this.includeInput = text as any;
				text.setPlaceholder('*.md, folder/**')
					.setValue(this.mode?.include?.join(', ') || '');
				text.inputEl.rows = 3; // make the textarea a few rows tall
			});

		// Exclude patterns: optional textarea
		new Setting(contentEl)
			.setName('Exclude patterns')
			.setDesc('Glob patterns for files to exclude (comma-separated, optional)')
			.addTextArea(text => {
				this.excludeInput = text as any;
				text.setPlaceholder('temp/**, *.tmp')
					.setValue(this.mode?.exclude?.join(', ') || '');
				text.inputEl.rows = 2;
			});

		// Buttons row: Cancel and Save
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

	// save validates inputs and updates or creates a mode entry in settings.
	private async save() {
		// name is required
		const name = this.nameInput.getValue().trim();
		if (!name) {
			new Notice('Mode name is required');
			return;
		}

		// Parse comma-separated include patterns into an array, trimming whitespace and removing empty entries
		const include = this.includeInput.getValue()
			.split(',')
			.map(p => p.trim())
			.filter(p => p.length > 0);

		// Parse exclude patterns similarly
		const exclude = this.excludeInput.getValue()
			.split(',')
			.map(p => p.trim())
			.filter(p => p.length > 0);

		if (this.mode) {
			// Edit existing mode in-place
			this.mode.name = name;
			this.mode.description = this.descInput.getValue().trim() || undefined;
			this.mode.include = include;
			this.mode.exclude = exclude.length > 0 ? exclude : undefined;
		} else {
			// Create a new mode object and append to settings.modes
			const newMode: ModeEntry = {
				// Use a timestamp-based id; for production you might use UUIDs instead
				id: Date.now().toString(),
				name,
				description: this.descInput.getValue().trim() || undefined,
				include,
				exclude: exclude.length > 0 ? exclude : undefined
			};
			this.plugin.settings.modes.push(newMode);
		}

		// Persist settings and refresh the settings UI
		await this.plugin.saveSettings();
		this.onSave();
		this.close();
		new Notice(`Mode ${this.mode ? 'updated' : 'created'}: ${name}`);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty(); // clear modal content when closed
	}
}

// Modal for previewing a list of files that will be affected by a mode.
// This helps users verify patterns before archiving or deleting files.
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

		// Create a scrollable list for file names to avoid huge modals for large sets
		const listEl = contentEl.createEl('ul');
		listEl.style.maxHeight = '400px';
		listEl.style.overflow = 'auto';
		listEl.style.border = '1px solid var(--background-modifier-border)';
		listEl.style.padding = '8px';
		listEl.style.borderRadius = '4px';

		// Show only the first 100 entries to keep UI responsive; indicate if more exist
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
