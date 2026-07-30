export function listMarkdown(
  session: {
    client: unknown;
    sftp: unknown;
    meta: { root: string };
  },
  rootRel?: string,
): Promise<Array<{ path: string; name: string; dir: string }>>;
