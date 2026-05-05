import { Search, ChevronRight } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useShellContext } from '@byteforce/shell';
import {
  getSelectedSectionId,
  setSelectedSectionId,
  subscribeToSettingsStore,
} from '../settings-store';

export function SettingsMenuView() {
  const { configService } = useShellContext();
  const sections = configService?.getSections() ?? [];
  const [query, setQuery] = useState('');

  const activeId = useSyncExternalStore(
    subscribeToSettingsStore,
    getSelectedSectionId,
  );

  const filtered = useMemo(
    () =>
      query
        ? sections.filter((s) =>
            s.title.toLowerCase().includes(query.toLowerCase()),
          )
        : sections,
    [sections, query],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 搜索框 */}
      <div className="px-2 py-2">
        <div
          className="flex items-center gap-1.5 rounded-md border border-[--border]
                     bg-[--input] px-2 py-1.5 focus-within:border-[--primary]"
        >
          <Search size={10} className="shrink-0 text-[--muted-foreground]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索设置…"
            className="flex-1 bg-transparent text-[11px] outline-none
                       placeholder:text-[--muted-foreground] text-[--foreground]"
          />
        </div>
      </div>

      {/* section 列表 */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
        {filtered.map((section) => (
          <button
            key={section.id}
            onClick={() => setSelectedSectionId(section.id)}
            className={[
              'flex w-full items-center gap-2 rounded-md border px-2 py-1.5',
              'text-left text-[11.5px] transition-all',
              activeId === section.id
                ? 'border-[--primary]/20 bg-[--primary]/15 text-[--primary]'
                : 'border-transparent text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground]',
            ].join(' ')}
          >
            <span className="flex-1">{section.title}</span>
            {activeId === section.id && (
              <ChevronRight size={10} className="shrink-0 opacity-60" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
