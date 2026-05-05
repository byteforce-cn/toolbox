import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';
import type {
  IConfigurationService,
  ISecretService,
} from '@byteforce/shell';
import type {
  ConfigurationSection,
  ConfigurationProperty,
} from '@byteforce/shell';

const CONFIG_BASE = '.byteforce/config/toolbox';

export class ConfigurationService implements IConfigurationService {
  /** key: sectionId */
  private sections = new Map<string, ConfigurationSection>();
  /** key: `sectionId.propertyId`，value: 已解密的原始值 */
  private cache = new Map<string, unknown>();
  private listeners = new Map<string, Set<(v: unknown) => void>>();

  constructor(private readonly secretService: ISecretService) {}

  async init(): Promise<void> {
    for (const section of this.sections.values()) {
      await this.loadSection(section.id);
    }
  }

  register(section: ConfigurationSection): void {
    this.sections.set(section.id, section);
    // 将 default 值写入 cache（若尚无持久化值）
    for (const prop of section.properties) {
      const fullKey = `${section.id}.${prop.id}`;
      if (!this.cache.has(fullKey)) {
        this.cache.set(fullKey, prop.default);
      }
    }
  }

  get<T = unknown>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const prop = this.findProp(key);
    let stored = value;

    // 敏感字段：加密后再写入
    if (prop?.secret && typeof value === 'string' && value !== '') {
      stored = await this.secretService.encrypt(value);
    }

    this.cache.set(key, value); // cache 存明文
    await this.persistKey(key, stored);
    this.notify(key, value);
  }

  async delete(key: string): Promise<void> {
    const prop = this.findProp(key);
    this.cache.set(key, prop?.default);
    await this.persistKey(key, undefined);
    this.notify(key, prop?.default);
  }

  onDidChange(key: string, handler: (v: unknown) => void): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(handler);
    return () => this.listeners.get(key)?.delete(handler);
  }

  getSections(): ConfigurationSection[] {
    return Array.from(this.sections.values());
  }

  // ── 私有方法 ────────────────────────────────────────────────────────────────

  private findProp(key: string): ConfigurationProperty | undefined {
    for (const [sectionId, section] of this.sections) {
      if (key.startsWith(sectionId + '.')) {
        const propId = key.slice(sectionId.length + 1);
        return section.properties.find((p) => p.id === propId);
      }
    }
    return undefined;
  }

  private sectionIdFromKey(key: string): string | undefined {
    for (const sectionId of this.sections.keys()) {
      if (key.startsWith(sectionId + '.')) return sectionId;
    }
    return undefined;
  }

  private async loadSection(sectionId: string): Promise<void> {
    const section = this.sections.get(sectionId);
    if (!section) return;

    const filePath = `${CONFIG_BASE}/${sectionId}.json`;
    const ok = await exists(filePath, { baseDir: BaseDirectory.Home });
    if (!ok) return;

    try {
      const raw = await readTextFile(filePath, { baseDir: BaseDirectory.Home });
      const data = JSON.parse(raw) as Record<string, unknown>;

      for (const prop of section.properties) {
        const stored = data[prop.id];
        if (stored === undefined) continue;

        // 敏感字段：持久化的是密文，cache 存明文
        if (prop.secret && typeof stored === 'string' && stored !== '') {
          try {
            const plain = await this.secretService.decrypt(stored);
            this.cache.set(`${sectionId}.${prop.id}`, plain);
          } catch {
            // 解密失败（主密钥更换）：保留默认值
          }
        } else {
          this.cache.set(`${sectionId}.${prop.id}`, stored);
        }
      }
    } catch {
      // 文件损坏：静默降级为默认值
    }
  }

  private async persistKey(key: string, value: unknown): Promise<void> {
    const sectionId = this.sectionIdFromKey(key);
    if (!sectionId) return;

    const filePath = `${CONFIG_BASE}/${sectionId}.json`;

    // 读现有文件
    let data: Record<string, unknown> = {};
    const ok = await exists(filePath, { baseDir: BaseDirectory.Home });
    if (ok) {
      try {
        const raw = await readTextFile(filePath, { baseDir: BaseDirectory.Home });
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* 降级 */ }
    }

    // 更新
    const propId = key.slice(sectionId.length + 1);
    if (value === undefined) {
      delete data[propId];
    } else {
      data[propId] = value;
    }

    // 确保目录存在
    await mkdir(CONFIG_BASE, { baseDir: BaseDirectory.Home, recursive: true });
    await writeTextFile(filePath, JSON.stringify(data, null, 2), {
      baseDir: BaseDirectory.Home,
    });
  }

  private notify(key: string, value: unknown): void {
    this.listeners.get(key)?.forEach((cb) => {
      try {
        cb(value);
      } catch { /* ignore */ }
    });
  }
}
