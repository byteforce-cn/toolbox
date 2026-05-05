/**
 * FileEditorPane — Monaco Editor wrapper.
 * Reads/writes via file-buffer-store, saves to disk on Cmd/Ctrl+S.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChangesetStore, type Changeset, type ChangesetFile } from '../../../store/changeset-store';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { getLanguageFromPath } from '../utils/language-map';
import { tauriFsService } from '../tauri-fs-service';
import { useExplorerStore } from '../store/explorer-store';
import { useExplorerGitStatusStore } from '../store/explorer-git-status-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { applyProposal } from '../../ai-assistant/services/proposal-review';

interface FileEditorPaneProps {
  filePath: string;
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function FileEditorPane({ filePath }: FileEditorPaneProps) {
  const buffer = useFileBufferStore((s) => s.buffers[filePath]);
  const changesets = useChangesetStore((s) => s.changesets);
  const language = getLanguageFromPath(filePath);
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
  const [reviewBusyAction, setReviewBusyAction] = useState<'accept' | 'reject' | null>(null);

  // 监听主题切换，响应 .dark 类变化
  const theme = isDarkTheme() ? 'vs-dark' : 'vs';

  const activeProposalFile = useMemo(
    () => findProposalChangesetFile(changesets, buffer?.aiReview, filePath),
    [buffer?.aiReview, changesets, filePath],
  );
  const reviewStatus = activeProposalFile?.status ?? buffer?.aiReview?.status;
  const canReviewInEditor = Boolean(
    buffer?.isAiDiffActive
    && buffer.aiReview?.proposalSessionId
    && buffer.aiReview?.proposalRecordId
    && reviewStatus === 'pending',
  );

  const focusAiDiffTarget = useCallback((editor: MonacoEditor.IStandaloneDiffEditor | null) => {
    const focusTarget = buffer?.aiReview?.focusTarget;
    if (!editor || !focusTarget || focusTarget.lineNumber < 1) {
      return;
    }

    const targetEditor = focusTarget.editor === 'original'
      ? editor.getOriginalEditor()
      : editor.getModifiedEditor();
    const model = targetEditor.getModel();
    if (!model) {
      return;
    }

    const lineNumber = Math.min(Math.max(1, focusTarget.lineNumber), model.getLineCount());
    targetEditor.revealLineInCenter(lineNumber);
    targetEditor.setPosition({ lineNumber, column: 1 });
    targetEditor.focus();
  }, [buffer?.aiReview?.focusTarget]);

  useEffect(() => {
    focusAiDiffTarget(diffEditorRef.current);
  }, [focusAiDiffTarget, buffer?.aiOriginalContent, buffer?.aiShadowContent]);

  const handleAiDiffAccept = useCallback(async () => {
    const proposalSessionId = buffer?.aiReview?.proposalSessionId;
    const proposalRecordId = buffer?.aiReview?.proposalRecordId;
    if (!proposalSessionId || !proposalRecordId) {
      return;
    }

    setReviewBusyAction('accept');
    try {
      await applyProposal(proposalSessionId, [proposalRecordId]);
    } finally {
      setReviewBusyAction(null);
    }
  }, [buffer?.aiReview?.proposalRecordId, buffer?.aiReview?.proposalSessionId]);

  const handleAiDiffReject = useCallback(async () => {
    const proposalSessionId = buffer?.aiReview?.proposalSessionId;
    const proposalRecordId = buffer?.aiReview?.proposalRecordId;
    if (!proposalSessionId || !proposalRecordId) {
      return;
    }

    setReviewBusyAction('reject');
    try {
      await applyProposal(proposalSessionId, [], {
        recordSelections: [{ proposalRecordId, acceptedHunks: [] }],
      });
    } finally {
      setReviewBusyAction(null);
    }
  }, [buffer?.aiReview?.proposalRecordId, buffer?.aiReview?.proposalSessionId]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          const content = editor.getValue();
          try {
            const wsId = useWorkspaceStore.getState().workspaceId ?? '';
            await tauriFsService.writeTextFile(wsId, filePath, content);
            useFileBufferStore.getState().markSaved(filePath, content);
            // 触发 git 状态刷新
            const rootPath = useExplorerStore.getState().rootPath;
            if (rootPath && filePath.startsWith(rootPath)) {
              void useExplorerGitStatusStore.getState().refresh(rootPath, [filePath]);
            }
          } catch (err) {
            console.error('Save failed', err);
          }
        },
      );
    },
    [filePath],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        useFileBufferStore.getState().markModified(filePath, value);
      }
    },
    [filePath],
  );

  if (!buffer) return null;

  if (buffer.isAiDiffActive && buffer.aiShadowContent !== undefined) {
    const focusTarget = buffer.aiReview?.focusTarget;

    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        {buffer.aiReview && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/25 px-3 py-2 text-[11px]">
            <span className="truncate font-mono text-foreground" title={filePath}>{filePath}</span>
            {reviewStatus && (
              <span className={fileReviewStatusClass(reviewStatus)}>{fileReviewStatusLabel(reviewStatus)}</span>
            )}
            {focusTarget && (
              <span className="text-muted-foreground">
                已定位到{focusTarget.editor === 'original' ? '变更前' : '变更后'}第 {focusTarget.lineNumber} 行
              </span>
            )}
            {canReviewInEditor && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={reviewBusyAction !== null}
                  onClick={() => void handleAiDiffAccept()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {reviewBusyAction === 'accept' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  接受
                </button>
                <button
                  type="button"
                  disabled={reviewBusyAction !== null}
                  onClick={() => void handleAiDiffReject()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:opacity-50"
                >
                  {reviewBusyAction === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  拒绝
                </button>
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            language={language}
            original={buffer.aiOriginalContent ?? buffer.originalContent}
            modified={buffer.aiShadowContent}
            theme={theme}
            onMount={(editor) => {
              diffEditorRef.current = editor;
              focusAiDiffTarget(editor);
            }}
            options={{
              readOnly: true,
              automaticLayout: true,
              minimap: { enabled: false },
              renderSideBySide: true,
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        language={language}
        value={buffer.content}
        theme={theme}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          automaticLayout: true,
          renderWhitespace: 'none',
          tabSize: 2,
        }}
      />
    </div>
  );
}

function findProposalChangesetFile(
  changesets: Changeset[],
  aiReview: { proposalSessionId?: string; proposalRecordId?: string } | undefined,
  filePath: string,
): ChangesetFile | null {
  if (!aiReview?.proposalRecordId && !aiReview?.proposalSessionId) {
    return null;
  }

  for (const changeset of changesets) {
    if (
      aiReview.proposalSessionId
      && changeset.id !== aiReview.proposalSessionId
      && changeset.proposalSessionId !== aiReview.proposalSessionId
    ) {
      continue;
    }

    const file = changeset.files.find((candidate) => (
      (aiReview.proposalRecordId && candidate.proposalRecordId === aiReview.proposalRecordId)
      || candidate.filePath === filePath
    ));
    if (file) {
      return file;
    }
  }

  return null;
}

function fileReviewStatusLabel(status: NonNullable<ChangesetFile['status']>) {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒绝';
  if (status === 'reviewing') return '部分接受';
  return '待处理';
}

function fileReviewStatusClass(status: NonNullable<ChangesetFile['status']>) {
  return cn(
    'rounded-full px-2 py-0.5 text-[10px] font-medium',
    status === 'accepted' && 'bg-emerald-500/10 text-emerald-700',
    status === 'rejected' && 'bg-destructive/10 text-destructive',
    status === 'reviewing' && 'bg-blue-500/10 text-blue-700',
    status === 'pending' && 'bg-amber-500/10 text-amber-700',
  );
}
