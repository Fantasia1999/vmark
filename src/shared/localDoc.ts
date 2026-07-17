/** Session storage payload for a user-opened local Markdown file. */
export const LOCAL_DOC_STORAGE_KEY = 'localPreviewDoc';

export interface LocalMarkdownDoc {
  /** Display name, e.g. README.md */
  name: string;
  /** Full markdown source */
  content: string;
  /** Epoch ms when opened */
  openedAt: number;
  /** Optional last-modified from File.lastModified */
  lastModified?: number;
  /** File size in bytes (informational) */
  size?: number;
}

export async function saveLocalDoc(doc: LocalMarkdownDoc): Promise<void> {
  await chrome.storage.session.set({ [LOCAL_DOC_STORAGE_KEY]: doc });
}

export async function loadLocalDoc(): Promise<LocalMarkdownDoc | null> {
  const result = await chrome.storage.session.get(LOCAL_DOC_STORAGE_KEY);
  const doc = result[LOCAL_DOC_STORAGE_KEY] as LocalMarkdownDoc | undefined;
  if (!doc || typeof doc.content !== 'string' || typeof doc.name !== 'string') {
    return null;
  }
  return doc;
}

export async function clearLocalDoc(): Promise<void> {
  await chrome.storage.session.remove(LOCAL_DOC_STORAGE_KEY);
}

export const MD_ACCEPT =
  '.md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/x-markdown,text/plain';

export function isMarkdownFileName(name: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(name);
}

export async function readFileAsLocalDoc(file: File): Promise<LocalMarkdownDoc> {
  const content = await file.text();
  return {
    name: file.name || 'untitled.md',
    content,
    openedAt: Date.now(),
    lastModified: file.lastModified,
    size: file.size,
  };
}
