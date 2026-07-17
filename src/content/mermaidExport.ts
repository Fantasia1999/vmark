/**
 * Export rendered Mermaid diagrams as PNG/JPG (clipboard when possible).
 */

function findSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('svg');
}

function resolveExportSize(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;

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
  const rootBg = getComputedStyle(document.documentElement).backgroundColor;
  if (rootBg && rootBg !== 'rgba(0, 0, 0, 0)' && rootBg !== 'transparent') {
    return rootBg;
  }
  // Fallbacks matching extension themes
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

  const xml = new XMLSerializer().serializeToString(clone);
  return xml;
}

async function svgToBlob(
  svg: SVGSVGElement,
  type: 'image/png' | 'image/jpeg',
  scale = 2,
): Promise<Blob> {
  const { width, height } = resolveExportSize(svg);
  const xml = prepareSvgClone(svg, width, height);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    // blob: URL is same-origin for canvas
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('无法将 Mermaid SVG 转为位图'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 不可用');
    }

    // JPEG has no alpha — fill solid background; PNG keeps transparency unless we fill
    if (type === 'image/jpeg') {
      ctx.fillStyle = pageBackgroundColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Optional light backdrop for PNG so dark-theme diagrams stay clear on white pages
      // Keep transparent for PNG so it matches preview.
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('导出图片失败'))),
        type,
        type === 'image/jpeg' ? 0.92 : undefined,
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
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

async function copyImageBlob(blob: Blob): Promise<'clipboard' | 'download'> {
  // Chromium clipboard write typically supports image/png well; jpeg is flaky.
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      return 'clipboard';
    } catch {
      // fall through
    }
    // If jpeg failed, try converting path: some browsers only accept png type key
    if (blob.type === 'image/jpeg') {
      try {
        // Re-wrap as png is wrong content-type; skip — download instead
      } catch {
        // ignore
      }
    }
  }

  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
  downloadBlob(blob, `mermaid-diagram.${ext}`);
  return 'download';
}

function setButtonFeedback(btn: HTMLButtonElement, text: string, ms = 1600): void {
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
    setButtonFeedback(btn, '无图');
    return;
  }

  btn.disabled = true;
  try {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const blob = await svgToBlob(svg, type, 2);
    const how = await copyImageBlob(blob);
    if (how === 'clipboard') {
      setButtonFeedback(btn, '已复制');
    } else {
      setButtonFeedback(btn, '已下载');
    }
  } catch (e) {
    console.error('[vscode-md-preview] mermaid export failed', e);
    setButtonFeedback(btn, '失败');
  }
}

export function attachMermaidExportButtons(nodes: HTMLElement[]): void {
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.querySelector(':scope > .mermaid-export')) {
      continue;
    }
    const svg = findSvg(node);
    if (!svg) {
      continue;
    }

    node.classList.add('mermaid-has-export');

    const bar = document.createElement('div');
    bar.className = 'mermaid-export';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', '导出 Mermaid 图');

    const pngBtn = document.createElement('button');
    pngBtn.type = 'button';
    pngBtn.className = 'mermaid-export-btn';
    pngBtn.textContent = 'PNG';
    pngBtn.title = '复制为 PNG（不支持剪贴板时将下载）';
    pngBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void exportDiagram(node, 'png', pngBtn);
    });

    const jpgBtn = document.createElement('button');
    jpgBtn.type = 'button';
    jpgBtn.className = 'mermaid-export-btn';
    jpgBtn.textContent = 'JPG';
    jpgBtn.title = '复制为 JPG（不支持剪贴板时将下载）';
    jpgBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void exportDiagram(node, 'jpg', jpgBtn);
    });

    bar.append(pngBtn, jpgBtn);
    node.appendChild(bar);
  }
}
