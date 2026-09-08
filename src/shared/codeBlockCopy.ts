/**
 * GitHub-style copy buttons on fenced code blocks (pre > code).
 */

import { copyText } from './clipboard';
import { createIconEl } from './icons';
import { t } from './i18n/index';

export const CODE_BLOCK_WRAP_CLASS = 'md-code-block';
export const CODE_COPY_BTN_CLASS = 'md-code-copy';

const FEEDBACK_MS = 1800;

function codeText(code: Element): string {
  // textContent keeps newlines from the highlighted token tree
  return code.textContent ?? '';
}

function setCopyButtonState(
  btn: HTMLButtonElement,
  state: 'idle' | 'ok' | 'fail',
): void {
  btn.replaceChildren();
  if (state === 'ok') {
    btn.appendChild(createIconEl('check', 'vsc-icon md-code-copy-icon'));
    const label = document.createElement('span');
    label.className = 'md-code-copy-label';
    label.textContent = t('codeBlock.copied');
    btn.appendChild(label);
    btn.setAttribute('aria-label', t('codeBlock.copied'));
    btn.title = t('codeBlock.copied');
    return;
  }
  if (state === 'fail') {
    btn.appendChild(createIconEl('copy', 'vsc-icon md-code-copy-icon'));
    const label = document.createElement('span');
    label.className = 'md-code-copy-label';
    label.textContent = t('codeBlock.failed');
    btn.appendChild(label);
    btn.setAttribute('aria-label', t('codeBlock.failed'));
    btn.title = t('codeBlock.failed');
    return;
  }
  btn.appendChild(createIconEl('copy', 'vsc-icon md-code-copy-icon'));
  const label = document.createElement('span');
  label.className = 'md-code-copy-label';
  label.textContent = t('codeBlock.copy');
  btn.appendChild(label);
  btn.setAttribute('aria-label', t('codeBlock.copyAria'));
  btn.title = t('codeBlock.copy');
}

function shouldSkipPre(pre: HTMLElement): boolean {
  if (pre.classList.contains('mermaid')) {
    return true;
  }
  if (pre.closest('.mermaid')) {
    return true;
  }
  // Diff tooltip snippets are tiny; no copy chrome
  if (pre.closest('.diff-change-indicator-tooltip')) {
    return true;
  }
  if (pre.closest(`.${CODE_BLOCK_WRAP_CLASS}`)) {
    return true;
  }
  return false;
}

function wrapPre(pre: HTMLElement): HTMLElement {
  const parent = pre.parentElement;
  if (!parent) {
    const wrap = document.createElement('div');
    wrap.className = CODE_BLOCK_WRAP_CLASS;
    wrap.appendChild(pre);
    return wrap;
  }
  const wrap = document.createElement('div');
  wrap.className = CODE_BLOCK_WRAP_CLASS;
  parent.insertBefore(wrap, pre);
  wrap.appendChild(pre);
  return wrap;
}

/**
 * Attach a top-right copy control to every fenced code block under `root`.
 * Safe to call after each preview render; skips Mermaid and already-wrapped blocks.
 */
export function attachCodeBlockCopyButtons(root: ParentNode): void {
  const codes = root.querySelectorAll('pre > code');
  for (const code of codes) {
    if (!(code instanceof HTMLElement)) {
      continue;
    }
    const pre = code.parentElement;
    if (!(pre instanceof HTMLElement) || pre.tagName !== 'PRE') {
      continue;
    }
    if (shouldSkipPre(pre)) {
      continue;
    }

    const wrap = wrapPre(pre);

    // Drop stale buttons if re-wrapping is somehow skipped
    wrap.querySelectorAll(`:scope > .${CODE_COPY_BTN_CLASS}`).forEach((el) => el.remove());

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = CODE_COPY_BTN_CLASS;
    setCopyButtonState(btn, 'idle');

    let feedbackTimer: number | undefined;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        const text = codeText(code);
        btn.disabled = true;
        const ok = await copyText(text);
        setCopyButtonState(btn, ok ? 'ok' : 'fail');
        if (feedbackTimer !== undefined) {
          window.clearTimeout(feedbackTimer);
        }
        feedbackTimer = window.setTimeout(() => {
          setCopyButtonState(btn, 'idle');
          btn.disabled = false;
          feedbackTimer = undefined;
        }, FEEDBACK_MS);
      })();
    });

    wrap.appendChild(btn);
  }
}
