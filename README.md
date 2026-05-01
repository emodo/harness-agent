# Harness Agent

> **AI 时代的 CLI 入口** — 任何 AI 生成的 CLI 工具、SKILL、MCP 服务器，装包即用，动态编排。

---

## 解决的核心问题

AI 现在可以在几秒内生成一个完整的 CLI 工具、一个 Skill 模块、或一个 MCP 服务器。但 **生成 ≠ 可用**。你仍然要手动 npm link、改配置、写胶水代码把它们串起来。工具越多，集成越痛。

**Harness Agent 把这个循环压到一步**：

```
AI 生成 npm 包 → harness install <pkg> → 即刻可用
```

不需要重启、不需要编译、不需要配置文件。任何符合 `HarnessPlugin` 协议的 npm 包，`import()` 进来就是一个可执行的能力单元。

三种形态，一个协议：

| 形态 | 例子 | 做什么 |
|------|------|--------|
| **CLI Tool** | `harness-plugin-code-review` | `harness run code-review ./src` |
| **SKILL** | `harness-skill-pdf-parser` | 被其他插件调用：`ctx.use('pdf-parser')` |
| **MCP Server** | `harness-mcp-figma` | 暴露 MCP 工具给 AI Agent 调用 |

---

## 核心逻辑流

Harness Agent 不是简单的命令分发器。它是一个 **可组合的能力运行时**，支持长链推理和插件间协作：

```
用户命令
  │
  ▼
┌─────────────────────────────────────────┐
│              Harness CLI                │
│  harness run code-review ./src          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│           Plugin Engine                 │
│                                          │
│  1. 解析 npm 包 → 找到入口 (MCP/SKILL/CLI) │
│  2. 动态 import() → 注入运行时上下文       │
│  3. 暴露 ctx.call() 实现跨插件调用         │
│  4. 生命周期管理：activate ↔ deactivate    │
└──────────────┬──────────────────────────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
  ┌──────┐ ┌──────┐ ┌──────┐
  │Plugin│ │Plugin│ │Plugin│  ← 每个插件是一个 npm 包
  │  A   │ │  B   │ │  C   │     动态 import()，无编译
  └──┬───┘ └──┬───┘ └──┬───┘
     │        │        │
     └────────┼────────┘
              │
              ▼
     ┌────────────────┐
     │  链式编排        │
     │  A.call('B')     │  ← 长链推理
     │  B.call('C')     │     多 Agent 协作
     │  C 返回结果给 A   │
     └────────────────┘
```

**三层能力递进**：

| 层级 | 能力 | 实现方式 |
|------|------|---------|
| **L1 单插件** | 独立 CLI 命令 | `harness run <plugin> <cmd>` |
| **L2 插件间调用** | Skill 被其他 Skill 复用 | `ctx.call('other-plugin', { ... })` |
| **L3 编排引擎** | 有向无环图推理链 | Orchestrator 插件 → 调度多个子插件 |

一个典型的 L3 编排场景：

```
harness run orchestrator review-and-deploy
  │
  ├─► code-review (L1)     → 审查代码
  ├─► type-check (L1)      → 类型检查
  ├─► test-runner (L1)     → 跑测试
  └─► deploy (L1)          → 如果上面全绿：部署
       └─► notify (L2)     → 通知飞书/微信
```

---

## 为什么是 CLI

- **终端是 AI Agent 的原生环境** — 没有 GUI 的摩擦
- **管道即编排** — `harness run a | harness run b` 就是工作流
- **npm 是最大的能力市场** — 2M+ 包，发布即分发
- **AI 生成的代码天然是文本** — 不需要额外封装

---

## Quick Start

```bash
git clone https://github.com/emodo/harness-agent.git
cd harness-agent
npm install && npm run build
npm link   # makes `harness` available globally

# Try the example plugin
harness install ./plugins/hello-world
harness list
harness run hello-world greet --name 庙爷 --style excited
```

## Plugin Protocol

A harness plugin is any npm package that exports a `HarnessPlugin` object:

```js
export default {
  meta: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'What it does',
  },
  commands: [
    {
      name: 'do-something',
      description: 'Does the thing',
      handler: async (ctx) => {
        console.log(`Hello, ${ctx.args.name}!`);
      },
    },
  ],
  onActivate: async (ctx) => {
    ctx.logger.info('Plugin ready!');
  },
  onDeactivate: async () => {
    console.log('Goodbye!');
  },
};
```

That's it. No harness-specific dependencies required.

## Architecture

```
harness-agent/
├── bin/harness.js        ← CLI entry shim
├── src/
│   ├── cli.ts            ← Commander CLI (install/list/run/remove)
│   ├── engine.ts         ← Plugin loader — dynamic import() + lifecycle
│   ├── protocol.ts       ← HarnessPlugin interface definition
│   └── registry.ts       ← JSON-based plugin registry (~/.harness/)
├── plugins/
│   └── hello-world/      ← Example plugin (npm package structure)
├── package.json
└── tsconfig.json
```

### How dynamic import works

1. `harness install <pkg>` installs the package into `~/.harness/plugins/<name>/node_modules/`
2. At runtime, `engine.ts` reads the plugin's `package.json` → resolves entry point → `import(pathToFileURL(resolvedPath))`
3. Validates the export against the `HarnessPlugin` interface
4. Registers commands and runs `onActivate`

Zero build step for plugins. Just `npm pack` and `npm publish`.

## Requirements

- Node.js >= 18
- npm >= 8

## License

MIT
