/**
 * monaco-setup.ts
 *
 * 强制 @monaco-editor/react 使用本地 monaco-editor 包，禁止从 CDN 加载。
 * 必须在 main.tsx 第一行 import（在任何 monaco/editor 组件之前执行）。
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

loader.config({ monaco });
