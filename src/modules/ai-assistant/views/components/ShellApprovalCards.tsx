/**
 * ShellApprovalCards — 渲染等待用户决策的 Shell 命令内联审批卡片。
 *
 * 从 useShellApprovalStore 读取待审批请求，在对话流中展示，
 * 确保审批提示始终可见，即使对应的 tool_call 事件尚未到达。
 */

import { useCallback, useState } from 'react';
import { Check, ShieldAlert, Terminal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useShellApprovalStore,
  respondShellApproval,
  type ShellApprovalRequest,
} from '../../services/approval-handlers';

interface ShellApprovalCardProps {
  request: ShellApprovalRequest;
}

function ShellApprovalCard({ request }: ShellApprovalCardProps) {
  const [busy, setBusy] = useState(false);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    await respondShellApproval(request.requestId, true);
  }, [request.requestId]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    await respondShellApproval(request.requestId, false);
  }, [request.requestId]);

  return (
    <div
      data-pending-approval
      className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 space-y-2"
    >
      <div className="flex items-center gap-2 text-[11px] text-blue-200">
        <ShieldAlert className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <span>AI 助手请求执行以下命令，是否允许？</span>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted border border-blue-500/20">
        <Terminal className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <pre className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-all leading-relaxed">
          {request.command}
        </pre>
      </div>
      {request.cwd && (
        <div className="text-[10px] text-muted-foreground px-2.5">
          工作目录: {request.cwd}
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
          <Check className="h-3 w-3" /> 允许执行
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

export function ShellApprovalCards() {
  const pending = useShellApprovalStore((s) => s.pending);

  if (pending.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3 px-3">
      {pending.map((req) => (
        <ShellApprovalCard key={req.requestId} request={req} />
      ))}
    </div>
  );
}
