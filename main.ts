import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFolder, TAbstractFile } from 'obsidian';
import { getVaultBasePath } from './src/utils';
import { createArchive, restoreArchive, RestorePolicy } from './src/archive';

// Simplified settings interface
interface ArchiverSettings {
	archiveFolder: string;
	restorePolicy: RestorePolicy;
}

// Default settings
const DEFAULT_SETTINGS: ArchiverSettings = {
	archiveFolder: 'Archive',
	restorePolicy: 'overwrite'
};

// Main plugin class
export default class ArchiverPlugin extends Plugin {
	settings: ArchiverSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'zip-folder',
			name: 'Zip a folder',
			callback: () => {
				new FolderSelectModal(this.app, async (folder) => {
					if (!folder) return;

					const vaultBase = getVaultBasePath(this.app);
					
					const filesToZip: string[] = [];
					const addFilesRecursively = async (dir: TFolder) => {
						for (const child of dir.children) {
							if (child instanceof TFolder) {
								await addFilesRecursively(child);
							} else {
								filesToZip.push(child.path);
							}
						}
					};
					
					await addFilesRecursively(folder);

					if (filesToZip.length === 0) {
						new Notice('Selected folder is empty. Nothing to zip.');
						return;
					}

					try {
						const res = await createArchive(this.app, vaultBase, this.settings.archiveFolder, folder.name, filesToZip, { deleteOriginals: false });
						new Notice(`Archive created: ${res.zipPath}`);
					} catch (e: any) {
						new Notice('Archive failed: ' + (e && e.message));
					}
				}).open();
			}
		});

		this.addCommand({
			id: 'archiver-restore-last',
			name: 'Restore Last Archive',
			callback: async () => {
				const folder = this.settings.archiveFolder;
				try {
					const children = await this.app.vault.adapter.list(folder);
					const files = (children.files || []).filter((f: string) => f.endsWith('.zip'));
					if (!files.length) { new Notice('No archives found in ' + folder); return; }
					files.sort();
					const latest = files[files.length - 1];
					
					await restoreArchive(this.app, latest, { policy: this.settings.restorePolicy });
					new Notice(`Restored ${latest} using ${this.settings.restorePolicy} policy`);
				} catch (e: any) {
					new Notice('Restore failed: ' + (e && e.message));
				}
			}
		});

		this.addSettingTab(new ArchiverSettingTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ArchiverSettingTab extends PluginSettingTab {
	plugin: ArchiverPlugin;

	constructor(app: App, plugin: ArchiverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Archiver Settings' });

		new Setting(containerEl)
			.setName('Archive folder')
			.setDesc('Folder inside vault where archives (zip) are stored')
			.addText(text => text
				.setPlaceholder('Archive')
				.setValue(this.plugin.settings.archiveFolder)
				.onChange(async (value) => {
					this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
					await this.plugin.saveSettings();
				}));

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
	}
}

class FolderSelectModal extends Modal {
    private onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Select a folder to zip' });

        const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder && f.path !== '/');

        const listEl = contentEl.createDiv();
        listEl.addClass('suggestion-container');
		listEl.style.maxHeight = '400px';
		listEl.style.overflowY = 'auto';


        folders.forEach(folder => {
            const folderEl = listEl.createEl('div', { text: folder.path });
            folderEl.addClass('suggestion-item');
			folderEl.style.padding = '8px';
			folderEl.style.cursor = 'pointer';

			folderEl.addEventListener('mouseenter', () => {
				folderEl.style.backgroundColor = 'var(--background-secondary-alt)';
			});
			folderEl.addEventListener('mouseleave', () => {
				folderEl.style.backgroundColor = 'transparent';
			});

            folderEl.addEventListener('click', () => {
                this.onChoose(folder as TFolder);
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
