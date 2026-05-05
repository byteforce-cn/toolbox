import type { FileBuffer } from '../../../store/file-buffer-store';

export function shouldDiscardDraftBufferOnTabClose(buffer: FileBuffer | undefined): boolean {
  if (!buffer) {
    return false;
  }
  // Phase 3: draft buffers (not-yet-on-disk) should be discarded on close
  // In Phase 2, all buffers exist on disk
  if (buffer.existsOnDisk || buffer.isAiDiffActive || buffer.aiShadowContent) {
    return false;
  }
  // Phase 3: check workingContent / diskContent once those fields are added
  return !buffer.isModified;
}
