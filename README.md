# Mode Shifter

A simple Obsidian plugin for zipping and unzipping folders in your vault. Archive folders to save space and restore them when needed.

## ✨ Features

### 🎯 Core Functionality
- **Folder Zipping**: Select any folder in your vault and create a zip archive
- **Easy Restoration**: Restore the most recent archive with a single command
- **Safe Operations**: Archives are verified before any operations
- **Flexible Restore Policies**: Choose how to handle conflicts (overwrite, skip, or create conflict copies)

### 🔧 Simple Workflow
1. Use "Zip a folder" command to select and archive any folder
2. Folder contents are preserved in a timestamped zip file
3. Use "Restore Last Archive" to extract the most recent archive
4. Configure restore behavior in plugin settings

### 🛡️ Safety & Reliability
- **Zip Verification**: Validates archives before operations
- **Batched Operations**: Processes files efficiently  
- **Conflict Resolution**: Handle existing files during restoration

### 🎨 User Interface
- **Settings Panel**: Simple configuration interface
- **Folder Selection**: Visual folder picker modal
- **Progress Feedback**: Real-time notifications during operations

## 🚀 Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/folder-archiver` directory
2. In Obsidian, go to Settings → Community plugins → Turn off Safe Mode
3. Enable the "Folder Archiver" plugin

## 📖 Usage

### Zipping a Folder

1. Use Command Palette (Ctrl/Cmd + P) and search for "Zip a folder"
2. Select the folder you want to archive from the picker
3. The folder will be compressed into a timestamped zip file in your archive folder

### Restoring an Archive

1. Use Command Palette and search for "Restore Last Archive"
2. The most recent archive will be extracted back to your vault
3. Choose your preferred restore policy in settings:
   - **Overwrite**: Replace existing files
   - **Skip**: Leave existing files untouched  
   - **Conflict Copy**: Create copies with conflict suffixes

## ⚙️ Settings

- **Archive Folder**: Where zip files are stored (default: "Archive")
- **Restore Policy**: How to handle file conflicts during restoration
## 🔧 Technical Details

- Uses `jszip` for compression/decompression
- Atomic operations with verification
- Timeout protection for operations
- Safe file handling with rollback on errors

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

##  License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

Built for the Obsidian community with focus on simplicity and data safety.
