/**
 * Export rendered Mermaid diagrams as PNG/JPG (clipboard when possible).
 */

import { t } from '../shared/i18n/index';

function findSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('svg');
}

function resolveExportSize(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;

  // CSS zoom on preview root shrinks getBoundingClientRect — prefer intrinsic size
  const attrW = Number(svg.getAttribute('width'));
  const attrH = Number(svg.getAttribute('height'));
  if ((!width || !height) && attrW > 0 && attrH > 0) {
    width = attrW;
    height = attrH;
  }

  if (!width || !height) {
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width && vb.height) {
      width = vb.width;
      height = vb.height;
    }
  }
  if (!width || !height) {
    try {
      const bbox = svg.getBBox();
      width = bbox.width || width;
      height = bbox.height || height;
    } catch {
      // getBBox can throw if not in DOM
    }
  }

  // If zoom distorted rect, prefer larger of viewBox vs rect
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    width = Math.max(width || 0, vb.width);
    height = Math.max(height || 0, vb.height);
  }

  width = Math.max(1, Math.ceil(width || 800));
  height = Math.max(1, Math.ceil(height || 600));
  return { width, height };
}

function pageBackgroundColor(): string {
  const body = document.body;
  const bg = getComputedStyle(body).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    return bg;
  }
  const root = document.getElementById('vscode-md-preview-root');
  if (root) {
    const rootBg = getComputedStyle(root).backgroundColor;
    if (rootBg && rootBg !== 'rgba(0, 0, 0, 0)' && rootBg !== 'transparent') {
      return rootBg;
    }
  }
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
    return htmlBg;
  }
  if (
    body.classList.contains('vscode-dark') ||
    document.documentElement.dataset.theme === 'dark'
  ) {
    return '#1e1e1e';
  }
  return '#ffffff';
}

function prepareSvgClone(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  // Ensure text is readable when rasterized
  if (!clone.style.fontFamily) {
    clone.style.fontFamily =
      getComputedStyle(document.body).fontFamily ||
      'system-ui, -apple-system, "Segoe UI", sans-serif';
  }

  // Inline currentColor / CSS custom props that often fail after clone → canvas
  try {
    const computed = getComputedStyle(svg);
    if (!clone.style.color && computed.color) {
      clone.style.color = computed.color;
    }
    if (!clone.getAttribute('color') && computed.color) {
      clone.setAttribute('color', computed.color);
    }
  } catch {
    // ignore
  }

  const xml = new XMLSerializer().serializeToString(clone);
  // XMLSerializer sometimes omits xmlns on root in edge cases
  if (!/\sxmlns=/.test(xml)) {
    return xml.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return xml;
}

function loadImageFromSvgXml(xml: string): Promise<HTMLImageElement> {
  // data: URL is more reliable than blob: for SVG→canvas across Chromium builds
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = new Image();
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法将 Mermaid SVG 转为位图'));
    img.src = url;
  });
}

async function svgToBlob(
  svg: SVGSVGElement,
  type: 'image/png' | 'image/jpeg',
  scale = 2,
): Promise<Blob> {
  const { width, height } = resolveExportSize(svg);
  const xml = prepareSvgClone(svg, width, height);
  const img = await loadImageFromSvgXml(xml);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 不可用');
  }

  // JPEG has no alpha — always fill. PNG: fill page bg so paste targets look solid.
  ctx.fillStyle = pageBackgroundColor();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('导出图片失败'))),
      type,
      type === 'image/jpeg' ? 0.92 : undefined,
    );
  });
  return blob;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Chromium clipboard image write is reliable only for image/png.
 * Prefer ClipboardItem with a Promise blob (required by some Chrome versions).
 */
async function writePngToClipboard(png: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('clipboard API unavailable');
  }
  const item = new ClipboardItem({
    'image/png': Promise.resolve(png),
  });
  await navigator.clipboard.write([item]);
}

async function copyImageBlob(
  blob: Blob,
  preferredDownloadExt: 'png' | 'jpg',
): Promise<'clipboard' | 'download'> {
  // Always try PNG on clipboard (JPEG type key is rejected by most browsers)
  let png = blob;
  if (blob.type !== 'image/png') {
    // Re-encode via bitmap if we somehow got jpeg for clipboard attempt
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d');
      if (!ctx) {
        throw new Error('no ctx');
      }
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      png = await new Promise<Blob>((resolve, reject) => {
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('png convert failed'))), 'image/png');
      });
    } catch {
      png = blob;
    }
  }

  try {
    await writePngToClipboard(png.type === 'image/png' ? png : blob);
    return 'clipboard';
  } catch (e) {
    console.warn('[vscode-md-preview] clipboard write failed, falling back to download', e);
  }

  const ext = preferredDownloadExt;
  const name = `mermaid-diagram.${ext}`;
  downloadBlob(blob, name);
  return 'download';
}

function setButtonFeedback(btn: HTMLButtonElement, text: string, ms = 1800): void {
  const prev = btn.dataset.label || btn.textContent || '';
  if (!btn.dataset.label) {
    btn.dataset.label = prev;
  }
  btn.textContent = text;
  btn.disabled = true;
  window.setTimeout(() => {
    btn.textContent = btn.dataset.label || prev;
    btn.disabled = false;
  }, ms);
}

async function exportDiagram(
  container: HTMLElement,
  format: 'png' | 'jpg',
  btn: HTMLButtonElement,
): Promise<void> {
  const svg = findSvg(container);
  if (!svg) {
    setButtonFeedback(btn, t('mermaid.noDiagram'));
    return;
  }

  btn.disabled = true;
  try {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const blob = await svgToBlob(svg, type, 2);
    const how = await copyImageBlob(blob, format === 'jpg' ? 'jpg' : 'png');
    if (how === 'clipboard') {
      setButtonFeedback(btn, t('mermaid.copied'));
    } else {
      setButtonFeedback(btn, t('mermaid.downloaded'));
    }
  } catch (e) {
    console.error('[vscode-md-preview] mermaid export failed', e);
    setButtonFeedback(btn, t('mermaid.failed'));
  }
}

export function attachMermaidExportButtons(nodes: HTMLElement[]): void {
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    // Remove stale bars if re-rendering the same node identity is reused
    node.querySelectorAll(':scope > .mermaid-export').forEach((el) => el.remove());

    const svg = findSvg(node);
    if (!svg) {
      continue;
    }

    node.classList.add('mermaid-has-export');

    const bar = document.createElement('div');
    bar.className = 'mermaid-export';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', t('mermaid.exportGroup'));

    const pngBtn = document.createElement('button');
    pngBtn.type = 'button';
    pngBtn.className = 'mermaid-export-btn';
    pngBtn.textContent = 'PNG';
    pngBtn.title = t('mermaid.copyPng');
    pngBtn.setAttribute('aria-label', t('mermaid.copyPngAria'));
    pngBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void exportDiagram(node, 'png', pngBtn);
    });

    const jpgBtn = document.createElement('button');
    jpgBtn.type = 'button';
    jpgBtn.className = 'mermaid-export-btn';
    jpgBtn.textContent = 'JPG';
    jpgBtn.title = t('mermaid.copyJpg');
    jpgBtn.setAttribute('aria-label', t('mermaid.copyJpgAria'));
    jpgBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void exportDiagram(node, 'jpg', jpgBtn);
    });

    bar.append(pngBtn, jpgBtn);
    // Place bar as first child so it paints above SVG in some stacking contexts
    node.insertBefore(bar, node.firstChild);
  }
}
