export type AgentMode = 'ask' | 'plan' | 'build';

export interface AgentModeDescriptor {
  label: string;
  description: string;
  tools?: string[];
  maxIterations: number;
  executionRules: string[];
}

export const AGENT_MODE_CONFIG: Record<AgentMode, AgentModeDescriptor> = {
  ask: {
    label: '问答',
    description: '纯问答，不使用工具',
    tools: [],
    maxIterations: 1,
    executionRules: [
      'Answer directly from the provided context and model knowledge.',
      'Do not call tools or propose file changes.',
      'Ask a clarifying question instead of guessing when required context is missing.',
    ],
  },
  plan: {
    label: '规划',
    description: '只读分析，不修改文件',
    tools: ['fs_read_file', 'fs_list_dir', 'rg_search', 'glob_find', 'lsp_get_definition', 'lsp_find_references'],
    maxIterations: 50,
    executionRules: [
      'Use read-only tools only, including semantic LSP navigation tools when available.',
      'Produce a concrete implementation plan before any write-capable action would be needed.',
      'Do not apply patches, modify files, or execute mutating commands.',
    ],
  },
  build: {
    label: '构建',
    description: '完整工具权限，可修改文件',
    tools: undefined,
    maxIterations: 100,
    executionRules: [
      'Implement the requested change end-to-end with the minimum necessary edits.',
      'Use tools as needed, including file modification and validation steps.',
      'Prefer lsp_get_definition and lsp_find_references for symbol-aware navigation, and lsp_rename_symbol for safe rename proposals.',
      'Keep proposals and edits aligned with the active execution metadata.',
      'After making code changes, run a lint or type-check command to verify the changes compile without errors.',
      'When editing multiple files, use propose_changes to batch all modifications into a single reviewable diff before applying.',
    ],
  },
};

export function getAgentModePolicy(mode: AgentMode): AgentModeDescriptor {
  return AGENT_MODE_CONFIG[mode];
}

export function buildExecutionMetadataBlock(metadata: {
  aiSessionId: string;
  runId?: string;
  mode: AgentMode;
  activeFilePath?: string | null;
  workspaceRoot?: string | null;
}): string {
  const lines = [
    `<!-- EXECUTION_METADATA`,
    `session_id: ${metadata.aiSessionId}`,
    metadata.runId ? `run_id: ${metadata.runId}` : null,
    `mode: ${metadata.mode}`,
    metadata.activeFilePath ? `active_file: ${metadata.activeFilePath}` : null,
    metadata.workspaceRoot ? `workspace_root: ${metadata.workspaceRoot}` : null,
    `-->`,
  ].filter(Boolean);
  return lines.join('\n');
}
