import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFolder, TAbstractFile } from 'obsidian';
import { getVaultBasePath } from './src/utils';
import { createArchive, restoreArchive, RestorePolicy } from './src/archive';

// Folder group interface
interface FolderGroup {
	name: string;
	folders: string[];
	description?: string;
}

// Simplified settings interface
interface ArchiverSettings {
	archiveFolder: string;
	restorePolicy: RestorePolicy;
	deleteOriginalFolder: boolean;
	deleteArchiveAfterRestore: boolean;
	folderGroups: FolderGroup[];
}

// Default settings
const DEFAULT_SETTINGS: ArchiverSettings = {
	archiveFolder: 'Archive',
	restorePolicy: 'overwrite',
	deleteOriginalFolder: false,
	deleteArchiveAfterRestore: true,
	folderGroups: []
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
						const res = await createArchive(this.app, vaultBase, this.settings.archiveFolder, folder.name, filesToZip, { 
							deleteOriginals: this.settings.deleteOriginalFolder 
						});
						new Notice(`Archive created: ${res.zipPath}`);
						
						// If we deleted the original folder, also delete the folder itself
						if (this.settings.deleteOriginalFolder) {
							try {
								await this.app.vault.delete(folder);
								new Notice(`Original folder '${folder.name}' deleted`);
							} catch (e: any) {
								new Notice(`Warning: Could not delete original folder: ${e.message}`);
							}
						}
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
					
					// Delete archive after successful restoration if setting is enabled
					if (this.settings.deleteArchiveAfterRestore) {
						try {
							await this.app.vault.adapter.remove(latest);
							new Notice(`Archive ${latest} deleted after restoration`);
							
							// Also clean up related files (manifest, logs, etc.)
							const relatedFiles = [
								`${latest}.manifest.json`,
								`${latest}.checkpoint.json`,
								`${latest}.deletelog.json`
							];
							
							for (const file of relatedFiles) {
								try {
									await this.app.vault.adapter.remove(file);
								} catch (e) {
									// Ignore errors for cleanup files that might not exist
								}
							}
						} catch (e: any) {
							new Notice(`Warning: Could not delete archive: ${e.message}`);
						}
					}
				} catch (e: any) {
					new Notice('Restore failed: ' + (e && e.message));
				}
			}
		});

		this.addCommand({
			id: 'unzip-archive',
			name: 'Unzip Archive',
			callback: async () => {
				const folder = this.settings.archiveFolder;
				try {
					const children = await this.app.vault.adapter.list(folder);
					const files = (children.files || []).filter((f: string) => f.endsWith('.zip'));
					
					if (!files.length) { 
						new Notice('No archives found in ' + folder); 
						return; 
					}
					
					if (files.length === 1) {
						// If only one archive, restore it directly
						const archive = files[0];
						await restoreArchive(this.app, archive, { policy: this.settings.restorePolicy });
						new Notice(`Restored ${archive} using ${this.settings.restorePolicy} policy`);
						
						if (this.settings.deleteArchiveAfterRestore) {
							try {
								await this.app.vault.adapter.remove(archive);
								new Notice(`Archive ${archive} deleted after restoration`);
							} catch (e: any) {
								new Notice(`Warning: Could not delete archive: ${e.message}`);
							}
						}
					} else {
						// Multiple archives, show selection modal
						new ArchiveSelectModal(this.app, files, async (selectedArchive) => {
							if (!selectedArchive) return;
							
							await restoreArchive(this.app, selectedArchive, { policy: this.settings.restorePolicy });
							new Notice(`Restored ${selectedArchive} using ${this.settings.restorePolicy} policy`);
							
							if (this.settings.deleteArchiveAfterRestore) {
								try {
									await this.app.vault.adapter.remove(selectedArchive);
									new Notice(`Archive ${selectedArchive} deleted after restoration`);
								} catch (e: any) {
									new Notice(`Warning: Could not delete archive: ${e.message}`);
								}
							}
						}).open();
					}
				} catch (e: any) {
					new Notice('Unzip failed: ' + (e && e.message));
				}
			}
		});

		this.addSettingTab(new ArchiverSettingTab(this.app, this));
		
		// Register folder group commands dynamically
		this.registerFolderGroupCommands();
	}

	registerFolderGroupCommands() {
		// Clear existing group commands first
		for (const group of this.settings.folderGroups) {
			// Add zip group command
			this.addCommand({
				id: `zip-group-${group.name.toLowerCase().replace(/\s+/g, '-')}`,
				name: `Zip Group: ${group.name}`,
				callback: async () => {
					await this.zipFolderGroup(group);
				}
			});
			
			// Add unzip group command
			this.addCommand({
				id: `unzip-group-${group.name.toLowerCase().replace(/\s+/g, '-')}`,
				name: `Unzip Group: ${group.name}`,
				callback: async () => {
					await this.unzipFolderGroup(group);
				}
			});
		}
	}

	async zipFolderGroup(group: FolderGroup) {
		const vaultBase = getVaultBasePath(this.app);
		const filesToZip: string[] = [];
		
		// Collect all files from group folders
		for (const folderPath of group.folders) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
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
			}
		}

		if (filesToZip.length === 0) {
			new Notice(`Group '${group.name}' contains no files to zip.`);
			return;
		}

		try {
			const res = await createArchive(this.app, vaultBase, this.settings.archiveFolder, group.name, filesToZip, { 
				deleteOriginals: this.settings.deleteOriginalFolder 
			});
			new Notice(`Group archive created: ${res.zipPath}`);
			
			// If we deleted original files and setting is enabled, also delete the folders
			if (this.settings.deleteOriginalFolder) {
				for (const folderPath of group.folders) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (folder instanceof TFolder) {
						try {
							await this.app.vault.delete(folder);
							new Notice(`Original folder '${folderPath}' deleted`);
						} catch (e: any) {
							new Notice(`Warning: Could not delete folder ${folderPath}: ${e.message}`);
						}
					}
				}
			}
		} catch (e: any) {
			new Notice(`Group archive failed: ${e && e.message}`);
		}
	}

	async unzipFolderGroup(group: FolderGroup) {
		// Look for archives that might belong to this group
		const folder = this.settings.archiveFolder;
		try {
			const children = await this.app.vault.adapter.list(folder);
			const files = (children.files || []).filter((f: string) => 
				f.endsWith('.zip') && f.includes(group.name.toLowerCase().replace(/\s+/g, '-'))
			);
			
			if (!files.length) {
				new Notice(`No archives found for group '${group.name}'`);
				return;
			}
			
			// If only one archive found, restore it directly
			if (files.length === 1) {
				const archive = files[0];
				await restoreArchive(this.app, archive, { policy: this.settings.restorePolicy });
				new Notice(`Restored group archive: ${archive}`);
				
				if (this.settings.deleteArchiveAfterRestore) {
					try {
						await this.app.vault.adapter.remove(archive);
						new Notice(`Archive ${archive} deleted after restoration`);
					} catch (e: any) {
						new Notice(`Warning: Could not delete archive: ${e.message}`);
					}
				}
			} else {
				// Multiple archives, show selection modal
				new ArchiveSelectModal(this.app, files, async (selectedArchive: string) => {
					if (!selectedArchive) return;
					
					await restoreArchive(this.app, selectedArchive, { policy: this.settings.restorePolicy });
					new Notice(`Restored group archive: ${selectedArchive}`);
					
					if (this.settings.deleteArchiveAfterRestore) {
						try {
							await this.app.vault.adapter.remove(selectedArchive);
							new Notice(`Archive ${selectedArchive} deleted after restoration`);
						} catch (e: any) {
							new Notice(`Warning: Could not delete archive: ${e.message}`);
						}
					}
				}).open();
			}
		} catch (e: any) {
			new Notice(`Group unzip failed: ${e && e.message}`);
		}
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

		new Setting(containerEl)
			.setName('Delete original folder after zipping')
			.setDesc('When enabled, the original folder will be deleted after successful archiving')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deleteOriginalFolder)
				.onChange(async (value) => {
					this.plugin.settings.deleteOriginalFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Delete archive after restoration')
			.setDesc('When enabled, archives will be automatically deleted after successful restoration')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deleteArchiveAfterRestore)
				.onChange(async (value) => {
					this.plugin.settings.deleteArchiveAfterRestore = value;
					await this.plugin.saveSettings();
				}));

		// Folder Groups Section
		containerEl.createEl('h3', { text: 'Folder Groups' });
		containerEl.createEl('p', { 
			text: 'Create groups of folders that can be zipped or unzipped together with dedicated commands.',
			cls: 'setting-item-description' 
		});

		// Display existing groups
		this.plugin.settings.folderGroups.forEach((group, index) => {
			const groupContainer = containerEl.createDiv();
			groupContainer.style.border = '1px solid var(--background-modifier-border)';
			groupContainer.style.borderRadius = '8px';
			groupContainer.style.padding = '12px';
			groupContainer.style.marginBottom = '12px';

			new Setting(groupContainer)
				.setName(`Group: ${group.name}`)
				.setDesc(`Folders: ${group.folders.join(', ') || 'None'}`)
				.addButton(button => button
					.setButtonText('Edit')
					.onClick(() => this.editFolderGroup(index))
				)
				.addButton(button => button
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => this.deleteFolderGroup(index))
				);
		});

		// Add new group button
		new Setting(containerEl)
			.setName('Add Folder Group')
			.setDesc('Create a new group of folders')
			.addButton(button => button
				.setButtonText('Add Group')
				.setCta()
				.onClick(() => this.addFolderGroup())
			);
	}

	addFolderGroup() {
		new FolderGroupModal(this.app, undefined, (group) => {
			if (group) {
				this.plugin.settings.folderGroups.push(group);
				this.plugin.saveSettings();
				this.plugin.registerFolderGroupCommands();
				this.display(); // Refresh settings display
			}
		}).open();
	}

	editFolderGroup(index: number) {
		const group = this.plugin.settings.folderGroups[index];
		new FolderGroupModal(this.app, group, (updatedGroup) => {
			if (updatedGroup) {
				this.plugin.settings.folderGroups[index] = updatedGroup;
				this.plugin.saveSettings();
				this.plugin.registerFolderGroupCommands();
				this.display(); // Refresh settings display
			}
		}).open();
	}

	deleteFolderGroup(index: number) {
		this.plugin.settings.folderGroups.splice(index, 1);
		this.plugin.saveSettings();
		this.plugin.registerFolderGroupCommands();
		this.display(); // Refresh settings display
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
        
        // Calculate dynamic height based on content
        const itemHeight = 40; // Approximate height per item including padding
        const maxVisibleItems = 12; // Show up to 12 items without scrolling
        const minHeight = Math.min(folders.length * itemHeight, 200); // Minimum 200px
        const maxHeight = Math.min(folders.length * itemHeight, maxVisibleItems * itemHeight);
        
        listEl.style.height = `${Math.max(minHeight, maxHeight)}px`;
        listEl.style.overflowY = folders.length > maxVisibleItems ? 'auto' : 'hidden';


        folders.forEach(folder => {
            const folderEl = listEl.createEl('div', { text: folder.path });
            folderEl.addClass('suggestion-item');
			folderEl.style.padding = '10px 12px';
			folderEl.style.cursor = 'pointer';
			folderEl.style.borderRadius = '4px';
			folderEl.style.margin = '2px 0';

			folderEl.addEventListener('mouseenter', () => {
				folderEl.style.backgroundColor = 'var(--background-modifier-hover)';
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

class ArchiveSelectModal extends Modal {
    private onChoose: (archive: string) => void;
    private archives: string[];

    constructor(app: App, archives: string[], onChoose: (archive: string) => void) {
        super(app);
        this.archives = archives;
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Select an archive to restore' });

        const listEl = contentEl.createDiv();
        listEl.addClass('suggestion-container');
        
        // Calculate dynamic height based on content
        const itemHeight = 50; // Slightly taller for archive info
        const maxVisibleItems = 10;
        const minHeight = Math.min(this.archives.length * itemHeight, 200);
        const maxHeight = Math.min(this.archives.length * itemHeight, maxVisibleItems * itemHeight);
        
        listEl.style.height = `${Math.max(minHeight, maxHeight)}px`;
        listEl.style.overflowY = this.archives.length > maxVisibleItems ? 'auto' : 'hidden';

        this.archives.forEach(archive => {
            const archiveEl = listEl.createEl('div');
            archiveEl.addClass('suggestion-item');
            archiveEl.style.padding = '10px 12px';
            archiveEl.style.cursor = 'pointer';
            archiveEl.style.borderRadius = '4px';
            archiveEl.style.margin = '2px 0';

            // Extract archive name and timestamp for display
            const archiveName = archive.split('/').pop() || archive;
            const nameEl = archiveEl.createEl('div', { text: archiveName });
            nameEl.style.fontWeight = 'bold';
            
            // Show file path as subtitle
            if (archive !== archiveName) {
                const pathEl = archiveEl.createEl('div', { text: archive });
                pathEl.style.fontSize = '0.8em';
                pathEl.style.opacity = '0.7';
                pathEl.style.marginTop = '2px';
            }

            archiveEl.addEventListener('mouseenter', () => {
                archiveEl.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            archiveEl.addEventListener('mouseleave', () => {
                archiveEl.style.backgroundColor = 'transparent';
            });

            archiveEl.addEventListener('click', () => {
                this.onChoose(archive);
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class FolderGroupModal extends Modal {
    private onSave: (group: FolderGroup | null) => void;
    private group: FolderGroup | undefined;
    private nameInput: HTMLInputElement;
    private descInput: HTMLInputElement;
    private selectedFolders: string[] = [];

    constructor(app: App, group: FolderGroup | undefined, onSave: (group: FolderGroup | null) => void) {
        super(app);
        this.group = group;
        this.onSave = onSave;
        this.selectedFolders = group ? [...group.folders] : [];
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.group ? 'Edit Folder Group' : 'Create Folder Group' });

        // Group name input
        new Setting(contentEl)
            .setName('Group Name')
            .setDesc('A unique name for this folder group')
            .addText(text => {
                this.nameInput = text.inputEl;
                text.setPlaceholder('My Folder Group')
                    .setValue(this.group?.name || '');
            });

        // Group description input
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Optional description for this group')
            .addText(text => {
                this.descInput = text.inputEl;
                text.setPlaceholder('Description of what this group contains')
                    .setValue(this.group?.description || '');
            });

        // Folder selection
        contentEl.createEl('h3', { text: 'Select Folders' });
        
        const foldersContainer = contentEl.createDiv();
        foldersContainer.style.maxHeight = '300px';
        foldersContainer.style.overflowY = 'auto';
        foldersContainer.style.border = '1px solid var(--background-modifier-border)';
        foldersContainer.style.borderRadius = '4px';
        foldersContainer.style.padding = '8px';
        foldersContainer.style.marginBottom = '16px';

        const folders = this.app.vault.getAllLoadedFiles()
            .filter(f => f instanceof TFolder && f.path !== '/')
            .map(f => f.path);

        folders.forEach(folderPath => {
            const folderItem = foldersContainer.createDiv();
            folderItem.style.display = 'flex';
            folderItem.style.alignItems = 'center';
            folderItem.style.padding = '4px 0';

            const checkbox = folderItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedFolders.includes(folderPath);
            checkbox.style.marginRight = '8px';

            const label = folderItem.createEl('label', { text: folderPath });
            label.style.cursor = 'pointer';

            label.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                this.updateSelectedFolders(folderPath, checkbox.checked);
            });

            checkbox.addEventListener('change', () => {
                this.updateSelectedFolders(folderPath, checkbox.checked);
            });
        });

        // Selected folders display
        const selectedContainer = contentEl.createDiv();
        selectedContainer.createEl('h4', { text: 'Selected Folders:' });
        const selectedList = selectedContainer.createEl('div');
        selectedList.style.fontFamily = 'monospace';
        selectedList.style.fontSize = '0.9em';
        selectedList.style.opacity = '0.8';
        selectedList.style.marginBottom = '16px';

        const updateSelectedDisplay = () => {
            selectedList.textContent = this.selectedFolders.length > 0 
                ? this.selectedFolders.join(', ') 
                : 'None selected';
        };
        updateSelectedDisplay();

        // Store reference for updates
        (this as any).updateSelectedDisplay = updateSelectedDisplay;

        // Buttons
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.onSave(null);
            this.close();
        });

        const saveButton = buttonContainer.createEl('button', { text: 'Save' });
        saveButton.addClass('mod-cta');
        saveButton.addEventListener('click', () => {
            const name = this.nameInput.value.trim();
            if (!name) {
                new Notice('Group name is required');
                return;
            }

            const group: FolderGroup = {
                name,
                folders: this.selectedFolders,
                description: this.descInput.value.trim() || undefined
            };

            this.onSave(group);
            this.close();
        });
    }

    updateSelectedFolders(folderPath: string, selected: boolean) {
        if (selected) {
            if (!this.selectedFolders.includes(folderPath)) {
                this.selectedFolders.push(folderPath);
            }
        } else {
            this.selectedFolders = this.selectedFolders.filter(f => f !== folderPath);
        }

        // Update display
        if ((this as any).updateSelectedDisplay) {
            (this as any).updateSelectedDisplay();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
