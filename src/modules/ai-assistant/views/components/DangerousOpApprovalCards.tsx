/**
 * DangerousOpApprovalCards — 渲染危险文件操作（fs_delete / fs_move）内联审批卡片。
 *
 * 这类操作不走 Changeset 标签页，而是直接在对话流中弹出审批，
 * 防止用户在未意识到的情况下删除或移动文件。
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Check, FileX2, FolderInput, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDangerousOpApprovalStore,
  respondDangerousOpApproval,
  type DangerousOpRequest,
} from '../../services/approval-handlers';

function DangerousOpCard({ request }: { request: DangerousOpRequest }) {
  const [busy, setBusy] = useState(false);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    await respondDangerousOpApproval(request.requestId, true);
  }, [request.requestId]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    await respondDangerousOpApproval(request.requestId, false);
  }, [request.requestId]);

  const isDelete = request.toolName === 'fs_delete';
  const Icon = isDelete ? FileX2 : FolderInput;
  const label = isDelete ? '删除' : '移动/重命名';
  const borderColor = isDelete ? 'border-red-500/30' : 'border-amber-500/30';
  const bgColor = isDelete ? 'bg-red-500/10' : 'bg-amber-500/10';
  const iconColor = isDelete ? 'text-red-400' : 'text-amber-400';
  const labelColor = isDelete ? 'text-red-200' : 'text-amber-200';

  return (
    <div
      data-pending-approval
      className={cn('rounded-md border px-3 py-2.5 space-y-2', borderColor, bgColor)}
    >
      <div className={cn('flex items-center gap-2 text-[11px]', labelColor)}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>AI 助手请求{label}以下文件，是否允许？</span>
      </div>
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted border',
          borderColor,
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
        <span className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-all leading-relaxed">
          {request.filePath}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
            isDelete
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-amber-600 text-white hover:bg-amber-500',
          )}
          onClick={() => void handleApprove()}
        >
          <Check className="h-3 w-3" /> 允许{label}
        </button>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
            'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
          onClick={() => void handleReject()}
        >
          <X className="h-3 w-3" /> 拒绝
        </button>
      </div>
    </div>
  );
}

export function DangerousOpApprovalCards() {
  const pending = useDangerousOpApprovalStore((s) => s.pending);

  if (pending.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3 px-3">
      {pending.map((req) => (
        <DangerousOpCard key={req.requestId} request={req} />
      ))}
    </div>
  );
}
