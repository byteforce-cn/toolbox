/**
 * Skills service — 包装 skill_* 后端命令。
 * 上游：jinhe-skill。后端命令已注册（Phase 2）。
 */
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { callBackend } from '../../../services/backend-unavailable';

export type SkillScope = 'builtin' | 'project' | 'user' | 'plugin';

export interface SkillArg {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  argumentHint?: string;
  model?: string;
  context?: string;
  agent?: string;
  hooks?: unknown;
  whenToUse?: string;
  args?: SkillArg[];
  shellPreExec?: string;
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  skillDir: string;
  skillFile: string;
  frontmatter: SkillFrontmatter;
  content: string;
  supportingFiles: string[];
  rawFrontmatter: string;
}

export interface SkillDiagnostic {
  level: 'error' | 'warn' | 'info' | string;
  field?: string;
  description?: string;
  message: string;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  manifest: SkillManifest;
  diagnostics: SkillDiagnostic[];
  runtimeStatus: string;
  availableTools: string[];
  missingTools: string[];
  unsupportedFields: string[];
}

interface RawSkillArg {
  name?: string;
  description?: string;
  required?: boolean;
  default?: string;
  defaultValue?: string;
}

interface RawSkillFrontmatter {
  name?: string;
  description?: string;
  ['allowed-tools']?: string[];
  allowedTools?: string[];
  ['disable-model-invocation']?: boolean;
  disableModelInvocation?: boolean;
  ['user-invocable']?: boolean;
  userInvocable?: boolean;
  ['argument-hint']?: string;
  argumentHint?: string;
  model?: string;
  context?: string;
  agent?: string;
  hooks?: unknown;
  ['when-to-use']?: string;
  whenToUse?: string;
  args?: RawSkillArg[];
  ['shell-pre-exec']?: string;
  shellPreExec?: string;
}

interface RawSkillManifest {
  id?: string;
  name?: string;
  description?: string;
  sourceScope?: SkillScope;
  source_scope?: SkillScope;
  skillDir?: string;
  skill_dir?: string;
  skillFile?: string;
  skill_file?: string;
  frontmatter?: RawSkillFrontmatter;
  content?: string;
  supportingFiles?: string[];
  supporting_files?: string[];
  rawFrontmatter?: string;
  raw_frontmatter?: string;
}

interface RawSkillDiagnostic {
  level?: string;
  field?: string | null;
  message?: string;
}

interface RawResolvedSkill {
  manifest?: RawSkillManifest;
  diagnostics?: RawSkillDiagnostic[];
  runtimeStatus?: string;
  runtime_status?: string;
  availableTools?: string[];
  available_tools?: string[];
  missingTools?: string[];
  missing_tools?: string[];
  unsupportedFields?: string[];
  unsupported_fields?: string[];
}

const USER_SKILLS_BASE = '.jinhe/.claude/skills';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSkillArg(raw: RawSkillArg): SkillArg {
  return {
    name: raw.name ?? '',
    description: raw.description ?? '',
    required: raw.required ?? false,
    defaultValue: raw.defaultValue ?? raw.default,
  };
}

function normalizeFrontmatter(raw: RawSkillFrontmatter | undefined): SkillFrontmatter {
  return {
    name: raw?.name,
    description: raw?.description,
    allowedTools: raw?.allowedTools ?? raw?.['allowed-tools'],
    disableModelInvocation: raw?.disableModelInvocation ?? raw?.['disable-model-invocation'],
    userInvocable: raw?.userInvocable ?? raw?.['user-invocable'],
    argumentHint: raw?.argumentHint ?? raw?.['argument-hint'],
    model: raw?.model,
    context: raw?.context,
    agent: raw?.agent,
    hooks: raw?.hooks,
    whenToUse: raw?.whenToUse ?? raw?.['when-to-use'],
    args: raw?.args?.map(normalizeSkillArg),
    shellPreExec: raw?.shellPreExec ?? raw?.['shell-pre-exec'],
  };
}

function normalizeManifest(raw: RawSkillManifest): SkillManifest {
  const scope = raw.sourceScope ?? raw.source_scope ?? 'project';
  const frontmatter = normalizeFrontmatter(raw.frontmatter);
  return {
    id: raw.id ?? '',
    name: raw.name ?? frontmatter.name ?? '',
    description: raw.description ?? frontmatter.description ?? '',
    scope,
    skillDir: raw.skillDir ?? raw.skill_dir ?? '',
    skillFile: raw.skillFile ?? raw.skill_file ?? '',
    frontmatter,
    content: raw.content ?? '',
    supportingFiles: raw.supportingFiles ?? raw.supporting_files ?? [],
    rawFrontmatter: raw.rawFrontmatter ?? raw.raw_frontmatter ?? '',
  };
}

function normalizeDiagnostic(raw: RawSkillDiagnostic): SkillDiagnostic {
  return {
    level: raw.level ?? 'info',
    field: raw.field ?? undefined,
    message: raw.message ?? '',
  };
}

function normalizeSkill(raw: RawResolvedSkill): ResolvedSkill {
  const manifest = normalizeManifest(raw.manifest ?? {});
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    scope: manifest.scope,
    manifest,
    diagnostics: (raw.diagnostics ?? []).map(normalizeDiagnostic),
    runtimeStatus: raw.runtimeStatus ?? raw.runtime_status ?? 'ready',
    availableTools: raw.availableTools ?? raw.available_tools ?? [],
    missingTools: raw.missingTools ?? raw.missing_tools ?? [],
    unsupportedFields: raw.unsupportedFields ?? raw.unsupported_fields ?? [],
  };
}

function serializeSkillFrontmatter(frontmatter: SkillFrontmatter): string {
  const lines: string[] = ['---'];
  if (frontmatter.name) lines.push(`name: ${frontmatter.name}`);
  if (frontmatter.description) lines.push(`description: ${frontmatter.description}`);
  if (frontmatter.whenToUse) lines.push(`when-to-use: ${frontmatter.whenToUse}`);
  if (frontmatter.allowedTools?.length) {
    lines.push('allowed-tools:');
    frontmatter.allowedTools.forEach((tool) => lines.push(`  - ${tool}`));
  }
  if (frontmatter.disableModelInvocation !== undefined) {
    lines.push(`disable-model-invocation: ${frontmatter.disableModelInvocation}`);
  }
  if (frontmatter.userInvocable !== undefined) lines.push(`user-invocable: ${frontmatter.userInvocable}`);
  if (frontmatter.argumentHint) lines.push(`argument-hint: ${frontmatter.argumentHint}`);
  if (frontmatter.model) lines.push(`model: ${frontmatter.model}`);
  if (frontmatter.context) lines.push(`context: ${frontmatter.context}`);
  if (frontmatter.agent) lines.push(`agent: ${frontmatter.agent}`);
  if (frontmatter.args?.length) {
    lines.push('args:');
    frontmatter.args.forEach((arg) => {
      lines.push(`  - name: ${arg.name}`);
      lines.push(`    description: ${arg.description}`);
      if (arg.required) lines.push('    required: true');
      if (arg.defaultValue) lines.push(`    default: ${arg.defaultValue}`);
    });
  }
  if (frontmatter.shellPreExec) lines.push(`shell-pre-exec: ${frontmatter.shellPreExec}`);
  if (frontmatter.hooks !== undefined) {
    lines.push(`hooks: ${JSON.stringify(frontmatter.hooks)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function buildSkillTemplate(name: string, description = ''): string {
  const safeName = name.trim() || 'new-skill';
  return `${serializeSkillFrontmatter({
    name: safeName,
    description: description || undefined,
    userInvocable: true,
  })}\n\n# ${safeName}\n\n在此编写 Skill 的执行说明。`;
}

export async function readSkillMarkdown(skillFile: string): Promise<string> {
  return readTextFile(skillFile);
}

export async function createSkillFile(
  scope: Extract<SkillScope, 'project' | 'user'>,
  directoryName: string,
  markdown: string,
  workspaceRoot?: string | null,
): Promise<string> {
  const safeDir = slugify(directoryName);
  if (!safeDir) {
    throw new Error('Skill 目录名不能为空');
  }

  if (scope === 'project') {
    if (!workspaceRoot) {
      throw new Error('当前未设置工作区，无法创建项目级 Skill');
    }
    const skillDir = `${workspaceRoot}/.claude/skills/${safeDir}`;
    const skillFile = `${skillDir}/SKILL.md`;
    if (await exists(skillDir)) {
      throw new Error(`项目级 Skill 目录已存在：${safeDir}`);
    }
    await mkdir(skillDir, { recursive: true });
    await writeTextFile(skillFile, markdown);
    return skillFile;
  }

  const skillDir = `${USER_SKILLS_BASE}/${safeDir}`;
  const skillFile = `${skillDir}/SKILL.md`;
  if (await exists(skillDir, { baseDir: BaseDirectory.Home })) {
    throw new Error(`用户级 Skill 目录已存在：${safeDir}`);
  }
  await mkdir(skillDir, { baseDir: BaseDirectory.Home, recursive: true });
  await writeTextFile(skillFile, markdown, { baseDir: BaseDirectory.Home });
  return skillFile;
}

export async function updateSkillFile(skillFile: string, markdown: string): Promise<void> {
  await writeTextFile(skillFile, markdown);
}

export async function deleteSkill(skillDir: string): Promise<void> {
  await remove(skillDir, { recursive: true });
}

export const skillList = (): Promise<ResolvedSkill[]> =>
  callBackend<RawResolvedSkill[]>('skill_list').then((skills) => skills.map(normalizeSkill));

export const skillGet = (id: string): Promise<ResolvedSkill | null> =>
  callBackend<RawResolvedSkill | null>('skill_get', { skillId: id }).then((skill) => (skill ? normalizeSkill(skill) : null));

export const skillReload = (): Promise<ResolvedSkill[]> =>
  callBackend<RawResolvedSkill[]>('skill_reload').then((skills) => skills.map(normalizeSkill));

export const skillDiagnostics = (id: string): Promise<SkillDiagnostic[]> =>
  callBackend<RawSkillDiagnostic[]>('skill_diagnostics', { skillId: id }).then((items) => items.map(normalizeDiagnostic));
