/**
 * InlineRenameInput: an inline input field for renaming a file or directory.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';

interface InlineRenameInputProps {
  initialName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  className?: string;
}

export function InlineRenameInput({
  initialName,
  onConfirm,
  onCancel,
  className,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dotIndex = initialName.lastIndexOf('.');
    if (dotIndex > 0) {
      input.setSelectionRange(0, dotIndex);
    } else {
      input.select();
    }
  }, [initialName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed && trimmed !== initialName) onConfirm(trimmed);
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialName) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'h-5 w-full min-w-0 rounded border border-ring bg-background px-1 text-xs text-foreground outline-none',
        className,
      )}
    />
  );
}
