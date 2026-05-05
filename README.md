# Toolbox — AI Agent 驱动的开发者工作台

[![CI](https://github.com/byteforce-cn/toolbox/actions/workflows/ci.yml/badge.svg)](https://github.com/byteforce-cn/toolbox/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.19.0-green.svg)](.node-version)

> **⚠️ MVP 预览版本 — 尚未达到生产就绪（Production-Ready）标准**
>
> 本仓库是 Toolbox 的最小可行版本（MVP）。核心功能已实现并通过基础测试，但在稳定性、可观测性及运维文档等方面仍存在已知缺口，**不建议在生产环境使用**。版本路线图参见 [CHANGELOG.md](CHANGELOG.md)。
> 注意：仓库在未声明稳定前可能重建。

> **🤖 AI 辅助开发声明**
>
> 本项目的设计、代码和文档在开发过程中借助了 AI Agent（GitHub Copilot / Claude）进行辅助生成与评审。所有输出均经过人工审阅，但使用者应自行评估代码质量并进行充分测试。

---

Toolbox 是面向开发人员的桌面工作台，基于 [Tauri 2](https://tauri.app/)、React 19、TypeScript、Tailwind CSS 4 和 Zustand 构建，当前覆盖以下能力：

- **AI 助手**：会话恢复、运行时间线、Proposal Inbox、审批决策、richer tool call 展示
- **Explorer**：文件树、变更状态装饰、虚拟 review/draft 节点投影
- **Skills 工作台**：三栏布局，支持搜索、过滤、诊断、Raw Markdown 预览和原文编辑
- **Settings 框架**：设置外壳与 layout contract，支持多模块接入
- **Agent / MCP 接入**：agent 调度、team 协作、MCP 工具协议支持

---

## 目录

- [Toolbox — AI Agent 驱动的开发者工作台](#toolbox--ai-agent-驱动的开发者工作台)
  - [目录](#目录)
  - [环境要求](#环境要求)
  - [快速启动](#快速启动)
  - [仓库结构](#仓库结构)
  - [私有插件说明](#私有插件说明)
  - [贡献](#贡献)
  - [许可证](#许可证)

---

## 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | 22.19.0（见 `.node-version`） |
| pnpm | 10.8.1 |
| Rust | 1.93.0（仅构建 Tauri 桌面壳时需要，见 `src-tauri/rust-toolchain.toml`） |

> **私有插件说明**：`src-tauri/Cargo.toml` 依赖 `toolbox-plugin-ai` 和 `toolbox-plugin-crypto`，发布在 Byteforce 私有 Cargo registry（`byteforce-private`）。外部贡献者无法直接构建 Tauri 桌面目标；前端部分（`pnpm dev` / `pnpm test` / `pnpm build`）不受此限制。

---

## 快速启动

```bash
# 安装依赖
pnpm install

# 运行单元测试
pnpm test

# 类型检查
pnpm exec tsc --noEmit

# 仅构建前端
pnpm build

# 启动 Tauri 桌面开发模式（需要私有插件凭据）
pnpm tauri dev
```

常用测试命令：

```bash
pnpm test -- src/store/changeset-store.test.ts
pnpm test -- src/modules/explorer/utils/tree-projection.test.ts
pnpm test -- src/modules/settings/views/settings-layout.test.ts
pnpm test -- src/modules/skills/views/skills-settings-utils.test.ts
```

---

## 仓库结构

```
src/
  modules/
    ai-assistant/   AI 助手、运行时间线、审批、会话恢复、proposal review
    agent/          Agent 调度与生命周期管理
    agent-team/     多 Agent 团队协作
    explorer/       文件树、状态装饰、虚拟 review/draft 节点投影
    mcp/            MCP 工具协议接入
    settings/       设置外壳与 layout contract
    skills/         Skills 工作台、诊断、模板与原文编辑
  store/            全局状态（Zustand）
  services/         前端服务层（Tauri IPC 封装）
src-tauri/          Tauri 桌面壳与 Rust 插件接入
docs/               设计文档与优化方案
```

---

## 私有插件说明

`src-tauri/Cargo.toml` 中的以下依赖来自 Byteforce 私有 Cargo registry，外部贡献者无法直接拉取：

- `toolbox-plugin-ai`：AI 运行时、IPC 通道、Agent 调度后端
- `toolbox-plugin-crypto`：加密服务（AES-GCM、HMAC、Key 管理）

如需获取访问凭据，请联系 [byteforce@qq.com](mailto:byteforce@qq.com)。

---

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 许可证

本项目遵循 [Apache-2.0](LICENSE) 许可证。
