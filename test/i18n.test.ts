import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, setLocale, t, onLocaleChange, initI18n } from '../src/shared/i18n/index';

describe('i18n module', () => {
  beforeEach(() => {
    initI18n('en');
  });

  it('defaults to english (en)', () => {
    assert.equal(getLocale(), 'en');
    assert.equal(t('toolbar.preview'), 'Preview');
  });

  it('translates properly in english', () => {
    assert.equal(t('toolbar.source'), 'Source');
    assert.equal(t('toolbar.copyRaw'), 'Copy raw file');
    assert.equal(t('codeBlock.failed'), 'Copy failed');
  });

  it('interpolates parameters correctly', () => {
    assert.equal(t('source.lines', { count: 120 }), '120 lines');
  });

  it('switches to simplified chinese (zh-CN) and remembers', () => {
    setLocale('zh-CN');
    assert.equal(getLocale(), 'zh-CN');
    assert.equal(t('toolbar.preview'), '预览');
    assert.equal(t('toolbar.source'), '源码');
    assert.equal(t('toolbar.copyRaw'), '复制原始文件');
    assert.equal(t('codeBlock.failed'), '复制失败');
    assert.equal(t('source.lines', { count: 120 }), '120 行');
  });

  it('falls back to english when key is missing in zh-CN', () => {
    setLocale('zh-CN');
    // Using localeOverride or checking fallback logic
    assert.equal(t('nonexistent_key'), 'nonexistent_key');
  });

  it('notifies subscribers on locale change and allows unsubscribe', () => {
    const received: string[] = [];
    const unsubscribe = onLocaleChange((loc) => {
      received.push(loc);
    });

    setLocale('zh-CN');
    assert.deepEqual(received, ['zh-CN']);

    setLocale('en');
    assert.deepEqual(received, ['zh-CN', 'en']);

    unsubscribe();
    setLocale('zh-CN');
    // should not receive further updates
    assert.deepEqual(received, ['zh-CN', 'en']);
  });

  it('declaratively localizes DOM elements via localizeDom', () => {
    initI18n('en');
    class MockElement {
      dataset: Record<string, string> = {};
      textContent = '';
      innerHTML = '';
      title = '';
      placeholder = '';
      attributes: Record<string, string> = {};
      setAttribute(k: string, v: string) {
        this.attributes[k] = v;
      }
      getAttribute(k: string) {
        return this.attributes[k];
      }
    }

    const titleEl = new MockElement();
    titleEl.dataset.i18n = 'toolbar.preview';

    const inputEl = new MockElement();
    inputEl.dataset.i18nPlaceholder = 'workbench.searchPlaceholder';

    const btnEl = new MockElement();
    btnEl.dataset.i18nTitle = 'toolbar.optionsTitle';
    btnEl.dataset.i18nAria = 'toolbar.options';

    const mockRoot = {
      querySelectorAll(selector: string) {
        if (selector === '[data-i18n]') return [titleEl];
        if (selector === '[data-i18n-placeholder]') return [inputEl];
        if (selector === '[data-i18n-title]') return [btnEl];
        if (selector === '[data-i18n-aria]') return [btnEl];
        return [];
      },
    } as unknown as ParentNode;

    const { localizeDom } = require('../src/shared/i18n/index');
    localizeDom(mockRoot);

    assert.equal(titleEl.textContent, 'Preview');
    assert.equal(inputEl.placeholder, 'Search workspaces or files (/) ...');
    assert.equal(btnEl.title, 'Options & Settings');
    assert.equal(btnEl.getAttribute('aria-label'), 'Settings');

    setLocale('zh-CN');
    localizeDom(mockRoot);

    assert.equal(titleEl.textContent, '预览');
    assert.equal(inputEl.placeholder, '搜索工作区或文件 (/) ...');
    assert.equal(btnEl.title, '选项与设置');
    assert.equal(btnEl.getAttribute('aria-label'), '设置');
  });
});
