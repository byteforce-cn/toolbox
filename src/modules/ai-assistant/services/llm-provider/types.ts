/**
 * LLM Provider types.
 * Frontend 仅维护用户自定义的 provider 实例，不再内置固定厂商模板。
 */

export type LLMProviderType = 'openai' | 'anthropic' | 'custom' | 'gemini';

export interface LLMProviderTypeOption {
  value: LLMProviderType;
  label: string;
  hint: string;
}

export const LLM_PROVIDER_TYPE_OPTIONS: LLMProviderTypeOption[] = [
  {
    value: 'openai',
    label: 'OpenAI 兼容',
    hint: '/v1/chat/completions，适用于 OpenAI、Ollama、vLLM、LM Studio 及其他兼容网关',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    hint: '支持根地址、/v1 或完整 /v1/messages；运行时会自动归一化到 Anthropic Messages API',
  },
  {
    value: 'custom',
    label: '自定义兼容',
    hint: '适用于 Ollama、vLLM、LM Studio、Azure OpenAI 兼容网关等自定义端点',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    hint: '默认使用 Google Gemini OpenAI-compatible endpoint，可按需覆盖 Base URL',
  },
];

export interface LLMProviderView {
  id: string;
  name: string;
  providerType: LLMProviderType;
  baseUrl: string;
  maskedApiKey: string;
  model: string;
  availableModels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Agent integration ──────────────────────────────────────────────────────

export interface LLMProviderAgentConfig {
  id: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  providerType: LLMProviderType;
  availableModels: string[];
}

// ─── Update payload ─────────────────────────────────────────────────────────

export interface LLMProviderUpdate {
  name?: string;
  providerType?: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  availableModels?: string[];
}
