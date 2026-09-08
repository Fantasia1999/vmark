import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mountToolbar, mountLangDropdown } from '../src/content/toolbar';
import { initI18n, setLocale } from '../src/shared/i18n/index';

describe('toolbar - source mode copy & download buttons', () => {
  let origDocument: unknown;

  class MockNode {
    nodeType = 1;
    tagName = 'DIV';
    children: MockNode[] = [];
    parentElement: MockNode | null = null;
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
      toggle(c: string, val?: boolean) {
        if (val === undefined) {
          val = !this.classes.has(c);
        }
        if (val) this.classes.add(c);
        else this.classes.delete(c);
        return val;
      },
    };
    attributes: Record<string, string> = {};
    dataset: Record<string, string> = {};
    textContent = '';
    innerHTML = '';
    className = '';
    title = '';
    type = '';
    hidden = false;
    listeners: Record<string, ((e: unknown) => void)[]> = {};

    setAttribute(k: string, v: string) {
      this.attributes[k] = v;
    }
    getAttribute(k: string) {
      return this.attributes[k];
    }
    appendChild(child: MockNode) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    append(...nodes: (MockNode | string)[]) {
      for (const n of nodes) {
        if (typeof n === 'string') {
          const t = new MockNode();
          t.textContent = n;
          this.appendChild(t);
        } else {
          this.appendChild(n);
        }
      }
    }
    insertBefore(child: MockNode, ref: MockNode) {
      child.parentElement = this;
      const idx = this.children.indexOf(ref);
      if (idx >= 0) {
        this.children.splice(idx, 0, child);
      } else {
        this.children.push(child);
      }
      return child;
    }
    after(...nodes: MockNode[]) {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) {
        nodes.forEach((n, i) => {
          n.parentElement = this.parentElement;
          this.parentElement!.children.splice(idx + 1 + i, 0, n);
        });
      }
    }
    replaceChildren(...nodes: MockNode[]) {
      this.children = [];
      nodes.forEach((n) => this.appendChild(n));
    }
    addEventListener(event: string, fn: (e: unknown) => void) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    dispatchEvent(event: string, target?: MockNode) {
      const e = {
        target: target ?? this,
        preventDefault() {},
        stopPropagation() {},
      };
      this.listeners[event]?.forEach((fn) => fn(e));
    }
    closest(selector: string): MockNode | null {
      if (selector === 'button') {
        if (this.tagName === 'BUTTON') return this;
      }
      return this.parentElement ? this.parentElement.closest(selector) : null;
    }
    contains(child: MockNode): boolean {
      if (child === this) return true;
      for (const ch of this.children) {
        if (ch.contains(child)) return true;
      }
      return false;
    }
    querySelector(selector: string): MockNode | null {
      const find = (n: MockNode): MockNode | null => {
        if (selector.startsWith('button[data-action="')) {
          const action = selector.slice('button[data-action="'.length, -2);
          if (n.tagName === 'BUTTON' && n.dataset.action === action) {
            return n;
          }
        }
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

  let mockDocElement: MockNode;

  before(() => {
    origDocument = (globalThis as any).document;
    mockDocElement = new MockNode();
    (globalThis as any).document = {
      documentElement: mockDocElement,
      getElementById(id: string) {
        if (id === 'vscode-md-preview-toolbar') {
          return mockDocElement.querySelector('.vsc-toolbar') ?? null;
        }
        return null;
      },
      createElement(tag: string) {
        const el = new MockNode();
        el.tagName = tag.toUpperCase();
        return el;
      },
    };
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 1900));
    (globalThis as any).document = origDocument;
  });

  it('hides copy-raw and download-raw in preview mode', () => {
    const bar = mountToolbar('preview', {
      onToggleMode: () => {},
      onOpenOptions: () => {},
      onCopyRaw: () => {},
      onDownloadRaw: () => {},
    }, { parent: mockDocElement as unknown as HTMLElement });

    const copyBtn = (bar as any).querySelector('button[data-action="copy-raw"]');
    const downloadBtn = (bar as any).querySelector('button[data-action="download-raw"]');

    assert.ok(copyBtn);
    assert.ok(downloadBtn);
    assert.equal(copyBtn.hidden, true);
    assert.equal(downloadBtn.hidden, true);
  });

  it('shows copy-raw and download-raw in source mode and fires handlers on click', () => {
    let copyFired = false;
    let downloadFired = false;

    const bar = mountToolbar('source', {
      onToggleMode: () => {},
      onOpenOptions: () => {},
      onCopyRaw: () => {
        copyFired = true;
      },
      onDownloadRaw: () => {
        downloadFired = true;
      },
    }, { parent: mockDocElement as unknown as HTMLElement });

    const copyBtn = (bar as any).querySelector('button[data-action="copy-raw"]');
    const downloadBtn = (bar as any).querySelector('button[data-action="download-raw"]');

    assert.ok(copyBtn);
    assert.ok(downloadBtn);
    assert.equal(copyBtn.hidden, false);
    assert.equal(downloadBtn.hidden, false);

    // Simulate clicking copy button
    (bar as any).dispatchEvent('click', copyBtn);
    assert.equal(copyFired, true, 'copy handler should fire on copy-raw click');

    // Simulate clicking download button
    (bar as any).dispatchEvent('click', downloadBtn);
    assert.equal(downloadFired, true, 'download handler should fire on download-raw click');
  });

  it('renders language globe button, toggles popover menu, and switches locale', () => {
    initI18n('en');
    let switchedLocale: string | null = null;
    const bar = mountToolbar('preview', {
      onToggleMode: () => {},
      onOpenOptions: () => {},
      onToggleLocale: (loc) => {
        switchedLocale = loc;
      },
    }, { parent: mockDocElement as unknown as HTMLElement });

    const langBtn = (bar as any).querySelector('button[data-action="toggle-lang"]');
    assert.ok(langBtn, 'toggle-lang button should exist');
    assert.equal(langBtn.title, 'Language');
    assert.equal(langBtn.getAttribute('aria-label'), 'Language');
    assert.equal(langBtn.getAttribute('aria-haspopup'), 'menu');
    assert.equal(langBtn.getAttribute('aria-expanded'), 'false');

    const menu = (bar as any).querySelector('.vsc-lang-menu');
    assert.ok(menu, 'popover menu should exist');
    assert.equal(menu.hidden, true, 'menu should initially be hidden');

    const previewBtn = (bar as any).querySelector('button[data-action="preview"]');
    assert.equal(previewBtn.textContent, 'Preview');
    assert.equal(previewBtn.title, 'Preview mode');

    // Click globe button to open menu
    (bar as any).dispatchEvent('click', langBtn);
    assert.equal(menu.hidden, false, 'menu should open on globe click');
    assert.equal(langBtn.getAttribute('aria-expanded'), 'true');

    // Find zh-CN item and click it
    const zhItem = menu.children.find((c: any) => c.dataset?.lang === 'zh-CN');
    assert.ok(zhItem, 'zh-CN item should exist');
    assert.equal(zhItem.title, '简体中文');

    (bar as any).dispatchEvent('click', zhItem);
    assert.equal(switchedLocale, 'zh-CN', 'onToggleLocale should receive zh-CN');
    assert.equal(menu.hidden, true, 'menu should close after selecting option');
    assert.equal(langBtn.getAttribute('aria-expanded'), 'false');

    // Re-mount toolbar in zh-CN
    const bar2 = mountToolbar('preview', {
      onToggleMode: () => {},
      onOpenOptions: () => {},
    }, { parent: mockDocElement as unknown as HTMLElement });

    const langBtn2 = (bar2 as any).querySelector('button[data-action="toggle-lang"]');
    const previewBtn2 = (bar2 as any).querySelector('button[data-action="preview"]');

    assert.equal(langBtn2.title, '界面语言');
    assert.equal(langBtn2.getAttribute('aria-label'), '界面语言');
    assert.equal(previewBtn2.textContent, '预览');
    assert.equal(previewBtn2.title, '预览模式');
  });

  it('standalone mountLangDropdown mounts in custom container and toggles', () => {
    initI18n('en');
    let selected: string | null = null;
    const slot = new MockNode();
    const dropdown = mountLangDropdown(slot as unknown as HTMLElement, {
      buttonClass: 'wb-icon-btn',
      onSelect: (l) => {
        selected = l;
      },
    });

    const langBtn = (dropdown as any).querySelector('button[data-action="toggle-lang"]');
    assert.ok(langBtn, 'toggle-lang button should exist in slot');
    assert.equal(langBtn.className, 'wb-icon-btn');
    assert.equal(langBtn.title, 'Language');

    const menu = (dropdown as any).querySelector('.vsc-lang-menu');
    assert.ok(menu);
    assert.equal(menu.hidden, true);

    // Click globe button
    (dropdown as any).dispatchEvent('click', langBtn);
    assert.equal(menu.hidden, false);

    // Select zh-CN
    const zhItem = menu.children.find((c: any) => c.dataset?.lang === 'zh-CN');
    assert.ok(zhItem);
    (dropdown as any).dispatchEvent('click', zhItem);
    assert.equal(selected, 'zh-CN');
    assert.equal(menu.hidden, true);
  });

  it('dropdown click stops propagation and avoids double toggle when embedded in toolbar', () => {
    initI18n('en');
    const bar = mountToolbar('preview', {
      onToggleMode: () => {},
      onOpenOptions: () => {},
    }, { parent: mockDocElement as unknown as HTMLElement });

    const dropdown = (bar as any).querySelector('.vsc-lang-dropdown');
    assert.ok(dropdown, 'dropdown should exist');
    const langBtn = dropdown.querySelector('button[data-action="toggle-lang"]');
    assert.ok(langBtn, 'langBtn should exist');
    const menu = dropdown.querySelector('.vsc-lang-menu');
    assert.ok(menu, 'menu should exist');
    assert.equal(menu.hidden, true);

    dropdown.dispatchEvent('click', langBtn);
    assert.equal(menu.hidden, false, 'menu should open on dropdown click');

    dropdown.dispatchEvent('click', langBtn);
    assert.equal(menu.hidden, true, 'menu should close on second click');
  });
});
