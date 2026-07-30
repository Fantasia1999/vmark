export const S_IFMT: number;
export const S_IFDIR: number;
export const S_IFREG: number;
export const S_IFLNK: number;

export interface SftpEntryLike {
  attrs?: {
    mode?: number;
    isDirectory?: () => boolean;
    isFile?: () => boolean;
    isSymbolicLink?: () => boolean;
  };
  longname?: string;
}

export function classifySftpEntry(
  entry: SftpEntryLike,
): 'dir' | 'file' | 'unknown';

export function attrsLookLikeDir(attrs: SftpEntryLike['attrs']): boolean;
