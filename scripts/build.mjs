import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outdir = join(root, 'dist');
const watch = process.argv.includes('--watch');

function copyStatic() {
  mkdirSync(outdir, { recursive: true });

  // Manifest
  const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
  writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Icons (placeholder SVGs copied as-is if present)
  const iconsDir = join(root, 'public/icons');
  if (existsSync(iconsDir)) {
    cpSync(iconsDir, join(outdir, 'icons'), { recursive: true });
  }

  // Styles (also imported as text in bundle; keep loose copies for debugging)
  const stylesOut = join(outdir, 'styles');
  mkdirSync(stylesOut, { recursive: true });
  for (const file of [
    'markdown.css',
    'highlight.css',
    'theme-vars.css',
    'toolbar.css',
  ]) {
    const src = join(root, 'src/preview/styles', file);
    if (existsSync(src)) {
      cpSync(src, join(stylesOut, file));
    }
  }

  // KaTeX fonts/css from node_modules
  const katexDist = join(root, 'node_modules/katex/dist');
  if (existsSync(katexDist)) {
    cpSync(join(katexDist, 'katex.min.css'), join(stylesOut, 'katex.min.css'));
    const fontsSrc = join(katexDist, 'fonts');
    if (existsSync(fontsSrc)) {
      cpSync(fontsSrc, join(stylesOut, 'fonts'), { recursive: true });
    }
  }

  // Options page
  const optionsHtml = join(root, 'src/options/options.html');
  if (existsSync(optionsHtml)) {
    mkdirSync(join(outdir, 'options'), { recursive: true });
    cpSync(optionsHtml, join(outdir, 'options/options.html'));
  }
}

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
  loader: {
    '.css': 'text',
  },
};

async function build() {
  if (existsSync(outdir)) {
    // Keep dist clean of stale chunks
    rmSync(outdir, { recursive: true, force: true });
  }
  copyStatic();

  const ctx = await esbuild.context({
    ...common,
    entryPoints: {
      'background/service-worker': join(root, 'src/background/service-worker.ts'),
      'content/content': join(root, 'src/content/index.ts'),
      'content/mermaidChunk': join(root, 'src/content/mermaidChunk.ts'),
      'options/options': join(root, 'src/options/options.ts'),
    },
    outdir,
    splitting: false,
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes…');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete → dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
