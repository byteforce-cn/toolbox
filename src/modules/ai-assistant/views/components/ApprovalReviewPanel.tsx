import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  FilePen,
  FilePlus,
  FileX2,
  FolderInput,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import { MarkdownContent, getDiffStatsFromText } from '@byteforce/assistant';
import { cn } from '@/lib/utils';
import { useApprovalStore, type ApprovalRequest } from '../../../../store/approval-store';
import {
  respondApproval,
  respondDangerousOpApproval,
  respondShellApproval,
  respondSubagentApproval,
  useDangerousOpApprovalStore,
  useShellApprovalStore,
  useSubagentApprovalStore,
  type DangerousOpRequest,
  type ShellApprovalRequest,
  type SubagentApprovalRequest,
} from '../../services/approval-handlers';

type ApprovalTone = 'amber' | 'red' | 'blue' | 'violet';

type ApprovalReviewItem =
  | { id: string; kind: 'write'; tone: ApprovalTone; title: string; object: string; meta: string; request: ApprovalRequest }
  | { id: string; kind: 'dangerous'; tone: ApprovalTone; title: string; object: string; meta: string; request: DangerousOpRequest }
  | { id: string; kind: 'shell'; tone: ApprovalTone; title: string; object: string; meta: string; request: ShellApprovalRequest }
  | { id: string; kind: 'subagent'; tone: ApprovalTone; title: string; object: string; meta: string; request: SubagentApprovalRequest };

export function ApprovalReviewPanel() {
  const writeRequests = useApprovalStore((state) => state.approvalRequests);
  const dangerousRequests = useDangerousOpApprovalStore((state) => state.pending);
  const shellRequests = useShellApprovalStore((state) => state.pending);
  const subagentRequests = useSubagentApprovalStore((state) => state.pending);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const items = useMemo(() => [
    ...writeRequests.map(toWriteItem),
    ...dangerousRequests.map(toDangerousItem),
    ...shellRequests.map(toShellItem),
    ...subagentRequests.map(toSubagentItem),
  ], [dangerousRequests, shellRequests, subagentRequests, writeRequests]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const moveSelection = useCallback((delta: number) => {
    if (items.length === 0) return;
    const currentIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    setSelectedId(items[nextIndex]?.id ?? null);
  }, [items, selectedId]);

  const handleDecision = useCallback(async (item: ApprovalReviewItem, approved: boolean) => {
    const key = `${item.id}:${approved ? 'approve' : 'reject'}`;
    setBusyKey(key);
    try {
      if (item.kind === 'write') await respondApproval(item.request.requestId, approved);
      if (item.kind === 'dangerous') await respondDangerousOpApproval(item.request.requestId, approved);
      if (item.kind === 'shell') await respondShellApproval(item.request.requestId, approved);
      if (item.kind === 'subagent') await respondSubagentApproval(item.request.requestId, approved);
    } finally {
      setBusyKey(null);
    }
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="shrink-0 border-b border-amber-500/20 bg-amber-500/6 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700">Approvals</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{items.length} 项待处理</p>
        </div>
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">待确认</span>
      </div>

      <div className="grid max-h-[38vh] min-h-0 gap-3 overflow-hidden lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <div
          className="min-h-0 space-y-1 overflow-y-auto pr-1 outline-none"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveSelection(1);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveSelection(-1);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setSelectedId(null);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md border border-l-4 bg-background/80 px-2.5 py-2 text-left transition-colors',
                toneBorderClass(item.tone),
                selectedItem?.id === item.id ? 'border-foreground/25 bg-background' : 'hover:bg-background',
              )}
            >
              <ApprovalIcon item={item} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-foreground">{item.title}</span>
                  <span className="rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-700">待确认</span>
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground" title={item.object}>{item.object}</span>
                <span className="mt-1 block text-[10px] text-muted-foreground">{item.meta}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-0 overflow-y-auto rounded-md border bg-background/90 p-3">
          {selectedItem ? (
            <ApprovalDetail
              item={selectedItem}
              busyKey={busyKey}
              onDecision={(approved) => void handleDecision(selectedItem, approved)}
            />
          ) : (
            <div className="rounded-md border border-dashed px-3 py-4 text-[12px] text-muted-foreground">选择左侧审批项查看详情。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function ApprovalDetail({
  item,
  busyKey,
  onDecision,
}: {
  item: ApprovalReviewItem;
  busyKey: string | null;
  onDecision: (approved: boolean) => void;
}) {
  const approveKey = `${item.id}:approve`;
  const rejectKey = `${item.id}:reject`;
  const isDangerousDelete = item.kind === 'dangerous' && item.request.toolName === 'fs_delete';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>待决策</span>
            <span>/</span>
            <span>{kindLabel(item.kind)}</span>
          </div>
          <h3 className="mt-1 truncate text-[13px] font-semibold text-foreground" title={item.object}>{item.title}</h3>
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{item.object}</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', toneBadgeClass(item.tone))}>{item.meta}</span>
      </div>

      {item.kind === 'write' && <WriteApprovalDetail request={item.request} />}
      {item.kind === 'dangerous' && <DangerousApprovalDetail request={item.request} />}
      {item.kind === 'shell' && <ShellApprovalDetail request={item.request} />}
      {item.kind === 'subagent' && <SubagentApprovalDetail request={item.request} />}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button
          type="button"
          disabled={Boolean(busyKey)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium text-white transition-colors disabled:opacity-50',
            isDangerousDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500',
          )}
          onClick={() => onDecision(true)}
        >
          <Check className="h-3.5 w-3.5" />
          {busyKey === approveKey ? '处理中' : approveLabel(item)}
        </button>
        <button
          type="button"
          disabled={Boolean(busyKey)}
          className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={() => onDecision(false)}
        >
          <X className="h-3.5 w-3.5" />
          {busyKey === rejectKey ? '处理中' : '拒绝'}
        </button>
      </div>
    </div>
  );
}

function WriteApprovalDetail({ request }: { request: ApprovalRequest }) {
  const diff = request.hunks.map((hunk) => hunk.content).join('\n\n');
  const stats = getDiffStatsFromText(diff);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">{request.toolName}</span>
        <span className="rounded-full bg-muted px-2 py-0.5">{request.changeType === 'create' ? '新建文件' : '修改文件'}</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">+{stats.added}</span>
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">-{stats.removed}</span>
      </div>
      {diff ? (
        <MarkdownContent content={`\`\`\`diff\n${diff}\n\`\`\``} />
      ) : (
        <div className="rounded-md border border-dashed px-3 py-4 text-[11px] text-muted-foreground">当前审批没有 hunk 预览。</div>
      )}
    </div>
  );
}

function DangerousApprovalDetail({ request }: { request: DangerousOpRequest }) {
  return (
    <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-700">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        {request.toolName === 'fs_delete' ? '删除文件' : '移动/重命名文件'}
      </div>
      <p className="mt-2 break-all font-mono text-[10px]">{request.filePath}</p>
    </div>
  );
}

function ShellApprovalDetail({ request }: { request: ShellApprovalRequest }) {
  return (
    <div className="space-y-2">
      {request.cwd && <p className="font-mono text-[10px] text-muted-foreground">cwd: {request.cwd}</p>}
      <MarkdownContent content={`\`\`\`bash\n${request.command}\n\`\`\``} />
    </div>
  );
}

function SubagentApprovalDetail({ request }: { request: SubagentApprovalRequest }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">Agent {request.agentId}</span>
        <span className="rounded-full bg-muted px-2 py-0.5">深度 {request.depth}</span>
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-[12px] leading-5 text-foreground/90 whitespace-pre-wrap wrap-break-word">
        {request.task}
      </div>
    </div>
  );
}

function toWriteItem(request: ApprovalRequest): ApprovalReviewItem {
  const diff = request.hunks.map((hunk) => hunk.content).join('\n');
  const stats = getDiffStatsFromText(diff);
  return {
    id: `write:${request.requestId}`,
    kind: 'write',
    tone: 'amber',
    title: request.changeType === 'create' ? '创建文件' : '修改文件',
    object: request.filePath,
    meta: `+${stats.added} -${stats.removed}`,
    request,
  };
}

function toDangerousItem(request: DangerousOpRequest): ApprovalReviewItem {
  const isDelete = request.toolName === 'fs_delete';
  return {
    id: `dangerous:${request.requestId}`,
    kind: 'dangerous',
    tone: isDelete ? 'red' : 'amber',
    title: isDelete ? '删除文件' : '移动/重命名',
    object: request.filePath,
    meta: request.toolName,
    request,
  };
}

function toShellItem(request: ShellApprovalRequest): ApprovalReviewItem {
  return {
    id: `shell:${request.requestId}`,
    kind: 'shell',
    tone: 'blue',
    title: '执行命令',
    object: request.command,
    meta: request.cwd ?? 'workspace',
    request,
  };
}

function toSubagentItem(request: SubagentApprovalRequest): ApprovalReviewItem {
  return {
    id: `subagent:${request.requestId}`,
    kind: 'subagent',
    tone: 'violet',
    title: '调用子智能体',
    object: request.agentId,
    meta: `深度 ${request.depth}`,
    request,
  };
}

function ApprovalIcon({ item, className }: { item: ApprovalReviewItem; className?: string }) {
  if (item.kind === 'write') {
    return item.request.changeType === 'create'
      ? <FilePlus className={cn(className, 'text-amber-600')} />
      : <FilePen className={cn(className, 'text-amber-600')} />;
  }
  if (item.kind === 'dangerous') {
    return item.request.toolName === 'fs_delete'
      ? <FileX2 className={cn(className, 'text-red-600')} />
      : <FolderInput className={cn(className, 'text-amber-600')} />;
  }
  if (item.kind === 'shell') return <Terminal className={cn(className, 'text-blue-600')} />;
  if (item.kind === 'subagent') return <Bot className={cn(className, 'text-violet-600')} />;
  return <ShieldAlert className={className} />;
}

function kindLabel(kind: ApprovalReviewItem['kind']) {
  if (kind === 'write') return '文件写入';
  if (kind === 'dangerous') return '危险操作';
  if (kind === 'shell') return 'Shell';
  return 'Subagent';
}

function approveLabel(item: ApprovalReviewItem) {
  if (item.kind === 'shell') return '允许执行';
  if (item.kind === 'subagent') return '允许调用';
  if (item.kind === 'dangerous') return item.request.toolName === 'fs_delete' ? '允许删除' : '允许操作';
  return '允许写入';
}

function toneBorderClass(tone: ApprovalTone) {
  if (tone === 'red') return 'border-l-red-500';
  if (tone === 'blue') return 'border-l-blue-500';
  if (tone === 'violet') return 'border-l-violet-500';
  return 'border-l-amber-500';
}

function toneBadgeClass(tone: ApprovalTone) {
  if (tone === 'red') return 'bg-red-500/10 text-red-700';
  if (tone === 'blue') return 'bg-blue-500/10 text-blue-700';
  if (tone === 'violet') return 'bg-violet-500/10 text-violet-700';
  return 'bg-amber-500/10 text-amber-700';
}