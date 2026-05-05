/**
 * useAgentConfig.ts — Agent 配置管理 Hook。
 * 适配 toolbox 函数式 API，去除 InversifyJS DI 依赖。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as agentService from '../../services/agent-service';
import { toErrorMessage } from '../../services/error-message';
import * as llmProviderService from '../../services/llm-provider-service';
import { buildExecutionMetadataBlock, getAgentModePolicy, type AgentMode } from '../../services/mode';
import { useFileBufferStore } from '../../../../store/file-buffer-store';
import { useWorkspaceStore } from '../../../../store/workspace-store';
import {
  buildFileContext,
  buildFileTreeContext,
  buildTopSymbolsContext,
  buildWorkspaceContext,
} from '../file-context-builder';
import type { AgentConfig } from '../../services/types';
import type { LLMProviderAgentConfig } from '../../services/llm-provider-service';

export const DEFAULT_AGENT_ID = agentService.DEFAULT_ASSISTANT_AGENT_ID;
const DEFAULT_RUNTIME_AGENT_ID = agentService.DEFAULT_ASSISTANT_RUNTIME_AGENT_ID;

export interface ExecutionMetadata {
  aiSessionId: string;
  runId?: string;
  mode: AgentMode;
  activeFilePath?: string | null;
  workspaceRoot?: string | null;
}

export interface ProviderOption {
  id: string;
  name: string;
  providerType: string;
  models: string[];
}

interface UseAgentConfigParams {
  activeFilePath: string | null;
  pinnedContextPaths: Set<string>;
  currentSessionIdRef: React.RefObject<string>;
  workspaceRoot?: string | null;
}

export function useAgentConfig({
  activeFilePath,
  pinnedContextPaths,
  currentSessionIdRef,
  workspaceRoot,
}: UseAgentConfigParams) {
  const [configError, setConfigError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('build');
  const [activeModel, setActiveModel] = useState<string | undefined>();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | undefined>();
  const [enabledProviders, setEnabledProviders] = useState<ProviderOption[]>([]);
  const [activeContextWindow, setActiveContextWindow] = useState<number | undefined>();
  const [configReady, setConfigReady] = useState(false);
  const lastConfigRef = useRef<LLMProviderAgentConfig | null>(null);
  const lastFingerprintRef = useRef<string | null>(null);
  const persistedTemplateRef = useRef<AgentConfig | null>(null);

  const loadPersistedDefaults = useCallback(async () => {
    setConfigReady(false);
    const [savedConfig, prompt] = await Promise.all([
      agentService.agentGetConfig(DEFAULT_AGENT_ID).catch(() => null),
      agentService.agentGetDefaultSystemPrompt().catch(() => ''),
    ]);
    persistedTemplateRef.current = savedConfig;
    setInstructions(savedConfig?.instructions?.trim() ? savedConfig.instructions : prompt);
    setActiveModel(savedConfig?.model);
    setActiveProviderId(savedConfig?.providerId);
    setConfigReady(true);
  }, []);

  useEffect(() => {
    void loadPersistedDefaults();
  }, [loadPersistedDefaults]);

  const initAgent = useCallback(async (
    overrideModel?: string,
    overrideMode?: AgentMode,
    executionMetadata?: ExecutionMetadata,
    overrideProviderId?: string,
  ) => {
    if (!configReady) return false;
    setConfigError(null);
    try {
      const allProviders = await llmProviderService.llmProviderList();
      const providers: ProviderOption[] = allProviders.map((provider) => ({
        id: provider.id,
        name: provider.name,
        providerType: provider.providerType,
        models: provider.availableModels.length > 0 ? provider.availableModels : [provider.model],
      }));
      setEnabledProviders(providers);

      const templateConfig = persistedTemplateRef.current;
      const targetProviderId = overrideProviderId ?? activeProviderId ?? templateConfig?.providerId;
      let active = targetProviderId
        ? allProviders.find((p) => p.id === targetProviderId) ?? null
        : null;

      if (!active) {
        active = await llmProviderService.llmProviderGetActive();
      }
      if (!active) {
        setConfigError('请先在设置 → LLM 提供商中新增并配置一个 Provider。');
        return false;
      }

      setActiveProviderId(active.id);
      const agentConfig = await llmProviderService.llmProviderGetAgentConfig(active.id);
      if (!agentConfig) {
        setConfigError(`提供者「${active.name}」配置异常，请前往设置页面检查。`);
        return false;
      }

      const baseInstructions = instructions || templateConfig?.instructions || '';
      const isProviderSwitch = overrideProviderId !== undefined && overrideProviderId !== lastConfigRef.current?.id;
      const modelToUse = overrideModel
        ? overrideModel
        : isProviderSwitch ? agentConfig.model : (activeModel ?? templateConfig?.model ?? agentConfig.model);
      setActiveModel(modelToUse);
      const modelList = active.availableModels.length > 0 ? active.availableModels : [agentConfig.model];
      setAvailableModels(modelList);

      const resolvedMode = overrideMode ?? agentMode;
      const modePolicy = getAgentModePolicy(resolvedMode);
      const pinnedStr = [...pinnedContextPaths].sort().join(',');
      const wsRoot = workspaceRoot ?? useWorkspaceStore.getState().rootPath;

      const fingerprint = [
        active.id, modelToUse, resolvedMode,
        activeFilePath ?? '', pinnedStr, baseInstructions,
        wsRoot ?? '', 'session-manual-approval',
      ].join('|');

      if (lastFingerprintRef.current === fingerprint) return true;

      if (!templateConfig) {
        const defaultTemplate: AgentConfig = {
          id: DEFAULT_AGENT_ID,
          name: 'AI Assistant',
          description: 'AI 助手默认配置',
          instructions: baseInstructions,
          model: modelToUse,
          providerId: active.id,
          tools: modePolicy.tools,
          maxIterations: modePolicy.maxIterations,
          autoApprove: false,
          contextWindow: undefined,
          subagentEnabled: true,
        };
        try {
          await agentService.agentAddConfig(defaultTemplate);
          persistedTemplateRef.current = defaultTemplate;
        } catch {
          persistedTemplateRef.current = defaultTemplate;
        }
      }

      let fullInstructions = baseInstructions;

      const { context: fileCtx } = buildFileContext(
        useFileBufferStore.getState().buffers,
        activeFilePath,
        pinnedContextPaths,
      );
      const buffers = useFileBufferStore.getState().buffers;
      const wsCtx = buildWorkspaceContext({
        rootPath: wsRoot,
        activeFilePath,
        openFiles: Object.keys(buffers),
        dirtyFiles: Object.values(buffers).filter((b) => b.isModified).map((b) => b.filePath),
      });

      const [fileTreeCtx, symbolCtx] = await Promise.all([
        buildFileTreeContext(wsRoot),
        buildTopSymbolsContext(wsRoot),
      ]);

      if (wsCtx) fullInstructions += `\n\n${wsCtx}`;
      if (fileTreeCtx) fullInstructions += `\n\n${fileTreeCtx}`;
      if (symbolCtx) fullInstructions += `\n\n${symbolCtx}`;
      if (fileCtx) fullInstructions += `\n\n${fileCtx}`;

      fullInstructions += `\n\n${buildExecutionMetadataBlock(
        executionMetadata ?? {
          aiSessionId: currentSessionIdRef.current ?? '',
          mode: resolvedMode,
          activeFilePath,
          workspaceRoot: wsRoot,
        },
      )}`;

      const contextWindow = undefined;
      setActiveContextWindow(contextWindow);

      await agentService.agentAddConfig({
        id: DEFAULT_RUNTIME_AGENT_ID,
        name: 'AI Assistant',
        description: 'AI 助手运行时配置',
        instructions: fullInstructions,
        model: modelToUse,
        providerId: active.id,
        tools: modePolicy.tools,
        maxIterations: modePolicy.maxIterations,
        autoApprove: false,
        contextWindow,
        subagentEnabled: true,
      });

      lastConfigRef.current = { ...agentConfig, model: modelToUse };
      lastFingerprintRef.current = fingerprint;
      return true;
    } catch (err) {
      setConfigError(toErrorMessage(err));
      return false;
    }
  }, [
    llmProviderService, agentService, instructions, activeModel, activeProviderId,
    agentMode, activeFilePath, pinnedContextPaths, currentSessionIdRef, workspaceRoot,
    configReady,
  ]);

  useEffect(() => {
    if (!configReady) return;
    void initAgent();
  }, [configReady, initAgent]);

  useEffect(() => {
    if (!configReady || !configError) return;
    const id = setInterval(() => void initAgent(), 10_000);
    return () => clearInterval(id);
  }, [configError, configReady, initAgent]);

  useEffect(() => {
    const handler = () => { lastFingerprintRef.current = null; void initAgent(); };
    window.addEventListener('ai:provider-changed', handler);
    window.addEventListener('toolbox:llm-providers-updated', handler);
    return () => {
      window.removeEventListener('ai:provider-changed', handler);
      window.removeEventListener('toolbox:llm-providers-updated', handler);
    };
  }, [initAgent]);

  useEffect(() => {
    const handler = () => {
      lastFingerprintRef.current = null;
      void loadPersistedDefaults();
    };
    window.addEventListener('toolbox:agent-configs-updated', handler);
    return () => window.removeEventListener('toolbox:agent-configs-updated', handler);
  }, [loadPersistedDefaults]);

  const handleModelChange = useCallback((m: string) => {
    setActiveModel(m);
    lastFingerprintRef.current = null;
    void initAgent(m);
  }, [initAgent]);

  const handleModeChange = useCallback((m: AgentMode) => {
    setAgentMode(m);
    lastFingerprintRef.current = null;
    void initAgent(undefined, m);
  }, [initAgent]);

  const handleProviderChange = useCallback((newProviderId: string, specificModel?: string) => {
    setActiveProviderId(newProviderId);
    if (specificModel) setActiveModel(specificModel);
    lastFingerprintRef.current = null;
    void initAgent(specificModel, undefined, undefined, newProviderId);
  }, [initAgent]);

  const invalidateFingerprint = useCallback(() => { lastFingerprintRef.current = null; }, []);

  return {
    configError, instructions, agentMode, activeModel, availableModels,
    activeProviderId, enabledProviders, activeContextWindow,
    lastConfigRef, initAgent, handleModelChange, handleModeChange,
    handleProviderChange, invalidateFingerprint,
  };
}
