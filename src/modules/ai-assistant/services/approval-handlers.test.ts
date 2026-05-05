import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useDangerousOpApprovalStore,
  useShellApprovalStore,
  useSubagentApprovalStore,
} from './approval-handlers';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('./invoke-ai', () => ({
  invokeAI: vi.fn(),
}));

describe('approval handler stores', () => {
  beforeEach(() => {
    useShellApprovalStore.setState({ pending: [] });
    useSubagentApprovalStore.setState({ pending: [] });
    useDangerousOpApprovalStore.setState({ pending: [] });
  });

  it('deduplicates shell approvals by request id', () => {
    useShellApprovalStore.getState().addRequest({
      requestId: 'shell-1',
      command: 'cat README.md',
      cwd: null,
    });
    useShellApprovalStore.getState().addRequest({
      requestId: 'shell-1',
      command: 'cat package.json',
      cwd: null,
    });

    expect(useShellApprovalStore.getState().pending).toEqual([
      { requestId: 'shell-1', command: 'cat package.json', cwd: null },
    ]);
  });

  it('deduplicates subagent and dangerous operation approvals by request id', () => {
    useSubagentApprovalStore.getState().addRequest({
      requestId: 'subagent-1',
      agentId: 'Explore',
      task: 'inspect files',
      depth: 1,
    });
    useSubagentApprovalStore.getState().addRequest({
      requestId: 'subagent-1',
      agentId: 'Explore',
      task: 'inspect updated files',
      depth: 1,
    });
    useDangerousOpApprovalStore.getState().addRequest({
      requestId: 'danger-1',
      toolName: 'fs_delete',
      filePath: '/workspace/tmp.txt',
      changeType: 'modify',
    });
    useDangerousOpApprovalStore.getState().addRequest({
      requestId: 'danger-1',
      toolName: 'fs_delete',
      filePath: '/workspace/tmp-renamed.txt',
      changeType: 'modify',
    });

    expect(useSubagentApprovalStore.getState().pending).toEqual([
      { requestId: 'subagent-1', agentId: 'Explore', task: 'inspect updated files', depth: 1 },
    ]);
    expect(useDangerousOpApprovalStore.getState().pending).toEqual([
      {
        requestId: 'danger-1',
        toolName: 'fs_delete',
        filePath: '/workspace/tmp-renamed.txt',
        changeType: 'modify',
      },
    ]);
  });
});