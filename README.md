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

Harness Agent 不是简单的命令分发器。它是一个 **可组合的能力运行时**，三层递进：

| 层级 | 能力 | 状态 |
|------|------|------|
| **L1 单插件** | `harness run <plugin> <cmd>` — 独立 CLI 命令 | ✅ |
| **L2 插件间调用** | `ctx.call()` / `ctx.use()` / `ctx.plugins` — 插件互相调用 | ✅ |
| **L3 编排引擎** | `harness pipeline <workflow.json>` — DAG 拓扑排序 + 并行执行 | ✅ |

### L2 示例：插件间调用

```js
// plugin A 的命令中调用 plugin B
handler: async (ctx) => {
  // 调用另一个插件的命令
  const result = await ctx.call('build-pipeline', 'lint', { files: '42' });
  console.log(result.success); // true

  // 直接导入另一个插件的模块
  const other = await ctx.use('hello-world');
  console.log(other.meta.description);

  // 发现所有已安装的插件
  console.log(ctx.plugins); // ['hello-world', 'build-pipeline', ...]
}
```

### L3 示例：DAG 工作流

```json
{
  "name": "CI Pipeline",
  "steps": [
    { "id": "lint",      "plugin": "build-pipeline", "command": "lint" },
    { "id": "typecheck", "plugin": "build-pipeline", "command": "typecheck", "dependsOn": ["lint"] },
    { "id": "test",      "plugin": "build-pipeline", "command": "test",      "dependsOn": ["lint"] },
    { "id": "build",     "plugin": "build-pipeline", "command": "build",     "dependsOn": ["typecheck", "test"] },
    { "id": "deploy",    "plugin": "build-pipeline", "command": "deploy",    "dependsOn": ["build"] }
  ]
}
```

```bash
harness pipeline workflows/ci.json
```

执行时自动拓扑排序，同级步骤并行执行：

```
── Level 1 ──        lint                  (串行)
── Level 2 ──        typecheck ∥ test      (并行！)
── Level 3 ──        build                 (串行)
── Level 4 ──        deploy                (串行)
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
│   ├── cli.ts            ← Commander CLI (install/list/run/remove/pipeline)
│   ├── engine.ts         ← Plugin loader — dynamic import() + L2 ctx.call/use
│   ├── protocol.ts       ← HarnessPlugin, WorkflowDef types
│   ├── registry.ts       ← JSON-based plugin registry (~/.harness/)
│   └── orchestrator.ts   ← L3 DAG engine — topological sort + parallel exec
├── plugins/
│   ├── hello-world/      ← Example plugin (L1)
│   ├── build-pipeline/   ← CI simulator plugin (L2/L3)
│   └── pipe-demo/        ← Cross-plugin calling demo (L2)
├── workflows/
│   └── ci.json           ← L3 DAG workflow example
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
