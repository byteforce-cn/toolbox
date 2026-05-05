import type { ChangesetFile } from '../../../../store/changeset-store';
import {
  getDiffStatsFromText as getAssistantDiffStatsFromText,
  type ChangeStats as AssistantChangeStats,
} from '@byteforce/assistant';

export type {
  ChangeStats,
  TaskReviewItem,
  TaskReviewSummary,
  TimelineGroup,
} from '@byteforce/assistant';

export {
  collectTaskReviewItems,
  getDiffStatsFromText,
  getTaskReviewSummary,
  groupTimelineItems,
} from '@byteforce/assistant';

export function getProposalFileChangeStats(file: Pick<ChangesetFile, 'changeType' | 'contentLoaded' | 'hunks' | 'oldContent' | 'newContent'>): AssistantChangeStats {
  if (file.hunks?.length) {
    return getAssistantDiffStatsFromText(file.hunks.map((hunk) => hunk.content).join('\n'));
  }

  if (!file.contentLoaded) return { added: 0, removed: 0 };
  if (file.changeType === 'create') return { added: countContentLines(file.newContent), removed: 0 };
  if (file.changeType === 'delete') return { added: 0, removed: countContentLines(file.oldContent) };
  return { added: 0, removed: 0 };
}

function countContentLines(content: string): number {
  if (!content) return 0;
  return content.replace(/\n$/, '').split('\n').length;
}