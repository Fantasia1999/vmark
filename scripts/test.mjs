/**
 * Test runner: bundles test/*.test.ts with esbuild (same loader config as the
 * extension build, so `.css` text imports and extensionless TS imports work),
 * then executes them with Node's built-in test runner.
 */
import * as esbuild from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const testDir = join(root, 'test');
const outdir = join(root, '.test-dist');

rmSync(outdir, { recursive: true, force: true });

const entryPoints = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join(testDir, f));

if (!entryPoints.length) {
  console.error('No test files found in test/');
  process.exit(1);
}

await esbuild.build({
  entryPoints,
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
  loader: { '.css': 'text' },
  outExtension: { '.js': '.mjs' },
});

// Pass explicit files: `--test <dir>` skips dot-directories like .test-dist
const builtFiles = readdirSync(outdir)
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => join(outdir, f));

const result = spawnSync(process.execPath, ['--test', ...builtFiles], {
  stdio: 'inherit',
  cwd: root,
});

rmSync(outdir, { recursive: true, force: true });
process.exit(result.status ?? 1);
