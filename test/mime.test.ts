import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getExtension,
  getMimeType,
  isBrowserViewable,
} from '../src/shared/mime';

describe('mime utilities', () => {
  describe('getExtension', () => {
    it('extracts extensions from simple and nested paths', () => {
      assert.equal(getExtension('doc.pdf'), 'pdf');
      assert.equal(getExtension('00-Intro/00-dedication-Dedication.pdf'), 'pdf');
      assert.equal(getExtension('/path/to/archive.tar.gz'), 'gz');
    });

    it('strips query and hash fragments', () => {
      assert.equal(getExtension('document.PDF#page=2'), 'pdf');
      assert.equal(getExtension('image.png?v=123#anchor'), 'png');
    });

    it('handles files without extensions or hidden dotfiles', () => {
      assert.equal(getExtension('Dockerfile'), '');
      assert.equal(getExtension('.gitignore'), '');
      assert.equal(getExtension('path/to/.bashrc'), '');
    });
  });

  describe('getMimeType', () => {
    it('resolves PDF, images, audio and video', () => {
      assert.equal(getMimeType('manual.pdf'), 'application/pdf');
      assert.equal(getMimeType('photo.PNG'), 'image/png');
      assert.equal(getMimeType('track.mp3'), 'audio/mpeg');
      assert.equal(getMimeType('video.mp4'), 'video/mp4');
    });

    it('resolves text and code files', () => {
      assert.equal(getMimeType('data.json'), 'application/json');
      assert.equal(getMimeType('notes.txt'), 'text/plain');
      assert.equal(getMimeType('script.py'), 'text/plain');
      assert.equal(getMimeType('index.ts'), 'text/plain');
    });

    it('resolves archives and binaries', () => {
      assert.equal(getMimeType('archive.zip'), 'application/zip');
      assert.equal(getMimeType('bundle.tar.gz'), 'application/gzip');
      assert.equal(getMimeType('setup.exe'), 'application/octet-stream');
    });

    it('falls back to default fallback for unknown extensions', () => {
      assert.equal(getMimeType('something.xyz123'), 'application/octet-stream');
      assert.equal(getMimeType('noext', 'custom/fallback'), 'custom/fallback');
    });
  });

  describe('isBrowserViewable', () => {
    it('identifies formats viewable in browser tabs', () => {
      assert.equal(isBrowserViewable('manual.pdf'), true);
      assert.equal(isBrowserViewable('pic.png'), true);
      assert.equal(isBrowserViewable('media.mp4'), true);
      assert.equal(isBrowserViewable('data.json'), true);
      assert.equal(isBrowserViewable('notes.txt'), true);
      assert.equal(isBrowserViewable('code.py'), true);
    });

    it('identifies formats requiring download or external app', () => {
      assert.equal(isBrowserViewable('release.zip'), false);
      assert.equal(isBrowserViewable('doc.docx'), false);
      assert.equal(isBrowserViewable('sheet.xlsx'), false);
      assert.equal(isBrowserViewable('installer.exe'), false);
    });
  });
});
