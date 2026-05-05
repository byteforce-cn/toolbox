import { invoke } from '@tauri-apps/api/core';
import type { ISecretService } from '@byteforce/shell';

/**
 * Phase 2: 真实 SecretService，通过 IPC 调用 toolbox-plugin-crypto。
 * 加密方案：AES-256-GCM，主密钥存放在 OS 钥匙串。
 */
export class SecretService implements ISecretService {
  async encrypt(plain: string): Promise<string> {
    return invoke<string>('plugin:toolbox-plugin-crypto|encrypt', { payload: plain });
  }

  async decrypt(cipher: string): Promise<string> {
    return invoke<string>('plugin:toolbox-plugin-crypto|decrypt', { payload: cipher });
  }
}
