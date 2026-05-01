/**
 * Harness Plugin: hello-world
 *
 * Demonstrates the pluggable plugin protocol.
 * Any npm package with this structure works.
 */

/** @type {import('../../dist/protocol.js').HarnessPlugin} */
const plugin = {
  meta: {
    name: 'hello-world',
    version: '1.0.0',
    description: 'A friendly example plugin for Harness Agent',
  },

  commands: [
    {
      name: 'greet',
      description: 'Print a greeting',
      args: [
        {
          name: 'name',
          description: 'Who to greet',
          default: 'world',
        },
        {
          name: 'style',
          description: 'Greeting style: casual, formal, excited',
          default: 'casual',
        },
      ],
      handler: async (ctx) => {
        const name = ctx.args.name ?? 'world';
        const style = ctx.args.style ?? 'casual';

        const greetings = {
          casual: `Hey ${name}! 👋`,
          formal: `Greetings, ${name}.`,
          excited: `HELLO ${name.toUpperCase()}!!! 🎉🔥🚀`,
        };

        const msg = greetings[style] ?? greetings.casual;
        console.log(msg);

        ctx.logger.info(`Greeted "${name}" in ${style} style`);
      },
    },
    {
      name: 'time',
      description: 'Show current time',
      handler: async (ctx) => {
        const now = new Date();
        console.log(`Current time: ${now.toISOString()}`);
        console.log(`Locale: ${now.toLocaleString('zh-CN')}`);
        ctx.logger.debug('Time command executed');
      },
    },
  ],

  onActivate: async (ctx) => {
    ctx.logger.info('Hello World plugin activated! 🌍');
    ctx.logger.info(`Workspace: ${ctx.workspace}`);
  },

  onDeactivate: async () => {
    console.log('Goodbye from hello-world plugin! 👋');
  },
};

export default plugin;
