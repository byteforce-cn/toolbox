function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMessage(message: string): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes('stream error')
    && lower.includes('error decoding response body')
  ) {
    return '流式响应解析失败。若当前 Provider 为 Anthropic，请检查 Base URL 是否可直达 /v1/messages，或确认网关完整透传 SSE 响应。';
  }

  return normalized;
}

function extractNestedMessage(value: unknown, seen = new Set<object>()): string | null {
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause;
    return value.message || extractNestedMessage(cause, seen);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractNestedMessage(item, seen);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  const preferredKeys = ['message', 'error', 'details', 'detail', 'reason', 'cause'];
  for (const key of preferredKeys) {
    const message = extractNestedMessage(value[key], seen);
    if (message) {
      return message;
    }
  }

  for (const nested of Object.values(value)) {
    if (!(nested instanceof Error) && !Array.isArray(nested) && !isRecord(nested)) {
      continue;
    }

    const message = extractNestedMessage(nested, seen);
    if (message) {
      return message;
    }
  }

  return null;
}

export function toErrorMessage(error: unknown): string {
  const extracted = extractNestedMessage(error);
  if (extracted) {
    return normalizeMessage(extracted);
  }

  if (isRecord(error)) {
    try {
      return JSON.stringify(error);
    } catch {
      return '[unknown error object]';
    }
  }

  return String(error);
}