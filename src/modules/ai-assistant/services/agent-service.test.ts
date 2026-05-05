import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import * as agentService from './agent-service';

describe('agent-service realtime protocol exports', () => {
  it('只暴露 agent-realtime-event 监听入口', () => {
    const exports = agentService as Record<string, unknown>;

    expect(exports.AGENT_REALTIME_EVENT_CHANNEL).toBe('agent-realtime-event');
    expect(exports.listenAgentRealtimeEvent).toEqual(expect.any(Function));
    expect(exports).not.toHaveProperty('AGENT_EVENT_CHANNEL');
    expect(exports).not.toHaveProperty('listenAgentEvent');
  });
});