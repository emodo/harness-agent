/**
 * Harness Plugin: build-pipeline
 *
 * Simulates CI/CD steps for L3 DAG orchestration demo.
 * Each command does a small delay + prints result.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @type {import('../../dist/protocol.js').HarnessPlugin} */
const plugin = {
  meta: {
    name: 'build-pipeline',
    version: '1.0.0',
    description: 'Simulated CI/CD pipeline — lint, typecheck, test, build',
  },

  commands: [
    {
      name: 'lint',
      description: 'Run linter',
      handler: async (ctx) => {
        ctx.logger.info('Running ESLint...');
        await sleep(300);
        const files = parseInt(ctx.args.files ?? '12');
        ctx.logger.info(`Checked ${files} files — 0 errors, 0 warnings`);
        console.log('LINT PASS ✓');
      },
    },
    {
      name: 'typecheck',
      description: 'Run TypeScript type checker',
      handler: async (ctx) => {
        ctx.logger.info('Running tsc --noEmit...');
        await sleep(500);
        console.log('TYPECHECK PASS ✓ (427 files, 0 errors)');
      },
    },
    {
      name: 'test',
      description: 'Run unit tests',
      args: [{ name: 'suite', description: 'Test suite to run', default: 'all' }],
      handler: async (ctx) => {
        const suite = ctx.args.suite ?? 'all';
        ctx.logger.info(`Running tests: ${suite}`);
        await sleep(400);
        console.log(`TEST PASS ✓ (suite: ${suite}, 38/38 passed, 1.2s)`);
      },
    },
    {
      name: 'build',
      description: 'Build production bundle',
      handler: async (ctx) => {
        ctx.logger.info('Building with esbuild...');
        await sleep(600);
        console.log('BUILD SUCCESS ✓ (dist/index.js, 42KB gzipped)');
      },
    },
    {
      name: 'deploy',
      description: 'Deploy to production',
      handler: async (ctx) => {
        ctx.logger.info('Deploying...');
        await sleep(200);
        const env = ctx.args.env ?? 'staging';
        console.log(`DEPLOY SUCCESS ✓ → ${env}`);
      },
    },
  ],

  onActivate: async (ctx) => {
    ctx.logger.info('Build pipeline plugin ready');
    ctx.logger.info(`Installed plugins: ${ctx.plugins.join(', ')}`);
  },
};

export default plugin;
