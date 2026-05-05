/**
 * llm-provider-service.ts — 无 DI 的 LLM 提供商 IPC 封装。
 * 所有方法直接调用 Tauri invoke()。
 */
import { invokeAI } from './invoke-ai';
import type { LLMProviderType, LLMProviderView, LLMProviderUpdate, LLMProviderAgentConfig } from './llm-provider/types';

export type { LLMProviderView, LLMProviderUpdate, LLMProviderAgentConfig };

// ─── Raw response shape from Rust backend ───────────────────────────────────
// Rust struct fields serialised with serde camelCase.
interface RawProviderView {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeyMasked: string;   // Rust: api_key_masked
  models: string[];       // Rust: models  → TS: availableModels
  defaultModel: string;   // Rust: default_model → TS: model
  isActive: boolean;      // Rust: is_active → TS: isConfigured
  createdAt: string;
  updatedAt: string;
}

interface RawProviderAgentConfig {
  providerId: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string[];
}

function normalizeProviderType(value: string): LLMProviderType {
  return value === 'anthropic' || value === 'custom' || value === 'gemini' ? value : 'openai';
}

/** 将 Rust 返回的原始视图映射为 TypeScript UI 视图模型。 */
function enrich(raw: RawProviderView): LLMProviderView {
  return {
    id: raw.id,
    name: raw.name,
    providerType: normalizeProviderType(raw.providerType),
    baseUrl: raw.baseUrl,
    model: raw.defaultModel,
    availableModels: raw.models,
    maskedApiKey: raw.apiKeyMasked,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** 将 TypeScript 更新载荷的字段名转换为 Rust 期望的格式。 */
function toRustUpdate(update: LLMProviderUpdate & { name?: string }) {
  return {
    name: update.name,
    providerType: normalizeProviderType(update.providerType ?? 'openai'),
    apiKey: update.apiKey,
    baseUrl: update.baseUrl,
    defaultModel: update.model,       // TS: model → Rust: defaultModel
    models: update.availableModels,   // TS: availableModels → Rust: models
  };
}

/** 列出所有 LLM 提供商实例（API key 已脱敏）。 */
export const llmProviderList = async (): Promise<LLMProviderView[]> => {
  const raw = await invokeAI<RawProviderView[]>('llm_provider_list');
  return raw.map(enrich);
};

/** 更新提供商配置（apiKey 由 Rust 侧加密后存储）。 */
export const llmProviderUpdate = async (
  id: string,
  update: LLMProviderUpdate & { name?: string },
): Promise<LLMProviderView> => {
  const raw = await invokeAI<RawProviderView>('llm_provider_update', {
    id,
    update: toRustUpdate(update),
  });
  return enrich(raw);
};

/** 获取当前激活提供商的运行时配置（含明文 apiKey，内部使用）。 */
export const llmProviderGetAgentConfig = async (providerId: string): Promise<LLMProviderAgentConfig> => {
  const raw = await invokeAI<RawProviderAgentConfig>('llm_provider_get_agent_config', { providerId });
  return {
    id: raw.providerId,
    apiKey: raw.apiKey,
    baseUrl: raw.baseUrl,
    model: raw.defaultModel,
    providerType: normalizeProviderType(raw.providerType),
    availableModels: raw.models,
  };
};

/** 获取当前激活的提供商（api_key 已脱敏）。 */
export const llmProviderGetActive = async (): Promise<LLMProviderView | null> => {
  const raw = await invokeAI<RawProviderView | null>('llm_provider_get_active');
  return raw ? enrich(raw) : null;
};

/** 设置激活提供商。 */
export const llmProviderSetActive = (id: string): Promise<void> =>
  invokeAI<void>('llm_provider_set_active', { id });

/** 删除提供商配置。 */
export const llmProviderDelete = (id: string): Promise<void> =>
  invokeAI<void>('llm_provider_delete', { id });

/** 测试连接是否可用。 */
export const llmProviderTestConnection = (providerId: string): Promise<boolean> =>
  invokeAI<boolean>('llm_provider_test_connection', { providerId });

/** 获取动态端点的可用模型列表。 */
export const llmProviderFetchModels = (providerId: string): Promise<string[]> =>
  invokeAI<string[]>('llm_provider_fetch_models', { providerId });
