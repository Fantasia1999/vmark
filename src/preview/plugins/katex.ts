/*---------------------------------------------------------------------------------------------
 *  Derived from VS Code extensions/markdown-math
 *  Copyright (c) Microsoft Corporation. MIT License.
 *--------------------------------------------------------------------------------------------*/

import type MarkdownIt from 'markdown-it';
import markdownItKatex from '@vscode/markdown-it-katex';

type MdPlugin = (md: MarkdownIt, options?: unknown) => void;

export function applyKatexPlugin(md: MarkdownIt): void {
  const options = {
    enableFencedBlocks: true,
    globalGroup: true,
    macros: {} as Record<string, string>,
  };
  md.core.ruler.push('reset-katex-macros', () => {
    options.macros = {};
  });
  const mod = markdownItKatex as unknown as { default?: MdPlugin } | MdPlugin;
  const plugin: MdPlugin =
    typeof mod === 'function' ? mod : ((mod as { default?: MdPlugin }).default as MdPlugin);
  md.use(plugin, options);
}
