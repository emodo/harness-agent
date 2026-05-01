/**
 * Plugin Registry — persistent list of installed plugins.
 * Stored as JSON at ~/.harness/registry.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface RegistryEntry {
  /** npm package name (e.g. "harness-plugin-hello") */
  name: string;
  /** Installed version */
  version: string;
  /** Local install path */
  installPath: string;
  /** When it was installed (ISO string) */
  installedAt: string;
}

const WORKSPACE = join(homedir(), '.harness');
const REGISTRY_PATH = join(WORKSPACE, 'registry.json');

function ensureWorkspace(): void {
  if (!existsSync(WORKSPACE)) {
    mkdirSync(WORKSPACE, { recursive: true });
  }
}

export function getRegistryPath(): string {
  return REGISTRY_PATH;
}

export function getWorkspace(): string {
  return WORKSPACE;
}

export function loadRegistry(): RegistryEntry[] {
  ensureWorkspace();
  if (!existsSync(REGISTRY_PATH)) {
    writeFileSync(REGISTRY_PATH, '[]', 'utf-8');
    return [];
  }
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw) as RegistryEntry[];
  } catch {
    return [];
  }
}

function saveRegistry(entries: RegistryEntry[]): void {
  ensureWorkspace();
  writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

export function addPlugin(entry: RegistryEntry): void {
  const entries = loadRegistry();
  const idx = entries.findIndex((e) => e.name === entry.name);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  saveRegistry(entries);
}

export function removePlugin(name: string): boolean {
  const entries = loadRegistry();
  const idx = entries.findIndex((e) => e.name === name);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  saveRegistry(entries);
  return true;
}

export function findPlugin(name: string): RegistryEntry | undefined {
  return loadRegistry().find((e) => e.name === name);
}
