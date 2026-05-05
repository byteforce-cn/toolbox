/**
 * debug-screenshot.ts — AI 对话列表带样式截图工具。
 *
 * 优先路径：调用 Tauri 原生 `copy_element_screenshot` 命令。
 * Rust 端截取 webview 渲染帧、裁剪到目标元素，并通过 NSPasteboard 直接写入系统剪贴板，
 * 完全绕过 JS navigator.clipboard API（WKWebView 中因权限拦截会报 NotAllowedError）。
 *
 * 回退路径（非 Tauri 环境）：SVG foreignObject + Canvas + navigator.clipboard.write。
 */
import { invoke } from '@tauri-apps/api/core';

// ── Tauri 原生截图 + 剪贴板写入（Rust 端） ────────────────────────────────────

/**
 * 调用 Rust 命令：滚动分段截取指定元素完整内容 → 拼接 → 写入 NSPasteboard。
 * 截图前重置 scrollTop，由 Rust 控制每段滚动；截图完成后恢复原始滚动位置。
 */
async function captureViaTauri(el: HTMLElement): Promise<void> {
  const selector = '[data-role="ai-chat-messages"]';
  const originalScrollTop = el.scrollTop;

  // 截图前滚到顶部，让 Rust 从头逐段向下滚动
  el.scrollTop = 0;
  // 等待两帧确保布局稳定
  await new Promise<void>((r) => requestAnimationFrame(() => { requestAnimationFrame(() => r()); }));

  const rect = el.getBoundingClientRect();
  try {
    await invoke('copy_element_screenshot', {
      selector,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      scrollHeight: el.scrollHeight,
      scaleFactor: window.devicePixelRatio,
    });
  } finally {
    // 截图完成后恢复原始滚动位置
    el.scrollTop = originalScrollTop;
  }
}

// ── SVG foreignObject 回退（Web 开发模式）──────────────────────────────────

async function captureViaSvg(el: HTMLElement): Promise<Blob> {
  const width = el.scrollWidth || el.offsetWidth;
  const height = el.scrollHeight;

  const styleSheets: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      styleSheets.push(Array.from(sheet.cssRules ?? []).map((r) => r.cssText).join('\n'));
    } catch {
      // 跨域 stylesheet 跳过
    }
  }

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.overflow = 'visible';
  clone.style.height = `${height}px`;
  clone.style.width = `${width}px`;
  clone.style.maxHeight = 'none';
  clone.style.background = 'white';

  const svgContent = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<foreignObject width="${width}" height="${height}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml">`,
    `<style>${styleSheets.join('\n')}</style>`,
    clone.outerHTML,
    `</div></foreignObject></svg>`,
  ].join('');

  const img = new Image();
  img.width = width;
  img.height = height;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (event) => {
      const msg = event instanceof ErrorEvent ? event.message : 'SVG 渲染失败';
      reject(new Error(msg));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取 Canvas 2D context');
  ctx.drawImage(img, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 返回空'))), 'image/png');
  });
}

// ── 公开 API ────────────────────────────────────────────────────────────────

/** 将 [data-role="ai-chat-messages"] 截图（带样式）复制到系统剪贴板。*/
export async function copyAiChatScreenshot(source?: HTMLElement): Promise<void> {
  const el = source ?? document.querySelector<HTMLElement>('[data-role="ai-chat-messages"]');
  if (!el) {
    console.warn('[debug-screenshot] 未找到 [data-role="ai-chat-messages"]');
    return;
  }

  try {
    await captureViaTauri(el);
    console.info('[debug-screenshot] 使用 Tauri 原生截图（已写入剪贴板）');
    return;
  } catch (tauriErr) {
    console.warn('[debug-screenshot] Tauri 截图失败，回退到 SVG 方案:', tauriErr);
  }

  // 回退：SVG foreignObject + JS clipboard（仅 Web 开发模式）
  const pngBlob = await captureViaSvg(el);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
  console.info('[debug-screenshot] SVG 回退截图已复制到剪贴板');
}

