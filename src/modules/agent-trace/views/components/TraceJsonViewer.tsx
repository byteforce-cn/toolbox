/**
 * TraceJsonViewer.tsx — 简单的折叠 JSON 查看器，用于展示 AgentTraceEvent.detail。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface Props {
  value: unknown;
  label?: string;
}

export function TraceJsonViewer({ value, label }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(value, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="rounded border border-border bg-muted/30 text-xs">
      <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1">
        <button
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-mono">{label ?? 'detail'}</span>
        </button>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title="复制 JSON"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      {expanded && (
        <pre className="max-h-72 overflow-auto p-2 font-mono leading-5 whitespace-pre-wrap break-words">
          {json}
        </pre>
      )}
    </div>
  );
}
