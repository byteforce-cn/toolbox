import { describe, expect, it } from 'vitest';

import type { ChangesetFile } from '../../../../store/changeset-store';
import {
  filterProposalFiles,
  getProposalFileStatusSummary,
  getSelectablePendingRecordIds,
  pruneSelectedProposalRecordIds,
} from './proposal-inbox-utils';

function makeFile(overrides: Partial<ChangesetFile> = {}): ChangesetFile {
  return {
    proposalRecordId: overrides.proposalRecordId ?? 'record-1',
    filePath: overrides.filePath ?? '/workspace/src/example.ts',
    oldContent: overrides.oldContent ?? '',
    newContent: overrides.newContent ?? '',
    contentLoaded: overrides.contentLoaded ?? false,
    toolName: overrides.toolName ?? 'apply_patch',
    summary: overrides.summary ?? '更新示例文件',
    changeType: overrides.changeType ?? 'modify',
    status: overrides.status ?? 'pending',
    reviewSource: overrides.reviewSource ?? 'proposal',
    proposalSessionId: overrides.proposalSessionId ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    hunks: overrides.hunks ?? [],
  };
}

describe('proposal-inbox-utils', () => {
  it('filters files by review status while preserving all files for the default filter', () => {
    const files = [
      makeFile({ proposalRecordId: 'record-1', status: 'pending' }),
      makeFile({ proposalRecordId: 'record-2', filePath: '/workspace/src/a.ts', status: 'accepted' }),
      makeFile({ proposalRecordId: 'record-3', filePath: '/workspace/src/b.ts', status: 'reviewing' }),
      makeFile({ proposalRecordId: 'record-4', filePath: '/workspace/src/c.ts', status: 'rejected' }),
    ];

    expect(filterProposalFiles(files, 'all')).toHaveLength(4);
    expect(filterProposalFiles(files, 'pending').map((file) => file.proposalRecordId)).toEqual(['record-1']);
    expect(filterProposalFiles(files, 'accepted').map((file) => file.proposalRecordId)).toEqual(['record-2']);
    expect(filterProposalFiles(files, 'reviewing').map((file) => file.proposalRecordId)).toEqual(['record-3']);
    expect(filterProposalFiles(files, 'rejected').map((file) => file.proposalRecordId)).toEqual(['record-4']);
  });

  it('keeps batch selection limited to pending proposal records', () => {
    const files = [
      makeFile({ proposalRecordId: 'record-1', status: 'pending' }),
      makeFile({ proposalRecordId: 'record-2', filePath: '/workspace/src/a.ts', status: 'accepted' }),
      makeFile({ proposalRecordId: 'record-3', filePath: '/workspace/src/b.ts', status: 'pending' }),
      makeFile({ proposalRecordId: undefined, filePath: '/workspace/src/c.ts', status: 'pending' }),
    ];

    expect(getSelectablePendingRecordIds(files)).toEqual(['record-1', 'record-3']);
    expect(pruneSelectedProposalRecordIds(files, ['record-1', 'record-2', 'missing'])).toEqual(['record-1']);
    expect(getProposalFileStatusSummary(files)).toEqual({
      total: 4,
      pending: 3,
      reviewing: 0,
      accepted: 1,
      rejected: 0,
    });
  });
});