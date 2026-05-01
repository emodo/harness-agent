#!/usr/bin/env node
/**
 * Harness Agent CLI — Pluggable AI Tool Base
 *
 * L1: harness install/list/run/remove
 * L2: ctx.call() / ctx.use() cross-plugin calling
 * L3: harness pipeline <workflow.json> DAG orchestration
 */

import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  loadRegistry,
  addPlugin,
  removePlugin,
  findPlugin,
  getWorkspace,
  type RegistryEntry,
} from './registry.js';
import {
  activatePlugin,
  deactivatePlugin,
  getPluginCommands,
  executeCommand,
} from './engine.js';
import { runWorkflow } from './orchestrator.js';
import type { WorkflowDef } from './protocol.js';

const program = new Command();

program
  .name('harness')
  .description('Pluggable AI tool CLI — dynamically load npm plugins')
  .version('0.1.0');

// ---- install ----
program
  .command('install <package>')
  .description('Install a plugin (npm package or local path)')
  .action(async (pkg: string) => {
    const workspace = getWorkspace();
    const isLocalPath = pkg.startsWith('.') || pkg.startsWith('/') || pkg.startsWith('~');

    // Determine plugin name: for local paths use dir name, for npm use package name
    const pluginName = isLocalPath
      ? pkg.split('/').filter(Boolean).pop()!
      : pkg;

    const pluginDir = join(workspace, 'plugins', pluginName.replace('/', '_'));

    console.log(`Installing "${pkg}"...`);

    try {
      if (isLocalPath) {
        // Local plugin: resolve path and create a node_modules structure
        const absPath = join(process.cwd(), pkg);
        if (!existsSync(join(absPath, 'package.json'))) {
          console.error(`✗ No package.json found at ${absPath}`);
          process.exit(1);
        }

        // Create plugin dir under workspace
        const nodeModules = join(pluginDir, 'node_modules', pluginName);
        execSync(`mkdir -p "${nodeModules}" && cp -r "${absPath}/"* "${nodeModules}/"`, {
          stdio: 'pipe',
        });

        // Read package.json
        const pkgJson = JSON.parse(
          readFileSync(
            join(nodeModules, 'package.json'),
            'utf-8',
          ),
        );

        const entry: RegistryEntry = {
          name: pluginName,
          version: pkgJson.version,
          installPath: nodeModules,
          installedAt: new Date().toISOString(),
        };

        addPlugin(entry);
        console.log(`✓ Plugin "${pluginName}" v${pkgJson.version} installed.`);
        await activatePlugin(entry);
        console.log(`✓ Plugin "${pluginName}" activated.`);
      } else {
        // npm package: install into plugin workspace
        execSync(`npm install ${pkg} --prefix "${pluginDir}" --no-save`, {
          stdio: 'pipe',
          cwd: workspace,
        });

        const nodeModules = join(pluginDir, 'node_modules', pkg);
        if (!existsSync(nodeModules)) {
          // scoped packages have nested dirs, try to find it
          const scoped = join(pluginDir, 'node_modules', ...pkg.split('/'));
          if (existsSync(scoped)) {
            const pkgJson = JSON.parse(
              readFileSync(
                join(scoped, 'package.json'),
                'utf-8',
              ),
            );
            const entry: RegistryEntry = {
              name: pkg,
              version: pkgJson.version,
              installPath: scoped,
              installedAt: new Date().toISOString(),
            };
            addPlugin(entry);
            console.log(`✓ Plugin "${pkg}" v${pkgJson.version} installed.`);
            await activatePlugin(entry);
            console.log(`✓ Plugin "${pkg}" activated.`);
          } else {
            throw new Error(`Could not find installed package "${pkg}"`);
          }
        } else {
          const pkgJson = JSON.parse(
            readFileSync(
              join(nodeModules, 'package.json'),
              'utf-8',
            ),
          );
          const entry: RegistryEntry = {
            name: pkg,
            version: pkgJson.version,
            installPath: nodeModules,
            installedAt: new Date().toISOString(),
          };
          addPlugin(entry);
          console.log(`✓ Plugin "${pkg}" v${pkgJson.version} installed.`);
          await activatePlugin(entry);
          console.log(`✓ Plugin "${pkg}" activated.`);
        }
      }
    } catch (err: any) {
      console.error(`✗ Failed to install "${pkg}":`, err.message);
      process.exit(1);
    }
  });

// ---- list ----
program
  .command('list')
  .description('List installed plugins')
  .action(() => {
    const plugins = loadRegistry();
    if (plugins.length === 0) {
      console.log('No plugins installed.');
      console.log(`Run \`harness install <npm-package>\` to add one.`);
      return;
    }
    console.log(`Installed plugins (${plugins.length}):`);
    for (const p of plugins) {
      console.log(`  ${p.name} v${p.version}  —  ${p.installPath}`);
    }
  });

// ---- remove ----
program
  .command('remove <plugin>')
  .description('Remove a plugin')
  .action(async (name: string) => {
    const entry = findPlugin(name);
    if (!entry) {
      console.error(`Plugin "${name}" is not installed.`);
      process.exit(1);
    }

    console.log(`Removing "${name}"...`);
    await deactivatePlugin(entry);

    // Remove from registry
    removePlugin(name);

    // Clean up install directory
    const pluginDir = join(getWorkspace(), 'plugins', name.replace('/', '_'));
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true });
    }

    console.log(`✓ Plugin "${name}" removed.`);
  });

// ---- run ----
program
  .command('run <plugin> [command]')
  .description('Run a plugin command')
  .allowUnknownOption()
  .action(async (pluginName: string, commandName?: string) => {
    if (!commandName) {
      // Show available commands for this plugin
      const plugin = await getPluginCommands(pluginName);
      if (!plugin) process.exit(1);

      console.log(`${plugin.meta.name} v${plugin.meta.version}`);
      if (plugin.meta.description) {
        console.log(`  ${plugin.meta.description}`);
      }
      if (plugin.commands && plugin.commands.length > 0) {
        console.log('\nCommands:');
        for (const cmd of plugin.commands) {
          console.log(`  ${cmd.name}  —  ${cmd.description ?? '(no description)'}`);
        }
      } else {
        console.log('\n(no commands exposed)');
      }
      return;
    }

    // Parse extra arguments after the command name
    const extraArgs = process.argv.slice(
      process.argv.indexOf(commandName) + 1,
    );
    const args: Record<string, string> = {};
    for (let i = 0; i < extraArgs.length; i++) {
      if (extraArgs[i].startsWith('--')) {
        const key = extraArgs[i].replace(/^--/, '');
        const val = extraArgs[i + 1] && !extraArgs[i + 1].startsWith('--')
          ? extraArgs[++i]
          : 'true';
        args[key] = val;
      }
    }

    await executeCommand(pluginName, commandName, args, process.argv);
  });

// ---- pipeline (L3) ----
program
  .command('pipeline <workflowFile>')
  .description('Run a DAG workflow of plugin commands')
  .option('--no-fail-fast', 'Continue on error')
  .action(async (workflowFile: string, options: { failFast?: boolean }) => {
    const wfPath = resolve(workflowFile);
    if (!existsSync(wfPath)) {
      console.error(`✗ Workflow file not found: ${wfPath}`);
      process.exit(1);
    }

    let wf: WorkflowDef;
    try {
      wf = JSON.parse(readFileSync(wfPath, 'utf-8')) as WorkflowDef;
    } catch (err: any) {
      console.error(`✗ Failed to parse workflow JSON: ${err.message}`);
      process.exit(1);
    }

    if (!wf.name || !wf.steps || wf.steps.length === 0) {
      console.error('✗ Workflow must have a "name" and non-empty "steps" array');
      process.exit(1);
    }

    if (options.failFast === false) {
      wf.failFast = false;
    }

    const result = await runWorkflow(wf);

    if (!result.success) {
      process.exit(1);
    }
  });

program.parse();
