export const PREVIEW_PATTERNS: string[];

export function shellQuote(value: unknown): string;

export function buildRemoteFindCommand(
  root: string,
  options?: {
    maxDepth?: number;
    maxFiles?: number;
    skip?: Iterable<string>;
    patterns?: Iterable<string>;
  },
): string;

export interface RemotePreviewFile {
  path: string;
  name: string;
  dir: string;
}

export function parseRemoteFindOutput(
  output: Uint8Array,
  root: string,
  maxFiles?: number,
): RemotePreviewFile[];
