/**
 * EditorTabsView — 主内容区：Tab 栏 + Monaco 编辑器面板。
 * 由 Explorer activate.ts 注册到 location: 'main'。
 */
import { useCallback } from 'react';
import { TabStrip, type TabPage } from '@byteforce/shell';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { FileEditorPane } from '../components/FileEditorPane';

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function EditorTabsView() {
  const tabs = useFileBufferStore((s) => s.tabs);
  const buffers = useFileBufferStore((s) => s.buffers);
  const activeTabPath = useFileBufferStore((s) => s.activeTabPath);

  const tabPages: TabPage[] = tabs.map((path) => ({
    id: path,
    title: `${buffers[path]?.isAiDiffActive ? 'Δ ' : ''}${buffers[path]?.isModified ? '● ' : ''}${basename(path)}`,
    closable: true,
  }));

  const handleSelectTab = useCallback((id: string) => {
    useFileBufferStore.getState().setActiveTab(id);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    useFileBufferStore.getState().closeFile(id);
  }, []);

  const handleCloseOthers = useCallback((id: string) => {
    useFileBufferStore.getState().closeOthers(id);
  }, []);

  const handleCloseRight = useCallback((id: string) => {
    useFileBufferStore.getState().closeRight(id);
  }, []);

  const handleCloseAll = useCallback(() => {
    useFileBufferStore.getState().closeAll();
  }, []);

  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">从资源管理器打开文件开始查看</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TabStrip
        tabs={tabPages}
        activeTabId={activeTabPath}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onCloseOthers={handleCloseOthers}
        onCloseRight={handleCloseRight}
        onCloseAll={handleCloseAll}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTabPath && (
          <FileEditorPane key={activeTabPath} filePath={activeTabPath} />
        )}
      </div>
    </div>
  );
}
