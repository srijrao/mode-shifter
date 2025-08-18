// Minimal Obsidian API mocks for tests
export abstract class TAbstractFile {
  path: string;
  name: string;
  parent?: TFolder;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || path;
  }
}

export class TFolder extends TAbstractFile {
  children: any[] = [];
  constructor(path: string) {
    super(path);
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  
  constructor(path: string) {
    super(path);
    const parts = path.split('.');
    this.extension = parts.length > 1 ? parts[parts.length - 1] : '';
  }
}

export class Notice {
  constructor(public message: string) {}
}
export class Modal {}
export class Setting {}
export class PluginSettingTab {}
export class Plugin {}
export class App {
  vault: any;
  constructor(vault: any){ this.vault = vault; }
}
