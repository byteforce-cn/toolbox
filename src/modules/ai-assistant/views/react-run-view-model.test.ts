import { describe, expect, it } from 'vitest';
import {
  replayAgentRealtimeEnvelopes,
  type AgentRealtimeEnvelope,
} from '@byteforce/assistant';

import type { ChatMessage } from './types';
import {
  buildReActLiveMessage,
  buildReActLiveTimelineItems,
  finalizeReActMessage,
  hasReActMessageArtifacts,
} from './react-run-view-model';

function envelope(
  sequence: number,
  event: AgentRealtimeEnvelope['event'],
  iteration = 0,
): AgentRealtimeEnvelope {
  return {
    runId: 'run-1',
    aiSessionId: 'session-1',
    agentId: 'agent-1',
    sequence,
    iteration,
    event,
    timestamp: `2026-05-04T00:00:0${sequence}.000Z`,
  };
}

describe('react-run-view-model', () => {
  it('基于 ReAct timeline 构建 live assistant message', () => {
    const timeline = replayAgentRealtimeEnvelopes([
      envelope(1, { type: 'run_started', payload: { model: 'claude-sonnet-4-5', provider: 'anthropic' } }),
      envelope(2, { type: 'thought', payload: '先检查工作区。' }, 1),
      envelope(3, { type: 'tool_call_start', payload: { id: 'tool-1', name: 'shell_run' } }, 1),
      envelope(4, { type: 'tool_call', payload: { id: 'tool-1', name: 'shell_run', args: { command: 'pwd' }, args_preview: 'pwd' } }, 1),
      envelope(5, { type: 'observation', payload: { id: 'tool-1', name: 'shell_run', success: true, output: '/workspace' } }, 1),
      envelope(6, { type: 'answer', payload: '已确认工作区。' }, 1),
      envelope(7, { type: 'done', payload: { usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }, stop_reason: 'end_turn' } }, 1),
    ]);

    const message = buildReActLiveMessage(timeline);

    expect(message).toMatchObject({
      id: 'run-1',
      role: 'assistant',
      content: '已确认工作区。',
      status: 'done',
      thinking: '先检查工作区。',
      tokenUsage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
    expect(message.toolCalls).toEqual([{ id: 'tool-1', name: 'shell_run', arguments: { command: 'pwd' }, argsPreview: 'pwd' }]);
    expect(message.taskSteps?.[0]).toMatchObject({
      id: 'tool-1',
      name: 'shell_run',
      status: 'completed',
      success: true,
      resultPreview: '/workspace',
    });
    expect(message.reactSteps?.map((step) => step.kind)).toEqual(['thought', 'action', 'observation', 'final_answer']);
    expect(hasReActMessageArtifacts(message)).toBe(true);
  });

  it('截断过长的正文与思考内容', () => {
    const timeline = replayAgentRealtimeEnvelopes([
      envelope(1, { type: 'run_started', payload: { model: 'gpt-5', provider: 'openai' } }),
      envelope(2, { type: 'thought', payload: 't'.repeat(80) }, 1),
      envelope(3, { type: 'answer', payload: 'a'.repeat(80) }, 1),
    ]);

    const message = buildReActLiveMessage(timeline, {
      maxStreamChars: 48,
      maxThinkingChars: 48,
    });

    expect(message.content).toContain('[stream output truncated]');
    expect(message.thinking).toContain('[thinking truncated]');
    expect(message.thinkingSegments?.[0]?.content).toContain('[thinking truncated]');
    expect(message.reactSteps?.[0]?.content).toContain('[react step truncated]');
  });

  it('把终态 live message 固化为会话消息', () => {
    const now = new Date('2026-05-04T01:02:03.000Z');
    const liveMessage: ChatMessage = {
      id: 'run-1',
      role: 'assistant',
      content: '',
      time: '09:02',
      errors: [{ message: 'provider failed', recoverable: false }],
    };

    const finalMessage = finalizeReActMessage(liveMessage, 'failed', 'session-1', now);

    expect(finalMessage).toMatchObject({
      id: 'session-1:assistant:2026-05-04T01:02:03.000Z',
      content: '运行失败，未生成最终回复。',
      status: 'error',
      timestamp: '2026-05-04T01:02:03.000Z',
    });
  });

  it('从 ReAct timeline 构建侧栏时间线条目', () => {
    const timeline = replayAgentRealtimeEnvelopes([
      envelope(1, { type: 'run_started', payload: { model: 'claude-sonnet-4-5', provider: 'anthropic' } }),
      envelope(2, { type: 'thought', payload: '需要读取 package.json。' }, 0),
      envelope(3, { type: 'tool_call', payload: { id: 'tool-1', name: 'read_file', args: { path: 'package.json' } } }, 0),
      envelope(4, { type: 'observation', payload: { id: 'tool-1', name: 'read_file', success: false, output: 'not found' } }, 0),
    ]);

    const items = buildReActLiveTimelineItems(timeline);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: 'assistant', status: 'success', detail: '需要读取 package.json。' });
    expect(items[1]).toMatchObject({ id: 'live:react:step:action:tool-1', kind: 'tool', title: '调用工具：read_file', status: 'error' });
    expect(items[2]).toMatchObject({ id: 'live:react:step:observation:obs-tool-1', kind: 'tool', title: '返回结果：read_file', status: 'error', detail: 'not found' });
  });
});