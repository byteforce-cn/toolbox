import { useState } from 'react';
import { Bot, Bug, Camera, Loader2, Network } from 'lucide-react';
import { useLayoutStore } from '@byteforce/shell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { copyAiChatScreenshot } from '../lib/debug-screenshot';

export function TitleBarActions() {
  const rightPanelOpen = useLayoutStore((s) => s.getActiveLayout().rightPanelOpen);
  const setRightPanelOpen = useLayoutStore((s) => s.setRightPanelOpen);
  const [isExportingScreenshot, setIsExportingScreenshot] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => setRightPanelOpen(!rightPanelOpen)}
        title="AI 助手"
        className={[
          'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
          rightPanelOpen
            ? 'bg-[--primary]/15 text-[--primary]'
            : 'text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground]',
        ].join(' ')}
      >
        <Bot size={15} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="开发者工具"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[--muted-foreground] transition-colors hover:bg-[--muted] hover:text-[--foreground]"
          >
            <Bug size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>开发者工具</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isExportingScreenshot}
            onSelect={() => {
              setIsExportingScreenshot(true);
              void copyAiChatScreenshot().finally(() => setIsExportingScreenshot(false));
            }}
          >
            {isExportingScreenshot
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Camera className="size-3.5" />
            }
            复制对话截图
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              useLayoutStore.getState().setBottomPanelActiveTab('toolbox.agent-trace.panel');
              useLayoutStore.getState().setBottomPanelOpen(true);
            }}
          >
            <Network className="size-3.5" />
            Agent 调用链路
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}