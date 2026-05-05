/**
 * settings 模块内部状态：当前选中的 section ID。
 * 使用 useSyncExternalStore 友好的订阅模型，无需外部状态库。
 */

let selectedSectionId: string | null = null;
const listeners = new Set<() => void>();

export function getSelectedSectionId(): string | null {
  return selectedSectionId;
}

export function setSelectedSectionId(id: string | null): void {
  selectedSectionId = id;
  listeners.forEach((l) => l());
}

export function subscribeToSettingsStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
