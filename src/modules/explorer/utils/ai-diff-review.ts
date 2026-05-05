import type { DiffHunk } from '../../../store/changeset-store';
import type { FileBufferAiDiffFocusTarget } from '../../../store/file-buffer-store';

const DIFF_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/m;

function positiveLineNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function parseDiffHeader(content: string): { originalStart: number | null; modifiedStart: number | null } {
  const match = content.match(DIFF_HEADER_PATTERN);
  if (!match) {
    return { originalStart: null, modifiedStart: null };
  }

  return {
    originalStart: positiveLineNumber(Number(match[1])),
    modifiedStart: positiveLineNumber(Number(match[2])),
  };
}

function resolveHunkLineTargets(hunk: DiffHunk): { originalStart: number | null; modifiedStart: number | null } {
  const originalStart = positiveLineNumber(hunk.originalStart);
  const modifiedStart = positiveLineNumber(hunk.modifiedStart);

  if (originalStart || modifiedStart) {
    return { originalStart, modifiedStart };
  }

  return parseDiffHeader(hunk.content);
}

export function getAiDiffFocusTarget(
  changeType: 'create' | 'modify' | 'delete' | undefined,
  hunks: DiffHunk[] | undefined,
): FileBufferAiDiffFocusTarget | null {
  if (!hunks || hunks.length === 0) {
    return null;
  }

  for (const hunk of hunks) {
    const { originalStart, modifiedStart } = resolveHunkLineTargets(hunk);

    if (changeType === 'delete' && originalStart) {
      return { editor: 'original', lineNumber: originalStart };
    }

    if (changeType !== 'delete' && modifiedStart) {
      return { editor: 'modified', lineNumber: modifiedStart };
    }

    if (originalStart) {
      return { editor: 'original', lineNumber: originalStart };
    }

    if (modifiedStart) {
      return { editor: 'modified', lineNumber: modifiedStart };
    }
  }

  return null;
}