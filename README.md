# Harness Agent

> Pluggable AI tool CLI — dynamically import npm packages as plugins.

## Concept

Harness Agent is a **pluggable CLI base**. You write plugins as normal npm packages, install them with one command, and the CLI dynamically `import()`s them at runtime — no rebuild, no config, no boilerplate.

```
harness install <npm-package>     # Any npm package that exports a HarnessPlugin
harness list                       # See what's installed
harness run <plugin> [cmd] [args] # Execute plugin commands
harness remove <plugin>            # Clean removal with onDeactivate hook
```

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
