#!/usr/bin/env node
/**
 * Thin SSH workspace diagnostics — reuses bridge modules, does not reimplement them.
 *
 * Usage:
 *   npm run diagnose:ssh -- <ssh-alias> <remote-root>
 *   DIAG_BRIDGE_API=1 npm run diagnose:ssh -- <alias> <root>
 *   DIAG_API_ONLY=1 DIAG_BRIDGE_API=1 npm run diagnose:ssh -- <alias> <root>
 *
 * Default path: resolve OpenSSH alias, sample root readdir, run remote GNU find
 * (required for SSH workspace listing; no SFTP walk fallback).
 * DIAG_BRIDGE_API=1 also spins up server.mjs and hits /connect + /list + /read.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  listOpenSshHosts,
  resolveOpenSshConnection,
} from '../ssh-bridge/opensshConfig.mjs';
import {
  MAX_DEPTH,
  MAX_MD,
  SKIP,
} from '../ssh-bridge/previewConstants.mjs';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
} from '../ssh-bridge/remoteFind.mjs';

const require = createRequire(
  fileURLToPath(new URL('../ssh-bridge/package.json', import.meta.url)),
);
const { Client } = require('ssh2');

const [, , sshAlias, remoteRootArg] = process.argv;

if (!sshAlias || !remoteRootArg) {
  console.error(
    'Usage: node scripts/diagnose-ssh-workspace.mjs <ssh-alias> <remote-root>',
  );
  process.exit(2);
}

const TIMEOUT_MS = Number(process.env.DIAG_TIMEOUT_MS || 30000);

function sftpCall(sftp, method, ...args) {
  return new Promise((resolve, reject) => {
    sftp[method](...args, (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

function connectSftp(options) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      client.end();
      reject(new Error(`SSH/SFTP connection timed out after ${TIMEOUT_MS} ms`));
    }, TIMEOUT_MS);

    client
      .once('ready', () => {
        client.sftp((error, sftp) => {
          clearTimeout(timer);
          if (error) {
            client.end();
            reject(error);
          } else {
            resolve({ client, sftp });
          }
        });
      })
      .once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      })
      .connect(options);
  });
}

function execRemote(client, command) {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      const chunks = [];
      const stderr = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.stderr.on('data', (chunk) => stderr.push(chunk));
      stream.on('error', reject);
      stream.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(
            new Error(
              `remote command failed (${code}): ${Buffer.concat(stderr).toString('utf8')}`,
            ),
          );
        }
      });
    });
  });
}

function octalMode(entry) {
  return typeof entry.attrs?.mode === 'number'
    ? `0${entry.attrs.mode.toString(8)}`
    : 'unset';
}

async function exerciseBridgeApi(alias, remoteRoot) {
  const port = Number(
    process.env.DIAG_BRIDGE_PORT || 18000 + crypto.randomInt(1000),
  );
  const token = crypto.randomBytes(18).toString('hex');
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverPath = fileURLToPath(
    new URL('../ssh-bridge/server.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      TOKEN: token,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  const headers = { 'X-Bridge-Token': token };

  try {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const health = await fetch(`${baseUrl}/health`, { headers });
        if (health.ok) {
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const hostsResponse = await fetch(`${baseUrl}/ssh/hosts`, { headers });
    const hostsBody = await hostsResponse.json();
    if (!hostsResponse.ok) {
      throw new Error(
        `/ssh/hosts failed (${hostsResponse.status}): ${hostsBody.error}`,
      );
    }
    if (!hostsBody.hosts.includes(alias)) {
      throw new Error(`OpenSSH Host list does not contain "${alias}"`);
    }

    const connectResponse = await fetch(`${baseUrl}/connect`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: alias,
        authMode: 'openssh',
        root: remoteRoot,
      }),
    });
    const connectBody = await connectResponse.json();
    if (!connectResponse.ok) {
      throw new Error(
        `/connect failed (${connectResponse.status}): ${connectBody.error}`,
      );
    }

    const started = Date.now();
    const listResponse = await fetch(`${baseUrl}/list`, { headers });
    const listBody = await listResponse.json();
    const elapsedMs = Date.now() - started;
    if (!listResponse.ok) {
      throw new Error(`/list failed (${listResponse.status}): ${listBody.error}`);
    }

    let firstReadBytes = null;
    if (listBody.files.length > 0) {
      const readResponse = await fetch(
        `${baseUrl}/read?path=${encodeURIComponent(listBody.files[0].path)}`,
        { headers },
      );
      const readBody = await readResponse.json();
      if (!readResponse.ok) {
        throw new Error(`/read failed (${readResponse.status}): ${readBody.error}`);
      }
      firstReadBytes = readBody.size;
    }

    console.log(
      JSON.stringify(
        {
          phase: 'bridge-api',
          connectOk: connectBody.ok,
          authMode: connectBody.meta.authMode || 'openssh',
          listedHostCount: hostsBody.hosts.length,
          root: connectBody.meta.root,
          listFileCount: listBody.files.length,
          listElapsedMs: elapsedMs,
          firstPath: listBody.files[0]?.path || null,
          firstReadBytes,
        },
        null,
        2,
      ),
    );
  } finally {
    child.kill('SIGINT');
  }
}

const resolved = await resolveOpenSshConnection(sshAlias);
console.log(
  JSON.stringify(
    {
      phase: 'resolved-ssh-config',
      alias: resolved.alias,
      host: resolved.host,
      port: resolved.port,
      username: resolved.username,
      identityFile: resolved.identityFile || null,
      agent: resolved.agent ? true : false,
      listedHosts: listOpenSshHosts().length,
      remoteRoot: remoteRootArg,
      timeoutMs: TIMEOUT_MS,
    },
    null,
    2,
  ),
);

if (process.env.DIAG_BRIDGE_API === '1') {
  await exerciseBridgeApi(sshAlias, remoteRootArg);
  if (process.env.DIAG_API_ONLY === '1') {
    process.exit(0);
  }
}

const { client, sftp } = await connectSftp({
  host: resolved.host,
  port: resolved.port,
  username: resolved.username,
  privateKey: resolved.privateKey,
  passphrase: resolved.passphrase,
  agent: resolved.agent,
  readyTimeout: TIMEOUT_MS,
  keepaliveInterval: 15000,
  keepaliveCountMax: 2,
});

try {
  const root = await sftpCall(sftp, 'realpath', remoteRootArg);
  const rootEntries = await sftpCall(sftp, 'readdir', root);
  console.log(
    JSON.stringify(
      {
        phase: 'root-readdir',
        root,
        entryCount: rootEntries.length,
        sample: rootEntries.slice(0, 30).map((entry) => ({
          name: entry.filename,
          longnamePrefix: String(entry.longname || '').slice(0, 10),
          mode: octalMode(entry),
        })),
      },
      null,
      2,
    ),
  );

  const remoteFindStarted = Date.now();
  try {
    const remoteFindOutput = await execRemote(
      client,
      buildRemoteFindCommand(root, {
        maxDepth: MAX_DEPTH,
        maxFiles: MAX_MD,
        skip: SKIP,
      }),
    );
    const remoteFindFiles = parseRemoteFindOutput(remoteFindOutput, root, MAX_MD);
    console.log(
      JSON.stringify(
        {
          phase: 'remote-bulk-list',
          ok: true,
          fileCount: remoteFindFiles.length,
          sampleFiles: remoteFindFiles.slice(0, 20).map((file) => file.path),
          elapsedMs: Date.now() - remoteFindStarted,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          phase: 'remote-bulk-list',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - remoteFindStarted,
          note:
            'SSH workspace listing requires GNU find on a Linux remote; no SFTP walk fallback.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
} finally {
  client.end();
}
