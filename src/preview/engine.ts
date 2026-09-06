/*---------------------------------------------------------------------------------------------
 *  Derived from VS Code extensions/markdown-language-features/src/markdownEngine.ts
 *  Copyright (c) Microsoft Corporation. MIT License.
 *--------------------------------------------------------------------------------------------*/

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { githubSlugifier, type ISlugifier, type SlugBuilder } from './slugify';
import { pluginSourceMap } from './plugins/sourceMap';
import { extendMarkdownItWithMermaid } from './plugins/mermaidFence';
import { applyKatexPlugin } from './plugins/katex';
import type { PreviewSettings } from './config';

export function sanitizeHtmlContent(html: string): string {
  if (typeof window !== 'undefined' && DOMPurify.isSupported) {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      ADD_TAGS: [
        'details',
        'summary',
        'kbd',
        'mark',
        'font',
        'del',
        'ins',
        'sub',
        'sup',
        'video',
        'audio',
        'source',
        'figure',
        'figcaption',
        'wbr',
        'ruby',
        'rt',
        'rp',
      ],
      ADD_ATTR: [
        'target',
        'align',
        'color',
        'controls',
        'poster',
        'preload',
        'autoplay',
        'loop',
        'muted',
        'playsinline',
        'width',
        'height',
        'data-line',
        'data-href',
        'data-src',
        'data-workspace-src',
      ],
      ALLOW_DATA_ATTR: true,
    });
  }
  // Headless / fallback environment (e.g. Node tests / smoke tests where DOM is absent)
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
}

export interface RenderOutput {
  html: string;
  containingImages: Set<string>;
  hasMermaid: boolean;
}

interface RenderEnv {
  readonly containingImages: Set<string>;
  readonly documentBase: string | undefined;
  readonly slugifier: ISlugifier;
  slugBuilder: SlugBuilder;
}

export interface EngineOptions {
  settings: PreviewSettings;
  documentBase?: string;
}

function normalizeHighlightLang(lang: string | undefined): string | undefined {
  switch (lang?.toLowerCase()) {
    case 'shell':
      return 'sh';
    case 'py3':
      return 'python';
    case 'tsx':
    case 'typescriptreact':
      return 'jsx';
    case 'json5':
    case 'jsonc':
      return 'json';
    case 'c#':
    case 'csharp':
      return 'cs';
    default:
      return lang;
  }
}

function isAbsoluteUrl(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function resolveResourceUri(href: string, documentBase: string | undefined): string {
  try {
    if (!href || isAbsoluteUrl(href) || href.startsWith('//') || href.startsWith('#')) {
      return href;
    }
    if (documentBase) {
      return new URL(href, documentBase).toString();
    }
    return href;
  } catch {
    return href;
  }
}

export class MarkdownPreviewEngine {
  #md: MarkdownIt | undefined;
  #settings: PreviewSettings;
  readonly slugifier: ISlugifier = githubSlugifier;

  constructor(settings: PreviewSettings) {
    this.#settings = settings;
  }

  updateSettings(settings: PreviewSettings): void {
    this.#settings = settings;
    this.#md = undefined;
  }

  #createEngine(): MarkdownIt {
    const md: MarkdownIt = new MarkdownIt({
      html: Boolean(this.#settings.html),
      linkify: this.#settings.linkify,
      typographer: this.#settings.typographer,
      breaks: this.#settings.breaks,
      highlight: (str: string, lang?: string) => {
        const normalized = normalizeHighlightLang(lang);
        if (normalized && hljs.getLanguage(normalized)) {
          try {
            return hljs.highlight(str, {
              language: normalized,
              ignoreIllegals: true,
            }).value;
          } catch {
            // fall through
          }
        }
        return md.utils.escapeHtml(str);
      },
    });

    md.linkify.set({ fuzzyLink: false });

    if (this.#settings.mathEnabled) {
      try {
        applyKatexPlugin(md);
      } catch (e) {
        console.warn('[vscode-md-preview] KaTeX plugin failed to load', e);
      }
    }

    if (this.#settings.mermaidEnabled) {
      extendMarkdownItWithMermaid(md, {
        languageIds: () => ['mermaid'],
      });
    }

    this.#addImageRenderer(md);
    this.#addFencedRenderer(md);
    this.#addNamedHeaders(md);
    this.#addLinkRenderer(md);
    md.use(pluginSourceMap);

    return md;
  }

  #getEngine(): MarkdownIt {
    if (!this.#md) {
      this.#md = this.#createEngine();
    }
    this.#md.set({
      breaks: this.#settings.breaks,
      linkify: this.#settings.linkify,
      typographer: this.#settings.typographer,
      html: Boolean(this.#settings.html),
    });
    return this.#md;
  }

  #addImageRenderer(md: MarkdownIt): void {
    const original = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, idx, options, env: RenderEnv, self) => {
      const token = tokens[idx];
      const src = token.attrGet('src');
      if (src) {
        env.containingImages?.add(src);
        if (!token.attrGet('data-src')) {
          token.attrSet('src', resolveResourceUri(src, env.documentBase));
          token.attrSet('data-src', src);
        }
      }
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  #addFencedRenderer(md: MarkdownIt): void {
    const original = md.renderer.rules['fence'];
    md.renderer.rules['fence'] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map?.length) {
        token.attrJoin('class', 'hljs');
      }
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  #addNamedHeaders(md: MarkdownIt): void {
    const original = md.renderer.rules.heading_open;
    md.renderer.rules.heading_open = (tokens, idx, options, env: RenderEnv, self) => {
      const title = this.#tokenToPlainText(tokens[idx + 1]);
      const slug = env.slugBuilder
        ? env.slugBuilder.add(title)
        : this.slugifier.fromHeading(title);
      tokens[idx].attrSet('id', slug.value);
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  #tokenToPlainText(token: { children?: unknown[] | null; type: string; content: string }): string {
    if (token.children) {
      return token.children
        .map((x) => this.#tokenToPlainText(x as { children?: unknown[] | null; type: string; content: string }))
        .join('');
    }
    switch (token.type) {
      case 'text':
      case 'emoji':
      case 'code_inline':
        return token.content;
      default:
        return '';
    }
  }

  #addLinkRenderer(md: MarkdownIt): void {
    const original = md.renderer.rules.link_open;
    md.renderer.rules.link_open = (tokens, idx, options, env: RenderEnv, self) => {
      const token = tokens[idx];
      const href = token.attrGet('href');
      if (typeof href === 'string') {
        token.attrSet('data-href', href);
        if (href && !href.startsWith('#') && !isAbsoluteUrl(href)) {
          token.attrSet('href', resolveResourceUri(href, env.documentBase));
        }
      }
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  render(text: string, documentBase?: string): RenderOutput {
    const engine = this.#getEngine();
    const env: RenderEnv = {
      containingImages: new Set<string>(),
      documentBase,
      slugifier: this.slugifier,
      slugBuilder: this.slugifier.createBuilder(),
    };

    let html = engine.render(text, env);
    if (this.#settings.html) {
      html = sanitizeHtmlContent(html);
    }
    const hasMermaid =
      this.#settings.mermaidEnabled &&
      (html.includes('class="mermaid"') || html.includes("class='mermaid'"));

    return {
      html: `<div class="markdown-body" dir="auto">${html}</div>`,
      containingImages: env.containingImages,
      hasMermaid,
    };
  }
}
