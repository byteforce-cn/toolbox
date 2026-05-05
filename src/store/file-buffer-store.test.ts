import { beforeEach, describe, expect, it } from 'vitest';

import { useFileBufferStore } from './file-buffer-store';

describe('useFileBufferStore.openAiDiff', () => {
  beforeEach(() => {
    useFileBufferStore.setState({
      buffers: {},
      tabs: [],
      activeTabPath: null,
    });
  });

  it('stores AI review context and clears it when reopening the file buffer', () => {
    useFileBufferStore.getState().openAiDiff(
      '/workspace/src/review.ts',
      'const before = true;',
      'const after = true;',
      true,
      {
        proposalSessionId: 'proposal-session-1',
        proposalRecordId: 'record-1',
        changeType: 'modify',
        status: 'pending',
        focusTarget: { editor: 'modified', lineNumber: 14 },
      },
    );

    expect(useFileBufferStore.getState().buffers['/workspace/src/review.ts']).toMatchObject({
      isAiDiffActive: true,
      aiOriginalContent: 'const before = true;',
      aiShadowContent: 'const after = true;',
      aiReview: {
        proposalSessionId: 'proposal-session-1',
        proposalRecordId: 'record-1',
        changeType: 'modify',
        status: 'pending',
        focusTarget: { editor: 'modified', lineNumber: 14 },
      },
    });

    useFileBufferStore.getState().openFile('/workspace/src/review.ts', 'const after = true;');

    expect(useFileBufferStore.getState().buffers['/workspace/src/review.ts']).toMatchObject({
      isAiDiffActive: false,
    });
    expect(useFileBufferStore.getState().buffers['/workspace/src/review.ts']?.aiReview).toBeUndefined();
    expect(useFileBufferStore.getState().buffers['/workspace/src/review.ts']?.aiShadowContent).toBeUndefined();
  });
});