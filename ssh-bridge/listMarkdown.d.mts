/**
 * List previewable files under the session workspace via remote GNU find.
 * Throws if find is unavailable (no SFTP walk fallback).
 */
export function listMarkdown(
  session: {
    client: unknown;
    sftp: unknown;
    meta: { root: string };
  },
  rootRel?: string,
): Promise<Array<{ path: string; name: string; dir: string }>>;
