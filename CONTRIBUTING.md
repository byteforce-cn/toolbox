# 贡献指南

感谢你有兴趣为 Toolbox 做出贡献！在提交 issue 或 PR 之前，请先阅读以下内容。

## 行为准则

本项目遵循 [贡献者公约行为准则](CODE_OF_CONDUCT.md)，参与即表示你同意遵守该准则。

## 报告问题

在提交新 issue 之前，请先搜索现有 issue 确认问题尚未被记录。

提交 bug 报告时请包含：

- 操作系统及版本
- Node.js 版本（`node --version`）与 pnpm 版本（`pnpm --version`）
- Toolbox 版本或 commit hash
- 最小可复现步骤
- 预期行为与实际行为（如有截图，请一并附上）

## 提交 Pull Request

1. Fork 本仓库并基于 `main` 分支创建特性分支：
   ```bash
   git checkout -b feat/your-feature
   ```
2. 遵循现有代码风格；运行格式化和类型检查：
   ```bash
   pnpm exec tsc --noEmit
   ```
3. 确保所有测试通过：
   ```bash
   pnpm test
   ```
4. 每个 commit 信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
   ```
   feat(ai-assistant): add proposal inbox batch approval
   fix(explorer): correct virtual draft node projection order
   ```
5. 提交 PR 时填写完整描述，关联相关 issue（`Closes #123`）。

## 开发环境要求

| 工具 | 版本 |
|------|------|
| Node.js | 22.19.0 |
| pnpm | 10.8.1 |
| Rust | 1.93.0（仅构建 Tauri 桌面壳时需要） |
| Tauri CLI | 通过 `pnpm tauri` 调用，版本固定于 `package.json` |

Node.js 版本固定在 `.node-version`。Rust 工具链版本固定在 `src-tauri/rust-toolchain.toml`，首次 `cargo build` 会自动安装。

> **注意**：`src-tauri/Cargo.toml` 依赖 `toolbox-plugin-ai` 和 `toolbox-plugin-crypto` 来自 Byteforce 私有 Cargo registry，外部贡献者无法直接构建 Tauri 桌面目标；前端部分（`pnpm dev` / `pnpm test` / `pnpm build`）不受此限制。

## 代码组织

```
src/modules/ai-assistant   AI 助手、运行时间线、审批、会话恢复、proposal review
src/modules/explorer       文件树、状态装饰、虚拟 review/draft 节点投影
src/modules/settings       设置外壳与 layout contract
src/modules/skills         Skills 工作台、诊断、模板与原文编辑
src-tauri/                 Tauri 桌面壳与 Rust 插件接入
docs/                      设计文档与优化方案
```

## 许可证

提交 PR 即表示你同意将该贡献以 [Apache-2.0 许可证](LICENSE) 授权。
