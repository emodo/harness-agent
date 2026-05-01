/**
 * Harness Plugin Protocol
 *
 * Any npm package that exports a `HarnessPlugin` object
 * can be used as a harness-agent plugin.
 */

export interface PluginMeta {
  /** Unique plugin identifier (e.g. "@scope/plugin-name") */
  name: string;
  /** Semver version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Required Node.js version */
  engines?: { node?: string };
}

export interface CommandDef {
  /** Command name (subcommand of `harness <plugin> <name>`) */
  name: string;
  /** Description shown in help */
  description?: string;
  /** CLI arguments definition */
  args?: ArgumentDef[];
  /** Handler function */
  handler: (ctx: CommandContext) => Promise<void>;
}

export interface ArgumentDef {
  name: string;
  description?: string;
  required?: boolean;
  /** Default value */
  default?: string;
}

export interface CommandContext {
  /** Parsed arguments key-value */
  args: Record<string, string>;
  /** Raw process.argv for this invocation */
  rawArgs: string[];
  /** Plugin workspace directory */
  workspace: string;
  /** Logger bound to this plugin */
  logger: PluginLogger;
}

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface PluginContext {
  /** Plugin's own install directory */
  pluginDir: string;
  /** Global harness workspace */
  workspace: string;
  /** Logger */
  logger: PluginLogger;
}

/**
 * The main interface every harness plugin must export.
 */
export interface HarnessPlugin {
  /** Plugin metadata */
  meta: PluginMeta;

  /** CLI commands exposed by this plugin */
  commands?: CommandDef[];

  /** Called when plugin is activated (installed / loaded) */
  onActivate?: (ctx: PluginContext) => Promise<void>;

  /** Called when plugin is deactivated (removed) */
  onDeactivate?: () => Promise<void>;
}

/**
 * Type guard to check if an imported module is a valid plugin.
 */
export function isHarnessPlugin(obj: unknown): obj is HarnessPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  if (!p.meta || typeof p.meta !== 'object') return false;
  const m = p.meta as Record<string, unknown>;
  return typeof m.name === 'string' && typeof m.version === 'string';
}
