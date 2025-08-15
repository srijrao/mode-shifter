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
	archiveInPlace: boolean;
	restorePolicy: RestorePolicy;
	deleteOriginalFolder: boolean;
	deleteArchiveAfterRestore: boolean;
	folderGroups: FolderGroup[];
}

// Default settings
const DEFAULT_SETTINGS: ArchiverSettings = {
	archiveFolder: 'Archive',
	archiveInPlace: false,
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

					// Default: zip the entire selected folder
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
						const archiveLocation = this.settings.archiveInPlace 
							? folder.parent?.path || '' 
							: this.settings.archiveFolder;
						const res = await createArchive(this.app, vaultBase, archiveLocation, folder.name, filesToZip, { 
								deleteOriginals: this.settings.deleteOriginalFolder,
								preserveBaseName: true // ensure folder.name is used for archive filename base
							});
						new Notice(`Archive created: ${res.zipPath}`);
						if (this.settings.deleteOriginalFolder) {
							await this.deleteFolderSafely(folder);
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
				try {
					const archives = await this.findAllArchives();
					if (!archives.length) { 
						new Notice('No archives found'); 
						return; 
					}
					
					// Sort by modification time (most recent first)
					archives.sort((a, b) => b.mtime - a.mtime);
					const latest = archives[0];
					
					await restoreArchive(this.app, latest.path, { policy: this.settings.restorePolicy });
					new Notice(`Restored ${latest.path} using ${this.settings.restorePolicy} policy`);
					
					// Delete archive after successful restoration if setting is enabled
					if (this.settings.deleteArchiveAfterRestore) {
						try {
							await this.app.vault.adapter.remove(latest.path);
							new Notice(`Archive ${latest.path} deleted after restoration`);
							
							// Also clean up related files (manifest, logs, etc.)
							const relatedFiles = [
								`${latest.path}.manifest.json`,
								`${latest.path}.checkpoint.json`,
								`${latest.path}.deletelog.json`
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
				try {
					const archives = await this.findAllArchives();
					
					if (!archives.length) { 
						new Notice('No archives found in vault'); 
						return; 
					}
					
					if (archives.length === 1) {
						// If only one archive, restore it directly
						const archive = archives[0];
						await restoreArchive(this.app, archive.path, { policy: this.settings.restorePolicy });
						new Notice(`Restored ${archive.path} using ${this.settings.restorePolicy} policy`);
						
						if (this.settings.deleteArchiveAfterRestore) {
							try {
								await this.app.vault.adapter.remove(archive.path);
								new Notice(`Archive ${archive.path} deleted after restoration`);
							} catch (e: any) {
								new Notice(`Warning: Could not delete archive: ${e.message}`);
							}
						}
					} else {
						// Multiple archives, show selection modal
						const archivePaths = archives.map(a => a.path);
						new ArchiveSelectModal(this.app, archivePaths, async (selectedArchive) => {
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

		// Default behavior: one archive containing all files from the group folders
		const filesToZip: string[] = [];
		for (const folderPath of group.folders) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
				const addFilesRecursively = async (dir: TFolder) => {
					for (const child of dir.children) {
						if (child instanceof TFolder) await addFilesRecursively(child);
						else filesToZip.push(child.path);
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
			let archiveLocation = this.settings.archiveFolder;
			if (this.settings.archiveInPlace && group.folders.length > 0) {
				const firstFolder = this.app.vault.getAbstractFileByPath(group.folders[0]);
				if (firstFolder instanceof TFolder) archiveLocation = firstFolder.parent?.path || '';
			}
			const res = await createArchive(this.app, vaultBase, archiveLocation, group.name, filesToZip, { 
				deleteOriginals: this.settings.deleteOriginalFolder,
				preserveBaseName: true // ensure group name is used as archive base name
			});
			new Notice(`Group archive created: ${res.zipPath}`);
			if (this.settings.deleteOriginalFolder) {
				for (const folderPath of group.folders) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (folder instanceof TFolder) await this.deleteFolderSafely(folder);
				}
			}
		} catch (e: any) {
			new Notice(`Group archive failed: ${e && e.message}`);
		}
	}

	async unzipFolderGroup(group: FolderGroup) {
		// Look for archives that might belong to this group
		try {
			const allArchives = await this.findAllArchives();
			const groupName = group.name.toLowerCase().replace(/[\s_]+/g, '-');
			const matchingArchives = allArchives.filter(archive => {
				const name = archive.path.split('/').pop()?.toLowerCase() || archive.path.toLowerCase();
				// We consider an archive to belong to the group if its filename starts with the groupName followed by '-' (from our slugified zip naming)
				return name.startsWith(groupName + '-');
			});
			
			if (!matchingArchives.length) {
				new Notice(`No archives found for group '${group.name}'`);
				return;
			}
			
			// If only one archive found, restore it directly
			if (matchingArchives.length === 1) {
				const archive = matchingArchives[0];
				await restoreArchive(this.app, archive.path, { policy: this.settings.restorePolicy });
				new Notice(`Restored group archive: ${archive.path}`);
				
				if (this.settings.deleteArchiveAfterRestore) {
					try {
						await this.app.vault.adapter.remove(archive.path);
						new Notice(`Archive ${archive.path} deleted after restoration`);
					} catch (e: any) {
						new Notice(`Warning: Could not delete archive: ${e.message}`);
					}
				}
			} else {
				// Multiple archives, show selection modal
				const archivePaths = matchingArchives.map(a => a.path);
				new ArchiveSelectModal(this.app, archivePaths, async (selectedArchive: string) => {
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

	// Helper method to find all archives in vault (both in archive folder and in-place)
	async findAllArchives(): Promise<Array<{path: string, mtime: number}>> {
		const archives: Array<{path: string, mtime: number}> = [];
		const all = this.app.vault.getAllLoadedFiles();
		for (const af of all) {
			if (af.path.startsWith('.obsidian/plugins/')) continue;
			if (af.path.toLowerCase().endsWith('.zip')) {
				try {
					const st = await this.app.vault.adapter.stat(af.path);
					archives.push({ path: af.path, mtime: st?.mtime || 0 });
				} catch {
					archives.push({ path: af.path, mtime: 0 });
				}
			}
		}
		return archives;
	}

	// Enhanced folder deletion with multiple fallback strategies (implemented below)

	// Helper method: centralized, robust folder deletion that works across platforms
	private isRetryableFsError(err: any): boolean {
		const msg = String(err?.message || err || '').toLowerCase();
		const code = String((err && (err.code || err.errno)) || '').toLowerCase();
		return (
			msg.includes('eperm') ||
			msg.includes('eacces') ||
			msg.includes('ebusy') ||
			msg.includes('enotempty') ||
			msg.includes('permission denied') ||
			msg.includes('resource busy') ||
			msg.includes('directory not empty') ||
			code === 'eperm' || code === 'eacces' || code === 'ebusy' || code === 'enotempty'
		);
	}

	private async delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

	private async removeDirWithRetries(path: string, recursive: boolean, attempts = 5): Promise<boolean> {
		for (let i = 0; i < attempts; i++) {
			try {
				await this.app.vault.adapter.rmdir(path, recursive);
				return true;
			} catch (err) {
				if (!ArchiverPlugin.prototype.isRetryableFsError.call(this, err) || i === attempts - 1) return false;
				await ArchiverPlugin.prototype.delay.call(this, 200 + i * 150);
			}
		}
		return false;
	}

	private async renameThenRemoveDir(path: string): Promise<boolean> {
		const adapter: any = this.app.vault.adapter as any;
		if (typeof adapter.rename !== 'function') return false;
		const tmp = `${path}.deleting-${Math.random().toString(36).slice(2,8)}`;
		try {
			await adapter.rename(path, tmp);
			// Try recursive removal on the renamed path with retries
			if (await ArchiverPlugin.prototype.removeDirWithRetries.call(this, tmp, true, 5)) return true;
			// As a fallback, deep-remove contents and rmdir non-recursive
			await ArchiverPlugin.prototype.deleteContentsRecursivelyByPath.call(this, tmp);
			if (await ArchiverPlugin.prototype.removeDirWithRetries.call(this, tmp, false, 5)) return true;
			// Final fallback: move the renamed folder into vault trash
			if (await ArchiverPlugin.prototype.moveToVaultTrash.call(this, tmp)) return true;
			return false;
		} catch {
			return false;
		}
	}

	private async moveToVaultTrash(path: string): Promise<boolean> {
		const adapter: any = this.app.vault.adapter as any;
		const TRASH_DIR = '.trash';
		try {
			// Ensure .trash exists at vault root
			await this.app.vault.createFolder(TRASH_DIR).catch(() => {});
			const base = path.split('/').pop() || 'item';
			const dest = `${TRASH_DIR}/${base}-deleted-${Math.random().toString(36).slice(2,8)}`;
			await adapter.rename(path, dest);
			return true;
		} catch {
			return false;
		}
	}

	private async deleteContentsRecursivelyByPath(dirPath: string): Promise<void> {
		// Use adapter.list to avoid stale in-memory folder trees and to work cross-platform
		const adapter: any = this.app.vault.adapter as any;
		let listing: { files: string[]; folders: string[] } | null = null;
		try {
			listing = await adapter.list(dirPath);
		} catch (e) {
			// If listing fails (e.g., path already gone), nothing to do
			return;
		}
		if (!listing) return;
		// Delete files first
		for (const file of listing.files || []) {
			for (let i = 0; i < 5; i++) {
				try {
					await adapter.remove(file);
					break;
				} catch (err) {
					if (!ArchiverPlugin.prototype.isRetryableFsError.call(this, err) || i === 4) break;
					await ArchiverPlugin.prototype.delay.call(this, 150 + i * 100);
				}
			}
		}
		// Recurse into subfolders
		for (const sub of listing.folders || []) {
			await ArchiverPlugin.prototype.deleteContentsRecursivelyByPath.call(this, sub);
			await ArchiverPlugin.prototype.removeDirWithRetries.call(this, sub, false, 5);
		}
	}

	// Backwards-compatible helper to preserve existing tests that stub this method
	async deleteContentsRecursively(folder: TFolder): Promise<void> {
		await this.deleteContentsRecursivelyByPath(folder.path);
	}

	// Re-implemented deleteFolderSafely using the helpers above for cross-platform robustness
	async deleteFolderSafely(folder: TFolder): Promise<boolean> {
		const folderName = folder.name;
		const folderPath = folder.path;
		// 1) Try high-level API (updates Obsidian state) with a couple of quick retries
		for (let i = 0; i < 3; i++) {
			try {
				await this.app.vault.delete(folder);
				new Notice(`Original folder '${folderName}' deleted`);
				return true;
			} catch (e) {
				if (!ArchiverPlugin.prototype.isRetryableFsError.call(this, e) || i === 2) break;
				await ArchiverPlugin.prototype.delay.call(this, 150 + i * 150);
			}
		}

		// 2) Adapter recursive delete with retries
		if (await ArchiverPlugin.prototype.removeDirWithRetries.call(this, folderPath, true, 5)) {
			new Notice(`Original folder '${folderName}' deleted (using adapter)`);
			return true;
		}

		// 3) Delete contents first + non-recursive rmdir with retries
		try {
			await ArchiverPlugin.prototype.deleteContentsRecursivelyByPath.call(this, folderPath);
			if (await ArchiverPlugin.prototype.removeDirWithRetries.call(this, folderPath, false, 5)) {
				new Notice(`Original folder '${folderName}' deleted (contents cleared first)`);
				return true;
			}
		} catch {}

		// 4) Rename then remove as last resort (helps on Windows and macOS when watchers hold locks)
		if (await ArchiverPlugin.prototype.renameThenRemoveDir.call(this, folderPath)) {
			new Notice(`Original folder '${folderName}' deleted (after rename)`);
			return true;
		}

		// 5) Move to vault trash as a final fallback (lets sync tools finish gracefully)
		if (await ArchiverPlugin.prototype.moveToVaultTrash.call(this, folderPath)) {
			new Notice(`Original folder '${folderName}' moved to vault trash (.trash/)`);
			return true;
		}

		console.error(`All deletion attempts failed for ${folderPath}`);
		new Notice(`Warning: Could not delete or move folder '${folderName}'. You may need to delete it manually.`);
		return false;
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
			.setDesc('Folder inside vault where archives (zip) are stored when "Archive in place" is disabled')
			.addText(text => text
				.setPlaceholder('Archive')
				.setValue(this.plugin.settings.archiveFolder)
				.onChange(async (value) => {
					this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Archive in place')
			.setDesc('When enabled, archives are created in the same location as the source folder instead of the archive folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archiveInPlace)
				.onChange(async (value) => {
					this.plugin.settings.archiveInPlace = value;
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
		// Enlarge modal dimensions for better visibility
		try {
			(this as any).modalEl?.style?.setProperty('width', '720px');
			(this as any).modalEl?.style?.setProperty('max-height', '70vh');
			(this as any).modalEl?.style?.setProperty('min-height', '320px');
		} catch {}

        const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder && f.path !== '/');

        const listEl = contentEl.createDiv();
        listEl.addClass('suggestion-container');
        
	// Larger list area
	const itemHeight = 36;
	const maxVisibleItems = 18;
	const minHeight = Math.min(folders.length * itemHeight, 320);
	const maxHeight = Math.min(folders.length * itemHeight, maxVisibleItems * itemHeight);
	listEl.style.height = `${Math.max(minHeight, maxHeight)}px`;
	listEl.style.overflowY = 'auto';


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
		// Enlarge modal dimensions for better visibility
		try {
			(this as any).modalEl?.style?.setProperty('width', '720px');
			(this as any).modalEl?.style?.setProperty('max-height', '70vh');
			(this as any).modalEl?.style?.setProperty('min-height', '320px');
		} catch {}

        const listEl = contentEl.createDiv();
        listEl.addClass('suggestion-container');
        
	// Larger list area
	const itemHeight = 44;
	const maxVisibleItems = 18;
	const minHeight = Math.min(this.archives.length * itemHeight, 320);
	const maxHeight = Math.min(this.archives.length * itemHeight, maxVisibleItems * itemHeight);
	listEl.style.height = `${Math.max(minHeight, maxHeight)}px`;
	listEl.style.overflowY = 'auto';

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
		foldersContainer.style.maxHeight = '400px';
		foldersContainer.style.overflowY = 'auto';
		foldersContainer.style.border = '1px solid var(--background-modifier-border)';
		foldersContainer.style.borderRadius = '4px';
		foldersContainer.style.padding = '8px';
		foldersContainer.style.marginBottom = '16px';

		// Get all folders and organize them in a tree structure
		const allFolders = this.app.vault.getAllLoadedFiles()
			.filter(f => f instanceof TFolder && f.path !== '/')
			.map(f => f.path)
			.sort();

		// Create tree structure
		this.createFolderTree(foldersContainer, allFolders);        // Selected folders display
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

    createFolderTree(container: HTMLElement, folders: string[]) {
        // Organize folders into a tree structure
        const tree: {[key: string]: any} = {};
        
        folders.forEach(folderPath => {
            const parts = folderPath.split('/');
            let current = tree;
            let currentPath = '';
            
            parts.forEach((part, index) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                if (!current[part]) {
                    current[part] = {
                        children: {},
                        depth: index,
                        fullPath: currentPath
                    };
                }
                current = current[part].children;
            });
        });
        
        // Render the tree
        this.renderTreeNode(container, tree, 0);
    }
    
    renderTreeNode(container: HTMLElement, node: any, depth: number) {
        Object.keys(node).sort().forEach(key => {
            const item = node[key];
            const fullPath = item.fullPath;
            
            const folderItem = container.createDiv();
            folderItem.style.display = 'flex';
            folderItem.style.alignItems = 'center';
            folderItem.style.padding = '4px 0';
            folderItem.style.paddingLeft = `${depth * 20 + 8}px`;
            
            // Add expand/collapse button if has children
            const hasChildren = Object.keys(item.children).length > 0;
            if (hasChildren) {
                const expandButton = folderItem.createEl('span', { text: '▶' });
                expandButton.style.cursor = 'pointer';
                expandButton.style.marginRight = '4px';
                expandButton.style.fontSize = '12px';
                expandButton.style.transition = 'transform 0.2s';
                expandButton.style.display = 'inline-block';
                expandButton.style.width = '12px';
                
                const childrenContainer = container.createDiv();
                childrenContainer.style.display = 'none';
                
                let expanded = false;
                expandButton.addEventListener('click', () => {
                    expanded = !expanded;
                    childrenContainer.style.display = expanded ? 'block' : 'none';
                    expandButton.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
                    
                    if (expanded && childrenContainer.children.length === 0) {
                        this.renderTreeNode(childrenContainer, item.children, depth + 1);
                    }
                });
            } else {
                // Spacer for alignment
                const spacer = folderItem.createEl('span', { text: ' ' });
                spacer.style.width = '16px';
                spacer.style.display = 'inline-block';
            }

            const checkbox = folderItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedFolders.includes(fullPath);
            checkbox.style.marginRight = '8px';

            const label = folderItem.createEl('label', { text: key });
            label.style.cursor = 'pointer';
            label.style.fontFamily = 'var(--font-monospace)';
            label.style.fontSize = '0.9em';

            // Add full path as tooltip
            label.title = fullPath;

            label.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                this.updateSelectedFolders(fullPath, checkbox.checked);
            });

            checkbox.addEventListener('change', () => {
                this.updateSelectedFolders(fullPath, checkbox.checked);
            });
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
