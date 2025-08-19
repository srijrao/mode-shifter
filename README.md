# Mode Shifter

Current release: 1.0.1 (2025-08-17)

A powerful Obsidian plugin for archiving and managing folders in your vault. Create zip archives of folders, organize them with flexible storage options, and restore them with advanced conflict resolution.

## ✨ Features

### 🎯 Core Functionality
- **Folder Archiving**: Select any folder in your vault and create a zip archive
- **Flexible Archive Storage**: Store archives in a central folder OR alongside source folders
- **Group Operations**: Create and manage folder groups for batch archiving
- **Smart Restoration**: Restore archives with advanced conflict resolution policies
- **Vault-wide Archive Discovery**: Find and restore archives from anywhere in your vault

### 🔧 Enhanced Workflow
1. **Single Folder**: Use "Zip a folder" command to archive individual folders
2. **Folder Groups**: Create named groups of folders for batch operations
3. **Flexible Storage**: Choose between centralized archive storage or in-place archiving
4. **Easy Restoration**: Restore the most recent archive or select from all available archives
5. **Robust Deletion**: Advanced folder deletion with multiple fallback strategies

### 🛡️ Safety & Reliability
- **Enhanced Deletion**: Multi-tier fallback system for reliable folder removal
- **Zip Verification**: Validates archives before any operations
- **Permission Handling**: Robust error handling with detailed user guidance
- **Conflict Resolution**: Handle existing files during restoration with multiple policies
- **Atomic Operations**: Safe file handling with rollback on errors

### 🎨 User Interface
- **Tree-style Folder Selection**: Hierarchical folder picker with expand/collapse
- **Comprehensive Settings Panel**: Full configuration control
- **Archive Discovery**: Visual archive selection from entire vault
- **Real-time Feedback**: Progress notifications and detailed error messages

## 🚀 Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/mode-shifter` directory
2. In Obsidian, go to Settings → Community plugins → Turn off Safe Mode
3. Enable the "Mode Shifter" plugin

## 📖 Usage

### Individual Folder Archiving

1. Use Command Palette (Ctrl/Cmd + P) and search for "Zip a folder"
2. Select the folder you want to archive from the tree-style picker
3. The folder will be compressed into a timestamped zip file
4. Archive location depends on your "Archive in place" setting

### Group Folder Operations

1. **Create Groups**: Go to plugin settings and create folder groups
2. **Add Folders**: Use the tree-view interface to select folders at any depth
3. **Batch Archive**: Use "Zip Group: [Group Name]" commands for group operations
4. **Batch Restore**: Use "Unzip Group: [Group Name]" commands to restore groups

### Archive Restoration

1. **Latest Archive**: Use "Restore Last Archive" to restore the most recent archive
2. **Select Archive**: Use "Unzip Archive" to choose from all available archives
3. **Vault-wide Search**: Archives are discovered from anywhere in your vault
4. **Conflict Handling**: Choose your preferred restore policy in settings

### Advanced Features

- **Tree Folder Selection**: Navigate and select folders using hierarchical tree view
- **Flexible Storage**: Toggle "Archive in place" to store archives with source folders
- **Enhanced Deletion**: Robust folder removal with multiple fallback strategies
- **Smart Discovery**: Find archives anywhere in vault, not just archive folder

## ⚙️ Settings

### Archive Configuration
- **Archive Folder**: Where zip files are stored when "Archive in place" is disabled (default: "Archive")
- **Archive in Place**: Toggle to store archives alongside source folders instead of central folder
- **Delete Original Folder**: Automatically remove source folders after successful archiving
- **Delete Archive After Restore**: Automatically remove archives after successful restoration

### Restore Policies
- **Overwrite**: Replace existing files during restoration
- **Skip**: Leave existing files untouched during restoration
- **Conflict Copy**: Create copies with conflict suffixes for existing files

### Folder Groups
- **Create Groups**: Organize multiple folders into named groups for batch operations
- **Tree Selection**: Use hierarchical folder picker to select folders at any depth
- **Group Commands**: Dedicated zip/unzip commands for each group
- **Flexible Organization**: Groups can contain folders from anywhere in vault

## 🆕 Recent Enhancements (v2.0)

### Enhanced Folder Deletion
- **Multi-tier Fallbacks**: Advanced deletion system with 3 fallback strategies
- **Permission Handling**: Robust error handling for permission-denied scenarios
- **User Guidance**: Detailed error messages with actionable advice

### Flexible Archive Storage
- **Archive in Place**: New option to store archives with source folders
- **Vault-wide Discovery**: Find archives anywhere in vault, not just archive folder
- **Smart Location Logic**: Intelligent archive placement based on user preference

### Advanced Folder Selection
- **Tree View Interface**: Hierarchical folder display with expand/collapse
- **Nested Selection**: Select folders at any depth in vault structure
- **Visual Hierarchy**: Indented display with tooltips showing full paths

### Usability and Discovery
- **Larger Selection Modals**: Increased modal width and list height for both folder and archive pickers
- **Better Archive Discovery**: Scans entire vault and ignores plugin directories for unzip selection
## 🔧 Technical Details

- **Enhanced Deletion**: Multi-tier folder deletion with adapter-level fallbacks
- **Archive Discovery**: Vault-wide recursive archive search with metadata caching
- **Tree Rendering**: Dynamic hierarchical folder display with lazy loading
- **JSZip Integration**: Robust compression/decompression with verification
- **Atomic Operations**: Safe file handling with comprehensive rollback on errors
- **Timeout Protection**: Configurable timeouts for long-running operations
- **Cross-platform Compatibility**: Handles path separators and file system differences

## 🧪 Development

### Prerequisites
- Node.js and npm
- TypeScript
- Obsidian development environment

### Setup
```powershell
npm install --legacy-peer-deps
```

### Development Commands
```powershell
# Build plugin
npm run build

# Development mode (watch)
npm run dev

# Type checking
npm run check
```

### Architecture Notes
- **Plugin Class**: Main plugin with command registration and settings management
- **Archive Module**: Core archiving functionality with JSZip integration
- **Modal Classes**: Tree-style folder selection and archive selection interfaces
- **Settings Tab**: Comprehensive configuration interface with real-time updates

## 🚨 Breaking Changes in v2.0

- **Settings Migration**: New `archiveInPlace` setting added (defaults to `false` for backward compatibility)
- **Archive Discovery**: Commands now search entire vault instead of just archive folder
- **Enhanced Error Handling**: More detailed error messages may appear different from v1.x

## 📋 Changelog

### Version 2.0.0 (August 15, 2025)
- ✅ **Fixed**: Enhanced folder deletion with multi-tier fallback strategies
- ✅ **Added**: Configurable archive storage location (in-place vs centralized)
- ✅ **Enhanced**: Tree-view folder selection with nested folder support
- ✅ **Improved**: Vault-wide archive discovery and management
- ✅ **Enhanced**: Error handling with detailed user guidance

### Version 1.x
- Basic folder archiving and restoration
- Simple folder selection interface
- Centralized archive storage only

## 🧪 Development

### Prerequisites
- Node.js and npm
- TypeScript

### Setup
```powershell
npm install --legacy-peer-deps
```

### Development Commands
```powershell
# Build plugin
npm run build

# Development mode (watch)
npm run dev
```

## 📝 License

MIT License - see LICENSE file for details.

## ⚠️ Desktop-only notice

This plugin uses desktop-only Node/Electron APIs (for example, Electron's `shell.trashItem`) to provide safe system-trash deletion and other file-system operations. Because of this, the plugin requires Obsidian Desktop and will not function on Obsidian Mobile or web builds.

## Third-party libraries & licenses

This project bundles or depends on the following third-party libraries. They are included under their respective licenses — see the linked pages for full license text and attribution details.

- JSZip — MIT. See: https://github.com/Stuk/jszip/blob/main/LICENSE.markdown
- pako — MIT. See: https://github.com/nodeca/pako/blob/master/LICENSE
- fast-glob — MIT. See: https://github.com/mrmlnc/fast-glob/blob/master/license

If you require a different set of bundled artifacts for licensing reasons, please raise an issue.

## 🙏 Acknowledgments

Built for the Obsidian community with focus on reliability, flexibility, and user experience. Special thanks to the community for feedback that led to the v2.0 enhancements.

## 🐛 Support & Issues

If you encounter any issues:
1. Check the plugin settings for configuration options
2. Look for detailed error messages in notifications
3. For permission errors, try the enhanced deletion fallbacks
4. Report persistent issues with your vault structure details

## 🔮 Future Roadmap

- **Archive Compression Levels**: Configurable compression settings
- **Batch Archive Management**: Multi-select archive operations
- **Archive Metadata**: Enhanced archive information and search
- **Import/Export Groups**: Share folder group configurations
- **Scheduled Archiving**: Automatic archiving based on rules
