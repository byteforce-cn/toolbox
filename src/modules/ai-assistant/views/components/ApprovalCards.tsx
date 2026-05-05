/**
 * ApprovalCards — 渲染工具写入审批内联卡片（diff/patch 类操作）。
 *
 * 从 useApprovalStore 读取待审批请求，展示文件路径、操作类型与 diff 摘要，
 * 用户可逐一批准或拒绝。
 */

import { useCallback, useState } from 'react';
import { Check, FilePen, FilePlus, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApprovalStore, type ApprovalRequest } from '../../../../store/approval-store';
import { respondApproval } from '../../services/approval-handlers';

function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    await respondApproval(request.requestId, true);
  }, [request.requestId]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    await respondApproval(request.requestId, false);
  }, [request.requestId]);

  const isCreate = request.changeType === 'create';
  const Icon = isCreate ? FilePlus : FilePen;
  const actionLabel = isCreate ? '创建文件' : '修改文件';

  return (
    <div
      data-pending-approval
      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 space-y-2"
    >
      <div className="flex items-center gap-2 text-[11px] text-amber-200">
        <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span>AI 助手请求{actionLabel}，是否允许？</span>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted border border-amber-500/20">
        <Icon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="font-mono text-[11px] text-foreground truncate flex-1">
          {request.filePath}
        </span>
        {request.hunks.length > 0 && (
          <button
            type="button"
            className="text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors shrink-0"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : `${request.hunks.length} 块 diff`}
          </button>
        )}
      </div>
      {expanded && request.hunks.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded border border-amber-500/20 bg-background/60 px-2.5 py-1.5">
          {request.hunks.map((hunk) => (
            <pre
              key={hunk.id}
              className="font-mono text-[10px] text-foreground/80 whitespace-pre-wrap break-all"
            >
              {hunk.content}
            </pre>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
            'bg-emerald-600 text-white hover:bg-emerald-500',
          )}
          onClick={() => void handleApprove()}
        >
          <Check className="h-3 w-3" /> 允许
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
        <span className="ml-auto text-[10px] text-muted-foreground">{request.toolName}</span>
      </div>
    </div>
  );
}

export function ApprovalCards() {
  const requests = useApprovalStore((s) => s.approvalRequests);

  if (requests.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3 px-3">
      {requests.map((req) => (
        <ApprovalCard key={req.requestId} request={req} />
      ))}
    </div>
  );
}
