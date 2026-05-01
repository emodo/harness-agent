/**
 * Plugin Engine — dynamic npm package loading + L2 cross-plugin calling.
 *
 * L1: Dynamic import() any npm package that conforms to HarnessPlugin
 * L2: ctx.call() / ctx.use() for cross-plugin collaboration
 */

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  type HarnessPlugin,
  type PluginContext,
  type PluginLogger,
  type CommandContext,
  type CallResult,
  isHarnessPlugin,
} from './protocol.js';
import {
  findPlugin,
  getWorkspace,
  loadRegistry,
  type RegistryEntry,
} from './registry.js';

// ── Logger factory ──

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

// ── Plugin import cache ──
const pluginCache = new Map<string, HarnessPlugin>();

function getPluginNames(): string[] {
  return loadRegistry().map((e) => e.name);
}

// ── Dynamic import ──

async function importPlugin(
  entry: RegistryEntry,
): Promise<HarnessPlugin | null> {
  // Check cache first
  if (pluginCache.has(entry.name)) {
    return pluginCache.get(entry.name)!;
  }

  const pkgJsonPath = join(entry.installPath, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.error(`Plugin "${entry.name}" not found at ${entry.installPath}`);
    return null;
  }

  try {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    const entryPoint = pkgJson.main || pkgJson.exports?.['.'] || 'index.js';
    const resolvedPath = join(entry.installPath, entryPoint);
    const mod = await import(pathToFileURL(resolvedPath).href);
    const candidate = mod.default ?? mod.plugin ?? mod;

    if (!isHarnessPlugin(candidate)) {
      console.error(`Plugin "${entry.name}" does not export a valid HarnessPlugin`);
      return null;
    }

    if (candidate.meta.version !== entry.version) {
      console.warn(
        `Version mismatch for "${entry.name}": ` +
          `registry=${entry.version}, module=${candidate.meta.version}`,
      );
    }

    pluginCache.set(entry.name, candidate);
    return candidate;
  } catch (err) {
    console.error(`Failed to load plugin "${entry.name}":`, err);
    return null;
  }
}

// ── L2: Cross-plugin call ──

/**
 * Call another plugin's command. Used by ctx.call().
 */
export async function callPlugin(
  callerName: string,
  targetName: string,
  commandName: string,
  args: Record<string, string>,
): Promise<CallResult> {
  if (targetName === callerName) {
    return { success: false, error: `Plugin "${callerName}" cannot call itself` };
  }

  const entry = findPlugin(targetName);
  if (!entry) {
    return { success: false, error: `Plugin "${targetName}" is not installed` };
  }

  const plugin = await importPlugin(entry);
  if (!plugin) {
    return { success: false, error: `Failed to load plugin "${targetName}"` };
  }

  if (!plugin.commands || plugin.commands.length === 0) {
    return { success: false, error: `Plugin "${targetName}" has no commands` };
  }

  const cmd = plugin.commands.find((c) => c.name === commandName);
  if (!cmd) {
    return {
      success: false,
      error: `Command "${commandName}" not found. Available: ${plugin.commands.map((c) => c.name).join(', ')}`,
    };
  }

  // Capture console output for the callee
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;

  console.log = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => logs.push('[err] ' + a.map(String).join(' '));
  console.warn = (...a) => logs.push('[warn] ' + a.map(String).join(' '));

  try {
    await cmd.handler(makeCommandContext(targetName, args, []));
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    return { success: true, data: logs.length > 0 ? logs.join('\n') : undefined };
  } catch (err: any) {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    return { success: false, error: err.message };
  }
}

/**
 * Dynamically import another plugin's module. Used by ctx.use().
 */
export async function usePlugin<T = unknown>(
  targetName: string,
): Promise<T | null> {
  const entry = findPlugin(targetName);
  if (!entry) {
    console.error(`Plugin "${targetName}" is not installed`);
    return null;
  }

  const pkgJsonPath = join(entry.installPath, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const entryPoint = pkgJson.main || pkgJson.exports?.['.'] || 'index.js';
  const resolvedPath = join(entry.installPath, entryPoint);

  try {
    const mod = await import(pathToFileURL(resolvedPath).href);
    return (mod.default ?? mod.plugin ?? mod) as T;
  } catch (err) {
    console.error(`Failed to use plugin "${targetName}":`, err);
    return null;
  }
}

// ── Context factories (inject L2 capabilities) ──

function makePluginContext(pluginName: string): PluginContext {
  const entry = findPlugin(pluginName);
  return {
    pluginDir: entry?.installPath ?? getWorkspace(),
    workspace: getWorkspace(),
    logger: createLogger(pluginName),
    call: (target, cmd, args) => callPlugin(pluginName, target, cmd, args),
    use: <T>(target: string) => usePlugin<T>(target),
    plugins: getPluginNames(),
  };
}

function makeCommandContext(
  pluginName: string,
  args: Record<string, string>,
  rawArgs: string[],
): CommandContext {
  return {
    args,
    rawArgs,
    workspace: getWorkspace(),
    logger: createLogger(pluginName),
    call: (target, cmd, callArgs) => callPlugin(pluginName, target, cmd, callArgs),
    use: <T>(target: string) => usePlugin<T>(target),
    plugins: getPluginNames(),
  };
}

// ── Lifecycle ──

export async function activatePlugin(
  entry: RegistryEntry,
): Promise<HarnessPlugin | null> {
  const plugin = await importPlugin(entry);
  if (!plugin) return null;

  if (plugin.onActivate) {
    try {
      await plugin.onActivate(makePluginContext(entry.name));
    } catch (err) {
      console.error(`Plugin "${entry.name}" onActivate failed:`, err);
      return null;
    }
  }

  return plugin;
}

export async function deactivatePlugin(entry: RegistryEntry): Promise<boolean> {
  const plugin = await importPlugin(entry);
  if (plugin?.onDeactivate) {
    try {
      await plugin.onDeactivate();
    } catch (err) {
      console.error(`Plugin "${entry.name}" onDeactivate failed:`, err);
    }
  }
  pluginCache.delete(entry.name);
  return true;
}

// ── Public API ──

export async function getPluginCommands(name: string): Promise<HarnessPlugin | null> {
  const entry = findPlugin(name);
  if (!entry) {
    console.error(`Plugin "${name}" is not installed.`);
    return null;
  }
  return importPlugin(entry);
}

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
    await cmd.handler(makeCommandContext(pluginName, args, rawArgs));
  } catch (err) {
    console.error(`Command "${commandName}" failed:`, err);
    process.exit(1);
  }
}
