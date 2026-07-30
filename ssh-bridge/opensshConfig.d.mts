export function parseOpenSshConfig(output: string): Map<string, string[]>;

export function expandOpenSshPath(
  value: string,
  connection?: { host?: string; port?: number; username?: string },
): string;

export function listOpenSshHosts(configFile?: string): string[];

export interface ResolvedOpenSshConnection {
  alias: string;
  host: string;
  port: number;
  username: string;
  privateKey?: Buffer;
  passphrase?: string;
  agent?: string;
  identityFile?: string;
}

export function resolveOpenSshConnection(
  alias: string,
  passphrase?: string,
): Promise<ResolvedOpenSshConnection>;
