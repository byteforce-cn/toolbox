import { describe, expect, it } from 'vitest';

import type { DiffHunk } from '../../../store/changeset-store';
import { getAiDiffFocusTarget } from './ai-diff-review';

describe('getAiDiffFocusTarget', () => {
  it('uses the modified hunk start for created and modified files', () => {
    const hunk = {
      id: 'hunk-1',
      content: '@@ -12,3 +18,4 @@\n-old\n+new',
      status: 'pending',
      originalStart: 12,
      originalLength: 3,
      modifiedStart: 18,
      modifiedLength: 4,
    } as unknown as DiffHunk;

    expect(getAiDiffFocusTarget('modify', [hunk])).toEqual({
      editor: 'modified',
      lineNumber: 18,
    });
  });

  it('uses the original hunk start for deleted files', () => {
    const hunk = {
      id: 'hunk-1',
      content: '@@ -8,5 +0,0 @@\n-old\n-old2',
      status: 'pending',
      originalStart: 8,
      originalLength: 5,
      modifiedStart: 0,
      modifiedLength: 0,
    } as unknown as DiffHunk;

    expect(getAiDiffFocusTarget('delete', [hunk])).toEqual({
      editor: 'original',
      lineNumber: 8,
    });
  });

  it('falls back to parsing unified diff headers when explicit line metadata is absent', () => {
    const hunk = {
      id: 'hunk-1',
      content: '@@ -4,1 +9,2 @@\n-old\n+new',
      status: 'pending',
    } as unknown as DiffHunk;

    expect(getAiDiffFocusTarget('modify', [hunk])).toEqual({
      editor: 'modified',
      lineNumber: 9,
    });
  });
});