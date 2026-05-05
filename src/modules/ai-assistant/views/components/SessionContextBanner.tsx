/**
 * SessionContextBanner — 显示当前上下文窗口压缩状态。
 *
 * 当对话发生压缩（compaction）时，在消息列表顶部显示一条紧凑提示条，
 * 说明已压缩次数和释放的 token 数量。
 */

import type { CompactionEventData } from '../../services/types';
import { Layers } from 'lucide-react';

interface SessionContextBannerProps {
  /** 当前运行期间收到的压缩事件列表。 */
  compactionEvents: CompactionEventData[];
}

export function SessionContextBanner({ compactionEvents }: SessionContextBannerProps) {
  if (compactionEvents.length === 0) return null;

  const totalFreed = compactionEvents.reduce((sum, e) => sum + (e.savings ?? 0), 0);
  const last = compactionEvents[compactionEvents.length - 1];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/20 text-[11px] text-amber-400">
      <Layers className="h-3 w-3 shrink-0" />
      <span>
        上下文已压缩 {compactionEvents.length} 次
        {totalFreed > 0 && (
          <span className="text-muted-foreground ml-1">
            (释放 {totalFreed >= 1000 ? `${(totalFreed / 1000).toFixed(1)}k` : totalFreed} tokens)
          </span>
        )}
      </span>
      {last.compactedTokens > 0 && (
        <span className="text-[10px] text-muted-foreground ml-auto">
          剩余 {last.compactedTokens.toLocaleString()} tokens
        </span>
      )}
    </div>
  );
}
