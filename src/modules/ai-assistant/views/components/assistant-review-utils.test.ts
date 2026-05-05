import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../types';
import {
  collectTaskReviewItems,
  getDiffStatsFromText,
  getProposalFileChangeStats,
  getTaskReviewSummary,
  groupTimelineItems,
} from './assistant-review-utils';

describe('assistant-review-utils', () => {
  it('counts diff additions and removals without file headers', () => {
    expect(getDiffStatsFromText([
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '-const oldValue = 1;',
      '+const nextValue = 2;',
      '+export { nextValue };',
    ].join('\n'))).toEqual({ added: 2, removed: 1 });
  });

  it('falls back to full content stats for created and deleted files', () => {
    expect(getProposalFileChangeStats({
      changeType: 'create',
      contentLoaded: true,
      oldContent: '',
      newContent: 'one\ntwo\n',
      hunks: [],
    })).toEqual({ added: 2, removed: 0 });

    expect(getProposalFileChangeStats({
      changeType: 'delete',
      contentLoaded: true,
      oldContent: 'one\ntwo',
      newContent: '',
      hunks: [],
    })).toEqual({ added: 0, removed: 2 });
  });

  it('collects plan and task steps with a status summary', () => {
    const messages: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      time: '10:00',
      planSteps: [{ id: 'plan-1', name: '读取配置', status: 'completed' }],
      toolCalls: [{ id: 'tool-1', name: 'shell_run', arguments: { command: 'pnpm test' } }],
      taskSteps: [{ id: 'tool-1', name: 'shell_run', status: 'completed', success: false, error: 'failed' }],
    }];

    const items = collectTaskReviewItems(messages);

    expect(items.map((item) => item.source)).toEqual(['plan', 'task']);
    expect(items[1]?.arguments).toEqual({ command: 'pnpm test' });
    expect(getTaskReviewSummary(items)).toEqual({
      total: 2,
      pending: 0,
      running: 0,
      completed: 1,
      failed: 1,
    });
  });

  it('groups adjacent non-error timeline items by kind and status', () => {
    const groups = groupTimelineItems([
      { id: 'a', timestamp: '2026-05-04T00:00:00.000Z', kind: 'tool', status: 'success', title: '读取 A' },
      { id: 'b', timestamp: '2026-05-04T00:00:01.000Z', kind: 'tool', status: 'success', title: '读取 B' },
      { id: 'c', timestamp: '2026-05-04T00:00:02.000Z', kind: 'tool', status: 'error', title: '读取 C' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['c']);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['a', 'b']);
  });
});