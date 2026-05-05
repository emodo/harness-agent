# Harness Agent — 企业级 CLI 基座设计文档

> **定位：** 面向大前端团队的企业级 CLI 能力基座。将公司内部所有底层系统（发布/监控/配置/工单/日志/权限）统一抽象为可编排的 CLI 插件，通过 Pipeline 引擎串联为自动化工作流，并以 AI 原生能力实现自然语言驱动的运维操作。

> **开源项目：** [harness-agent](https://github.com/emodo/harness-agent) — 实验性质的插件协议验证  
> **企业内部实现：** 本文档描述的是基于开源验证经验之上的企业级实现方案

---

## 一、项目定位

### 1.1 解决的核心问题

公司通常有几十个内部平台：发布系统、监控告警、配置中心、工单系统、日志平台、权限系统……每个平台有自己的 UI、API、CLI。团队在日常工作中需要在多个系统间反复切换，操作链路长、容易出错、无法自动化串联。

**Harness Agent 的思路：**

```
每个内部系统 → 一个 Harness Plugin (npm 包)
Harness CLI → 统一入口 → 安装/运行/编排所有插件
Pipeline → DAG 工作流 → 多系统自动化联动
AI → 自然语言 → 自动拆解步骤 → 执行 Pipeline
```

### 1.2 与大前端的结合点

作为前端团队主导的基础设施项目，Harness Agent 不仅服务后端运维，更是大前端工程化的延伸：

| 前端场景 | 能力 |
|---------|------|
| CI/CD 管线 | 前端构建 → 性能审计 → 视觉回归 → 发布的一键 Pipeline |
| 微前端治理 | 子应用版本管理、灰度发布、依赖检测 |
| 组件库管理 | 组件发布、文档生成、跨项目同步 |
| AI 赋能 | Design→Code、AI Code Review、自然语言操作基础设施 |
| 多端构建 | Web/H5/小程序/RN 统一编排 |

---

## 二、核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer / AI Agent                       │
│              CLI · Natural Language · MCP Client              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    ⚡ CLI Base · Harness Core                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │CLI Entry │ │  Plugin  │ │ Registry │ │ Orchestrator │   │
│  │Commander │ │ Engine   │ │  ~/.hrn  │ │ DAG TopoSort │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ Secrets  │ │ Sandbox  │                                  │
│  │ Manager  │ │ + Audit  │                                  │
│  └──────────┘ └──────────┘                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HarnessPlugin Protocol
┌──────────────────────────▼──────────────────────────────────┐
│                    📦 Plugin Ecosystem                        │
│  @team/deploy  @team/monitor  @team/config  @team/ticket    │
│  @team/log     @team/acl      @team/im       ...             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               🏭 Enterprise Systems                           │
│  Jenkins  Prometheus  Apollo  ELK  Jira  LDAP  ...          │
└─────────────────────────────────────────────────────────────┘
```

完整架构图见 [architecture.html](./architecture.html)。

### 2.1 层次说明

| 层次 | 职责 | 关键模块 |
|------|------|---------|
| **用户层** | 开发者通过 CLI / AI / MCP Client 交互 | CLI commands, NL parser |
| **CLI 基座** | 插件加载、注册管理、Pipeline 编排、安全管控 | engine, registry, orchestrator, secrets, sandbox |
| **协议层** | 标准化插件接口，任何 npm 包实现协议即可接入 | HarnessPlugin interface |
| **业务插件层** | 对接各个内部系统的适配器，一个系统一个 npm 包 | deploy, monitor, config, ticket, log, acl, im |
| **基础设施层** | 公司现有的底层系统 | Jenkins, Prometheus, Apollo, ELK, Jira, LDAP |

---

## 三、功能路线图

### 3.1 优先级定义

| 级别 | 含义 | 时间窗口 |
|------|------|---------|
| **P0** | 基座核心，缺了就不是 Harness Agent | 第 1-2 周 |
| **P1** | 企业可用性的最低门槛 | 第 3-6 周 |
| **P2** | 生态竞争力，团队协作 | 第 7-12 周 |
| **P3** | 大前端差异化 & AI 原生 | 第 13-20 周 |

---

### P0 — 基座核心（第 1-2 周）

#### P0-1 CLI 脚手架 `harness init`

```bash
harness init my-project     # 生成项目骨架
harness init --template ci # 选择模板
```

生成标准目录结构：`src/`、`plugins/`、`workflows/`、`harness.config.ts`。

#### P0-2 插件协议 `HarnessPlugin`

```typescript
interface HarnessPlugin {
  meta: { name: string; version: string; description?: string };
  commands: CommandDef[];
  onActivate?: (ctx: PluginContext) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

interface CommandDef {
  name: string;
  description?: string;
  args?: ArgumentDef[];
  handler: (ctx: CommandContext) => Promise<void>;
}
```

任何 npm 包 export 这个接口即可作为 Harness 插件。

#### P0-3 插件安装与管理

```bash
harness install <npm-package>    # npm 包安装
harness install ./plugins/my     # 本地路径安装
harness list                     # 列出已安装
harness remove <name>            # 卸载
harness run <plugin> <command>   # 执行命令
```

#### P0-4 Pipeline 编排引擎

```yaml
# workflows/ci.yaml
name: CI Pipeline
steps:
  - id: lint
    plugin: build-pipeline
    command: lint
  - id: test
    plugin: build-pipeline
    command: test
    dependsOn: [lint]
  - id: build
    plugin: build-pipeline
    command: build
    dependsOn: [test]
```

- DAG 拓扑排序（Kahn's algorithm）
- 同级步骤并行执行
- fail-fast / continue-on-error 模式
- 执行计时和结果汇总

#### P0-5 插件脚手架 `harness create`

```bash
harness create my-plugin         # 生成标准插件模板
harness create --ai "对接飞书审批" # AI 理解需求 → 生成代码
```

模板包含：`package.json`、`tsconfig.json`、`src/index.ts`（HarnessPlugin 骨架）、`README.md`。

---

### P1 — 企业可用（第 3-6 周）

#### P1-1 企业级插件协议增强

```typescript
interface CommandDef {
  name: string;
  description?: string;
  args?: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'json';
    required?: boolean;
    default?: unknown;
    validate?: (v: unknown) => boolean | string;  // 自定义校验
  }[];
  handler: (ctx: CommandContext) => Promise<void>;
  
  // 企业增强
  auth?: { provider: string; scopes: string[] };  // 认证中间件
  audit?: boolean;                                  // 审计日志
  retry?: { maxAttempts: number; backoff: number }; // 自动重试
  timeout?: number;                                 // 超时控制
}
```

#### P1-2 密钥管理 `ctx.secrets`

```bash
harness config set JENKINS_TOKEN xxx
harness config set --scope team-frontend GRAFANA_KEY yyy
```

```typescript
// 插件内使用
const token = ctx.secrets.get('JENKINS_TOKEN');
```

支持：全局密钥、团队范围密钥、环境变量注入、`.env` 文件加载。

#### P1-3 Pipeline 实时流式输出

```
── Level 1/4 (lint) ──
  ▶ lint → build-pipeline:lint
  ✓ lint (342ms)  ── 0 errors, 12 warnings

── Level 2/4 (typecheck, test) ──
  ▶ typecheck → build-pipeline:typecheck
  [typecheck] Checking 145 files...
  ▶ test → build-pipeline:test
  [test] ✓ suite/unit (45/45 passed)
  [test] ✓ suite/integration (12/12 passed)
  ✓ test (1.2s)
  ✓ typecheck (2.1s)  ── No errors
```

每个 step 的 stdout/stderr 实时透出，不再等全部跑完才显示。

#### P1-4 参数校验系统

```typescript
args: [
  { name: 'env', type: 'string', required: true, 
    validate: (v) => ['dev','staging','prod'].includes(v as string) || 'env must be dev/staging/prod' },
  { name: 'version', type: 'string', required: true,
    validate: (v) => /^\d+\.\d+\.\d+$/.test(v as string) || 'Invalid semver' },
]
```

非法参数在 handler 执行前直接拒绝，带清晰错误信息。

#### P1-5 沙箱模式

```bash
harness run --sandbox my-plugin    # 沙箱执行
```

可选权限控制：文件系统读写路径白名单、网络域名白名单、环境变量访问、子进程执行。

#### P1-6 YAML 工作流支持

```bash
harness pipeline workflows/ci.yaml   # YAML 格式
harness pipeline workflows/ci.json   # JSON 格式（兼容）
```

#### P1-7 插件更新机制

```bash
harness update [name]         # 升级指定插件
harness list --outdated        # 检查过期插件
harness update --all           # 全部升级
```

---

### P2 — 生态竞争力（第 7-12 周）

#### P2-1 MCP Server `harness serve`

```bash
harness serve                  # 启动 MCP Server
harness serve --port 9898      # 指定端口
harness serve --tools deploy,monitor  # 只暴露部分插件
```

所有已安装插件的 `commands` 自动暴露为 MCP tools。Claude Desktop / Cursor / Windsurf 等 AI 工具可直接调用企业内部系统。

```json
// MCP tool 映射
{
  "name": "deploy_release",
  "description": "发布系统: 执行正式发布",
  "inputSchema": {
    "type": "object",
    "properties": {
      "env": { "type": "string", "enum": ["dev", "staging", "prod"] },
      "version": { "type": "string" }
    }
  }
}
```

#### P2-2 OpenAPI / REST 暴露

```bash
harness serve --http           # 同时启动 HTTP API
```

```
POST /api/plugins/deploy/release   → harness run deploy release
POST /api/pipeline/run             → harness pipeline ...
GET  /api/plugins                   → harness list
```

每个 Plugins 的 commands 自动生成 RESTful 端点。

#### P2-3 插件市场 `harness search`

```bash
harness search "监控"           # 搜索内部 Registry
harness info @team/monitor       # 查看详情
harness publish                  # 发布到内部 Registry
```

对接公司私有 npm Registry（Verdaccio / Nexus / Artifactory）。

#### P2-4 私有 Registry 支持

```bash
harness registry add https://npm.company.com
harness registry use company
harness registry list
```

多 Registry 管理，按 scope 自动路由。

#### P2-5 审计日志

```
[2026-05-05 10:30:00] user=emodo plugin=deploy command=release args={env:prod} result=success duration=12.3s
[2026-05-05 10:30:00] user=emodo pipeline=emergency-rollback steps=5 result=failed
```

全链路调用记录，支持导出为 JSON/CSV。

#### P2-6 健康检查 `harness doctor`

```bash
harness doctor                  # 诊断所有插件连通性
harness doctor --plugin deploy  # 诊断指定插件
```

```
✓ deploy     (0.8s)   Connected to Jenkins https://jenkins.company.com
✓ monitor    (0.3s)   Connected to Prometheus https://prom.company.com
✗ config     (5.0s)   Timeout: Apollo config service unreachable
⚠ ticket     (0.1s)   Auth token expiring in 3 days
```

#### P2-7 多团队 Profile

```bash
harness profile create team-frontend
harness profile use team-frontend
harness profile list
```

每个 Profile 独立的插件集、密钥、配置。不同团队互不干扰。

#### P2-8 命令审批流程

```yaml
# 高危命令需审批
commands:
  - name: release
    approval: { required: true, approvers: ["tech-lead"], timeout: "30m" }
```

执行高危操作时自动发起审批（对接飞书/钉钉审批），通过后才执行。

#### P2-9 插件命名空间隔离

```bash
harness install @team-a/deploy
harness install @team-b/deploy
# 两个 deploy 互不冲突，通过 scope 区分
harness run @team-a/deploy release
harness run @team-b/deploy release
```

---

### P3 — 大前端差异化 & AI 原生（第 13-20 周）

#### P3-1 AI 自然语言编排 `harness ask`

```bash
harness ask "把 gateway 服务灰度发布到 10% 流量"
```

AI 理解意图 → 拆解步骤 → 匹配现有插件 → 生成 Pipeline → 执行。

```
🤖 分析中...
  → 识别意图: 灰度发布
  → 匹配插件: @team/deploy
  → 生成 Pipeline:
     1. health-check (确认服务正常)
     2. canary-deploy --service gateway --percentage 10 (灰度发布)
     3. monitor-observe --duration 5m (观察 5 分钟)
     4. notify --channel #ops (通知运维群)
  → 执行此 Pipeline? [Y/n]
```

#### P3-2 AI 生成插件 `harness create --ai`

```bash
harness create --ai "写一个对接飞书审批系统的插件，支持创建审批、查询审批状态、撤销审批"
```

AI 自动生成完整的 Harness Plugin 代码，包括 API 对接、参数校验、错误处理。

#### P3-3 Design → Code 插件

```bash
harness run design-to-code generate --figma-url "https://..." --output ./src/components
```

Figma 设计稿 → React/Vue 组件代码，集成到 CI Pipeline：

```yaml
steps:
  - id: design-check
    plugin: design-to-code
    command: diff
    args: { figma: "...", code: "./src" }
    # 检查设计稿和代码是否一致
```

#### P3-4 前端性能审计插件

```bash
harness run perf audit --url https://app.company.com
harness run perf budget --path ./dist --limit 200kb
```

集成 Lighthouse CI、Webpack Bundle Analyzer，作为 CI 门禁：

```yaml
steps:
  - id: build
    plugin: build-pipeline
    command: build
  - id: perf-check
    plugin: perf-audit
    command: budget
    args: { path: "./dist", js: "200kb", css: "50kb" }
    dependsOn: [build]
```

#### P3-5 视觉回归测试插件

```bash
harness run visual-diff compare --base ./screenshots/main --head ./screenshots/feature
```

集成 Pixelmatch / Playwright，自动检测 UI 变更：

```yaml
steps:
  - id: screenshot
    plugin: visual-diff
    command: capture
    args: { url: "https://app.company.com" }
  - id: compare
    plugin: visual-diff
    command: compare
    args: { threshold: "0.5%" }
    dependsOn: [screenshot]
```

#### P3-6 AI Code Review 插件

```bash
harness run ai-review check --pr 42
harness run ai-review check --staged
```

AI 自动审查代码：安全漏洞、性能问题、最佳实践、代码风格。

#### P3-7 微前端治理插件

```bash
harness run mfe status                    # 微前端全局状态
harness run mfe deploy --app checkout --version 2.1.0  # 子应用灰度
harness run mfe deps --check              # 依赖版本冲突检测
```

#### P3-8 多端构建编排

```yaml
# workflows/build-all.yaml
name: 全平台构建
steps:
  - id: web
    plugin: build-pipeline
    command: build
    args: { target: "web" }
  - id: h5
    plugin: build-pipeline
    command: build
    args: { target: "h5" }
  - id: miniapp
    plugin: build-pipeline
    command: build
    args: { target: "wechat" }
  # 三个平台并行构建
  - id: notify
    plugin: im
    command: send
    dependsOn: [web, h5, miniapp]
```

#### P3-9 Self-Healing Pipeline

Pipeline step 失败后，AI 自动分析错误日志 → 建议修复方案 → 自动重试。

```
✗ deploy (12.3s)
  Error: Connection refused to Jenkins https://jenkins.company.com
  
🤖 Self-Healing 分析中...
  → 检测到 Jenkins 连接失败
  → 尝试: 检查 VPN 状态 → VPN 已断开
  → 建议: 连接 VPN 后重试，或使用备用地址 jenkins-backup.company.com
  → 自动重试 with jenkins-backup? [Y/n]
```

---

## 四、大前端竞争优势

作为前端团队主导的项目，Harness Agent 相比纯后端基础设施项目，具备以下差异化优势：

### 4.1 前端全链路覆盖

| 阶段 | 能力 | 对应插件 |
|------|------|---------|
| 设计 | Figma → Code、设计稿 diff | `design-to-code` |
| 开发 | AI Code Review、组件生成 | `ai-review` |
| 构建 | 多端并行构建、依赖分析 | `build-pipeline` |
| 测试 | 视觉回归、E2E、性能审计 | `visual-diff`, `perf-audit` |
| 发布 | 灰度发布、CDN 刷新、版本管理 | `deploy` |
| 监控 | 前端异常监控、性能 SLA | `monitor` |
| 治理 | 微前端管理、组件库同步 | `mfe` |

### 4.2 相对于后端 CLI 工具的优势

| 维度 | 后端 CLI | Harness Agent (前端视角) |
|------|---------|-------------------------|
| 用户界面 | 纯终端 | 可接 Web UI、ChatOps、MCP |
| 工作流 | 单系统操作 | 跨系统 DAG 编排 |
| AI 集成 | 手动调用 | MCP Server 自动暴露、自然语言驱动 |
| 可视化 | 无 | Pipeline 拓扑图、执行甘特图 |
| 安全 | 依赖 OS 权限 | 插件级沙箱 + 审计 |
| 可观测性 | 依赖外部 | 内建 metrics、tracing |

### 4.3 前端专属场景

```
设计师改稿 → CI 自动检测 UI 差异 → 通知前端
     ↓
harness pipeline design-review.yaml
     ↓
  visual-diff → perf-check → build → notify
```

从设计到上线的全自动化管线，这是纯后端 CLI 无法提供的。

---

## 五、技术方案

### 5.1 技术选型

| 模块 | 技术 | 理由 |
|------|------|------|
| CLI 框架 | Commander.js | 生态最大，插件丰富 |
| 语言 | TypeScript | 类型安全，IDE 友好 |
| 运行时 | Node.js ≥ 18 | 前端团队统一技术栈 |
| 插件加载 | `dynamic import()` | 原生 ESM，零依赖 |
| 工作流格式 | YAML (js-yaml) | 可读性优于 JSON |
| 注册表 | JSON 文件 | 简单可靠，无需数据库 |
| MCP 协议 | `@modelcontextprotocol/sdk` | 官方 SDK |
| 测试 | Vitest | 快速，TypeScript 原生 |
| 构建 | tsc / tsup | 轻量 |

### 5.2 目录结构

```
harness-agent/
├── bin/
│   └── harness.js              # CLI 入口 shim
├── src/
│   ├── cli/
│   │   ├── index.ts            # Commander 主入口
│   │   ├── install.ts          # install 命令
│   │   ├── run.ts              # run 命令
│   │   ├── create.ts           # create 脚手架
│   │   ├── pipeline.ts         # pipeline 命令
│   │   ├── config.ts           # config/secret 管理
│   │   ├── serve.ts            # MCP + HTTP Server
│   │   └── search.ts           # 插件搜索
│   ├── core/
│   │   ├── engine.ts           # 插件动态加载引擎
│   │   ├── registry.ts         # 插件注册表
│   │   ├── orchestrator.ts     # DAG Pipeline 编排
│   │   ├── sandbox.ts          # 沙箱执行
│   │   └── audit.ts            # 审计日志
│   ├── protocol/
│   │   ├── plugin.ts           # HarnessPlugin 类型定义
│   │   ├── context.ts          # PluginContext / CommandContext
│   │   └── workflow.ts         # WorkflowDef / WorkflowResult
│   ├── security/
│   │   ├── secrets.ts          # 密钥管理
│   │   └── auth.ts             # 认证中间件
│   ├── ai/
│   │   ├── nl-executor.ts      # 自然语言 → Pipeline
│   │   └── code-gen.ts         # AI 生成插件代码
│   └── server/
│       ├── mcp.ts              # MCP Server
│       └── http.ts             # REST API
├── plugins/                    # 内置/示例插件
├── workflows/                  # 工作流定义
├── templates/                  # 项目/插件模板
├── docs/
│   ├── DESIGN.md               # 本文档
│   └── architecture.html       # 架构图
├── package.json
└── tsconfig.json
```

### 5.3 插件通信模型

```
┌──────────────────────────────────────────────────────┐
│                   CLI Base                            │
│                                                       │
│  ┌─────────┐   ctx.call()    ┌─────────┐            │
│  │ Plugin A │ ──────────────→│ Plugin B │            │
│  │  deploy  │                │ monitor  │            │
│  └─────────┘                └─────────┘            │
│       │                          │                   │
│       │  ctx.use()               │  ctx.secrets      │
│       ▼                          ▼                   │
│  ┌─────────┐   Pipeline  ┌─────────────┐           │
│  │ Plugin C │  ─────────→ │ Orchestrator │           │
│  │  config  │              │ DAG Engine   │           │
│  └─────────┘              └─────────────┘           │
│                                                       │
│  ┌──────────────────────────────────────────┐       │
│  │         MCP Server / REST API              │       │
│  │   (所有 commands 自动暴露)                  │       │
│  └──────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────┘
```

---

## 六、实施计划

### Phase 1: P0 基座（Week 1-2）

| 任务 | 产出 |
|------|------|
| CLI 脚手架 `harness init` | 项目模板 |
| 插件协议 v2 定义 | TypeScript 类型 |
| 插件引擎 + Registry | 核心模块 |
| Pipeline 编排引擎 | DAG + 并行执行 |
| 插件脚手架 `harness create` | 插件模板 |

### Phase 2: P1 企业可用（Week 3-6）

| 任务 | 产出 |
|------|------|
| 企业协议增强 | auth/audit/retry/timeout |
| 密钥管理 | ctx.secrets + config 命令 |
| Pipeline 流式输出 | 实时日志 |
| 参数校验系统 | JSON Schema 校验 |
| 沙箱模式 | 权限隔离 |
| YAML 工作流 | YAML 解析 |
| 插件更新 | update + outdated |

### Phase 3: P2 生态（Week 7-12）

| 任务 | 产出 |
|------|------|
| MCP Server | harness serve |
| REST API | HTTP 端点 |
| 插件市场 | search/info/publish |
| 私有 Registry | 多 Registry 管理 |
| 审计日志 | 全链路记录 |
| 健康检查 | harness doctor |
| 多团队 Profile | profile 命令 |
| 命令审批 | 审批流程 |
| 命名空间隔离 | scope 支持 |

### Phase 4: P3 大前端 + AI（Week 13-20）

| 任务 | 产出 |
|------|------|
| AI 自然语言编排 | harness ask |
| AI 生成插件 | harness create --ai |
| Design→Code 插件 | Figma 集成 |
| 性能审计插件 | Lighthouse CI |
| 视觉回归插件 | Pixelmatch |
| AI Code Review | 自动审查 |
| 微前端治理 | MFE 管理 |
| 多端构建编排 | 并行构建 |
| Self-Healing | AI 自动修复 |

---

## 七、成功指标

| 指标 | 目标 |
|------|------|
| 插件安装到可用 | ≤ 30 秒 |
| Pipeline 编排错误率 | < 1% |
| 插件开发到发布 | ≤ 1 小时（含 AI 辅助） |
| 内部系统接入覆盖率 | 100%（6 个月） |
| 团队日常操作 CLI 化率 | ≥ 80% |
| MCP Server 响应延迟 | ≤ 200ms |

---

## 八、附录

### A. 与开源版 harness-agent 的关系

开源版 `harness-agent` 是协议验证项目，用于：
- 验证 HarnessPlugin 协议的可行性
- 收集社区反馈
- 作为企业内部版的参考实现

企业内部版在此基础上增加：
- 企业级安全（审计、沙箱、审批）
- 内部系统连接器
- 私有 Registry
- AI 原生能力
- 大前端专属插件

### B. 参考资料

- [Commander.js](https://github.com/tj/commander.js)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Architecture Diagram](./architecture.html)
