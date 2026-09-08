import { flashButtonFeedback, setButtonIcon, type IconName } from './icons';
import { t } from './i18n/index';

export const SOURCE_VIEW_CLASS = 'md-source-view';

export interface SourceViewOptions {
  fileName?: string;
  onCopyRaw?: () => void;
  onDownloadRaw?: () => void;
}

/** Format byte count into human-readable size (B, KB, MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(2) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/** Split into display lines; empty document → one blank line. */
export function splitSourceLines(text: string): string[] {
  if (text.length === 0) {
    return [''];
  }
  return text.split('\n');
}

/**
 * Fill `container` with a line-numbered source view.
 * Includes GitHub-style header with document metrics and raw copy/download buttons.
 * Replaces previous children. Adds {@link SOURCE_VIEW_CLASS}.
 */
export function renderSourceWithLineNumbers(
  container: HTMLElement,
  text: string,
  options?: SourceViewOptions,
): void {
  container.classList.add(SOURCE_VIEW_CLASS);

  const lines = splitSourceLines(text);
  const byteLength = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(text).length
    : text.length;

  const header = document.createElement('div');
  header.className = 'md-source-header';

  const stats = document.createElement('div');
  stats.className = 'md-source-stats';

  const lineCount = text.length === 0 ? 0 : lines.length;
  const linesSpan = document.createElement('span');
  linesSpan.className = 'md-source-lines';
  linesSpan.textContent = t('source.lines', { count: lineCount });

  const sepSpan = document.createElement('span');
  sepSpan.className = 'md-source-sep';
  sepSpan.textContent = '·';

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'md-source-size';
  sizeSpan.textContent = formatFileSize(byteLength);

  stats.append(linesSpan, sepSpan, sizeSpan);
  header.appendChild(stats);

  if (options?.onCopyRaw || options?.onDownloadRaw) {
    const actions = document.createElement('div');
    actions.className = 'md-source-actions';

    if (options.onCopyRaw) {
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'vsc-icon-btn md-source-btn-copy';
      copyBtn.title = t('source.copyTitle');
      copyBtn.setAttribute('aria-label', t('source.copyTitle'));
      setButtonIcon(copyBtn, 'copy', { label: t('source.copy') });
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        options.onCopyRaw?.();
        flashButtonFeedback(copyBtn, {
          idleIcon: 'copy',
          feedbackIcon: 'check',
          idleLabel: t('source.copy'),
          feedbackLabel: t('source.copied'),
          idleTitle: t('source.copyTitle'),
          feedbackTitle: t('source.copied'),
        });
      });
      actions.appendChild(copyBtn);
    }

    if (options.onDownloadRaw) {
      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'vsc-icon-btn md-source-btn-download';
      downloadBtn.title = t('source.downloadTitle');
      downloadBtn.setAttribute('aria-label', t('source.downloadTitle'));
      setButtonIcon(downloadBtn, 'download', { label: t('source.download') });
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        options.onDownloadRaw?.();
        flashButtonFeedback(downloadBtn, {
          idleIcon: 'download',
          feedbackIcon: 'check',
          idleLabel: t('source.download'),
          feedbackLabel: t('source.downloadStarted'),
          idleTitle: t('source.downloadTitle'),
          feedbackTitle: t('source.downloadStarted'),
        });
      });
      actions.appendChild(downloadBtn);
    }

    header.appendChild(actions);
  }

  const table = document.createElement('table');
  table.className = 'md-source-table';
  table.setAttribute('role', 'presentation');

  const frag = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    const tr = document.createElement('tr');
    tr.className = 'md-source-row';

    const ln = document.createElement('td');
    ln.className = 'md-source-ln';
    ln.textContent = String(i + 1);
    ln.setAttribute('data-line', String(i + 1));

    const code = document.createElement('td');
    code.className = 'md-source-line';
    // Keep empty rows tall; pre-wrap alone collapses zero-height cells
    const line = lines[i];
    code.textContent = line.length === 0 ? '\u00a0' : line;

    tr.append(ln, code);
    frag.appendChild(tr);
  }
  table.appendChild(frag);

  container.replaceChildren(header, table);
}

