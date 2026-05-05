import { useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { AlertTriangle, Ban, Check, CheckCheck, FileDiff, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isChangesetAwaitingReview, type Changeset } from '../../../../store/changeset-store';
import { applyProposal, ensureProposalRecordContent, rejectProposal } from '../../services/proposal-review';
import {
  filterProposalFiles,
  getProposalFileStatusSummary,
  getSelectablePendingRecordIds,
  pruneSelectedProposalRecordIds,
  type ProposalInboxFilter,
} from './proposal-inbox-utils';
import { getProposalFileChangeStats } from './assistant-review-utils';
import type { ProposalRecordApplySelection } from '../../services/types';
import {
  buildAcceptedHunkIds,
  findConflictingChangesets,
  getEffectiveHunkDecision,
  summarizeHunkDecisions,
  type HunkDecision,
  type HunkDecisionMap,
} from './proposal-review-ui-utils';

interface ProposalInboxPanelProps {
  changesets: Changeset[];
  title?: string;
  description?: string;
  focusPath?: string | null;
  focusChangesetId?: string | null;
  variant?: 'rail' | 'session';
}

export function ProposalInboxPanel({
  changesets,
  title = '文件变更审核',
  description = '当前会话内的 proposal 与待审文件在这里集中处理。',
  focusPath = null,
  focusChangesetId = null,
  variant = 'rail',
}: ProposalInboxPanelProps) {
  const isSessionVariant = variant === 'session';
  const orderedChangesets = useMemo(
    () => [...changesets].sort((left, right) => statusWeight(left.status) - statusWeight(right.status)),
    [changesets],
  );
  const [selectedChangesetId, setSelectedChangesetId] = useState<string | null>(orderedChangesets[0]?.id ?? null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<ProposalInboxFilter>('all');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [contentBusyRecordId, setContentBusyRecordId] = useState<string | null>(null);
  const [contentErrorRecordId, setContentErrorRecordId] = useState<string | null>(null);
  const [hunkDecisions, setHunkDecisions] = useState<Record<string, HunkDecisionMap>>({});

  useEffect(() => {
    if (!orderedChangesets.length) {
      setSelectedChangesetId(null);
      return;
    }

    const focusedChangeset = focusChangesetId
      ? orderedChangesets.find((changeset) => changeset.id === focusChangesetId)
      : focusPath
        ? orderedChangesets.find((changeset) => changeset.files.some((file) => matchesFocusPath(file.filePath, focusPath)))
        : null;
    const currentStillExists = orderedChangesets.some((changeset) => changeset.id === selectedChangesetId);
    const nextChangesetId = focusedChangeset?.id ?? (currentStillExists ? selectedChangesetId : orderedChangesets[0]?.id ?? null);

    if (nextChangesetId !== selectedChangesetId) {
      setSelectedChangesetId(nextChangesetId);
    }
  }, [focusChangesetId, focusPath, orderedChangesets, selectedChangesetId]);

  const selectedChangeset = useMemo(
    () => orderedChangesets.find((changeset) => changeset.id === selectedChangesetId) ?? null,
    [orderedChangesets, selectedChangesetId],
  );
  const statusSummary = useMemo(
    () => getProposalFileStatusSummary(selectedChangeset?.files ?? []),
    [selectedChangeset],
  );
  const selectablePendingRecordIds = useMemo(
    () => getSelectablePendingRecordIds(selectedChangeset?.files ?? []),
    [selectedChangeset],
  );
  const visibleFiles = useMemo(
    () => filterProposalFiles(selectedChangeset?.files ?? [], fileFilter),
    [fileFilter, selectedChangeset],
  );
  const selectedChangesetConflicts = useMemo(() => {
    if (!selectedChangeset) {
      return new Map<string, ReturnType<typeof findConflictingChangesets>>();
    }

    return selectedChangeset.files.reduce((conflicts, file) => {
      const matches = findConflictingChangesets(orderedChangesets, selectedChangeset.id, file.filePath);
      if (matches.length > 0) {
        conflicts.set(file.filePath, matches);
      }
      return conflicts;
    }, new Map<string, ReturnType<typeof findConflictingChangesets>>());
  }, [orderedChangesets, selectedChangeset]);

  useEffect(() => {
    if (!selectedChangesetId) {
      setFileFilter('all');
      setSelectedRecordIds((cur) => (cur.length > 0 ? [] : cur));
      return;
    }

    setFileFilter(statusSummary.pending > 0 ? 'pending' : 'all');
    setSelectedRecordIds((cur) => (cur.length > 0 ? [] : cur));
  }, [selectedChangesetId, statusSummary.pending]);

  useEffect(() => {
    if (!selectedChangeset) {
      return;
    }

    setSelectedRecordIds((current) => {
      const pruned = pruneSelectedProposalRecordIds(selectedChangeset.files, current);
      return pruned.length === current.length ? current : pruned;
    });
  }, [selectedChangeset]);

  useEffect(() => {
    if (!selectedChangeset) {
      setSelectedFileKey(null);
      return;
    }

    if (visibleFiles.length === 0) {
      setSelectedFileKey(null);
      return;
    }

    const currentFile = visibleFiles.find((file) => fileIdentity(file) === selectedFileKey) ?? null;
    const focusedFile = focusPath
      ? visibleFiles.find((file) => matchesFocusPath(file.filePath, focusPath)) ?? null
      : null;
    const nextFile = focusedFile ?? currentFile ?? visibleFiles[0] ?? null;
    const nextFileKey = nextFile ? fileIdentity(nextFile) : null;

    if (nextFileKey !== selectedFileKey) {
      setSelectedFileKey(nextFileKey);
    }
  }, [focusPath, selectedChangeset, selectedFileKey, visibleFiles]);

  const selectedFile = useMemo(
    () => visibleFiles.find((file) => fileIdentity(file) === selectedFileKey) ?? null,
    [visibleFiles, selectedFileKey],
  );
  const selectedFileDecisions = selectedFile?.proposalRecordId
    ? hunkDecisions[selectedFile.proposalRecordId] ?? undefined
    : undefined;
  const selectedFileHunkSummary = useMemo(
    () => summarizeHunkDecisions(selectedFile, selectedFileDecisions),
    [selectedFile, selectedFileDecisions],
  );
  const selectedFileChangeStats = useMemo(
    () => selectedFile ? getProposalFileChangeStats(selectedFile) : null,
    [selectedFile],
  );
  const selectedFileConflicts = useMemo(
    () => (
      selectedChangeset && selectedFile
        ? findConflictingChangesets(orderedChangesets, selectedChangeset.id, selectedFile.filePath)
        : []
    ),
    [orderedChangesets, selectedChangeset, selectedFile],
  );
  const canReviewHunks = Boolean(
    selectedChangeset
    && selectedFile
    && isChangesetAwaitingReview(selectedChangeset.status)
    && selectedFile.status === 'pending'
    && selectedFile.proposalRecordId
    && selectedFile.hunks?.length,
  );

  useEffect(() => {
    const proposalRecordId = selectedFile?.proposalRecordId;
    const hunks = selectedFile?.hunks;
    const fileStatus = selectedFile?.status;

    if (!proposalRecordId || !hunks?.length) {
      return;
    }

    setHunkDecisions((current) => {
      const existing = current[proposalRecordId] ?? {};
      let changed = false;

      const nextEntry = fileStatus === 'pending'
        ? hunks.reduce<HunkDecisionMap>((map, hunk) => {
            if (!(hunk.id in map)) {
              changed = true;
              map[hunk.id] = hunk.status;
            }
            return map;
          }, { ...existing })
        : hunks.reduce<HunkDecisionMap>((map, hunk) => {
            if (map[hunk.id] !== hunk.status) {
              changed = true;
            }
            map[hunk.id] = hunk.status;
            return map;
          }, {});

      if (!changed) {
        return current;
      }

      return {
        ...current,
        [proposalRecordId]: nextEntry,
      };
    });
  }, [selectedFile]);

  useEffect(() => {
    if (
      !selectedFile
      || selectedFile.reviewSource !== 'proposal'
      || !selectedFile.proposalRecordId
      || selectedFile.contentLoaded
    ) {
      return;
    }

    let cancelled = false;
    setContentBusyRecordId(selectedFile.proposalRecordId);
    setContentErrorRecordId(null);

    void ensureProposalRecordContent(selectedFile)
      .catch(() => {
        if (!cancelled) {
          setContentErrorRecordId(selectedFile.proposalRecordId ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContentBusyRecordId((current) => (
            current === selectedFile.proposalRecordId ? null : current
          ));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const handleApplySelection = async (
    changeset: Changeset,
    acceptedIds: string[],
    scopeLabel: string,
    recordSelections: ProposalRecordApplySelection[] = [],
  ) => {
    const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
    if (!proposalSessionId || (acceptedIds.length === 0 && recordSelections.length === 0)) return;
    setBusyKey(`${changeset.id}:${scopeLabel}:apply`);
    try {
      await applyProposal(proposalSessionId, acceptedIds, { recordSelections });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectAll = async (changeset: Changeset) => {
    const proposalSessionId = changeset.proposalSessionId ?? changeset.id;
    if (!proposalSessionId) return;
    setBusyKey(`${changeset.id}:reject`);
    try {
      await rejectProposal(proposalSessionId);
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleRecordSelection = (recordId: string, checked: boolean) => {
    setSelectedRecordIds((current) => {
      if (checked) {
        return current.includes(recordId) ? current : [...current, recordId];
      }
      return current.filter((value) => value !== recordId);
    });
  };

  const allPendingSelected = selectablePendingRecordIds.length > 0
    && selectedRecordIds.length === selectablePendingRecordIds.length;

  const setHunkDecision = (recordId: string, hunkId: string, decision: HunkDecision) => {
    setHunkDecisions((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] ?? {}),
        [hunkId]: decision,
      },
    }));
  };

  return (
    <section
      className={cn(
        'min-w-0',
        isSessionVariant
          ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border bg-background/80 p-4 shadow-sm'
          : 'rounded-[20px] border bg-background/80 p-4 shadow-sm',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{orderedChangesets.length}</span>
      </div>

      <div className={cn('mt-4 space-y-2', isSessionVariant && 'max-h-36 shrink-0 overflow-y-auto pr-1')}>
        {orderedChangesets.length === 0 ? (
          <div className="rounded-[16px] border border-dashed px-3 py-4 text-[12px] text-muted-foreground">
            当前会话暂无 proposal。出现待审变更后，这里会显示文件级摘要与处理动作。
          </div>
        ) : orderedChangesets.map((changeset) => (
          <button
            key={changeset.id}
            type="button"
            onClick={() => setSelectedChangesetId(changeset.id)}
            className={cn(
              'w-full rounded-[16px] border px-3 py-3 text-left transition-colors',
              selectedChangesetId === changeset.id
                ? 'border-foreground/20 bg-foreground/4'
                : 'border-border bg-background hover:bg-muted/40',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 rounded-full bg-muted p-1 text-muted-foreground">
                <FileDiff className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12px] font-medium text-foreground">{changeset.summary || '待审变更'}</span>
                  <span className={changesetStatusBadge(changeset.status)}>{changesetStatusLabel(changeset.status)}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {changeset.files.length} 个文件 · {changeset.files.filter((file) => file.status === 'pending').length} 个待处理
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedChangeset && (
        <div
          className={cn(
            'mt-4 space-y-3 rounded-[18px] border bg-muted/10 p-3',
            isSessionVariant && 'min-h-0 flex-1 overflow-y-auto',
          )}
        >
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">{selectedChangeset.summary || '待审变更'}</h4>
              <span className={changesetStatusBadge(selectedChangeset.status)}>{changesetStatusLabel(selectedChangeset.status)}</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{selectedChangeset.proposalSessionId ?? selectedChangeset.id}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700">
                {statusSummary.pending} 待处理
              </span>
              <span className="rounded-full bg-blue-500/10 px-2 py-1 font-medium text-blue-700">
                {statusSummary.reviewing} 部分接受
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700">
                {statusSummary.accepted} 已接受
              </span>
              <span className="rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive">
                {statusSummary.rejected} 已拒绝
              </span>
              <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
                共 {statusSummary.total} 个文件
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-[16px] border bg-background/70 px-3 py-2">
            {([
              ['pending', '待处理'],
              ['reviewing', '部分接受'],
              ['all', '全部'],
              ['accepted', '已接受'],
              ['rejected', '已拒绝'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFileFilter(value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
                  fileFilter === value
                    ? 'bg-foreground text-background'
                    : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
            {isChangesetAwaitingReview(selectedChangeset.status) && selectablePendingRecordIds.length > 0 && (
              <>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {selectedRecordIds.length > 0 ? `已选择 ${selectedRecordIds.length} 个待处理文件` : '可先筛选再批量接受'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRecordIds(allPendingSelected ? [] : selectablePendingRecordIds)}
                  className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {allPendingSelected ? '清空批量选择' : '选择全部待处理'}
                </button>
              </>
            )}
          </div>

          {isChangesetAwaitingReview(selectedChangeset.status) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={selectedRecordIds.length === 0 || busyKey === `${selectedChangeset.id}:selected:apply`}
                onClick={() => void handleApplySelection(
                  selectedChangeset,
                  selectedRecordIds,
                  'selected',
                )}
                className="flex h-8 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {busyKey === `${selectedChangeset.id}:selected:apply` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                接受选中
              </button>
              <button
                type="button"
                disabled={busyKey === `${selectedChangeset.id}:all:apply`}
                onClick={() => void handleApplySelection(
                  selectedChangeset,
                  selectedChangeset.files
                    .map((file) => file.proposalRecordId)
                    .filter((value): value is string => Boolean(value)),
                  'all',
                )}
                className="flex h-8 items-center gap-1 rounded-full bg-emerald-600 px-3 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {busyKey === `${selectedChangeset.id}:all:apply` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                接受全部
              </button>
              <button
                type="button"
                disabled={busyKey === `${selectedChangeset.id}:reject`}
                onClick={() => void handleRejectAll(selectedChangeset)}
                className="flex h-8 items-center gap-1 rounded-full border px-3 text-[11px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:opacity-50"
              >
                {busyKey === `${selectedChangeset.id}:reject` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                拒绝全部
              </button>
            </div>
          )}

          <div className={cn(
            'grid gap-3',
            isSessionVariant && 'lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]',
          )}>
            <div className="space-y-2">
            {visibleFiles.length === 0 ? (
              <div className="rounded-[16px] border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                当前筛选条件下没有文件。可以切换到“全部”或其他状态继续分诊。
              </div>
            ) : visibleFiles.map((file) => {
              const fileBusyKey = `${selectedChangeset.id}:${file.proposalRecordId}:apply`;
              const isSelectedFile = fileIdentity(file) === selectedFileKey;
              const isPendingSelectable = isChangesetAwaitingReview(selectedChangeset.status)
                && file.status === 'pending'
                && Boolean(file.proposalRecordId);
              const isChecked = Boolean(file.proposalRecordId) && selectedRecordIds.includes(file.proposalRecordId as string);
              const conflicts = selectedChangesetConflicts.get(file.filePath) ?? [];
              const changeStats = getProposalFileChangeStats(file);
              return (
                <div
                  key={file.proposalRecordId ?? file.filePath}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedFileKey(fileIdentity(file))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedFileKey(fileIdentity(file));
                    }
                  }}
                  className={cn(
                    'rounded-lg border border-l-4 bg-background/70 px-3 py-3 outline-none transition-colors',
                    fileStatusToneClass(file.status),
                    isSelectedFile
                      ? 'bg-foreground/4 ring-1 ring-foreground/20'
                      : 'hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-foreground" title={file.filePath}>{file.filePath}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        {file.toolName && <span>{file.toolName}</span>}
                        {file.changeType && <span>{file.changeType}</span>}
                        {file.hunks && file.hunks.length > 0 && <span>{file.hunks.length} 个 hunk</span>}
                        {(changeStats.added > 0 || changeStats.removed > 0) && (
                          <>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">+{changeStats.added}</span>
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">-{changeStats.removed}</span>
                          </>
                        )}
                        <span className={fileStatusBadge(file.status)}>{fileStatusLabel(file.status)}</span>
                        {conflicts.length > 0 && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700">
                            冲突 {conflicts.length}
                          </span>
                        )}
                      </div>
                      {isPendingSelectable && file.proposalRecordId && (
                        <label
                          className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                            checked={isChecked}
                            onChange={(event) => handleToggleRecordSelection(file.proposalRecordId as string, event.target.checked)}
                          />
                          加入批量接受
                        </label>
                      )}
                    </div>
                    {isChangesetAwaitingReview(selectedChangeset.status) && file.status === 'pending' && file.proposalRecordId && (
                      <button
                        type="button"
                        disabled={busyKey === fileBusyKey}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleApplySelection(selectedChangeset, [file.proposalRecordId as string], file.proposalRecordId as string);
                        }}
                        className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {busyKey === fileBusyKey ? '处理中…' : '仅接受此文件'}
                      </button>
                    )}
                  </div>

                  {file.summary && <p className="mt-2 text-[11px] text-muted-foreground">{file.summary}</p>}
                  {conflicts.length > 0 && (
                    <p className="mt-2 text-[10px] text-amber-700">
                      同路径变更还出现在 {conflicts.map((conflict) => conflict.summary || conflict.changesetId).join(' / ')}。
                    </p>
                  )}
                </div>
              );
            })}
            </div>

            <div className="rounded-[16px] border bg-background/80 p-3">
              {selectedFile ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-foreground" title={selectedFile.filePath}>{selectedFile.filePath}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        {selectedFile.toolName && <span>{selectedFile.toolName}</span>}
                        {selectedFile.changeType && <span>{selectedFile.changeType}</span>}
                        {selectedFile.hunks && selectedFile.hunks.length > 0 && <span>{selectedFile.hunks.length} 个 hunk</span>}
                        {selectedFileChangeStats && (selectedFileChangeStats.added > 0 || selectedFileChangeStats.removed > 0) && (
                          <>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">+{selectedFileChangeStats.added}</span>
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">-{selectedFileChangeStats.removed}</span>
                          </>
                        )}
                        <span className={fileStatusBadge(selectedFile.status)}>{fileStatusLabel(selectedFile.status)}</span>
                      </div>
                    </div>
                    {contentBusyRecordId === selectedFile.proposalRecordId && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在加载完整内容
                      </span>
                    )}
                  </div>

                  {selectedFile.summary && <p className="mt-3 text-[11px] text-muted-foreground">{selectedFile.summary}</p>}

                  {selectedFileConflicts.length > 0 && (
                    <div className="mt-3 rounded-[12px] border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700">
                      <div className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        检测到跨 changeset 冲突
                      </div>
                      <p className="mt-1 text-[10px] leading-5">
                        同一路径还出现在 {selectedFileConflicts.map((conflict) => conflict.summary || conflict.changesetId).join(' / ')}，提交前需要确认当前 hunk 决策不会与另一组待审内容相互覆盖。
                      </p>
                    </div>
                  )}

                  {contentErrorRecordId === selectedFile.proposalRecordId && (
                    <div className="mt-3 rounded-[12px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                      完整 diff 加载失败，请稍后重试。
                    </div>
                  )}

                  {selectedFile.contentLoaded ? (
                    <MonacoDiffPreview
                      title="Monaco 双栏 Diff"
                      originalLabel={selectedFile.changeType === 'create' ? '变更前（空文件）' : '变更前'}
                      modifiedLabel={selectedFile.changeType === 'delete' ? '变更后（已删除）' : '变更后'}
                      original={selectedFile.oldContent}
                      modified={selectedFile.newContent}
                    />
                  ) : selectedFile.hunks && selectedFile.hunks.length > 0 ? (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-[12px] border bg-muted/20 px-3 py-2 font-mono text-[10px] leading-5 text-foreground/85">
                      {selectedFile.hunks.map((hunk) => hunk.content).join('\n\n')}
                    </pre>
                  ) : (
                    <div className="mt-3 rounded-[12px] border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                      当前记录没有可展示的 hunk 预览。
                    </div>
                  )}

                  {selectedFile.hunks && selectedFile.hunks.length > 0 && (
                    <section className="mt-4 rounded-[14px] border bg-muted/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Hunk 决策</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">
                              {selectedFileHunkSummary.accepted} 接受
                            </span>
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                              {selectedFileHunkSummary.rejected} 拒绝
                            </span>
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700">
                              {selectedFileHunkSummary.pending} 待决策
                            </span>
                          </div>
                        </div>
                        {canReviewHunks && selectedFile.proposalRecordId && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next = Object.fromEntries(selectedFile.hunks!.map((hunk) => [hunk.id, 'accepted' as const]));
                                setHunkDecisions((current) => ({
                                  ...current,
                                  [selectedFile.proposalRecordId as string]: next,
                                }));
                              }}
                              className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              全部接受
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = Object.fromEntries(selectedFile.hunks!.map((hunk) => [hunk.id, 'rejected' as const]));
                                setHunkDecisions((current) => ({
                                  ...current,
                                  [selectedFile.proposalRecordId as string]: next,
                                }));
                              }}
                              className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                            >
                              全部拒绝
                            </button>
                          </div>
                        )}
                      </div>

                      {canReviewHunks && (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          提交时，仅标记为“接受”的 hunk 会写入工作区，其他 hunk 会按拒绝处理并保留在审计记录中。
                        </p>
                      )}

                      <div className="mt-3 space-y-2">
                        {selectedFile.hunks.map((hunk, index) => {
                          const decision = getEffectiveHunkDecision(hunk, selectedFileDecisions);
                          const hunkApplyKey = `${selectedChangeset.id}:hunks:${selectedFile.proposalRecordId}:apply`;
                          return (
                            <div key={hunk.id} className="rounded-[12px] border bg-background/80 px-3 py-3">
                              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Hunk {index + 1}</span>
                                <span className={hunkDecisionBadge(decision)}>{hunkDecisionLabel(decision)}</span>
                              </div>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-[10px] border bg-muted/20 px-3 py-2 font-mono text-[10px] leading-5 text-foreground/85">
                                {hunk.content}
                              </pre>
                              {canReviewHunks && selectedFile.proposalRecordId && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setHunkDecision(selectedFile.proposalRecordId as string, hunk.id, 'accepted')}
                                    className={hunkActionClass(decision === 'accepted')}
                                  >
                                    <Check className="h-3.5 w-3.5" /> 接受
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHunkDecision(selectedFile.proposalRecordId as string, hunk.id, 'rejected')}
                                    className={hunkActionClass(decision === 'rejected', true)}
                                  >
                                    <Ban className="h-3.5 w-3.5" /> 拒绝
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHunkDecision(selectedFile.proposalRecordId as string, hunk.id, 'pending')}
                                    className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    重置
                                  </button>
                                  {busyKey === hunkApplyKey && index === 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      正在提交 hunk 决策
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {canReviewHunks && selectedFile.proposalRecordId && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border bg-background/80 px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">
                            当前将应用 {buildAcceptedHunkIds(selectedFile, selectedFileDecisions).length} 个 hunk。
                          </p>
                          <button
                            type="button"
                            disabled={busyKey === `${selectedChangeset.id}:hunks:${selectedFile.proposalRecordId}:apply`}
                            onClick={() => void handleApplySelection(
                              selectedChangeset,
                              [],
                              `hunks:${selectedFile.proposalRecordId}`,
                              [{
                                proposalRecordId: selectedFile.proposalRecordId as string,
                                acceptedHunks: buildAcceptedHunkIds(selectedFile, selectedFileDecisions),
                              }],
                            )}
                            className="flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {busyKey === `${selectedChangeset.id}:hunks:${selectedFile.proposalRecordId}:apply`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCheck className="h-3.5 w-3.5" />}
                            {buildAcceptedHunkIds(selectedFile, selectedFileDecisions).length > 0 ? '提交当前 hunk 决策' : '按当前决策拒绝此文件'}
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <div className="rounded-[12px] border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                  {visibleFiles.length === 0
                    ? '当前筛选条件下没有可预览的文件。'
                    : '选择左侧文件后，可在这里查看完整 diff 与落地内容。'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

function MonacoDiffPreview({
  title,
  originalLabel,
  modifiedLabel,
  original,
  modified,
}: {
  title: string;
  originalLabel: string;
  modifiedLabel: string;
  original: string;
  modified: string;
}) {
  return (
    <section className="mt-3 min-h-0 rounded-[14px] border bg-muted/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span>{title}</span>
        <div className="flex flex-wrap items-center gap-2 normal-case tracking-normal text-[10px]">
          <span>{originalLabel}</span>
          <span>→</span>
          <span>{modifiedLabel}</span>
        </div>
      </div>
      <div className="h-90 overflow-hidden rounded-b-[14px]">
        <DiffEditor
          height="100%"
          theme={isDarkTheme() ? 'vs-dark' : 'vs'}
          original={original}
          modified={modified}
          options={{
            readOnly: true,
            automaticLayout: true,
            minimap: { enabled: false },
            renderSideBySide: true,
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
          }}
        />
      </div>
    </section>
  );
}

function fileIdentity(file: Changeset['files'][number]) {
  return file.proposalRecordId ?? file.filePath;
}

function matchesFocusPath(filePath: string, focusPath: string) {
  return filePath === focusPath || filePath.startsWith(`${focusPath}/`);
}

function statusWeight(status: Changeset['status']) {
  if (status === 'pending') return 0;
  if (status === 'reviewing') return 1;
  if (status === 'applied') return 2;
  return 3;
}

function changesetStatusLabel(status: Changeset['status']) {
  if (status === 'pending') return '待审';
  if (status === 'reviewing') return '部分已处理';
  if (status === 'applied') return '已应用';
  return '已拒绝';
}

function changesetStatusBadge(status: Changeset['status']) {
  return cn(
    'rounded-full px-2 py-0.5 text-[10px] font-medium',
    status === 'pending' && 'bg-amber-500/10 text-amber-700',
    status === 'reviewing' && 'bg-blue-500/10 text-blue-700',
    status === 'applied' && 'bg-emerald-500/10 text-emerald-700',
    status === 'rejected' && 'bg-destructive/10 text-destructive',
  );
}

function fileStatusLabel(status: Changeset['files'][number]['status']) {
  if (status === 'accepted') return '已接受';
  if (status === 'reviewing') return '部分接受';
  if (status === 'rejected') return '已拒绝';
  return '待处理';
}

function fileStatusBadge(status: Changeset['files'][number]['status']) {
  return cn(
    'rounded-full px-2 py-0.5 text-[10px] font-medium',
    status === 'accepted' && 'bg-emerald-500/10 text-emerald-700',
    status === 'reviewing' && 'bg-blue-500/10 text-blue-700',
    status === 'rejected' && 'bg-destructive/10 text-destructive',
    (!status || status === 'pending') && 'bg-amber-500/10 text-amber-700',
  );
}

function fileStatusToneClass(status: Changeset['files'][number]['status']) {
  if (status === 'accepted') return 'border-l-emerald-500';
  if (status === 'reviewing') return 'border-l-blue-500 bg-blue-500/5';
  if (status === 'rejected') return 'border-l-destructive bg-destructive/5';
  return 'border-l-amber-500 bg-amber-500/5';
}

function hunkDecisionLabel(status: HunkDecision) {
  if (status === 'accepted') return '接受';
  if (status === 'rejected') return '拒绝';
  return '待决策';
}

function hunkDecisionBadge(status: HunkDecision) {
  return cn(
    'rounded-full px-2 py-0.5 text-[10px] font-medium',
    status === 'accepted' && 'bg-emerald-500/10 text-emerald-700',
    status === 'rejected' && 'bg-destructive/10 text-destructive',
    status === 'pending' && 'bg-amber-500/10 text-amber-700',
  );
}

function hunkActionClass(active: boolean, destructive = false) {
  return cn(
    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition-colors',
    active && !destructive && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
    active && destructive && 'border-destructive/30 bg-destructive/10 text-destructive',
    !active && 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
}