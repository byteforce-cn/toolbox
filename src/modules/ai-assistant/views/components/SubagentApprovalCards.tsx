/**
 * SubagentApprovalCards — 渲染等待用户决策的子代理调用内联审批卡片。
 */

import { useCallback, useState } from 'react';
import { Bot, Check, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSubagentApprovalStore,
  respondSubagentApproval,
  type SubagentApprovalRequest,
} from '../../services/approval-handlers';

function SubagentApprovalItem({ request }: { request: SubagentApprovalRequest }) {
  const [busy, setBusy] = useState(false);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    await respondSubagentApproval(request.requestId, true);
  }, [request.requestId]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    await respondSubagentApproval(request.requestId, false);
  }, [request.requestId]);

  return (
    <div
      data-pending-approval
      className="border border-violet-500/30 bg-violet-500/10 rounded-md px-3 py-2.5 space-y-2"
    >
      <div className="flex items-center gap-2 text-[11px] text-violet-200">
        <ShieldAlert className="h-3.5 w-3.5 text-violet-400 shrink-0" />
        <span>AI 助手请求调用子智能体，是否允许？</span>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted border border-violet-500/20">
        <Bot className="h-3.5 w-3.5 text-violet-400 shrink-0" />
        <span className="font-mono text-[12px] text-violet-300">{request.agentId}</span>
        {request.depth > 1 && (
          <span className="text-[10px] text-muted-foreground">(深度 {request.depth})</span>
        )}
      </div>
      <p className="text-[11px] text-foreground/80 px-2.5 whitespace-pre-wrap wrap-break-word leading-relaxed line-clamp-3">
        {request.task}
      </p>
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
      </div>
    </div>
  );
}

export function SubagentApprovalCards() {
  const pending = useSubagentApprovalStore((s) => s.pending);

  if (pending.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3 px-3">
      {pending.map((req) => (
        <SubagentApprovalItem key={req.requestId} request={req} />
      ))}
    </div>
  );
}
