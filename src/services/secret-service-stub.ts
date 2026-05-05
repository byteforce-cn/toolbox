/**
 * @deprecated UNSAFE: SecretServiceStub 以明文存储密钥，仅用于本地开发调试。
 * 生产构建（NODE_ENV=production）中禁止导入此文件。
 * CI 中通过 grep 检查此文件是否被引用：任何 import 都应导致构建失败。
 *
 * Phase 2 已用 SecretService（toolbox-plugin-crypto）替代，请勿回退到此 stub。
 */
if (import.meta.env.PROD) {
  throw new Error(
    '[Security] SecretServiceStub must not be used in production builds. ' +
      'Use SecretService (toolbox-plugin-crypto) instead.',
  );
}

import type { ISecretService } from '@byteforce/shell';

/**
 * Phase 1 stub：直接返回明文，不做加密。
 * Phase 2 将替换为调用 toolbox-plugin-crypto 的真实实现。
 */
export class SecretServiceStub implements ISecretService {
  async encrypt(plain: string): Promise<string> {
    return plain;
  }

  async decrypt(cipher: string): Promise<string> {
    return cipher;
  }
}
