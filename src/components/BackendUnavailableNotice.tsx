/**
 * BackendUnavailableNotice.tsx — 当依赖的后端命令尚未注册时统一展示的占位面板。
 */
import { AlertTriangle } from 'lucide-react';

interface Props {
  /** 标题，例如「Agent Team 模块」 */
  title: string;
  /** 一句话说明该模块用途 */
  description: string;
  /** 缺失或待启用的命令名清单，例如 `['team_list', 'team_create']` */
  pendingCommands: string[];
  /** 简要集成步骤说明（可选，markdown 不支持） */
  hint?: string;
}

export function BackendUnavailableNotice({ title, description, pendingCommands, hint }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-2 py-2">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>

            <div className="mt-3">
              <p className="text-[11px] font-medium text-foreground">待启用的后端命令：</p>
              <ul className="mt-1 space-y-0.5">
                {pendingCommands.map((cmd) => (
                  <li
                    key={cmd}
                    className="font-mono text-[11px] text-muted-foreground"
                  >
                    plugin:toolbox-plugin-ai|{cmd}
                  </li>
                ))}
              </ul>
            </div>

            {hint && (
              <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">{hint}</p>
            )}

            <p className="mt-4 text-[11px] text-muted-foreground">
              详见{' '}
              <code className="font-mono">public/toolbox/docs/integration-roadmap.md</code>{' '}
              的 Phase 2。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
