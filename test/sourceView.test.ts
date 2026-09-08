import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFileSize,
  splitSourceLines,
  renderSourceWithLineNumbers,
  SOURCE_VIEW_CLASS,
} from '../src/shared/sourceView';
import { t } from '../src/shared/i18n/index';

describe('sourceView - formatFileSize', () => {
  it('formats bytes below 1KB', () => {
    assert.equal(formatFileSize(0), '0 B');
    assert.equal(formatFileSize(512), '512 B');
    assert.equal(formatFileSize(1023), '1023 B');
  });

  it('formats sizes between 1KB and 10KB with two decimals', () => {
    assert.equal(formatFileSize(1024), '1.00 KB');
    assert.equal(formatFileSize(1536), '1.50 KB');
    assert.equal(formatFileSize(9500), '9.28 KB');
  });

  it('formats sizes between 10KB and 1MB with one decimal', () => {
    assert.equal(formatFileSize(10240), '10.0 KB');
    assert.equal(formatFileSize(51200), '50.0 KB');
    assert.equal(formatFileSize(500000), '488.3 KB');
  });

  it('formats sizes 1MB and above with two decimals', () => {
    assert.equal(formatFileSize(1048576), '1.00 MB');
    assert.equal(formatFileSize(5242880), '5.00 MB');
  });
});

describe('sourceView - splitSourceLines', () => {
  it('returns a single blank line for empty input', () => {
    assert.deepEqual(splitSourceLines(''), ['']);
  });

  it('splits single and multiline strings', () => {
    assert.deepEqual(splitSourceLines('single line'), ['single line']);
    assert.deepEqual(splitSourceLines('line 1\nline 2\nline 3'), ['line 1', 'line 2', 'line 3']);
  });

  it('preserves empty lines and trailing newline', () => {
    assert.deepEqual(splitSourceLines('a\n\nb\n'), ['a', '', 'b', '']);
  });
});

describe('sourceView - renderSourceWithLineNumbers (DOM)', () => {
  let origDocument: unknown;

  class MockNode {
    nodeType = 1;
    tagName = 'DIV';
    children: MockNode[] = [];
    classList = {
      classes: new Set<string>(),
      add(...cls: string[]) {
        cls.forEach((c) => this.classes.add(c));
      },
      contains(c: string) {
        return this.classes.has(c);
      },
      remove(...cls: string[]) {
        cls.forEach((c) => this.classes.delete(c));
      },
    };
    attributes: Record<string, string> = {};
    textContent = '';
    className = '';
    title = '';
    type = '';
    listeners: Record<string, ((e: unknown) => void)[]> = {};

    setAttribute(k: string, v: string) {
      this.attributes[k] = v;
    }
    getAttribute(k: string) {
      return this.attributes[k];
    }
    appendChild(child: MockNode) {
      if (child.nodeType === 11) {
        this.children.push(...child.children);
        child.children = [];
        return child;
      }
      this.children.push(child);
      return child;
    }
    append(...nodes: (MockNode | string)[]) {
      for (const n of nodes) {
        if (typeof n === 'string') {
          const t = new MockNode();
          t.textContent = n;
          this.children.push(t);
        } else if (n.nodeType === 11) {
          this.children.push(...n.children);
          n.children = [];
        } else {
          this.children.push(n);
        }
      }
    }
    replaceChildren(...nodes: MockNode[]) {
      this.children = [];
      this.append(...nodes);
    }
    addEventListener(event: string, fn: (e: unknown) => void) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    dispatchEvent(event: string) {
      this.listeners[event]?.forEach((fn) => fn({ preventDefault() {} }));
    }
    querySelector(selector: string): MockNode | null {
      const find = (n: MockNode): MockNode | null => {
        if (selector.startsWith('.')) {
          const c = selector.slice(1);
          if (n.className.split(/\s+/).includes(c) || n.classList.contains(c)) {
            return n;
          }
        }
        for (const ch of n.children) {
          const m = find(ch);
          if (m) return m;
        }
        return null;
      };
      for (const ch of this.children) {
        const m = find(ch);
        if (m) return m;
      }
      return null;
    }
  }

  before(() => {
    origDocument = (globalThis as any).document;
    (globalThis as any).document = {
      createElement(tag: string) {
        const el = new MockNode();
        el.tagName = tag.toUpperCase();
        return el;
      },
      createDocumentFragment() {
        const frag = new MockNode();
        frag.nodeType = 11;
        return frag;
      },
    };
  });

  after(async () => {
    // Wait for any feedback timers to settle before restoring global
    await new Promise((r) => setTimeout(r, 1900));
    (globalThis as any).document = origDocument;
  });

  it('renders line numbers table and header stats without action buttons', () => {
    const container = new MockNode() as unknown as HTMLElement;
    renderSourceWithLineNumbers(container, 'hello\nworld');

    assert.ok((container as any).classList.contains(SOURCE_VIEW_CLASS));
    assert.equal((container as any).children.length, 2);

    const header = (container as any).children[0];
    assert.equal(header.className, 'md-source-header');

    const linesEl = header.querySelector('.md-source-lines');
    assert.equal(linesEl?.textContent, t('source.lines', { count: 2 }));

    const sizeEl = header.querySelector('.md-source-size');
    assert.equal(sizeEl?.textContent, '11 B');

    // No actions since callbacks omitted
    const actions = header.querySelector('.md-source-actions');
    assert.equal(actions, null);

    const table = (container as any).children[1];
    assert.equal(table.className, 'md-source-table');
    assert.equal(table.children.length, 2); // 2 rows
  });

  it('renders copy and download action buttons when callbacks provided and triggers events', () => {
    const container = new MockNode() as unknown as HTMLElement;
    let copied = false;
    let downloaded = false;

    renderSourceWithLineNumbers(container, '# Header\nContent', {
      fileName: 'test.md',
      onCopyRaw: () => {
        copied = true;
      },
      onDownloadRaw: () => {
        downloaded = true;
      },
    });

    const header = (container as any).children[0];
    const actions = header.querySelector('.md-source-actions');
    assert.ok(actions, 'actions container should be created');

    const copyBtn = actions.querySelector('.md-source-btn-copy');
    assert.ok(copyBtn, 'copy button should be present');
    copyBtn.dispatchEvent('click');
    assert.equal(copied, true, 'onCopyRaw callback should be called on click');

    const downloadBtn = actions.querySelector('.md-source-btn-download');
    assert.ok(downloadBtn, 'download button should be present');
    downloadBtn.dispatchEvent('click');
    assert.equal(downloaded, true, 'onDownloadRaw callback should be called on click');
  });

  it('handles empty documents with 0 lines and 0 B', () => {
    const container = new MockNode() as unknown as HTMLElement;
    renderSourceWithLineNumbers(container, '');

    const header = (container as any).children[0];
    const linesEl = header.querySelector('.md-source-lines');
    assert.equal(linesEl?.textContent, t('source.lines', { count: 0 }));

    const sizeEl = header.querySelector('.md-source-size');
    assert.equal(sizeEl?.textContent, '0 B');
  });
});
