/**
 * backend-unavailable.ts — 用于尚未注册 Tauri 命令的占位 Service。
 *
 * 后端命令未补齐时，前端调用会得到 `Command not found` 错误。
 * 通过 `wrapBackendCall` 把它转换成结构化的 `BackendUnavailableError`，
 * UI 层可据此渲染「需启用后端命令 `<name>`」的提示。
 */
import { invokeAI } from '../modules/ai-assistant/services/invoke-ai';

export class BackendUnavailableError extends Error {
  readonly commandName: string;

  constructor(commandName: string, cause?: unknown) {
    super(`后端命令未注册：${commandName}`);
    this.name = 'BackendUnavailableError';
    this.commandName = commandName;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/** 调用后端命令；命令缺失时抛 BackendUnavailableError，其它错误透传。 */
export async function callBackend<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invokeAI<T>(command, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /not\s+found/i.test(msg) ||
      /unknown command/i.test(msg) ||
      /command\s+.+\s+not\s+registered/i.test(msg)
    ) {
      throw new BackendUnavailableError(command, err);
    }
    throw err;
  }
}

/** UI 工具：判断错误是否为后端未就绪。 */
export function isBackendUnavailable(err: unknown): err is BackendUnavailableError {
  return err instanceof BackendUnavailableError;
}
