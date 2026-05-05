import type { ResolvedSkill } from '../services/skills-service';

export const SKILL_SCOPE_ORDER = ['project', 'user', 'builtin', 'plugin'] as const;

export type SkillFilterScope = 'all' | ResolvedSkill['scope'];
export type SkillHealthTone = 'ready' | 'attention' | 'critical';

export interface SkillEditorIssue {
  level: 'error' | 'warn';
  line: number;
  field?: string;
  message: string;
}

const KNOWN_FRONTMATTER_FIELDS = new Set([
  'name',
  'description',
  'when-to-use',
  'allowed-tools',
  'disable-model-invocation',
  'user-invocable',
  'argument-hint',
  'model',
  'context',
  'agent',
  'args',
  'hooks',
  'shell-pre-exec',
]);

const REQUIRED_FRONTMATTER_FIELDS = ['name', 'description', 'when-to-use'] as const;
const BOOLEAN_FIELDS = new Set(['disable-model-invocation', 'user-invocable']);

export interface SkillHealthSummary {
  tone: SkillHealthTone;
  label: string;
  detail: string;
  issueCount: number;
}

export function filterSkills(
  skills: ResolvedSkill[],
  query: string,
  scope: SkillFilterScope,
): ResolvedSkill[] {
  const normalizedQuery = query.trim().toLowerCase();

  return skills.filter((skill) => {
    if (scope !== 'all' && skill.scope !== scope) return false;
    if (!normalizedQuery) return true;

    const haystacks = [
      skill.name,
      skill.description,
      skill.id,
      skill.runtimeStatus,
      skill.manifest.skillFile,
      skill.manifest.frontmatter.whenToUse,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());

    return haystacks.some((value) => value.includes(normalizedQuery));
  });
}

export function groupSkillsByScope(skills: ResolvedSkill[]): Record<ResolvedSkill['scope'], ResolvedSkill[]> {
  return skills.reduce<Record<ResolvedSkill['scope'], ResolvedSkill[]>>(
    (groups, skill) => {
      groups[skill.scope].push(skill);
      return groups;
    },
    {
      builtin: [],
      project: [],
      user: [],
      plugin: [],
    },
  );
}

export function summarizeSkillHealth(skill: ResolvedSkill): SkillHealthSummary {
  const errorCount = skill.diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
  const warnCount = skill.diagnostics.filter((diagnostic) => diagnostic.level === 'warn').length;
  const missingToolCount = skill.missingTools.length;
  const unsupportedFieldCount = skill.unsupportedFields.length;
  const issueCount = errorCount + warnCount + missingToolCount + unsupportedFieldCount;

  if (errorCount > 0 || missingToolCount > 0) {
    return {
      tone: 'critical',
      label: '待修复',
      detail: [
        errorCount > 0 ? `${errorCount} 条错误` : null,
        missingToolCount > 0 ? `${missingToolCount} 个缺失工具` : null,
      ]
        .filter(Boolean)
        .join('，'),
      issueCount,
    };
  }

  if (warnCount > 0 || unsupportedFieldCount > 0 || skill.runtimeStatus !== 'ready') {
    return {
      tone: 'attention',
      label: '需关注',
      detail: [
        warnCount > 0 ? `${warnCount} 条警告` : null,
        unsupportedFieldCount > 0 ? `${unsupportedFieldCount} 个未完全支持字段` : null,
        skill.runtimeStatus !== 'ready' ? `运行状态 ${skill.runtimeStatus}` : null,
      ]
        .filter(Boolean)
        .join('，'),
      issueCount,
    };
  }

  return {
    tone: 'ready',
    label: '可运行',
    detail: '诊断通过，运行时链路可用',
    issueCount,
  };
}

export function buildRawSkillMarkdown(skill: ResolvedSkill, loadedMarkdown?: string | null): string {
  if (loadedMarkdown && loadedMarkdown.trim()) return loadedMarkdown;

  const rawFrontmatter = skill.manifest.rawFrontmatter.trim();
  const frontmatterBlock = rawFrontmatter
    ? rawFrontmatter.startsWith('---')
      ? rawFrontmatter
      : `---\n${rawFrontmatter}\n---`
    : '';

  return [frontmatterBlock, skill.manifest.content.trim()]
    .filter((value) => value.length > 0)
    .join('\n\n')
    .trim();
}

export function validateSkillFrontmatter(markdown: string): SkillEditorIssue[] {
  const lines = markdown.split(/\r?\n/);
  const issues: SkillEditorIssue[] = [];

  if (lines[0]?.trim() !== '---') {
    return [{
      level: 'error',
      line: 1,
      message: 'SKILL.md 必须以 YAML frontmatter 开头（首行应为 ---）。',
    }];
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    return [{
      level: 'error',
      line: 1,
      message: 'frontmatter 缺少结束分隔符 ---。',
    }];
  }

  const presentFields = new Map<string, number>();
  let activeListField: 'allowed-tools' | 'args' | null = null;

  for (let index = 1; index < closingIndex; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (rawLine.startsWith('\t')) {
      issues.push({
        level: 'warn',
        line: lineNumber,
        message: 'frontmatter 建议统一使用空格缩进，避免使用 Tab。',
      });
      continue;
    }

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    if (indent === 0) {
      activeListField = null;
      const match = line.match(/^([a-z0-9-]+):(.*)$/);
      if (!match) {
        issues.push({
          level: 'error',
          line: lineNumber,
          message: 'frontmatter 顶层字段必须写成 key: value 或 key: 形式。',
        });
        continue;
      }

      const [, field, value] = match;
      const normalizedValue = value.trim();
      presentFields.set(field, lineNumber);

      if (!KNOWN_FRONTMATTER_FIELDS.has(field)) {
        issues.push({
          level: 'warn',
          line: lineNumber,
          field,
          message: `字段 ${field} 当前未在 Skills 编辑器的 schema 中声明，请确认运行时是否支持。`,
        });
      }

      if (REQUIRED_FRONTMATTER_FIELDS.includes(field as typeof REQUIRED_FRONTMATTER_FIELDS[number]) && normalizedValue.length === 0) {
        issues.push({
          level: 'error',
          line: lineNumber,
          field,
          message: `字段 ${field} 不能为空。`,
        });
      }

      if (BOOLEAN_FIELDS.has(field) && normalizedValue.length > 0 && !['true', 'false'].includes(normalizedValue)) {
        issues.push({
          level: 'error',
          line: lineNumber,
          field,
          message: `字段 ${field} 只能填写 true 或 false。`,
        });
      }

      if (field === 'allowed-tools' || field === 'args') {
        activeListField = field;
      }

      continue;
    }

    if (activeListField === 'allowed-tools' && !line.startsWith('- ')) {
      issues.push({
        level: 'error',
        line: lineNumber,
        field: activeListField,
        message: 'allowed-tools 下的每一项都必须写成 `- tool_name`。',
      });
    }

    if (activeListField === 'args' && !line.startsWith('- ') && !line.includes(':')) {
      issues.push({
        level: 'error',
        line: lineNumber,
        field: activeListField,
        message: 'args 列表中的每一行都必须是 `- name: ...` 或 `description: ...` 这类键值对。',
      });
    }
  }

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!presentFields.has(field)) {
      issues.push({
        level: 'error',
        line: 1,
        field,
        message: `frontmatter 缺少必填字段 ${field}。`,
      });
    }
  }

  if (!lines.slice(closingIndex + 1).some((line) => line.trim().length > 0)) {
    issues.push({
      level: 'warn',
      line: closingIndex + 1,
      message: 'frontmatter 之后还需要补充正文说明，避免 Skill 只有元数据没有执行指导。',
    });
  }

  return issues;
}