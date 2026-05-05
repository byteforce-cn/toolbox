import { beforeEach, describe, expect, it } from 'vitest';

import { useApprovalStore, type ApprovalRequest } from './approval-store';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: overrides.requestId ?? 'approval-1',
    toolName: overrides.toolName ?? 'fs_edit_file',
    filePath: overrides.filePath ?? '/workspace/src/example.ts',
    changeType: overrides.changeType ?? 'modify',
    applyViaPatch: overrides.applyViaPatch ?? true,
    hunks: overrides.hunks ?? [{ id: 'hunk-1', content: '@@\n-old\n+new', status: 'pending' }],
    aiSessionId: overrides.aiSessionId,
  };
}

describe('useApprovalStore', () => {
  beforeEach(() => {
    useApprovalStore.setState({
      pendingApprovalIds: [],
      approvalRequests: [],
    });
  });

  it('keeps one pending approval per request id', () => {
    useApprovalStore.getState().addApprovalRequest(makeRequest());
    useApprovalStore.getState().addApprovalRequest(makeRequest({
      hunks: [{ id: 'hunk-2', content: '@@\n-old2\n+new2', status: 'pending' }],
    }));

    expect(useApprovalStore.getState().pendingApprovalIds).toEqual(['approval-1']);
    expect(useApprovalStore.getState().approvalRequests).toHaveLength(1);
    expect(useApprovalStore.getState().approvalRequests[0]?.hunks[0]?.id).toBe('hunk-2');
  });
});