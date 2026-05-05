import type { FileBuffer } from '../../../store/file-buffer-store';

function isUnderRoot(rootPath: string, targetPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
}

export function collectDraftMaterializedPaths(
  previousBuffers: Record<string, FileBuffer>,
  nextBuffers: Record<string, FileBuffer>,
  rootPath: string | null,
): string[] {
  if (!rootPath) {
    return [];
  }

  const materializedPaths = new Set<string>();

  for (const [filePath, nextBuffer] of Object.entries(nextBuffers)) {
    const previousBuffer = previousBuffers[filePath];
    if (!previousBuffer) {
      continue;
    }

    if (previousBuffer.existsOnDisk || !nextBuffer.existsOnDisk) {
      continue;
    }

    if (isUnderRoot(rootPath, filePath)) {
      materializedPaths.add(filePath);
    }
  }

  return Array.from(materializedPaths).sort((a, b) => a.localeCompare(b));
}
