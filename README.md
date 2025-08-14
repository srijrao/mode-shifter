# Mode Shifter

A powerful Obsidian plugin that allows users to easily switch between different 'modes' by archiving and restoring sets of files. Perfect for managing different project states, hiding completed work, or organizing large vaults.

## ✨ Features

### 🎯 Core Functionality
- **Custom Modes**: Define multiple modes with include/exclude glob patterns
- **Smart Archiving**: Files are zipped and moved to an archive folder, removing them from Obsidian's index
- **Safe Restoration**: Multiple restoration policies (overwrite, skip, create conflict copies)
- **Robust Operations**: Comprehensive verification and rollback mechanisms

### 🔧 Mode Management
- **Visual Mode Editor**: Rich UI for creating and editing modes
- **File Pattern Support**: Use glob patterns like `*.md`, `folder/**`, `!temp/**`
- **Size Calculation**: See how much space each mode consumes
- **File Preview**: Preview which files will be affected before activation

### 🛡️ Safety & Reliability
- **Zip Verification**: Validates archives before any file deletion
- **Batched Operations**: Processes files in batches with checkpoints
- **Automatic Rollback**: Restores files if operations fail partway through
- **Conflict Resolution**: Handle existing files during restoration

### 🎨 User Interface
- **Settings Panel**: Comprehensive configuration interface
- **Mode List**: Visual overview of all defined modes with actions
- **Progress Indicators**: Real-time feedback during operations
- **Size Display**: Human-readable file size formatting

## 🚀 Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/mode-shifter` directory
2. In Obsidian, go to Settings → Community plugins → Turn off Safe Mode
3. Enable the "Mode Shifter" plugin

## 📖 Usage

### Creating a Mode

1. Open Settings → Mode Shifter
2. Click "Add Mode"
3. Configure:
   - **Name**: Display name for your mode
   - **Description**: Optional description
   - **Include patterns**: Glob patterns for files to archive (e.g., `*.md`, `folder/**`)
   - **Exclude patterns**: Optional patterns to exclude (e.g., `temp/**`, `*.tmp`)

### Activating a Mode

1. In the Mode Shifter settings, find your mode
2. Click "Preview Files" to see what will be affected
3. Click "Calculate Size" to see storage impact
4. Click "Activate Mode" to archive the files

When activated, matching files are:
- Compressed into a timestamped zip file
- Moved to the archive folder
- Removed from Obsidian's file system (no longer indexed/searchable)

### Restoring Files

Use the "Restore Last Archive" command or the mode-specific restore options.

Restoration policies:
- **Overwrite**: Replace existing files with archived versions
- **Skip**: Keep existing files, skip archived versions
- **Conflict Copy**: Create renamed copies (e.g., `file-conflict-abc123.md`)

## ⚙️ Configuration

### Archive Folder
Set where zip archives are stored (default: "Mode Shifter Archive")

### Restore Policy
Choose default behavior when restoring files that already exist

### Mode Definitions
Each mode includes:
- Unique ID and name
- Include patterns (required)
- Exclude patterns (optional)
- Description (optional)

## 🔧 Technical Details

### File Operations
- Uses `fast-glob` for pattern matching
- `jszip` for compression/decompression
- Atomic operations with verification
- Timeout protection for large operations

### Safety Mechanisms
- **Pre-deletion verification**: Archives are tested before original deletion
- **Batched processing**: Large operations split into checkpointed batches
- **Rollback capability**: Failed operations automatically restore from archive
- **Manifest logging**: Detailed logs of all operations

### Performance
- Streaming operations for large files
- Configurable batch sizes
- Progress callbacks for UI updates
- Timeout handling for robust operations

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
# Run tests
npm test

# Type checking
npm run typecheck

# Build plugin
npm run build

# Development mode (watch)
npm run dev
```

### Testing
Comprehensive test suite covering:
- Archive/restore functionality
- Zip verification
- Rollback mechanisms
- Size calculations
- Error handling

## 📝 API Reference

### Core Functions

#### `createArchive(app, vaultPath, archiveFolder, modeName, files, options)`
Creates a zip archive of specified files with optional deletion.

#### `restoreArchive(app, zipPath, options)`
Restores files from a zip archive with configurable conflict resolution.

#### `verifyZipIntegrity(app, zipPath, expectedFiles, options)`
Verifies zip contents match expected file list.

#### `calculateModeSize(app, files)`
Calculates total size and file count for a set of files.

### Type Definitions

```typescript
interface ModeEntry {
  id: string;
  name: string;
  include: string[];
  exclude?: string[];
  description?: string;
}

interface ModeShifterSettings {
  archiveFolder: string;
  modes: ModeEntry[];
  lastActiveModeId?: string;
  restorePolicy: RestorePolicy;
}

type RestorePolicy = 'overwrite' | 'skip' | 'conflict-copy';
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Run type checking: `npm run typecheck`
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

Built for the Obsidian community with focus on data safety and user experience.
