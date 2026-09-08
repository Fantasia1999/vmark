/**
 * Trigger a browser download of text content as a raw file.
 */
export function downloadRawFile(filename: string, content: string): void {
  const cleanName = filename.split(/[/\\]/).filter(Boolean).pop() || 'document.md';
  const isSvg = cleanName.toLowerCase().endsWith('.svg');
  const mimeType = isSvg ? 'image/svg+xml;charset=utf-8' : 'text/markdown;charset=utf-8';
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
