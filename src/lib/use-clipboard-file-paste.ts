/**
 * useClipboardFilePaste — 全局或局部监听 paste 事件，检测文件路径并回调。
 *
 * 用法示例（全局，挂在 App 根节点）：
 * ```tsx
 * useClipboardFilePaste({
 *   onFilePaths: (result) => {
 *     console.log('粘贴的文件路径：', result.paths, '来源：', result.source);
 *   },
 * });
 * ```
 *
 * 用法示例（局部，绑定到某个 div 的 ref）：
 * ```tsx
 * const ref = useClipboardFilePaste({ onFilePaths: handlePaste });
 * return <div ref={ref} tabIndex={0} />;
 * ```
 */
import { useEffect, useRef } from 'react';
import {
  readClipboardFilePaths,
  readPasteEventFilePath,
  type ClipboardFileResult,
} from './clipboard-file-service';

interface UseClipboardFilePasteOptions {
  /** 检测到文件路径时的回调 */
  onFilePaths: (result: ClipboardFileResult) => void;
  /**
   * 是否在检测到文件路径时阻止事件冒泡/默认行为。
   * 默认 false；若不希望文件路径被当作普通文本插入到输入框，可设为 true。
   */
  preventDefault?: boolean;
  /** 是否禁用监听（条件渲染时有用） */
  disabled?: boolean;
}

/**
 * 监听 paste 事件中的文件路径。
 *
 * @returns 可选的 ref，将其绑定到 DOM 元素以实现局部监听；
 *          若不使用返回值，则自动在 `window` 上注册全局监听。
 */
export function useClipboardFilePaste(
  options: UseClipboardFilePasteOptions,
): React.RefObject<HTMLElement | null> {
  const { onFilePaths, preventDefault = false, disabled = false } = options;
  const callbackRef = useRef(onFilePaths);
  callbackRef.current = onFilePaths;

  const domRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (disabled) return;

    const handler = async (e: Event) => {
      const pasteEvent = e as ClipboardEvent;

      // ① 同步：先从 event.clipboardData 读文本路径（低延迟）
      const textPath = readPasteEventFilePath(pasteEvent);
      if (textPath !== null) {
        if (preventDefault) {
          pasteEvent.preventDefault();
          pasteEvent.stopPropagation();
        }
        callbackRef.current({ paths: [textPath], source: 'text' });
        return;
      }

      // ② 异步：调用 Rust NSPasteboard 读 native 文件类型
      const result = await readClipboardFilePaths();
      if (result !== null) {
        if (preventDefault) {
          pasteEvent.preventDefault();
          pasteEvent.stopPropagation();
        }
        callbackRef.current(result);
      }
    };

    const target: EventTarget = domRef.current ?? window;
    target.addEventListener('paste', handler);
    return () => target.removeEventListener('paste', handler);
  }, [disabled, preventDefault]);

  return domRef;
}
