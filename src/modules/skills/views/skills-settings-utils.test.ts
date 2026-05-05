import { describe, expect, it } from 'vitest';

import type { ResolvedSkill } from '../services/skills-service';
import {
  buildRawSkillMarkdown,
  filterSkills,
  groupSkillsByScope,
  summarizeSkillHealth,
  validateSkillFrontmatter,
} from './skills-settings-utils';

function makeSkill(overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  return {
    id: overrides.id ?? 'project:deploy',
    name: overrides.name ?? 'Deploy',
    description: overrides.description ?? '发布服务到目标环境',
    scope: overrides.scope ?? 'project',
    manifest: overrides.manifest ?? {
      id: overrides.id ?? 'project:deploy',
      name: overrides.name ?? 'Deploy',
      description: overrides.description ?? '发布服务到目标环境',
      scope: overrides.scope ?? 'project',
      skillDir: '/tmp/.claude/skills/deploy',
      skillFile: '/tmp/.claude/skills/deploy/SKILL.md',
      frontmatter: {
        whenToUse: '需要部署发布时使用',
      },
      content: '# Deploy\n\n执行部署。',
      supportingFiles: [],
      rawFrontmatter: 'name: Deploy\ndescription: 发布服务到目标环境',
    },
    diagnostics: overrides.diagnostics ?? [],
    runtimeStatus: overrides.runtimeStatus ?? 'ready',
    availableTools: overrides.availableTools ?? [],
    missingTools: overrides.missingTools ?? [],
    unsupportedFields: overrides.unsupportedFields ?? [],
  };
}

describe('filterSkills', () => {
  it('filters by query across metadata fields', () => {
    const deploy = makeSkill();
    const debug = makeSkill({
      id: 'user:debug',
      name: 'Debug',
      description: '排查运行时异常',
      scope: 'user',
    });

    expect(filterSkills([deploy, debug], '异常', 'all')).toEqual([debug]);
  });

  it('filters by scope before query matching', () => {
    const projectSkill = makeSkill();
    const userSkill = makeSkill({ id: 'user:deploy', scope: 'user', name: 'Deploy Local' });

    expect(filterSkills([projectSkill, userSkill], 'deploy', 'user')).toEqual([userSkill]);
  });
});

describe('groupSkillsByScope', () => {
  it('groups skills into fixed scope buckets', () => {
    const grouped = groupSkillsByScope([
      makeSkill({ scope: 'project' }),
      makeSkill({ id: 'builtin:review', scope: 'builtin', name: 'Review' }),
    ]);

    expect(grouped.project).toHaveLength(1);
    expect(grouped.builtin).toHaveLength(1);
    expect(grouped.user).toHaveLength(0);
  });
});

describe('summarizeSkillHealth', () => {
  it('marks missing tools or errors as critical', () => {
    const skill = makeSkill({
      diagnostics: [{ level: 'error', message: 'frontmatter 缺失 name' }],
      missingTools: ['shell_run'],
    });

    expect(summarizeSkillHealth(skill)).toMatchObject({
      tone: 'critical',
      label: '待修复',
      issueCount: 2,
    });
  });

  it('marks warnings and unsupported fields as attention', () => {
    const skill = makeSkill({
      diagnostics: [{ level: 'warn', message: '字段 hooks 尚未完全支持' }],
      unsupportedFields: ['hooks'],
      runtimeStatus: 'degraded',
    });

    expect(summarizeSkillHealth(skill)).toMatchObject({
      tone: 'attention',
      label: '需关注',
      issueCount: 2,
    });
  });

  it('marks clean skills as ready', () => {
    expect(summarizeSkillHealth(makeSkill())).toMatchObject({
      tone: 'ready',
      label: '可运行',
      issueCount: 0,
    });
  });
});

describe('buildRawSkillMarkdown', () => {
  it('prefers loaded markdown when available', () => {
    expect(buildRawSkillMarkdown(makeSkill(), 'custom markdown')).toBe('custom markdown');
  });

  it('reconstructs markdown from manifest fallback', () => {
    expect(buildRawSkillMarkdown(makeSkill())).toContain('---');
    expect(buildRawSkillMarkdown(makeSkill())).toContain('# Deploy');
  });
});

describe('validateSkillFrontmatter', () => {
  it('accepts a complete skill frontmatter block', () => {
    expect(validateSkillFrontmatter(`---
name: Deploy
description: 发布服务到目标环境
when-to-use: 需要部署时使用
allowed-tools:
  - shell_run
---

# Deploy
`)).toEqual([]);
  });

  it('reports missing required fields and malformed lists', () => {
    expect(validateSkillFrontmatter(`---
name:
allowed-tools:
  shell_run
---
`)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'name', level: 'error' }),
      expect.objectContaining({ field: 'description', level: 'error' }),
      expect.objectContaining({ field: 'when-to-use', level: 'error' }),
      expect.objectContaining({ field: 'allowed-tools', level: 'error' }),
    ]));
  });

  it('warns about unknown fields and missing body content', () => {
    expect(validateSkillFrontmatter(`---
name: Deploy
description: 发布服务
when-to-use: 需要部署时使用
custom-field: true
---
`)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'custom-field', level: 'warn' }),
      expect.objectContaining({ level: 'warn' }),
    ]));
  });
});