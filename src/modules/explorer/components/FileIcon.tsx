/**
 * FileIcon: maps file/directory names and extensions to lucide-react icons.
 */

import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Settings,
  Terminal,
  ImageIcon,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const EXT_ICON_MAP: Record<string, LucideIcon> = {
  // Code
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  kt: FileCode,
  swift: FileCode,
  c: FileCode,
  cpp: FileCode,
  cc: FileCode,
  cs: FileCode,
  rb: FileCode,
  php: FileCode,
  lua: FileCode,
  dart: FileCode,
  scala: FileCode,
  groovy: FileCode,

  // Text / Docs
  md: FileText,
  mdx: FileText,
  txt: FileText,
  rst: FileText,
  log: FileText,

  // Data
  json: FileJson,
  jsonc: FileJson,
  yaml: FileType,
  yml: FileType,
  toml: FileType,
  xml: FileType,
  csv: FileType,

  // Images
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  svg: ImageIcon,
  webp: ImageIcon,
  ico: ImageIcon,

  // Web
  html: FileCode,
  htm: FileCode,
  css: FileCode,
  scss: FileCode,
  less: FileCode,

  // Shell
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  fish: Terminal,
  ps1: Terminal,
  bat: Terminal,

  // Config
  ini: Settings,
  env: Settings,
  gitignore: Settings,
  gitattributes: Settings,
  editorconfig: Settings,

  // Package
  lock: Package,
};

const NAME_ICON_MAP: Record<string, LucideIcon> = {
  'package.json': Package,
  'package-lock.json': Package,
  'pnpm-lock.yaml': Package,
  'yarn.lock': Package,
  'cargo.toml': Package,
  dockerfile: Terminal,
  makefile: Terminal,
  gnumakefile: Terminal,
  '.gitignore': Settings,
  '.gitattributes': Settings,
  '.editorconfig': Settings,
};

interface FileIconProps {
  name: string;
  kind: 'file' | 'dir';
  isExpanded?: boolean;
  className?: string;
}

export function FileIcon({ name, kind, isExpanded, className }: FileIconProps) {
  if (kind === 'dir') {
    const IconComp = isExpanded ? FolderOpen : Folder;
    return <IconComp className={className} />;
  }

  const lower = name.toLowerCase();
  const NameIcon = NAME_ICON_MAP[lower];
  if (NameIcon) return <NameIcon className={className} />;

  const ext = lower.split('.').pop();
  const ExtIcon = ext ? EXT_ICON_MAP[ext] : undefined;
  if (ExtIcon) return <ExtIcon className={className} />;

  return <File className={className} />;
}
