/**
 * Harness Plugin: orchestrator-demo
 *
 * Demonstrates L2 cross-plugin calling via ctx.call() and ctx.use().
 * This plugin has NO built-in logic — it chains to other plugins.
 */

/** @type {import('../../dist/protocol.js').HarnessPlugin} */
const plugin = {
  meta: {
    name: 'orchestrator-demo',
    version: '1.0.0',
    description: 'L2 demo: chains calls to hello-world and build-pipeline',
  },

  commands: [
    {
      name: 'chain-greet',
      description: 'Call hello-world:greet via ctx.call()',
      args: [{ name: 'name', default: 'world' }],
      handler: async (ctx) => {
        ctx.logger.info('Calling hello-world:greet via ctx.call()...');
        const result = await ctx.call('hello-world', 'greet', {
          name: ctx.args.name ?? 'world',
          style: 'excited',
        });
        ctx.logger.info(`Result: ${result.success ? 'OK' : 'FAIL'}`);
        if (result.data) console.log('Output:', result.data);
      },
    },
    {
      name: 'list-plugins',
      description: 'Show all installed plugins via ctx.plugins',
      handler: async (ctx) => {
        console.log(`Available plugins (${ctx.plugins.length}):`);
        for (const name of ctx.plugins) {
          // Use ctx.use() to load each plugin's meta
          const p = await ctx.use(name);
          if (p?.meta) {
            console.log(`  ${p.meta.name} v${p.meta.version} — ${p.meta.description ?? ''}`);
          } else {
            console.log(`  ${name} (failed to load)`);
          }
        }
      },
    },
    {
      name: 'full-check',
      description: 'Chain: lint → typecheck → test (sequential via ctx.call)',
      handler: async (ctx) => {
        ctx.logger.info('Starting full check via L2 chain...\n');

        const steps = [
          { plugin: 'build-pipeline', cmd: 'lint', label: 'Lint' },
          { plugin: 'build-pipeline', cmd: 'typecheck', label: 'TypeCheck' },
          { plugin: 'build-pipeline', cmd: 'test', label: 'Test' },
        ];

        let passed = 0;
        for (const step of steps) {
          const result = await ctx.call(step.plugin, step.cmd, {});
          const icon = result.success ? '✓' : '✗';
          console.log(`  ${icon} ${step.label}: ${result.success ? 'PASS' : result.error}`);
          if (result.success) passed++;
          if (!result.success) break; // stop on first failure
        }

        console.log(`\n${passed}/${steps.length} steps passed`);
      },
    },
  ],

  onActivate: async (ctx) => {
    ctx.logger.info('Orchestrator demo plugin ready');
  },
};

export default plugin;
