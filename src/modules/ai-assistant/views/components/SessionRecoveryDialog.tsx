/**
 * SessionRecoveryDialog — 列出可恢复的会话快照。
 *
 * 用户可恢复（还原）或删除快照。对话框可从工具栏手动打开，
 * 或在检测到快照时在启动时自动弹出。
 */

import { Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  agentListSnapshots,
  agentRecoverSession,
  agentDeleteSnapshot,
} from '../../services/agent-service';
import type { SessionSnapshotSummary } from '../../services/types';

interface SessionRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
  onRecover: (sessionId: string) => void;
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

export function SessionRecoveryDialog({ open, onClose, onRecover }: SessionRecoveryDialogProps) {
  const [snapshots, setSnapshots] = useState<SessionSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const result = await agentListSnapshots();
      setSnapshots(result);
    } catch (e) {
      console.warn('[SessionRecovery] Failed to load snapshots:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadSnapshots();
  }, [open, loadSnapshots]);

  const handleRecover = useCallback(
    async (sessionId: string) => {
      setActionInProgress(sessionId);
      try {
        await agentRecoverSession(sessionId);
        onRecover(sessionId);
        onClose();
      } catch (e) {
        console.error('[SessionRecovery] Recover failed:', e);
      } finally {
        setActionInProgress(null);
      }
    },
    [onRecover, onClose],
  );

  const handleDelete = useCallback(async (sessionId: string) => {
    setActionInProgress(sessionId);
    try {
      await agentDeleteSnapshot(sessionId);
      setSnapshots((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch (e) {
      console.error('[SessionRecovery] Delete failed:', e);
    } finally {
      setActionInProgress(null);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-[--border] bg-[--card] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[--border]">
          <h3 className="text-sm font-medium text-foreground">会话恢复</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-xs">加载中…</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              暂无可恢复的会话快照
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snap) => {
                const busy = actionInProgress === snap.sessionId;
                return (
                  <div
                    key={snap.sessionId}
                    className="flex items-center justify-between rounded-md border border-[--border] px-3 py-2 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-foreground">
                        <span className="font-mono truncate max-w-32">
                          {snap.sessionId.slice(0, 8)}
                        </span>
                        <span className="text-muted-foreground">{formatTime(snap.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        <span>{snap.messageCount} 条消息</span>
                        <span>{snap.iterationCount} 轮迭代</span>
                        {snap.costUsd > 0 && <span>${snap.costUsd.toFixed(4)}</span>}
                        {snap.gitBranch && (
                          <span className="truncate max-w-20">{snap.gitBranch}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        onClick={() => void handleRecover(snap.sessionId)}
                        title="恢复此会话"
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        恢复
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        onClick={() => void handleDelete(snap.sessionId)}
                        title="删除此快照"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-2 border-t border-[--border]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
