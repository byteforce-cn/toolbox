import { describe, expect, it } from 'vitest';

import type { Changeset, ChangesetFile } from '../../../../store/changeset-store';
import {
  buildAcceptedHunkIds,
  findConflictingChangesets,
  getEffectiveHunkDecision,
  summarizeHunkDecisions,
} from './proposal-review-ui-utils';

function makeFile(overrides: Partial<ChangesetFile> = {}): ChangesetFile {
  return {
    proposalRecordId: overrides.proposalRecordId ?? 'record-1',
    filePath: overrides.filePath ?? '/workspace/src/example.ts',
    oldContent: overrides.oldContent ?? 'old',
    newContent: overrides.newContent ?? 'new',
    contentLoaded: overrides.contentLoaded ?? true,
    status: overrides.status ?? 'pending',
    reviewSource: overrides.reviewSource ?? 'proposal',
    proposalSessionId: overrides.proposalSessionId ?? 'proposal-session-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    hunks: overrides.hunks ?? [
      { id: 'h1', content: '@@\n-old\n+new', status: 'pending' },
      { id: 'h2', content: '@@\n-old2\n+new2', status: 'rejected' },
    ],
  };
}

function makeChangeset(overrides: Partial<Changeset> = {}): Changeset {
  return {
    id: overrides.id ?? 'changeset-1',
    proposalSessionId: overrides.proposalSessionId ?? overrides.id ?? 'changeset-1',
    aiSessionId: overrides.aiSessionId ?? 'session-1',
    status: overrides.status ?? 'pending',
    summary: overrides.summary ?? '待审变更',
    files: overrides.files ?? [makeFile()],
  };
}

describe('proposal-review-ui-utils', () => {
  it('derives effective hunk decisions from local overrides', () => {
    const file = makeFile();

    expect(getEffectiveHunkDecision(file.hunks![0], { h1: 'accepted' })).toBe('accepted');
    expect(buildAcceptedHunkIds(file, { h1: 'accepted' })).toEqual(['h1']);
    expect(summarizeHunkDecisions(file, { h1: 'accepted' })).toEqual({
      total: 2,
      accepted: 1,
      rejected: 1,
      pending: 0,
    });
  });

  it('finds conflicting awaiting-review changesets touching the same file', () => {
    const conflicts = findConflictingChangesets([
      makeChangeset({ id: 'changeset-1', summary: '当前变更' }),
      makeChangeset({ id: 'changeset-2', summary: '另一组待审', status: 'reviewing' }),
      makeChangeset({
        id: 'changeset-3',
        summary: '已处理完成',
        status: 'applied',
      }),
      makeChangeset({
        id: 'changeset-4',
        summary: '不同文件',
        files: [makeFile({ filePath: '/workspace/src/other.ts' })],
      }),
    ], 'changeset-1', '/workspace/src/example.ts');

    expect(conflicts).toEqual([
      {
        changesetId: 'changeset-2',
        summary: '另一组待审',
        status: 'reviewing',
      },
    ]);
  });
});