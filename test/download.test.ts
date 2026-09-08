import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { downloadRawFile } from '../src/shared/download';

describe('download - downloadRawFile', () => {
  let origDocument: unknown;
  let origURL: unknown;
  let createdBlob: Blob | null = null;
  let createdUrl: string | null = null;
  let clicked = false;
  let downloadAttr: string | null = null;
  let hrefAttr: string | null = null;

  beforeEach(() => {
    createdBlob = null;
    createdUrl = null;
    clicked = false;
    downloadAttr = null;
    hrefAttr = null;

    origDocument = (globalThis as any).document;
    origURL = (globalThis as any).URL;

    (globalThis as any).URL = {
      createObjectURL(blob: Blob) {
        createdBlob = blob;
        createdUrl = 'blob:test-url-123';
        return createdUrl;
      },
      revokeObjectURL() {},
    };

    (globalThis as any).document = {
      body: {
        appendChild(child: any) {
          return child;
        },
      },
      createElement(tag: string) {
        if (tag === 'a') {
          return {
            set download(val: string) {
              downloadAttr = val;
            },
            get download() {
              return downloadAttr ?? '';
            },
            set href(val: string) {
              hrefAttr = val;
            },
            get href() {
              return hrefAttr ?? '';
            },
            click() {
              clicked = true;
            },
            remove() {},
          };
        }
        return {};
      },
    };
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).URL = origURL;
  });

  it('downloads markdown file with clean filename and UTF-8 markdown MIME', () => {
    downloadRawFile('/workspace/docs/guide.md', '# Hello Markdown');

    assert.equal(clicked, true);
    assert.equal(downloadAttr, 'guide.md');
    assert.equal(hrefAttr, 'blob:test-url-123');
    assert.ok(createdBlob);
    assert.equal(createdBlob.type, 'text/markdown;charset=utf-8');
  });

  it('downloads svg file with svg MIME type', () => {
    downloadRawFile('architecture.SVG', '<svg></svg>');

    assert.equal(clicked, true);
    assert.equal(downloadAttr, 'architecture.SVG');
    assert.ok(createdBlob);
    assert.equal(createdBlob.type, 'image/svg+xml;charset=utf-8');
  });

  it('falls back to document.md when filename is empty or slash only', () => {
    downloadRawFile('', 'some text');

    assert.equal(clicked, true);
    assert.equal(downloadAttr, 'document.md');
  });
});
