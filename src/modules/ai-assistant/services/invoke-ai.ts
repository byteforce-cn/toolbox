/**
 * invoke-ai.ts — toolbox-plugin-ai 插件命令调用封装。
 *
 * Tauri v2 的插件命令必须通过 `plugin:plugin-name|command_name` 形式调用。
 * 本模块提供统一封装，避免每处都重复写命名空间前缀。
 *
 * 参考：secret-service.ts 中 `plugin:toolbox-plugin-crypto|encrypt` 的惯用法。
 */
import { invoke } from '@tauri-apps/api/core';

const PREFIX = 'plugin:toolbox-plugin-ai|';

/**
 * 调用 toolbox-plugin-ai 插件中的 Tauri 命令。
 * @param cmd  裸命令名（不含 plugin: 前缀），如 'llm_provider_list'
 * @param args 透传给 Tauri invoke 的参数对象
 */
export function invokeAI<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(`${PREFIX}${cmd}`, args);
}
