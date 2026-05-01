/**
 * Harness Plugin Protocol
 *
 * Any npm package that exports a `HarnessPlugin` object
 * can be used as a harness-agent plugin.
 *
 * L1: Standalone CLI commands
 * L2: Cross-plugin calling via ctx.call() / ctx.use()
 * L3: Orchestrator DAG pipelines via harness pipeline
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

export interface ArgumentDef {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

// ── L2: Cross-plugin calling ──

/** Result returned from ctx.call() */
export interface CallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Runtime context injected into every command handler */
export interface CommandContext {
  args: Record<string, string>;
  rawArgs: string[];
  workspace: string;
  logger: PluginLogger;

  /**
   * L2: Call another plugin's command.
   * @example await ctx.call('pdf-parser', 'extract', { path: './doc.pdf' })
   */
  call: (pluginName: string, commandName: string, args: Record<string, string>) => Promise<CallResult>;

  /**
   * L2: Dynamically import another plugin's entire module.
   * @example const pdf = await ctx.use<HarnessPlugin>('pdf-parser')
   */
  use: <T = unknown>(pluginName: string) => Promise<T | null>;

  /** L2: List of all installed plugin names */
  plugins: string[];
}

export interface PluginContext {
  pluginDir: string;
  workspace: string;
  logger: PluginLogger;

  call: (pluginName: string, commandName: string, args: Record<string, string>) => Promise<CallResult>;
  use: <T = unknown>(pluginName: string) => Promise<T | null>;
  plugins: string[];
}

// ── Plugin Command ──

export interface CommandDef {
  name: string;
  description?: string;
  args?: ArgumentDef[];
  handler: (ctx: CommandContext) => Promise<void>;
}

// ── Main Plugin Interface ──

export interface HarnessPlugin {
  meta: PluginMeta;
  commands?: CommandDef[];
  onActivate?: (ctx: PluginContext) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

// ── L3: Orchestrator types ──

export interface WorkflowStep {
  /** Unique step identifier within this workflow */
  id: string;
  /** Plugin name to invoke */
  plugin: string;
  /** Command to run on that plugin */
  command: string;
  /** Arguments for the command */
  args?: Record<string, string>;
  /** Step IDs this step depends on (must complete first) */
  dependsOn?: string[];
}

export interface WorkflowDef {
  /** Workflow name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Steps to execute */
  steps: WorkflowStep[];
  /** If true, stop on first failure (default: true) */
  failFast?: boolean;
}

export interface StepResult {
  id: string;
  plugin: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkflowResult {
  name: string;
  success: boolean;
  totalSteps: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  steps: StepResult[];
}

// ── Type guards ──

export function isHarnessPlugin(obj: unknown): obj is HarnessPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  if (!p.meta || typeof p.meta !== 'object') return false;
  const m = p.meta as Record<string, unknown>;
  return typeof m.name === 'string' && typeof m.version === 'string';
}
