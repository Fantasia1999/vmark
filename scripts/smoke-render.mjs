/**
 * Node smoke test for the render engine (no Chrome APIs).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'md-smoke-'));

try {
  const outfile = join(tmp, 'engine.mjs');
  await esbuild.build({
    entryPoints: [join(root, 'src/preview/engine.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
  });

  // dynamic import bundled engine
  const { MarkdownPreviewEngine } = await import(outfile);
  const md = readFileSync(join(root, 'fixtures/sample.md'), 'utf8');
  const engine = new MarkdownPreviewEngine({
    autoPreview: true,
    breaks: false,
    linkify: true,
    typographer: false,
    mathEnabled: true,
    mermaidEnabled: true,
    theme: 'auto',
    sanitizeHtml: false,
  });
  const out = engine.render(md, 'file:///tmp/sample.md');
  const checks = [
    ['h1', out.html.includes('VS Code Markdown Preview Sample')],
    ['code', out.html.includes('greet') && out.html.includes('hljs')],
    ['katex or math', out.html.includes('katex') || out.html.includes('math')],
    ['mermaid', out.hasMermaid === true],
    ['table', out.html.includes('<table')],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(ok ? '✓' : '✗', name);
    if (!ok) failed++;
  }
  if (failed) {
    console.error('Smoke render failed');
    console.log(out.html.slice(0, 500));
    process.exit(1);
  }
  console.log('Smoke render OK, html length', out.html.length);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
