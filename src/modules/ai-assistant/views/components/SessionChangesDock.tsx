import { useMemo, useState } from 'react';
import { Check, ChevronDown, FileDiff, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isChangesetAwaitingReview,
  type Changeset,
  type ChangesetFile,
} from '../../../../store/changeset-store';
import { applyProposal, rejectProposal } from '../../services/proposal-review';
import { getProposalFileChangeStats } from './assistant-review-utils';

interface SessionChangesDockProps {
  changesets: Changeset[];
  onOpenFile: (file: ChangesetFile) => void;
}

interface FlatFile {
  changeset: Changeset;
  file: ChangesetFile;
}

export function SessionChangesDock({ changesets, onOpenFile }: SessionChangesDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const files = useMemo<FlatFile[]>(
    () => changesets.flatMap((changeset) => changeset.files.map((file) => ({ changeset, file }))),
    [changesets],
  );
  const pendingFiles = files.filter(({ changeset, file }) => (
    isChangesetAwaitingReview(changeset.status) && file.status === 'pending' && file.proposalRecordId
  ));

  if (files.length === 0) return null;

  const handleAcceptFile = async (changeset: Changeset, file: ChangesetFile) => {
    if (!file.proposalRecordId) return;
    const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
    const key = `${proposalSessionId}:${file.proposalRecordId}:accept`;
    setBusyKey(key);
    try {
      await applyProposal(proposalSessionId, [file.proposalRecordId]);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectFile = async (changeset: Changeset, file: ChangesetFile) => {
    if (!file.proposalRecordId) return;
    const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
    const key = `${proposalSessionId}:${file.proposalRecordId}:reject`;
    setBusyKey(key);
    try {
      await applyProposal(proposalSessionId, [], {
        recordSelections: [{ proposalRecordId: file.proposalRecordId, acceptedHunks: [] }],
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAcceptAll = async () => {
    setBusyKey('all:accept');
    try {
      for (const changeset of changesets.filter((item) => isChangesetAwaitingReview(item.status))) {
        const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
        const recordIds = changeset.files
          .filter((file) => file.status === 'pending' && file.proposalRecordId)
          .map((file) => file.proposalRecordId as string);
        if (recordIds.length > 0) await applyProposal(proposalSessionId, recordIds);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectAll = async () => {
    setBusyKey('all:reject');
    try {
      for (const changeset of changesets.filter((item) => isChangesetAwaitingReview(item.status))) {
        await rejectProposal(changeset.proposalSessionId ?? changeset.id);
      }
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background text-sm">
      <button
        type="button"
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
        onClick={() => setCollapsed((value) => !value)}
      >
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
        <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 font-medium text-foreground">文件变更</span>
        {pendingFiles.length > 0 && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {pendingFiles.length} 待处理
          </span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground">{files.length}</span>
      </button>

      {!collapsed && (
        <div className="border-t">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/15 px-3 py-2">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => void handleAcceptAll()}
              >
                {busyKey === 'all:accept' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                接受全部
              </button>
              <button
                type="button"
                disabled={Boolean(busyKey)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] text-muted-foreground hover:border-destructive/30 hover:text-destructive disabled:opacity-50"
                onClick={() => void handleRejectAll()}
              >
                {busyKey === 'all:reject' ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                拒绝全部
              </button>
              <span className="ml-auto text-[10px] text-muted-foreground">点击文件在主编辑区查看 diff</span>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {files.map(({ changeset, file }) => {
              const stats = getProposalFileChangeStats(file);
              const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
              const acceptKey = `${proposalSessionId}:${file.proposalRecordId}:accept`;
              const rejectKey = `${proposalSessionId}:${file.proposalRecordId}:reject`;
              const canDecide = isChangesetAwaitingReview(changeset.status) && file.status === 'pending' && file.proposalRecordId;
              return (
                <div
                  key={`${proposalSessionId}:${file.proposalRecordId ?? file.filePath}`}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/20"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenFile(file)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-[11px] text-foreground" title={file.filePath}>{file.filePath}</span>
                      <span className={fileStatusClass(file.status)}>{fileStatusLabel(file.status)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {file.toolName && <span>{file.toolName}</span>}
                      {file.changeType && <span>{file.changeType}</span>}
                      {(stats.added > 0 || stats.removed > 0) && (
                        <span>
                          <span className="text-emerald-600">+{stats.added}</span>
                          <span className="mx-1 text-muted-foreground">/</span>
                          <span className="text-destructive">-{stats.removed}</span>
                        </span>
                      )}
                    </div>
                  </button>
                  {canDecide && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="接受此文件"
                        disabled={Boolean(busyKey)}
                        className="flex h-6 w-6 items-center justify-center rounded border text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50"
                        onClick={() => void handleAcceptFile(changeset, file)}
                      >
                        {busyKey === acceptKey ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </button>
                      <button
                        type="button"
                        title="拒绝此文件"
                        disabled={Boolean(busyKey)}
                        className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:border-destructive/30 hover:text-destructive disabled:opacity-50"
                        onClick={() => void handleRejectFile(changeset, file)}
                      >
                        {busyKey === rejectKey ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function fileStatusLabel(status: ChangesetFile['status']): string {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒绝';
  if (status === 'reviewing') return '部分接受';
  return '待处理';
}

function fileStatusClass(status: ChangesetFile['status']): string {
  return cn(
    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
    status === 'accepted' && 'bg-emerald-500/10 text-emerald-700',
    status === 'rejected' && 'bg-destructive/10 text-destructive',
    status === 'reviewing' && 'bg-blue-500/10 text-blue-700',
    (!status || status === 'pending') && 'bg-amber-500/10 text-amber-700',
  );
}