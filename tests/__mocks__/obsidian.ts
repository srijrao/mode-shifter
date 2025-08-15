// Minimal Obsidian API mocks for tests
export class TFolder {
  path: string;
  name: string;
  children: any[] = [];
  parent?: TFolder;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || path;
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
