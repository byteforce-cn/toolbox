import { describe, expect, it } from 'vitest';

import { toErrorMessage } from './error-message';

describe('toErrorMessage', () => {
  it('returns native Error messages', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('normalizes opaque stream decode failures into actionable guidance', () => {
    expect(toErrorMessage(new Error('Stream error: error decoding response body'))).toBe(
      '流式响应解析失败。若当前 Provider 为 Anthropic，请检查 Base URL 是否可直达 /v1/messages，或确认网关完整透传 SSE 响应。',
    );
  });

  it('unwraps nested invoke-style error payloads', () => {
    expect(toErrorMessage({
      message: {
        error: {
          message: 'Anthropic API error 404: missing endpoint',
        },
      },
    })).toBe('Anthropic API error 404: missing endpoint');
  });

  it('falls back to JSON for opaque objects', () => {
    expect(toErrorMessage({ code: 404, status: 'not_found' })).toBe(
      '{"code":404,"status":"not_found"}',
    );
  });
});