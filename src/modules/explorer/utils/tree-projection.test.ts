import { describe, expect, it } from 'vitest';

import { collectPendingReviewCreatePaths } from './tree-projection';
import type { Changeset } from '../../../store/changeset-store';

function makeChangeset(overrides: Partial<Changeset> = {}): Changeset {
  return {
    id: overrides.id ?? 'changeset-1',
    proposalSessionId: overrides.proposalSessionId ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    status: overrides.status ?? 'pending',
    summary: overrides.summary ?? '新增待审文件',
    files: overrides.files ?? [
      {
        proposalRecordId: 'record-1',
        filePath: '/workspace/src/new-file.ts',
        oldContent: '',
        newContent: '',
        changeType: 'create',
        status: 'pending',
      },
    ],
  };
}

describe('collectPendingReviewCreatePaths', () => {
  it('includes both pending and reviewing create paths under root', () => {
    const result = collectPendingReviewCreatePaths(
      '/workspace',
      [
        makeChangeset({ status: 'pending' }),
        makeChangeset({
          id: 'changeset-2',
          status: 'reviewing',
          files: [{
            proposalRecordId: 'record-2',
            filePath: '/workspace/src/second.ts',
            oldContent: '',
            newContent: '',
            changeType: 'create',
            status: 'pending',
          }],
        }),
      ],
      [],
    );

    expect(result).toEqual(['/workspace/src/new-file.ts', '/workspace/src/second.ts']);
  });

  it('ignores rejected or out-of-root files', () => {
    const result = collectPendingReviewCreatePaths(
      '/workspace',
      [
        makeChangeset({
          files: [{
            proposalRecordId: 'record-3',
            filePath: '/workspace/src/rejected.ts',
            oldContent: '',
            newContent: '',
            changeType: 'create',
            status: 'rejected',
          }],
        }),
        makeChangeset({
          id: 'changeset-4',
          files: [{
            proposalRecordId: 'record-4',
            filePath: '/outside/file.ts',
            oldContent: '',
            newContent: '',
            changeType: 'create',
            status: 'pending',
          }],
        }),
      ],
      [],
    );

    expect(result).toEqual([]);
  });
});