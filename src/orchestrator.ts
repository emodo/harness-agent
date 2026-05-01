/**
 * Orchestrator — L3 DAG workflow execution engine.
 *
 * Takes a WorkflowDef JSON, resolves dependencies via topological sort,
 * executes steps in parallel where possible, sequentially where dependent.
 */

import {
  type WorkflowDef,
  type WorkflowStep,
  type StepResult,
  type WorkflowResult,
  type CallResult,
} from './protocol.js';
import { callPlugin, getPluginCommands } from './engine.js';
import { findPlugin } from './registry.js';

// ── Topological sort (Kahn's algorithm) ──

function topologicalSort(steps: WorkflowStep[]): WorkflowStep[][] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // id → [dependents]

  // Initialize
  for (const s of steps) {
    inDegree.set(s.id, s.dependsOn?.length ?? 0);
    for (const dep of s.dependsOn ?? []) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(s.id);
    }
  }

  const levels: WorkflowStep[][] = [];
  let queue = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue: WorkflowStep[] = [];

    for (const step of queue) {
      for (const dep of dependents.get(step.id) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          nextQueue.push(stepMap.get(dep)!);
        }
      }
    }
    queue = nextQueue;
  }

  // Detect cycles
  const sortedCount = levels.reduce((sum, l) => sum + l.length, 0);
  if (sortedCount !== steps.length) {
    const sortedIds = new Set(levels.flat().map((s) => s.id));
    const unsorted = steps.filter((s) => !sortedIds.has(s.id));
    throw new Error(
      `Circular dependency detected involving: ${unsorted.map((s) => s.id).join(', ')}`,
    );
  }

  return levels;
}

// ── Validate workflow ──

async function validateWorkflow(wf: WorkflowDef): Promise<string[]> {
  const errors: string[] = [];

  // Check step IDs are unique
  const ids = new Set<string>();
  for (const s of wf.steps) {
    if (ids.has(s.id)) {
      errors.push(`Duplicate step ID: "${s.id}"`);
    }
    ids.add(s.id);
  }

  // Check all referenced plugins are installed
  for (const s of wf.steps) {
    if (!findPlugin(s.plugin)) {
      errors.push(
        `Step "${s.id}" references plugin "${s.plugin}" which is not installed`,
      );
    }
  }

  // Check all dependsOn references exist
  for (const s of wf.steps) {
    for (const dep of s.dependsOn ?? []) {
      if (!ids.has(dep)) {
        errors.push(
          `Step "${s.id}" depends on "${dep}" which does not exist in this workflow`,
        );
      }
    }
  }

  // Optional: verify commands exist on plugins (non-blocking warning)
  for (const s of wf.steps) {
    if (findPlugin(s.plugin)) {
      const plugin = await getPluginCommands(s.plugin);
      if (plugin?.commands && !plugin.commands.find((c) => c.name === s.command)) {
        console.warn(
          `⚠ Step "${s.id}": command "${s.command}" not found in plugin "${s.plugin}". ` +
            `Available: ${plugin.commands.map((c) => c.name).join(', ')}`,
        );
      }
    }
  }

  return errors;
}

// ── Execute a single step ──

async function executeStep(
  step: WorkflowStep,
): Promise<StepResult> {
  const start = Date.now();

  try {
    const result = await callPlugin(
      'orchestrator',
      step.plugin,
      step.command,
      step.args ?? {},
    );

    return {
      id: step.id,
      plugin: step.plugin,
      command: step.command,
      success: result.success,
      data: result.data,
      error: result.error,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      id: step.id,
      plugin: step.plugin,
      command: step.command,
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Main orchestration ──

export async function runWorkflow(wf: WorkflowDef): Promise<WorkflowResult> {
  const start = Date.now();
  const stepResults = new Map<string, StepResult>();
  const skipped = new Set<string>();
  const failFast = wf.failFast !== false; // default true

  console.log(`\n⚡ Pipeline: ${wf.name}`);
  if (wf.description) console.log(`   ${wf.description}`);
  console.log(`   ${wf.steps.length} steps\n`);

  // Validate
  const errors = await validateWorkflow(wf);
  if (errors.length > 0) {
    console.error('✗ Workflow validation failed:');
    for (const e of errors) console.error(`  - ${e}`);
    return {
      name: wf.name,
      success: false,
      totalSteps: wf.steps.length,
      passed: 0,
      failed: errors.length,
      skipped: 0,
      durationMs: Date.now() - start,
      steps: [],
    };
  }

  // Topological sort → levels
  let levels: WorkflowStep[][];
  try {
    levels = topologicalSort(wf.steps);
  } catch (err: any) {
    console.error(`✗ ${err.message}`);
    return {
      name: wf.name,
      success: false,
      totalSteps: wf.steps.length,
      passed: 0,
      failed: wf.steps.length,
      skipped: 0,
      durationMs: Date.now() - start,
      steps: [],
    };
  }

  // Execute level by level; within a level, steps run in parallel
  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    console.log(`── Level ${li + 1}/${levels.length} (${level.map((s) => s.id).join(', ')}) ──`);

    // Check if any dependency failed → skip dependents (failFast)
    const toRun: WorkflowStep[] = [];
    const toSkip: string[] = [];

    for (const step of level) {
      const deps = step.dependsOn ?? [];
      const depFailed = failFast && deps.some((d) => {
        const r = stepResults.get(d);
        return r && !r.success;
      });

      if (depFailed) {
        toSkip.push(step.id);
      } else {
        toRun.push(step);
      }
    }

    for (const id of toSkip) {
      skipped.add(id);
      stepResults.set(id, {
        id,
        plugin: '',
        command: '',
        success: false,
        error: 'Skipped: dependency failed',
        durationMs: 0,
      });
      console.log(`  ⏭ ${id} — skipped (dependency failed)`);
    }

    // Execute in parallel
    const promises = toRun.map(async (step) => {
      console.log(`  ▶ ${step.id} → ${step.plugin}:${step.command}`);
      const result = await executeStep(step);
      stepResults.set(step.id, result);

      const icon = result.success ? '✓' : '✗';
      const time = `${result.durationMs}ms`;
      console.log(`  ${icon} ${step.id} (${time})`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      if (result.data && typeof result.data === 'string' && result.data.length < 200) {
        console.log(`    Output: ${result.data}`);
      }

      return result;
    });

    await Promise.all(promises);
  }

  // Summarize
  const allResults = wf.steps.map((s) => stepResults.get(s.id)!);
  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success && !skipped.has(r.id)).length;
  const totalSkipped = skipped.size;
  const totalDuration = Date.now() - start;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(
    `Pipeline "${wf.name}" complete: ${passed} passed, ${failed} failed, ${totalSkipped} skipped (${totalDuration}ms)`,
  );

  if (failed > 0) {
    console.log('\nFailed steps:');
    for (const r of allResults) {
      if (!r.success && !skipped.has(r.id)) {
        console.log(`  ✗ ${r.id}: ${r.error ?? 'unknown error'}`);
      }
    }
  }

  return {
    name: wf.name,
    success: failed === 0,
    totalSteps: wf.steps.length,
    passed,
    failed,
    skipped: totalSkipped,
    durationMs: totalDuration,
    steps: allResults,
  };
}
