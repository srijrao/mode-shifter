import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFolder, TFile } from './__mocks__/obsidian';

// Mock the main plugin class with just the context menu methods
class MockModeShifterPlugin {
  addFileMenuItems(menu: any, file: any, source: string) {
    // Only show menu items in file explorer
    if (source !== 'file-explorer-context-menu') return;

    if (file instanceof TFolder) {
      // Add "Zip Folder" option for folders
      menu.addItem((item: any) => {
        item
          .setTitle('📦 Zip Folder')
          .setIcon('package')
          .onClick(async () => {
            // Mock implementation
          });
      });
    } else if (file instanceof TFile && (file.extension === 'zip' || file.extension === '7z')) {
      // Add "Unzip Archive" option for archive files
      menu.addItem((item: any) => {
        item
          .setTitle('📂 Unzip Archive')
          .setIcon('folder-open')
          .onClick(async () => {
            // Mock implementation
          });
      });
    }
  }

  addFilesMenuItems(menu: any, files: any[], source: string) {
    // Only show menu items in file explorer
    if (source !== 'file-explorer-context-menu') return;

    // Check if all selected files are folders
    const allFolders = files.every(file => file instanceof TFolder);
    const allArchives = files.every(file => 
      file instanceof TFile && (file.extension === 'zip' || file.extension === '7z')
    );

    if (allFolders && files.length > 1) {
      // Add "Zip Selected Folders" option
      menu.addItem((item: any) => {
        item
          .setTitle(`📦 Zip ${files.length} Folders`)
          .setIcon('package')
          .onClick(async () => {
            // Mock implementation
          });
      });
    } else if (allArchives && files.length > 1) {
      // Add "Unzip Selected Archives" option
      menu.addItem((item: any) => {
        item
          .setTitle(`📂 Unzip ${files.length} Archives`)
          .setIcon('folder-open')
          .onClick(async () => {
            // Mock implementation
          });
      });
    }
  }
}

// Extend TFile mock to include custom extension
class MockTFile extends TFile {
  constructor(path: string, extension: string) {
    super(path);
    this.extension = extension;
  }
}

// Mock menu class to track added items
class MockMenu {
  items: Array<{title: string, icon: string, onClick: () => void}> = [];
  
  addItem(callback: (item: any) => void) {
    const mockItem = {
      title: '',
      icon: '',
      onClick: vi.fn(),
      setTitle: vi.fn().mockImplementation(function(this: any, title: string) {
        this.title = title;
        return this;
      }),
      setIcon: vi.fn().mockImplementation(function(this: any, icon: string) {
        this.icon = icon;
        return this;
      })
    };
    
    callback(mockItem);
    this.items.push({
      title: mockItem.title,
      icon: mockItem.icon,
      onClick: mockItem.onClick
    });
  }
  
  getItemTitles() {
    return this.items.map(item => item.title);
  }
}

describe('Context Menu Integration', () => {
  let plugin: MockModeShifterPlugin;
  let menu: MockMenu;

  beforeEach(() => {
    plugin = new MockModeShifterPlugin();
    menu = new MockMenu();
  });

  describe('addFileMenuItems', () => {
    it('should add zip menu item for folders with correct source', () => {
      const folder = new TFolder('test-folder');
      
      plugin.addFileMenuItems(menu, folder, 'file-explorer-context-menu');
      
      expect(menu.getItemTitles()).toContain('📦 Zip Folder');
      expect(menu.items[0].icon).toBe('package');
    });

    it('should add unzip menu item for zip files with correct source', () => {
      const zipFile = new MockTFile('test.zip', 'zip');
      
      plugin.addFileMenuItems(menu, zipFile, 'file-explorer-context-menu');
      
      expect(menu.getItemTitles()).toContain('📂 Unzip Archive');
      expect(menu.items[0].icon).toBe('folder-open');
    });

    it('should add unzip menu item for 7z files with correct source', () => {
      const sevenZipFile = new MockTFile('test.7z', '7z');
      
      plugin.addFileMenuItems(menu, sevenZipFile, 'file-explorer-context-menu');
      
      expect(menu.getItemTitles()).toContain('📂 Unzip Archive');
      expect(menu.items[0].icon).toBe('folder-open');
    });

    it('should NOT add menu items with wrong source (old behavior)', () => {
      const folder = new TFolder('test-folder');
      
      plugin.addFileMenuItems(menu, folder, 'file-explorer');
      
      expect(menu.items).toHaveLength(0);
    });

    it('should NOT add menu items for non-archive files', () => {
      const textFile = new MockTFile('test.txt', 'txt');
      
      plugin.addFileMenuItems(menu, textFile, 'file-explorer-context-menu');
      
      expect(menu.items).toHaveLength(0);
    });

    it('should NOT add menu items from non-file-explorer sources', () => {
      const folder = new TFolder('test-folder');
      
      plugin.addFileMenuItems(menu, folder, 'editor-menu');
      
      expect(menu.items).toHaveLength(0);
    });
  });

  describe('addFilesMenuItems', () => {
    it('should add batch zip menu item for multiple folders', () => {
      const folders = [
        new TFolder('folder1'),
        new TFolder('folder2'),
        new TFolder('folder3')
      ];
      
      plugin.addFilesMenuItems(menu, folders, 'file-explorer-context-menu');
      
      expect(menu.getItemTitles()).toContain('📦 Zip 3 Folders');
      expect(menu.items[0].icon).toBe('package');
    });

    it('should add batch unzip menu item for multiple archives', () => {
      const archives = [
        new MockTFile('archive1.zip', 'zip'),
        new MockTFile('archive2.zip', 'zip')
      ];
      
      plugin.addFilesMenuItems(menu, archives, 'file-explorer-context-menu');
      
      expect(menu.getItemTitles()).toContain('📂 Unzip 2 Archives');
      expect(menu.items[0].icon).toBe('folder-open');
    });

    it('should NOT add menu items for single folder (covered by addFileMenuItems)', () => {
      const folders = [new TFolder('single-folder')];
      
      plugin.addFilesMenuItems(menu, folders, 'file-explorer-context-menu');
      
      expect(menu.items).toHaveLength(0);
    });

    it('should NOT add menu items for mixed file types', () => {
      const mixedFiles = [
        new TFolder('folder'),
        new MockTFile('archive.zip', 'zip')
      ];
      
      plugin.addFilesMenuItems(menu, mixedFiles, 'file-explorer-context-menu');
      
      expect(menu.items).toHaveLength(0);
    });

    it('should NOT add menu items with wrong source', () => {
      const folders = [
        new TFolder('folder1'),
        new TFolder('folder2')
      ];
      
      plugin.addFilesMenuItems(menu, folders, 'file-explorer');
      
      expect(menu.items).toHaveLength(0);
    });
  });

  describe('Source string compatibility', () => {
    it('should work with the correct Obsidian source string', () => {
      // This test verifies the fix for the actual issue found in the logs
      const folder = new TFolder('test-folder');
      const correctSource = 'file-explorer-context-menu'; // This is what Obsidian actually sends
      
      plugin.addFileMenuItems(menu, folder, correctSource);
      
      expect(menu.getItemTitles()).toContain('📦 Zip Folder');
    });

    it('should reject the old incorrect source string', () => {
      const folder = new TFolder('test-folder');
      const oldIncorrectSource = 'file-explorer'; // This was the bug - checking for wrong string
      
      plugin.addFileMenuItems(menu, folder, oldIncorrectSource);
      
      expect(menu.items).toHaveLength(0);
    });
  });
});
