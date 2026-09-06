import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownPreviewEngine } from '../src/preview/engine';
import { DEFAULT_SETTINGS, type PreviewSettings } from '../src/preview/config';

function createEngine(overrides: Partial<PreviewSettings> = {}): MarkdownPreviewEngine {
  return new MarkdownPreviewEngine({
    ...DEFAULT_SETTINGS,
    ...overrides,
  });
}

describe('Markdown HTML rendering', () => {
  it('has html: true enabled by default in DEFAULT_SETTINGS', () => {
    assert.equal(DEFAULT_SETTINGS.html, true);
  });

  it('renders standard HTML tags when html is true', () => {
    const engine = createEngine({ html: true });
    const md = `
# Title

<div align="center">
  <p>Centered paragraph with <b>bold</b> and <span style="color: red;">red text</span></p>
</div>

<details>
  <summary>Click to see details</summary>
  <p>Hidden content with <kbd>Ctrl</kbd> + <kbd>C</kbd> and <mark>highlight</mark></p>
</details>
`;
    const out = engine.render(md);
    assert.ok(out.html.includes('<div align="center">'), 'includes div with align attribute');
    assert.ok(out.html.includes('<details>'), 'includes details tag');
    assert.ok(out.html.includes('<summary>Click to see details</summary>'), 'includes summary tag');
    assert.ok(out.html.includes('<kbd>Ctrl</kbd>'), 'includes kbd tag');
    assert.ok(out.html.includes('<mark>highlight</mark>'), 'includes mark tag');
    assert.ok(out.html.includes('style="color: red;"') || out.html.includes('style="color:red"'), 'preserves safe inline style');
  });

  it('escapes HTML tags as plain text when html is false', () => {
    const engine = createEngine({ html: false });
    const md = `
<details>
  <summary>Click me</summary>
  <p>Hidden</p>
</details>
<kbd>Cmd</kbd>
`;
    const out = engine.render(md);
    assert.ok(!out.html.includes('<details>'), 'does not contain raw details tag');
    assert.ok(out.html.includes('&lt;details&gt;'), 'escapes details tag');
    assert.ok(out.html.includes('&lt;summary&gt;'), 'escapes summary tag');
    assert.ok(out.html.includes('&lt;kbd&gt;'), 'escapes kbd tag');
  });

  it('sanitizes malicious script tags and inline event handlers', () => {
    const engine = createEngine({ html: true });
    const md = `
<script>alert("xss")</script>
<img src="test.jpg" onerror="alert('hack')" />
<a href="javascript:alert(1)">click me</a>
`;
    const out = engine.render(md);
    assert.ok(!out.html.includes('<script>'), 'strips script tag');
    assert.ok(!out.html.includes('alert("xss")'), 'strips script content');
    assert.ok(!out.html.includes('onerror'), 'strips onerror attribute');
  });

  it('preserves KaTeX math and Markdown features while HTML is enabled', () => {
    const engine = createEngine({ html: true, mathEnabled: true });
    const md = `
Here is inline math: $E = mc^2$

<details><summary>Math details</summary>
$$
\\frac{a}{b}
$$
</details>
`;
    const out = engine.render(md);
    assert.ok(out.html.includes('<details>'), 'details rendered');
    assert.ok(out.html.includes('katex') || out.html.includes('math'), 'katex rendered');
  });
});
