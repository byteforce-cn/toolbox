import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  AlertTriangle,
  ArrowUpRight,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Save,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import * as skillsService from '../services/skills-service';
import type { ResolvedSkill } from '../services/skills-service';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { useFileBufferStore } from '../../../store/file-buffer-store';
import { isBackendUnavailable } from '../../../services/backend-unavailable';
import { BackendUnavailableNotice } from '../../../components/BackendUnavailableNotice';
import { cn } from '@/lib/utils';
import { tauriFsService } from '../../explorer/tauri-fs-service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SKILL_SCOPE_ORDER,
  buildRawSkillMarkdown,
  filterSkills,
  groupSkillsByScope,
  summarizeSkillHealth,
  validateSkillFrontmatter,
  type SkillFilterScope,
} from './skills-settings-utils';

const PENDING_COMMANDS = [
  'skill_list',
  'skill_get',
  'skill_reload',
  'skill_diagnostics',
];

type EditableScope = 'project' | 'user';

interface EditorState {
  mode: 'create' | 'edit';
  scope: EditableScope;
  directoryName: string;
  content: string;
  skill?: ResolvedSkill;
}

interface EditorNotice {
  tone: 'success' | 'error';
  message: string;
}

function scopeLabel(scope: ResolvedSkill['scope']): string {
  switch (scope) {
    case 'project':
      return '项目';
    case 'user':
      return '用户';
    case 'builtin':
      return '内置';
    case 'plugin':
      return '插件';
    default:
      return scope;
  }
}

function canEditSkill(skill: ResolvedSkill | null): skill is ResolvedSkill {
  return !!skill && (skill.scope === 'project' || skill.scope === 'user');
}

export function SkillsSettingsPage() {
  const workspaceRoot = useWorkspaceStore((state) => state.rootPath);
  const [skills, setSkills] = useState<ResolvedSkill[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<SkillFilterScope>('all');
  const [deleteCandidate, setDeleteCandidate] = useState<ResolvedSkill | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState('');
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [editorNotice, setEditorNotice] = useState<EditorNotice | null>(null);
  const monacoEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await skillsService.skillReload();
      setSkills(list);
      setSelectedSkillId((current) => current ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [selectedSkillId, skills],
  );

  const filteredSkills = useMemo(
    () => filterSkills(skills, query, scopeFilter),
    [skills, query, scopeFilter],
  );

  const groupedSkills = useMemo(
    () => groupSkillsByScope(filteredSkills),
    [filteredSkills],
  );

  const editorIssues = useMemo(
    () => (editor ? validateSkillFrontmatter(editor.content) : []),
    [editor],
  );

  useEffect(() => {
    if (!editorNotice) return undefined;
    const timer = window.setTimeout(() => setEditorNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [editorNotice]);

  useEffect(() => {
    if (!filteredSkills.length) {
      setSelectedSkillId(null);
      return;
    }
    if (!filteredSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(filteredSkills[0]?.id ?? null);
    }
  }, [filteredSkills, selectedSkillId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedSkill) {
      setMarkdownPreview('');
      setMarkdownLoading(false);
      return;
    }

    setMarkdownLoading(true);
    void skillsService
      .readSkillMarkdown(selectedSkill.manifest.skillFile)
      .then((content) => {
        if (!cancelled) setMarkdownPreview(content);
      })
      .catch(() => {
        if (!cancelled) setMarkdownPreview(buildRawSkillMarkdown(selectedSkill));
      })
      .finally(() => {
        if (!cancelled) setMarkdownLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSkill]);

  const beginCreate = useCallback((scope: EditableScope) => {
    setEditorNotice(null);
    setEditor({
      mode: 'create',
      scope,
      directoryName: '',
      content: skillsService.buildSkillTemplate('new-skill'),
    });
  }, []);

  const beginEdit = useCallback(async (skill: ResolvedSkill) => {
    try {
      setSaving(true);
      setEditorNotice(null);
      const content = selectedSkill?.id === skill.id && markdownPreview
        ? markdownPreview
        : await skillsService.readSkillMarkdown(skill.manifest.skillFile);
      setEditor({
        mode: 'edit',
        scope: skill.scope === 'user' ? 'user' : 'project',
        directoryName: skill.id.split(':').pop() ?? skill.name,
        content,
        skill,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [markdownPreview, selectedSkill?.id]);

  const openSourceFile = useCallback(async (filePath: string, content?: string) => {
    try {
      const existing = useFileBufferStore.getState().buffers[filePath];
      if (existing) {
        useFileBufferStore.getState().setActiveTab(filePath);
        return;
      }

      const fileContent = content ?? await tauriFsService.readTextFile(workspaceRoot ?? '', filePath);
      useFileBufferStore.getState().openFile(filePath, fileContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEditorNotice({
        tone: 'error',
        message: '打开源码失败，请确认文件仍然存在。',
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    if (!editor.directoryName.trim()) {
      setError('Skill 目录名不能为空');
      setEditorNotice({ tone: 'error', message: 'Skill 目录名不能为空。' });
      return;
    }
    if (!editor.content.trim()) {
      setError('SKILL.md 内容不能为空');
      setEditorNotice({ tone: 'error', message: 'SKILL.md 内容不能为空。' });
      return;
    }
    if (editorIssues.some((issue) => issue.level === 'error')) {
      setError('frontmatter 校验未通过，请先修复编辑器中的错误。');
      setEditorNotice({ tone: 'error', message: 'frontmatter 校验未通过，当前不能保存。' });
      return;
    }

    try {
      setSaving(true);
      setError(null);
      let createdSkillFile: string | null = null;
      if (editor.mode === 'create') {
        createdSkillFile = await skillsService.createSkillFile(editor.scope, editor.directoryName, editor.content, workspaceRoot);
      } else if (editor.skill) {
        await skillsService.updateSkillFile(editor.skill.manifest.skillFile, editor.content);
      }

      const refreshed = await skillsService.skillReload();
      setSkills(refreshed);
      const nextId = editor.mode === 'create'
        ? refreshed.find((skill) => skill.manifest.skillFile === createdSkillFile)?.id ?? refreshed[0]?.id ?? null
        : editor.skill?.id ?? selectedSkillId;
      setSelectedSkillId(nextId ?? refreshed[0]?.id ?? null);
      setEditor(null);
      setEditorNotice({
        tone: 'success',
        message: editor.mode === 'create' ? 'Skill 已创建并重新载入索引。' : 'Skill 已保存。',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEditorNotice({
        tone: 'error',
        message: e instanceof Error ? e.message : 'Skill 保存失败。',
      });
    } finally {
      setSaving(false);
    }
  }, [editor, editorIssues, selectedSkillId, workspaceRoot]);

  const handleDelete = useCallback(async (skill: ResolvedSkill) => {
    try {
      setSaving(true);
      setError(null);
      await skillsService.deleteSkill(skill.manifest.skillDir);
      const refreshed = await skillsService.skillReload();
      setSkills(refreshed);
      setSelectedSkillId(refreshed[0]?.id ?? null);
      setEditor(null);
      setDeleteCandidate(null);
      setEditorNotice({ tone: 'success', message: 'Skill 已删除。' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEditorNotice({ tone: 'error', message: e instanceof Error ? e.message : '删除 Skill 失败。' });
    } finally {
      setSaving(false);
    }
  }, []);

  const syncEditorMarkers = useCallback(() => {
    if (!editor || !monacoEditorRef.current || !monacoRef.current) {
      return;
    }

    const model = monacoEditorRef.current.getModel();
    if (!model) {
      return;
    }

    monacoRef.current.editor.setModelMarkers(model, 'skills-frontmatter', editorIssues.map((issue) => ({
      startLineNumber: issue.line,
      endLineNumber: issue.line,
      startColumn: 1,
      endColumn: model.getLineMaxColumn(issue.line),
      message: issue.message,
      severity: issue.level === 'error'
        ? monacoRef.current!.MarkerSeverity.Error
        : monacoRef.current!.MarkerSeverity.Warning,
    })));
  }, [editor, editorIssues]);

  useEffect(() => {
    syncEditorMarkers();
  }, [syncEditorMarkers]);

  const handleEditorMount: OnMount = useCallback((monacoEditor, monaco) => {
    monacoEditorRef.current = monacoEditor;
    monacoRef.current = monaco;
    monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => { void handleSave(); },
    );
    syncEditorMarkers();
  }, [handleSave, syncEditorMarkers]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载 Skills…
      </div>
    );
  }

  if (error && isBackendUnavailable(error)) {
    return (
      <BackendUnavailableNotice
        title="Skills 设置"
        description="Skill 是参数化的工具调用模板，让用户或 Agent 用自然语言触发预定义任务。"
        pendingCommands={PENDING_COMMANDS}
        hint="后端命令已在 toolbox-plugin-ai/src/commands/skill.rs 注册。若仍显示此页，请检查 Tauri 构建产物是否包含最新 toolbox-plugin-ai。"
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 py-1">
        <div>
          <h1 className="text-base font-semibold text-foreground">Skills</h1>
          <p className="text-[11px] text-muted-foreground">
            {skills.length} 个 Skill，{skills.filter((s) => s.diagnostics.some((d) => d.level === 'error')).length} 个有错误
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" /> 刷新
          </button>
          <button
            type="button"
            onClick={() => beginCreate('project')}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderPlus className="h-3 w-3" /> 新建项目 Skill
          </button>
          <button
            type="button"
            onClick={() => beginCreate('user')}
            className="flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
          >
            <UserPlus className="h-3 w-3" /> 新建用户 Skill
          </button>
        </div>
      </div>

      {editorNotice && (
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-[12px]',
          editorNotice.tone === 'success'
            ? 'border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10'
            : 'border-destructive/20 bg-destructive/10 text-destructive',
        )}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {editorNotice.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-56 shrink-0 flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称、描述…"
              className="h-7 w-full rounded-md border bg-background pl-8 pr-3 text-[12px] outline-none focus:border-ring placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', ...SKILL_SCOPE_ORDER] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                  scopeFilter === scope
                    ? 'border-foreground/30 bg-foreground text-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {scope === 'all' ? '全部' : scopeLabel(scope)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {SKILL_SCOPE_ORDER.map((scope) => {
              const group = groupedSkills[scope];
              if (group.length === 0) return null;
              return (
                <div key={scope} className="mb-3">
                  <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>{scopeLabel(scope)}</span>
                    <span>{group.length}</span>
                  </div>
                  <div className="space-y-px">
                    {group.map((skill) => {
                      const hasErrors = skill.diagnostics.some((d) => d.level === 'error');
                      const isSelected = skill.id === selectedSkillId;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => { setSelectedSkillId(skill.id); setEditor(null); }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                            isSelected
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                          )}
                        >
                          <span className={cn(
                            'mt-px h-1.5 w-1.5 shrink-0 rounded-full',
                            hasErrors ? 'bg-destructive' : 'bg-emerald-500',
                          )} />
                          <span className="truncate">{skill.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filteredSkills.length === 0 && (
              <div className="px-1 text-[12px] text-muted-foreground">无匹配结果</div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card">
          {editor ? (
            <EditorPanel
              editor={editor}
              saving={saving}
              editorIssues={editorIssues}
              onEditorChange={(content) => setEditor({ ...editor, content })}
              onDirNameChange={(directoryName) => setEditor({ ...editor, directoryName })}
              onScopeChange={(scope) => setEditor({ ...editor, scope })}
              onSave={() => void handleSave()}
              onCancel={() => setEditor(null)}
              onMount={handleEditorMount}
            />
          ) : selectedSkill ? (
            <SkillDetailPanel
              skill={selectedSkill}
              markdownLoading={markdownLoading}
              markdownPreview={markdownPreview}
              saving={saving}
              onEdit={() => void beginEdit(selectedSkill)}
              onDelete={() => setDeleteCandidate(selectedSkill)}
              onOpenSource={() => void openSourceFile(
                selectedSkill.manifest.skillFile,
                markdownPreview || buildRawSkillMarkdown(selectedSkill),
              )}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              从左侧选择一个 Skill
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteCandidate !== null} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }}>
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Skill</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate
                ? `将删除 "${deleteCandidate.name}" 的整个目录（${deleteCandidate.manifest.skillDir}）。此操作不可恢复。`
                : '确认删除当前 Skill。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving || !deleteCandidate}
              onClick={() => {
                if (deleteCandidate) {
                  void handleDelete(deleteCandidate);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SkillDetailPanel({
  skill, markdownLoading, markdownPreview, saving, onEdit, onDelete, onOpenSource,
}: {
  skill: ResolvedSkill;
  markdownLoading: boolean;
  markdownPreview: string;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenSource: () => void;
}) {
  const health = summarizeSkillHealth(skill);
  const errors = skill.diagnostics.filter((d) => d.level === 'error');
  const warns = skill.diagnostics.filter((d) => d.level === 'warn');

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{skill.name}</h2>
            <span className="rounded-md bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{scopeLabel(skill.scope)}</span>
            <span className={cn(
              'rounded-md px-1.5 py-px text-[10px] font-medium',
              health.tone === 'critical' ? 'bg-destructive/10 text-destructive'
                : health.tone === 'attention' ? 'bg-amber-500/10 text-amber-700'
                : 'bg-emerald-500/10 text-emerald-700',
            )}>{health.label}</span>
          </div>
          {skill.description && (
            <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSource}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> 打开源码
          </button>
          {canEditSkill(skill) && (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={saving}
                className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> 编辑
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {(errors.length > 0 || warns.length > 0) && (
        <div className="space-y-1.5">
          {errors.map((d, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{d.field ? <span className="font-mono mr-1">{d.field}:</span> : null}{d.message}</span>
            </div>
          ))}
          {warns.map((d, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-50/50 px-3 py-2 text-[12px] text-amber-700 dark:bg-amber-500/5">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{d.field ? <span className="font-mono mr-1">{d.field}:</span> : null}{d.message}</span>
            </div>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[12px]">
        {skill.manifest.frontmatter.whenToUse && (
          <>
            <dt className="text-muted-foreground">When to use</dt>
            <dd className="text-foreground">{skill.manifest.frontmatter.whenToUse}</dd>
          </>
        )}
        {skill.manifest.frontmatter.model && (
          <>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-mono text-foreground">{skill.manifest.frontmatter.model}</dd>
          </>
        )}
        {skill.missingTools.length > 0 && (
          <>
            <dt className="text-muted-foreground">缺失工具</dt>
            <dd className="text-destructive">{skill.missingTools.join(', ')}</dd>
          </>
        )}
        <dt className="text-muted-foreground">文件</dt>
        <dd className="break-all font-mono text-[11px] text-muted-foreground">{skill.manifest.skillFile}</dd>
      </dl>

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">SKILL.md</div>
        {markdownLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 读取中…
          </div>
        ) : (
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground/80 whitespace-pre-wrap">
            {buildRawSkillMarkdown(skill, markdownPreview)}
          </pre>
        )}
      </div>
    </div>
  );
}

function EditorPanel({
  editor, saving, editorIssues,
  onEditorChange, onDirNameChange, onScopeChange,
  onSave, onCancel, onMount,
}: {
  editor: EditorState;
  saving: boolean;
  editorIssues: ReturnType<typeof validateSkillFrontmatter>;
  onEditorChange: (v: string) => void;
  onDirNameChange: (v: string) => void;
  onScopeChange: (v: EditableScope) => void;
  onSave: () => void;
  onCancel: () => void;
  onMount: OnMount;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-foreground">
            {editor.mode === 'create' ? '新建 Skill' : `编辑 · ${editor.skill?.name ?? editor.directoryName}`}
          </span>
          {editor.mode === 'create' && (
            <>
              <select
                value={editor.scope}
                onChange={(e) => onScopeChange(e.target.value as EditableScope)}
                className="h-6 rounded-md border bg-background px-2 text-[11px] outline-none focus:border-ring"
              >
                <option value="project">项目</option>
                <option value="user">用户</option>
              </select>
              <input
                value={editor.directoryName}
                onChange={(e) => onDirNameChange(e.target.value)}
                placeholder="目录名"
                className="h-6 w-40 rounded-md border bg-background px-2 text-[11px] outline-none focus:border-ring placeholder:text-muted-foreground"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editorIssues.length > 0 && (
            <span className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-medium',
              editorIssues.some((i) => i.level === 'error')
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-700',
            )}>
              {editorIssues.length} 条诊断
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> 取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="markdown"
          value={editor.content}
          theme={isDarkTheme() ? 'vs-dark' : 'vs'}
          onMount={onMount}
          onChange={(v) => onEditorChange(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            renderWhitespace: 'none',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}
