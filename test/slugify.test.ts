import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { githubSlugifier } from '../src/preview/slugify';

describe('githubSlugifier.fromHeading', () => {
  it('lowercases and hyphenates spaces', () => {
    assert.equal(githubSlugifier.fromHeading('Hello World').value, 'hello-world');
  });

  it('strips punctuation but keeps CJK, digits, hyphen, underscore', () => {
    assert.equal(githubSlugifier.fromHeading('第 1 章：入门!').value, '第-1-章入门');
    assert.equal(githubSlugifier.fromHeading('a_b-c').value, 'a_b-c');
  });

  it('produces empty slug for punctuation-only headings', () => {
    assert.equal(githubSlugifier.fromHeading('!!!').value, '');
  });
});

describe('githubSlugifier.createBuilder — de-duplication (regression)', () => {
  it('appends -N for duplicate headings', () => {
    const b = githubSlugifier.createBuilder();
    assert.equal(b.add('Foo').value, 'foo');
    assert.equal(b.add('Foo').value, 'foo-1');
    assert.equal(b.add('Foo').value, 'foo-2');
  });

  it('never collides with an explicit heading named like a deduped slug', () => {
    // Old bug: Foo, Foo, Foo-1 produced foo, foo-1, foo-1 (duplicate id)
    const b = githubSlugifier.createBuilder();
    const ids = [b.add('Foo').value, b.add('Foo').value, b.add('Foo-1').value];
    assert.equal(new Set(ids).size, ids.length, `ids not unique: ${ids.join(', ')}`);
  });

  it('handles the reverse order too (Foo-1 first)', () => {
    const b = githubSlugifier.createBuilder();
    const ids = [b.add('Foo-1').value, b.add('Foo').value, b.add('Foo').value];
    assert.equal(new Set(ids).size, ids.length, `ids not unique: ${ids.join(', ')}`);
  });

  it('deduplicates independent duplicate groups', () => {
    const b = githubSlugifier.createBuilder();
    const ids = ['A', 'B', 'A', 'B', 'A'].map((h) => b.add(h).value);
    assert.equal(new Set(ids).size, ids.length);
  });
});
