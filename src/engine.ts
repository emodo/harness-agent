/**
 * Plugin Engine — dynamic npm package loading.
 *
 * Core capability: dynamically import() any installed npm package
 * that conforms to the HarnessPlugin interface.
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  type HarnessPlugin,
  type PluginContext,
  type PluginLogger,
  isHarnessPlugin,
} from './protocol.js';
import {
  findPlugin,
  getWorkspace,
  type RegistryEntry,
} from './registry.js';

function createLogger(pluginName: string): PluginLogger {
  const prefix = `[${pluginName}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, '⚠', ...args),
    error: (...args) => console.error(prefix, '✗', ...args),
    debug: (...args) => {
      if (process.env.HARNESS_DEBUG) console.debug(prefix, ...args);
    },
  };
}

/**
 * Dynamically import a plugin from its install path.
 * Works with both ESM and CJS npm packages.
 */
async function importPlugin(
  entry: RegistryEntry,
): Promise<HarnessPlugin | null> {
  const pkgJsonPath = join(entry.installPath, 'package.json');

  if (!existsSync(pkgJsonPath)) {
    console.error(`Plugin "${entry.name}" not found at ${entry.installPath}`);
    return null;
  }

  try {
    // Read package.json to find the entry point
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    const entryPoint = pkgJson.main || pkgJson.exports?.['.'] || 'index.js';
    const resolvedPath = join(entry.installPath, entryPoint);

    // Dynamic import — the heart of the pluggable system
    const mod = await import(pathToFileURL(resolvedPath).href);

    // Support both default export and named export 'plugin'
    const candidate = mod.default ?? mod.plugin ?? mod;

    if (!isHarnessPlugin(candidate)) {
      console.error(
        `Plugin "${entry.name}" does not export a valid HarnessPlugin`,
      );
      return null;
    }

    // Basic version match check
    if (candidate.meta.version !== entry.version) {
      console.warn(
        `Version mismatch for "${entry.name}": ` +
          `registry=${entry.version}, module=${candidate.meta.version}`,
      );
    }

    return candidate;
  } catch (err) {
    console.error(`Failed to load plugin "${entry.name}":`, err);
    return null;
  }
}

/**
 * Load a plugin and run its onActivate hook.
 */
export async function activatePlugin(
  entry: RegistryEntry,
): Promise<HarnessPlugin | null> {
  const plugin = await importPlugin(entry);
  if (!plugin) return null;

  if (plugin.onActivate) {
    try {
      const ctx: PluginContext = {
        pluginDir: entry.installPath,
        workspace: getWorkspace(),
        logger: createLogger(plugin.meta.name),
      };
      await plugin.onActivate(ctx);
    } catch (err) {
      console.error(
        `Plugin "${entry.name}" onActivate failed:`,
        err,
      );
      return null;
    }
  }

  return plugin;
}

/**
 * Deactivate a plugin and run its onDeactivate hook.
 */
export async function deactivatePlugin(
  entry: RegistryEntry,
): Promise<boolean> {
  const plugin = await importPlugin(entry);
  if (plugin?.onDeactivate) {
    try {
      await plugin.onDeactivate();
    } catch (err) {
      console.error(
        `Plugin "${entry.name}" onDeactivate failed:`,
        err,
      );
    }
  }
  return true;
}

/**
 * Load a plugin and return its command definitions for CLI registration.
 */
export async function getPluginCommands(
  name: string,
): Promise<HarnessPlugin | null> {
  const entry = findPlugin(name);
  if (!entry) {
    console.error(`Plugin "${name}" is not installed.`);
    return null;
  }
  return importPlugin(entry);
}

/**
 * Execute a plugin command.
 */
export async function executeCommand(
  pluginName: string,
  commandName: string,
  args: Record<string, string>,
  rawArgs: string[],
): Promise<void> {
  const plugin = await getPluginCommands(pluginName);
  if (!plugin) return;

  if (!plugin.commands || plugin.commands.length === 0) {
    console.error(`Plugin "${pluginName}" has no commands.`);
    return;
  }

  const cmd = plugin.commands.find((c) => c.name === commandName);
  if (!cmd) {
    console.error(
      `Command "${commandName}" not found in plugin "${pluginName}". ` +
        `Available: ${plugin.commands.map((c) => c.name).join(', ')}`,
    );
    return;
  }

  try {
    const entry = findPlugin(pluginName)!;
    await cmd.handler({
      args,
      rawArgs,
      workspace: getWorkspace(),
      logger: createLogger(plugin.meta.name),
    });
  } catch (err) {
    console.error(`Command "${commandName}" failed:`, err);
    process.exit(1);
  }
}
