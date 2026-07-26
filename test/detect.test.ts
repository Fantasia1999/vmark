import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countMarkdownSignals,
  isLikelyMarkdownUrl,
  isMarkdownSourceDescriptor,
  looksLikeMarkdown,
  looksStronglyLikeMarkdown,
  type PageDescriptor,
} from '../src/content/detect';

function fileDesc(overrides: Partial<PageDescriptor> = {}): PageDescriptor {
  return {
    href: 'file:///home/user/notes.txt',
    protocol: 'file:',
    hostname: '',
    pathname: '/home/user/notes.txt',
    contentType: 'text/plain',
    ...overrides,
  };
}

describe('isMarkdownSourceDescriptor — URL policy', () => {
  it('auto-previews local .md by extension without content checks', () => {
    assert.equal(
      isMarkdownSourceDescriptor(
        fileDesc({
          href: 'file:///home/user/readme.md',
          pathname: '/home/user/readme.md',
        }),
      ),
      true,
    );
  });

  it('handles .markdown/.mdx/.mkd extensions and query/hash suffixes', () => {
    for (const name of ['a.markdown', 'a.mdx', 'a.mkd', 'a.md#sec', 'a.md?x=1']) {
      assert.equal(
        isMarkdownSourceDescriptor(
          fileDesc({ href: `file:///d/${name}`, pathname: `/d/${name}` }),
        ),
        true,
        name,
      );
    }
  });

  it('accepts percent-encoded markdown paths', () => {
    assert.equal(
      isMarkdownSourceDescriptor(
        fileDesc({
          href: 'file:///home/user/%E7%AC%94%E8%AE%B0.md',
          pathname: '/home/user/%E7%AC%94%E8%AE%B0.md',
        }),
      ),
      true,
    );
  });

  it('previews markdown on GitHub raw hosts', () => {
    assert.equal(
      isMarkdownSourceDescriptor({
        href: 'https://raw.githubusercontent.com/o/r/main/README.md',
        protocol: 'https:',
        hostname: 'raw.githubusercontent.com',
        pathname: '/o/r/main/README.md',
      }),
      true,
    );
  });

  it('leaves SVG on GitHub raw hosts to the browser', () => {
    assert.equal(
      isMarkdownSourceDescriptor({
        href: 'https://raw.githubusercontent.com/o/r/main/logo.svg',
        protocol: 'https:',
        hostname: 'raw.githubusercontent.com',
        pathname: '/o/r/main/logo.svg',
      }),
      false,
    );
  });

  it('never hijacks arbitrary http(s) pages, even .md-looking ones', () => {
    assert.equal(
      isMarkdownSourceDescriptor({
        href: 'https://example.com/docs/readme.md',
        protocol: 'https:',
        hostname: 'example.com',
        pathname: '/docs/readme.md',
      }),
      false,
    );
  });

  it('trusts a markdown contentType on file://', () => {
    assert.equal(
      isMarkdownSourceDescriptor(fileDesc({ contentType: 'text/markdown' })),
      true,
    );
  });
});

describe('isMarkdownSourceDescriptor — .txt false positives (regression)', () => {
  it('does NOT hijack a .txt just because of its extension', () => {
    // wslPaths.isMarkdownPath counts .txt as markdown; detection must not.
    assert.equal(
      isMarkdownSourceDescriptor(fileDesc({ singlePreText: 'hello world\nplain text' })),
      false,
    );
  });

  it('does NOT hijack a .txt containing only a link', () => {
    assert.equal(
      isMarkdownSourceDescriptor(
        fileDesc({ singlePreText: 'see [ticket](JIRA-123) for details' }),
      ),
      false,
    );
  });

  it('does NOT hijack a log file with dash-prefixed lines', () => {
    assert.equal(
      isMarkdownSourceDescriptor(
        fileDesc({ singlePreText: '- 12:00 started\n- 12:01 stopped\n- 12:02 done' }),
      ),
      false,
    );
  });

  it('DOES preview a .txt whose content strongly looks like markdown', () => {
    assert.equal(
      isMarkdownSourceDescriptor(
        fileDesc({
          singlePreText: '# Title\n\n- item one\n- item two\n\n```js\ncode\n```',
        }),
      ),
      true,
    );
  });
});

describe('markdown signal counting', () => {
  it('counts distinct marker kinds, not repeats', () => {
    assert.equal(countMarkdownSignals('- a\n- b\n- c'), 1);
    assert.equal(countMarkdownSignals('# h\n- a'), 2);
    assert.equal(countMarkdownSignals(''), 0);
  });

  it('loose check accepts a single marker; strict requires two', () => {
    const single = '> quoted note';
    assert.equal(looksLikeMarkdown(single), true);
    assert.equal(looksStronglyLikeMarkdown(single), false);
    const double = '# Title\n> quoted note';
    assert.equal(looksStronglyLikeMarkdown(double), true);
  });

  it('only samples the first 4KB', () => {
    const farAway = `${'x'.repeat(5000)}\n# heading\n- list`;
    assert.equal(countMarkdownSignals(farAway), 0);
  });
});

describe('isLikelyMarkdownUrl (prehide guard)', () => {
  it('matches local .md files', () => {
    assert.equal(
      isLikelyMarkdownUrl('file:///a/b.md', 'file:', '', '/a/b.md'),
      true,
    );
  });

  it('does not pre-hide .txt files (content unknown at document_start)', () => {
    assert.equal(
      isLikelyMarkdownUrl('file:///a/b.txt', 'file:', '', '/a/b.txt'),
      false,
    );
  });

  it('matches GitHub raw markdown but not other https hosts', () => {
    assert.equal(
      isLikelyMarkdownUrl(
        'https://raw.githubusercontent.com/o/r/m/x.md',
        'https:',
        'raw.githubusercontent.com',
        '/o/r/m/x.md',
      ),
      true,
    );
    assert.equal(
      isLikelyMarkdownUrl('https://example.com/x.md', 'https:', 'example.com', '/x.md'),
      false,
    );
  });

  it('matches WSL file URLs with markdown extension', () => {
    assert.equal(
      isLikelyMarkdownUrl(
        'file://wsl.localhost/Ubuntu/home/u/a.md',
        'file:',
        'wsl.localhost',
        '/Ubuntu/home/u/a.md',
      ),
      true,
    );
  });
});
