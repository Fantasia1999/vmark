import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSidebarWidth,
  CONTENT_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../src/viewer/sidebar';

describe('clampSidebarWidth', () => {
  const VIEWPORT = 1400;

  it('passes through widths inside the bounds', () => {
    assert.equal(clampSidebarWidth(300, VIEWPORT), 300);
    assert.equal(clampSidebarWidth(SIDEBAR_MIN_WIDTH, VIEWPORT), SIDEBAR_MIN_WIDTH);
    assert.equal(clampSidebarWidth(SIDEBAR_MAX_WIDTH, VIEWPORT), SIDEBAR_MAX_WIDTH);
  });

  it('clamps below the minimum', () => {
    assert.equal(clampSidebarWidth(10, VIEWPORT), SIDEBAR_MIN_WIDTH);
    assert.equal(clampSidebarWidth(-50, VIEWPORT), SIDEBAR_MIN_WIDTH);
  });

  it('clamps above the maximum', () => {
    assert.equal(clampSidebarWidth(2000, VIEWPORT), SIDEBAR_MAX_WIDTH);
  });

  it('keeps room for the content pane on narrow windows', () => {
    const viewport = 700;
    const clamped = clampSidebarWidth(600, viewport);
    assert.equal(clamped, viewport - CONTENT_MIN_WIDTH);
  });

  it('never returns less than the minimum, even on tiny windows', () => {
    assert.equal(clampSidebarWidth(500, 400), SIDEBAR_MIN_WIDTH);
  });

  it('falls back to the default for non-finite input', () => {
    assert.equal(clampSidebarWidth(Number.NaN, VIEWPORT), SIDEBAR_DEFAULT_WIDTH);
    assert.equal(
      clampSidebarWidth(Number.POSITIVE_INFINITY, VIEWPORT),
      SIDEBAR_DEFAULT_WIDTH,
    );
  });

  it('rounds fractional pixel values', () => {
    assert.equal(clampSidebarWidth(300.6, VIEWPORT), 301);
  });
});
