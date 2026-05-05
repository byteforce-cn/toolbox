import { useCallback, useMemo, useRef, useState } from 'react';
import * as teamService from '../../agent-team/services/team-service';
import type { TaskStatusDto } from '../../agent-team/services/team-service';
import { toErrorMessage } from '../services/error-message';
import type { ChatMessage } from './types';
import { buildTeamAssistantMessage, isTeamTerminalStatus } from './team-run-view-model';

type TeamRunStatus = 'idle' | 'running' | 'aborting' | 'completed' | 'failed' | 'cancelled';

export interface UseTeamRunReturn {
  status: TeamRunStatus;
  taskId: string | null;
  taskStatus: TaskStatusDto | null;
  error: string | null;
  finalMessage: ChatMessage | null;
  run(teamId: string, sessionId: string, input: string, teamName?: string): Promise<void>;
  abort(): Promise<void>;
  clear(): void;
}

const POLL_INTERVAL_MS = 900;

export function useTeamRun(): UseTeamRunReturn {
  const [status, setStatus] = useState<TeamRunStatus>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const runTokenRef = useRef(0);
  const taskIdRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    runTokenRef.current += 1;
    taskIdRef.current = null;
    setStatus('idle');
    setTaskId(null);
    setTaskStatus(null);
    setError(null);
    setTeamName(undefined);
    setSessionId(null);
  }, []);

  const pollUntilTerminal = useCallback(async (startedTaskId: string, runToken: number) => {
    while (runTokenRef.current === runToken) {
      const nextStatus = await teamService.teamTaskStatus(startedTaskId);
      if (runTokenRef.current !== runToken) return;

      setTaskStatus(nextStatus);
      if (isTeamTerminalStatus(nextStatus.status)) {
        setStatus(nextStatus.status === 'completed' ? 'completed' : nextStatus.status);
        if (nextStatus.error) setError(nextStatus.error);
        return;
      }

      await delay(POLL_INTERVAL_MS);
    }
  }, []);

  const run = useCallback(async (
    teamId: string,
    nextSessionId: string,
    input: string,
    nextTeamName?: string,
  ) => {
    runTokenRef.current += 1;
    const runToken = runTokenRef.current;
    taskIdRef.current = null;
    setStatus('running');
    setTaskId(null);
    setTaskStatus(null);
    setError(null);
    setTeamName(nextTeamName);
    setSessionId(nextSessionId);

    try {
      const startedTaskId = await teamService.teamRun(teamId, nextSessionId, input);
      if (runTokenRef.current !== runToken) return;

      taskIdRef.current = startedTaskId;
      setTaskId(startedTaskId);
      await pollUntilTerminal(startedTaskId, runToken);
    } catch (runError) {
      if (runTokenRef.current !== runToken) return;

      const message = toErrorMessage(runError);
      setError(message);
      setStatus('failed');
      setTaskStatus({
        taskId: taskIdRef.current ?? `failed-${runToken}`,
        teamId,
        status: 'failed',
        input,
        error: message,
        memberStates: [],
      });
    }
  }, [pollUntilTerminal]);

  const abort = useCallback(async () => {
    const currentTaskId = taskIdRef.current;
    if (!currentTaskId) return;

    setStatus('aborting');
    try {
      await teamService.teamCancel(currentTaskId);
      const nextStatus = await teamService.teamTaskStatus(currentTaskId);
      setTaskStatus(nextStatus);
      setStatus(nextStatus.status === 'cancelled' ? 'cancelled' : 'failed');
      if (nextStatus.error) setError(nextStatus.error);
    } catch (abortError) {
      const message = toErrorMessage(abortError);
      setError(message);
      setStatus('failed');
    }
  }, []);

  const finalMessage = useMemo(() => {
    if (!taskStatus || !sessionId || !isTeamTerminalStatus(taskStatus.status)) return null;
    return buildTeamAssistantMessage(taskStatus, teamName, sessionId);
  }, [sessionId, taskStatus, teamName]);

  return {
    status,
    taskId,
    taskStatus,
    error,
    finalMessage,
    run,
    abort,
    clear,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}