/*---------------------------------------------------------------------------------------------
 *  Derived from VS Code markdownEngine pluginSourceMap
 *  Copyright (c) Microsoft Corporation. MIT License.
 *--------------------------------------------------------------------------------------------*/

import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';

/**
 * Adds begin line index via data-line attribute (VS Code preview source map).
 */
export function pluginSourceMap(md: MarkdownIt): void {
  md.core.ruler.push('source_map_data_attribute', (state: StateCore): void => {
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
        token.attrJoin('class', 'code-line');
        token.attrJoin('dir', 'auto');
      }
    }
  });

  const originalHtmlBlockRenderer = md.renderer.rules['html_block'];
  if (originalHtmlBlockRenderer) {
    md.renderer.rules['html_block'] = (tokens, idx, options, env, self) =>
      `<div ${self.renderAttrs(tokens[idx])} ></div>\n` +
      originalHtmlBlockRenderer(tokens, idx, options, env, self);
  }
}
