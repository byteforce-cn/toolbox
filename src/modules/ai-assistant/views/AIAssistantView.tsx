import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Bot,
  FileDiff,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import {
  ConversationThread,
  MessageSearchBar,
  useMessageSearch,
  type AgentOption,
  type ApprovalRequest as AssistantApprovalRequest,
  type DiffHunk as AssistantDiffHunk,
} from '@byteforce/assistant';
import { cn } from '@/lib/utils';
import { useAgentRun } from './use-agent-run';
import { useTeamRun } from './use-team-run';
import { useAgentConfig } from './hooks/useAgentConfig';
import { SessionChangesDock } from './components/SessionChangesDock';
import { SessionContextBanner } from './components/SessionContextBanner';
import { SessionRecoveryDialog } from './components/SessionRecoveryDialog';
import { useConversationManager } from './hooks/useConversationManager';

import { getAiDiffFocusTarget } from '../../explorer/utils/ai-diff-review';
import {
  finalizeReActMessage,
  hasReActMessageArtifacts,
} from './react-run-view-model';
import {
  buildTeamLiveMessage,
} from './team-run-view-model';
import { useAssistantSettingsStore } from '../store/assistant-settings-store';
import { useSessionApprovalStore } from '../store/session-approval-store';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { useApprovalStore, type ApprovalRequest as WriteApprovalRequest } from '../../../store/approval-store';
import { useChangesetStore, type Changeset, type ChangesetFile } from '../../../store/changeset-store';
import { llmProviderList } from '../services/llm-provider-service';
import {
  DEFAULT_ASSISTANT_RUNTIME_AGENT_ID,
  DEFAULT_ASSISTANT_AGENT_ID,
  agentListConfigs,
  onAgentMessageFeedback,
  onCostSnapshotUpdated,
} from '../services/agent-service';
import * as teamService from '../../agent-team/services/team-service';
import type { TeamDto } from '../../agent-team/services/team-service';
import {
  respondApproval,
  respondDangerousOpApproval,
  respondShellApproval,
  respondSubagentApproval,
  startApprovalListener,
  startShellApprovalListener,
  startSubagentApprovalListener,
  useDangerousOpApprovalStore,
  useShellApprovalStore,
  useSubagentApprovalStore,
  type DangerousOpRequest,
  type ShellApprovalRequest,
  type SubagentApprovalRequest,
} from '../services/approval-handlers';
import {
  ensureProposalRecordContent,
  hydrateProposalSessionsForAiSession,
  startProposalListener,
} from '../services/proposal-review';

type ApprovalKindPrefix = 'tool' | 'shell' | 'subagent' | 'dangerous_op';
type AssistantRunTarget = 'agent' | 'team';

export function AIAssistantView() {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [runTarget, setRunTarget] = useState<AssistantRunTarget>('agent');
  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamListError, setTeamListError] = useState<string | null>(null);
  const [agentList, setAgentList] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(DEFAULT_ASSISTANT_AGENT_ID);
  const sessionReviewOpen = useAssistantSettingsStore((s) => s.sessionRailOpen);
  const setSessionReviewOpen = useAssistantSettingsStore((s) => s.setSessionRailOpen);
  const setCurrentSession = useSessionApprovalStore((s) => s.setCurrentSession);
  const activeFilePath = useFileBufferStore((s) => s.activeTabPath);
  const workspaceRoot = useWorkspaceStore((s) => s.rootPath);
  const [hasConfiguredProvider, setHasConfiguredProvider] = useState<boolean | null>(null);

  const writeRequests = useApprovalStore((s) => s.approvalRequests);
  const shellRequests = useShellApprovalStore((s) => s.pending);
  const subagentRequests = useSubagentApprovalStore((s) => s.pending);
  const dangerousRequests = useDangerousOpApprovalStore((s) => s.pending);
  const changesets = useChangesetStore((s) => s.changesets);
  const pinnedContextPaths = useMemo(() => new Set<string>(), []);

  const {
    status: agentRunStatus,
    compactionEvents,
    error: agentRunError,
    liveMessage,
    liveTimelineItems,
    run,
    abort,
    clearLiveRunArtifacts,
    reset,
  } = useAgentRun();
  const {
    status: teamRunStatus,
    error: teamRunError,
    finalMessage: teamFinalMessage,
    taskStatus: teamTaskStatus,
    run: runTeam,
    abort: abortTeam,
    clear: clearTeamRun,
  } = useTeamRun();

  const isAgentRunning = agentRunStatus === 'running' || agentRunStatus === 'aborting';
  const isTeamRunning = teamRunStatus === 'running' || teamRunStatus === 'aborting';
  const isRunning = isAgentRunning || isTeamRunning;
  const hasLiveRunArtifacts = hasReActMessageArtifacts(liveMessage);
  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId),
    [selectedTeamId, teams],
  );

  const {
    messages,
    setMessages,
    activeConversationId,
    currentConvIdRef,
    historySummaries,
    handleNewChat,
    handleRestoreChat,
    handleCopyConversation,
    loadSessionSummaries,
  } = useConversationManager({
    isRunning,
    isAborting: agentRunStatus === 'aborting' || teamRunStatus === 'aborting',
    liveTimelineItems,
    abort: isTeamRunning ? abortTeam : abort,
    reset: () => {
      reset();
      clearTeamRun();
    },
  });

  const sessionChangesets = useMemo(
    () => changesets.filter((changeset) => changeset.aiSessionId === activeConversationId),
    [activeConversationId, changesets],
  );

  const sessionWriteRequests = useMemo(
    () => writeRequests.filter((request) => !request.aiSessionId || request.aiSessionId === activeConversationId),
    [activeConversationId, writeRequests],
  );

  const pendingApprovals = useMemo<AssistantApprovalRequest[]>(() => [
    ...sessionWriteRequests.map(mapWriteApproval),
    ...shellRequests.map(mapShellApproval),
    ...subagentRequests.map(mapSubagentApproval),
    ...dangerousRequests.map(mapDangerousApproval),
  ], [dangerousRequests, sessionWriteRequests, shellRequests, subagentRequests]);

  const {
    configError,
    agentMode,
    initAgent,
    handleModeChange,
  } = useAgentConfig({
    activeFilePath,
    pinnedContextPaths,
    currentSessionIdRef: currentConvIdRef,
    workspaceRoot,
  });

  useEffect(() => {
    setCurrentSession(activeConversationId);
    return () => setCurrentSession(null);
  }, [activeConversationId, setCurrentSession]);

  useEffect(() => {
    let unlistenFeedback: (() => void) | undefined;
    let unlistenCost: (() => void) | undefined;

    void onAgentMessageFeedback((event) => {
      if (event.aiSessionId && event.aiSessionId !== activeConversationId) return;
      void loadSessionSummaries();
    }).then((dispose) => {
      unlistenFeedback = dispose;
    });

    void onCostSnapshotUpdated((event) => {
      if (event.sessionId && event.sessionId !== activeConversationId) return;
      void loadSessionSummaries();
    }).then((dispose) => {
      unlistenCost = dispose;
    });

    return () => {
      unlistenFeedback?.();
      unlistenCost?.();
    };
  }, [activeConversationId, loadSessionSummaries]);

  const reloadTeams = useCallback(async () => {
    try {
      setTeamListError(null);
      const list = await teamService.teamList();
      setTeams(list);
      setSelectedTeamId((current) => (
        current && list.some((team) => team.id === current) ? current : list[0]?.id ?? ''
      ));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setTeamListError(message);
    }
  }, []);

  useEffect(() => {
    void reloadTeams();
    window.addEventListener('toolbox:teams-updated', reloadTeams);
    return () => window.removeEventListener('toolbox:teams-updated', reloadTeams);
  }, [reloadTeams]);

  const reloadAgents = useCallback(async () => {
    try {
      const configs = await agentListConfigs();
      setAgentList(configs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void reloadAgents();
    window.addEventListener('toolbox:agent-configs-updated', reloadAgents);
    return () => window.removeEventListener('toolbox:agent-configs-updated', reloadAgents);
  }, [reloadAgents]);

  useEffect(() => {
    const check = () => {
      llmProviderList()
        .then((providers) => setHasConfiguredProvider(providers.length > 0))
        .catch(() => setHasConfiguredProvider(false));
    };
    check();
    window.addEventListener('ai:provider-changed', check);
    return () => window.removeEventListener('ai:provider-changed', check);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const register = (unlisten: () => void) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    };

    void (async () => {
      register(await startApprovalListener());
      register(await startShellApprovalListener());
      register(await startSubagentApprovalListener());
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners.splice(0)) unlisten();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlistenProposal: (() => void) | undefined;

    void startProposalListener()
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        unlistenProposal = unlisten;
      })
      .catch((listenerError) => {
        console.error('[AIAssistantView] proposal listener failed', listenerError);
      });

    return () => {
      cancelled = true;
      unlistenProposal?.();
    };
  }, []);

  const refreshSessionProposals = useCallback(async () => {
    try {
      await hydrateProposalSessionsForAiSession(activeConversationId);
    } catch (proposalError) {
      console.error('[AIAssistantView] hydrate session proposals failed', proposalError);
    }
  }, [activeConversationId]);

  useEffect(() => {
    void refreshSessionProposals();
  }, [refreshSessionProposals]);

  useEffect(() => {
    const handler = () => { void handleNewChat(); };
    window.addEventListener('ai-assistant:new-chat', handler);
    return () => window.removeEventListener('ai-assistant:new-chat', handler);
  }, [handleNewChat]);

  useEffect(() => {
    if (agentRunStatus !== 'completed' && agentRunStatus !== 'failed' && agentRunStatus !== 'aborted') return;

    const finalMessage = finalizeReActMessage(liveMessage, agentRunStatus, activeConversationId);
    if (finalMessage) setMessages((prev) => [...prev, finalMessage]);

    clearLiveRunArtifacts();
    void loadSessionSummaries();
    void refreshSessionProposals();
  }, [
    activeConversationId,
    clearLiveRunArtifacts,
    liveMessage,
    loadSessionSummaries,
    refreshSessionProposals,
    setMessages,
    agentRunStatus,
  ]);

  useEffect(() => {
    const finalMessage = teamFinalMessage;
    if (!finalMessage) return;

    clearTeamRun();
    setMessages((prev) => (
      prev.some((message) => message.id === finalMessage.id) ? prev : [...prev, finalMessage]
    ));
    void loadSessionSummaries();
    void refreshSessionProposals();
  }, [clearTeamRun, loadSessionSummaries, refreshSessionProposals, setMessages, teamFinalMessage]);

  const allMessages = liveMessage ? [...messages, liveMessage] : isTeamRunning && teamTaskStatus ? [...messages, buildTeamLiveMessage(teamTaskStatus, selectedTeam?.name, activeConversationId)] : messages;
  const agentOptions = useMemo<AgentOption[]>(() => {
    const defaultOpt: AgentOption = { id: DEFAULT_ASSISTANT_AGENT_ID, name: 'AI 助手', description: '默认助手配置' };
    const extras = agentList
      .filter((a) => a.id !== DEFAULT_ASSISTANT_AGENT_ID)
      .map((a): AgentOption => ({ id: a.id, name: a.name, description: a.description }));
    return [defaultOpt, ...extras];
  }, [agentList]);
  const search = useMessageSearch(allMessages, isRunning);
  const hasReviewContent = historySummaries.length > 0;
  const isEmpty = allMessages.length === 0 && !isRunning;

  const handleSend = useCallback(async (text: string, mode = agentMode) => {
    const trimmedText = text.trim();
    if (!trimmedText || isRunning) return;
    setDecisionError(null);

    if (runTarget === 'team') {
      if (!selectedTeamId) {
        setDecisionError('请选择一个 Team。');
        return;
      }

      const now = new Date();
      const timestamp = now.toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: `${activeConversationId}:user:${timestamp}`,
          role: 'user',
          content: trimmedText,
          time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          timestamp,
          status: 'done',
        },
      ]);
      await runTeam(selectedTeamId, activeConversationId, trimmedText, selectedTeam?.name);
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: `${activeConversationId}:user:${timestamp}`,
        role: 'user',
        content: trimmedText,
        time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        timestamp,
        status: 'done',
      },
    ]);

    const isDefaultAgent = !selectedAgentId || selectedAgentId === DEFAULT_ASSISTANT_AGENT_ID;
    if (isDefaultAgent) {
      const ready = await initAgent(undefined, mode, {
        aiSessionId: activeConversationId,
        mode,
        activeFilePath,
        workspaceRoot,
      });
      if (!ready) return;
      await run(DEFAULT_ASSISTANT_RUNTIME_AGENT_ID, trimmedText, undefined, { aiSessionId: activeConversationId });
    } else {
      await run(selectedAgentId, trimmedText, undefined, { aiSessionId: activeConversationId });
    }
  }, [
    activeConversationId,
    activeFilePath,
    agentMode,
    initAgent,
    isRunning,
    run,
    runTarget,
    selectedAgentId,
    selectedTeam?.name,
    selectedTeamId,
    setMessages,
    workspaceRoot,
    runTeam,
  ]);

  const handleRetry = useCallback(async (messageId: string) => {
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    const searchSpace = messageIndex >= 0 ? messages.slice(0, messageIndex) : messages;
    const preceding = [...searchSpace].reverse().find((message) => message.role === 'user');
    if (!preceding) return;
    setDecisionError(null);

    if (runTarget === 'team') {
      if (!selectedTeamId) {
        setDecisionError('请选择一个 Team。');
        return;
      }

      const now = new Date();
      const timestamp = now.toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: `${activeConversationId}:retry:${timestamp}`,
          role: 'user',
          content: preceding.content,
          time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          timestamp,
          status: 'done',
        },
      ]);
      await runTeam(selectedTeamId, activeConversationId, preceding.content, selectedTeam?.name);
      return;
    }

    const ready = await initAgent(undefined, agentMode, {
      aiSessionId: activeConversationId,
      mode: agentMode,
      activeFilePath,
      workspaceRoot,
    });
    if (!ready) return;

    const now = new Date();
    const timestamp = now.toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: `${activeConversationId}:retry:${timestamp}`,
        role: 'user',
        content: preceding.content,
        time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        timestamp,
        status: 'done',
      },
    ]);

    const isDefaultAgent = !selectedAgentId || selectedAgentId === DEFAULT_ASSISTANT_AGENT_ID;
    if (isDefaultAgent) {
      const ready = await initAgent(undefined, agentMode, {
        aiSessionId: activeConversationId,
        mode: agentMode,
        activeFilePath,
        workspaceRoot,
      });
      if (!ready) return;
      await run(DEFAULT_ASSISTANT_RUNTIME_AGENT_ID, preceding.content, undefined, { aiSessionId: activeConversationId });
    } else {
      await run(selectedAgentId, preceding.content, undefined, { aiSessionId: activeConversationId });
    }
  }, [
    activeConversationId,
    activeFilePath,
    agentMode,
    initAgent,
    messages,
    run,
    runTarget,
    selectedAgentId,
    selectedTeam?.name,
    selectedTeamId,
    setMessages,
    workspaceRoot,
    runTeam,
  ]);

  const handleFeedback = useCallback((messageId: string, feedback: 'helpful' | 'unhelpful' | null) => {
    setMessages((prev) => prev.map((message) => (
      message.id === messageId ? { ...message, feedback } : message
    )));
  }, [setMessages]);

  const handleApprovalDecision = useCallback(async (approvalId: string, approved: boolean) => {
    const parsed = splitApprovalId(approvalId);
    if (!parsed) return;
    const [kind, requestId] = parsed;
    setDecisionError(null);
    try {
      if (kind === 'tool') await respondApproval(requestId, approved);
      if (kind === 'shell') await respondShellApproval(requestId, approved);
      if (kind === 'subagent') await respondSubagentApproval(requestId, approved);
      if (kind === 'dangerous_op') await respondDangerousOpApproval(requestId, approved);
    } catch (approvalError) {
      const message = approvalError instanceof Error ? approvalError.message : String(approvalError);
      setDecisionError(message);
    }
  }, []);

  const handleOpenProposalDiff = useCallback(async (file: ChangesetFile) => {
    try {
      await ensureProposalRecordContent(file);
      const latestFile = findChangesetFile(
        useChangesetStore.getState().changesets,
        file.proposalRecordId,
        file.filePath,
      ) ?? file;
      const oldContent = latestFile.changeType === 'create' ? '' : latestFile.oldContent;
      const newContent = latestFile.changeType === 'delete' ? '' : latestFile.newContent;
      useFileBufferStore.getState().openAiDiff(
        latestFile.filePath,
        oldContent,
        newContent,
        latestFile.changeType !== 'create',
        {
          proposalSessionId: latestFile.proposalSessionId,
          proposalRecordId: latestFile.proposalRecordId,
          changeType: latestFile.changeType,
          status: latestFile.status,
          focusTarget: getAiDiffFocusTarget(latestFile.changeType, latestFile.hunks),
        },
      );
    } catch (openError) {
      console.error('[AIAssistantView] open proposal diff failed', openError);
      setDecisionError(openError instanceof Error ? openError.message : String(openError));
    }
  }, []);

  return (
    <div data-module="ai-assistant" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SessionContextBanner compactionEvents={compactionEvents} />

      <header className="shrink-0 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', isRunning ? 'bg-blue-500' : 'bg-emerald-500')} />
            <RunTargetPicker
              value={runTarget}
              onChange={setRunTarget}
              teams={teams}
              selectedTeamId={selectedTeamId}
              onTeamChange={setSelectedTeamId}
              onRefreshTeams={() => void reloadTeams()}
              agents={agentOptions}
              selectedAgentId={selectedAgentId}
              onAgentChange={setSelectedAgentId}
              disabled={isRunning}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton title="新会话" onClick={() => void handleNewChat()}>
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="搜索对话" onClick={() => search.open()}>
              <Search className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title={sessionReviewOpen ? '收起会话审核' : '展开会话审核'}
              active={sessionReviewOpen && hasReviewContent}
              onClick={() => setSessionReviewOpen(!sessionReviewOpen)}
            >
              <FileDiff className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="恢复会话" onClick={() => setRecoveryOpen(true)}>
              <History className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title="设置"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toolbox:navigate', { detail: { page: 'settings' } }));
              }}
            >
              <Settings className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      </header>

      <StatusStrip
        status={isTeamRunning ? teamRunStatus : agentRunStatus}
        runTarget={isTeamRunning ? 'team' : runTarget}
        teamName={selectedTeam?.name}
        error={agentRunError || teamRunError || configError || (runTarget === 'team' ? teamListError : null) || decisionError}
        hasConfiguredProvider={hasConfiguredProvider}
        waitingForFirstEvent={isAgentRunning && !hasLiveRunArtifacts}
      />

      {sessionReviewOpen && hasReviewContent && (
        <SessionReviewPanel
          summaries={historySummaries.map((summary) => ({
            ...summary,
            preview: summary.preview ?? '(空会话)',
          }))}
          activeConversationId={activeConversationId}
          onRestore={(id) => void handleRestoreChat(id)}
          onCopy={(id) => void handleCopyConversation(id)}
          onClose={() => setSessionReviewOpen(false)}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <MessageSearchBar search={search} />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-x-4 top-10 z-10 rounded-lg border border-dashed bg-background/90 px-4 py-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-foreground">准备开始</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasConfiguredProvider === false ? '请先配置 LLM Provider。' : '输入任务后，审批和文件变更会在本 session 内处理。'}
            </p>
          </div>
        )}

        <ConversationThread
          messages={allMessages}
          pendingApprovals={pendingApprovals}
          inputPinnedSlot={sessionChangesets.length > 0 ? (
            <SessionChangesDock changesets={sessionChangesets} onOpenFile={(file) => void handleOpenProposalDiff(file)} />
          ) : null}
          isRunning={isRunning}
          onSend={(text, mode) => void handleSend(text, mode)}
          onStop={() => void (isTeamRunning ? abortTeam() : abort())}
          onClear={() => void handleNewChat()}
          onCopy={(content) => void navigator.clipboard.writeText(content)}
          onRetry={(id) => void handleRetry(id)}
          onFeedback={handleFeedback}
          onApprove={(id) => void handleApprovalDecision(id, true)}
          onReject={(id) => void handleApprovalDecision(id, false)}
          agents={runTarget === 'agent' ? agentOptions : undefined}
          selectedAgentId={runTarget === 'agent' ? selectedAgentId : undefined}
          onAgentChange={runTarget === 'agent' ? setSelectedAgentId : undefined}
          mode={agentMode}
          onModeChange={handleModeChange}
          className="h-full"
        />
      </div>

      <SessionRecoveryDialog
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        onRecover={(restoredSessionId) => {
          void handleRestoreChat(restoredSessionId);
          setRecoveryOpen(false);
        }}
      />
    </div>
  );
}

function findChangesetFile(
  changesets: Changeset[],
  proposalRecordId: string | undefined,
  filePath: string,
): ChangesetFile | null {
  for (const changeset of changesets) {
    const file = changeset.files.find((candidate) => (
      (proposalRecordId && candidate.proposalRecordId === proposalRecordId)
      || candidate.filePath === filePath
    ));
    if (file) return file;
  }
  return null;
}

function RunTargetPicker({
  value,
  onChange,
  teams,
  selectedTeamId,
  onTeamChange,
  onRefreshTeams,
  agents,
  selectedAgentId,
  onAgentChange,
  disabled,
}: {
  value: AssistantRunTarget;
  onChange: (value: AssistantRunTarget) => void;
  teams: TeamDto[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  onRefreshTeams: () => void;
  agents: Array<{ id: string; name: string }>;
  selectedAgentId: string;
  onAgentChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex h-7 overflow-hidden rounded-md border bg-background">
        <button
          type="button"
          title="Agent"
          aria-label="Agent"
          disabled={disabled}
          onClick={() => onChange('agent')}
          className={cn(
            'flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
            value === 'agent' && 'bg-foreground text-background hover:bg-foreground hover:text-background',
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Team"
          aria-label="Team"
          disabled={disabled}
          onClick={() => onChange('team')}
          className={cn(
            'flex w-8 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
            value === 'team' && 'bg-foreground text-background hover:bg-foreground hover:text-background',
          )}
        >
          <Users className="h-3.5 w-3.5" />
        </button>
      </div>

      {value === 'agent' && agents.length > 0 && (
        <select
          aria-label="选择 Agent"
          title="选择 Agent"
          value={selectedAgentId}
          disabled={disabled}
          onChange={(event) => onAgentChange(event.target.value)}
          className="h-7 max-w-40 rounded-md border bg-background px-2 text-[11px] text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      )}

      {value === 'team' && (
        <>
          <select
            aria-label="选择 Team"
            title="选择 Team"
            value={selectedTeamId}
            disabled={disabled || teams.length === 0}
            onChange={(event) => onTeamChange(event.target.value)}
            className="h-7 max-w-36 rounded-md border bg-background px-2 text-[11px] text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
          >
            {teams.length === 0 ? (
              <option value="">无可用 Team</option>
            ) : teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name || team.id}</option>
            ))}
          </select>
          <IconButton title="刷新 Team" onClick={onRefreshTeams} disabled={disabled}>
            <RefreshCw className="h-3.5 w-3.5" />
          </IconButton>
        </>
      )}
    </div>
  );
}

function StatusStrip({
  status,
  runTarget,
  teamName,
  error,
  hasConfiguredProvider,
  waitingForFirstEvent,
}: {
  status: string;
  runTarget: AssistantRunTarget;
  teamName?: string;
  error: string | null;
  hasConfiguredProvider: boolean | null;
  waitingForFirstEvent: boolean;
}) {
  if (error) {
    return (
      <div className="shrink-0 border-b border-destructive/20 bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
        {error}
      </div>
    );
  }

  if (hasConfiguredProvider === false) {
    return (
      <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[12px] text-amber-700">
        尚未配置 LLM Provider
      </div>
    );
  }

  if (waitingForFirstEvent) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {status === 'aborting' ? '正在终止当前运行…' : '等待模型返回消息…'}
      </div>
    );
  }

  if (runTarget === 'team' && (status === 'running' || status === 'aborting')) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {status === 'aborting' ? '正在终止 Team 运行…' : `Team「${teamName || 'Team'}」正在运行…`}
      </div>
    );
  }

  return null;
}

function SessionReviewPanel({
  summaries,
  activeConversationId,
  onRestore,
  onCopy,
  onClose,
}: {
  summaries: Array<{ id: string; preview: string; time: string }>;
  activeConversationId: string;
  onRestore: (id: string) => void;
  onCopy: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="shrink-0 border-b bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-xs font-semibold text-foreground">会话历史</p>
        <IconButton title="收起" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="max-h-[46vh] min-h-0 overflow-y-auto px-3 py-3">
        <HistoryPanel
          summaries={summaries}
          activeConversationId={activeConversationId}
          onRestore={onRestore}
          onCopy={onCopy}
        />
      </div>
    </section>
  );
}

function HistoryPanel({
  summaries,
  activeConversationId,
  onRestore,
  onCopy,
}: {
  summaries: Array<{ id: string; preview: string; time: string }>;
  activeConversationId: string;
  onRestore: (id: string) => void;
  onCopy: (id: string) => void;
}) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-4 text-[12px] text-muted-foreground">
        暂无可恢复的历史会话。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summaries.slice(0, 10).map((summary) => (
        <div key={summary.id} className="rounded-lg border bg-background/80 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-foreground">{summary.id.slice(0, 8)}</span>
            <span className="text-[10px] text-muted-foreground">{formatSessionTime(summary.time)}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{summary.preview}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRestore(summary.id)}
              className="rounded-md border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {summary.id === activeConversationId ? '当前会话' : '恢复'}
            </button>
            <button
              type="button"
              onClick={() => onCopy(summary.id)}
              className="rounded-md border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              复制
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
        active && 'border-foreground/20 bg-foreground text-background hover:bg-foreground hover:text-background',
      )}
    >
      {children}
    </button>
  );
}

function mapWriteApproval(request: WriteApprovalRequest): AssistantApprovalRequest {
  const action = request.changeType === 'create' ? '创建文件' : '修改文件';
  return {
    id: makeApprovalId('tool', request.requestId),
    kind: 'tool',
    title: `${action}: ${fileName(request.filePath)}`,
    description: `${request.toolName} 请求写入 ${request.filePath}`,
    toolName: request.toolName,
    filePath: request.filePath,
    changeType: request.changeType,
    applyViaPatch: request.applyViaPatch,
    hunks: mapDiffHunks(request.hunks),
    aiSessionId: request.aiSessionId,
  };
}

function mapShellApproval(request: ShellApprovalRequest): AssistantApprovalRequest {
  return {
    id: makeApprovalId('shell', request.requestId),
    kind: 'shell',
    title: '执行 Shell 命令',
    description: request.cwd ? `cwd: ${request.cwd}` : undefined,
    command: request.command,
    cwd: request.cwd,
    riskLevel: request.riskLevel,
    riskReason: request.riskReason,
  };
}

function mapSubagentApproval(request: SubagentApprovalRequest): AssistantApprovalRequest {
  return {
    id: makeApprovalId('subagent', request.requestId),
    kind: 'subagent',
    title: `调用子 Agent: ${request.agentId}`,
    description: request.task,
    agentId: request.agentId,
    task: request.task,
    depth: request.depth,
  };
}

function mapDangerousApproval(request: DangerousOpRequest): AssistantApprovalRequest {
  return {
    id: makeApprovalId('dangerous_op', request.requestId),
    kind: 'dangerous_op',
    title: request.toolName === 'fs_delete' ? '删除文件确认' : '危险文件操作确认',
    description: request.filePath,
    toolName: request.toolName,
    filePath: request.filePath,
    changeType: request.changeType,
  };
}

function mapDiffHunks(hunks: WriteApprovalRequest['hunks']): AssistantDiffHunk[] {
  return hunks.map((hunk, index) => {
    const header = parseHunkHeader(hunk.content);
    return {
      id: hunk.id ?? `hunk-${index}`,
      content: hunk.content,
      status: hunk.status,
      originalStart: header.originalStart,
      originalLength: header.originalLength,
      modifiedStart: header.modifiedStart,
      modifiedLength: header.modifiedLength,
    };
  });
}

function parseHunkHeader(content: string) {
  const match = content.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  return {
    originalStart: Number(match?.[1] ?? 0),
    originalLength: Number(match?.[2] ?? 0),
    modifiedStart: Number(match?.[3] ?? 0),
    modifiedLength: Number(match?.[4] ?? 0),
  };
}

function makeApprovalId(kind: ApprovalKindPrefix, requestId: string): string {
  return `${kind}:${requestId}`;
}

function splitApprovalId(approvalId: string): [ApprovalKindPrefix, string] | null {
  const separatorIndex = approvalId.indexOf(':');
  if (separatorIndex < 0) return null;
  const kind = approvalId.slice(0, separatorIndex) as ApprovalKindPrefix;
  const requestId = approvalId.slice(separatorIndex + 1);
  if (!requestId || !['tool', 'shell', 'subagent', 'dangerous_op'].includes(kind)) return null;
  return [kind, requestId];
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function formatSessionTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}
