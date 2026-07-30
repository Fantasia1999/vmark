#!/usr/bin/env node
/**
 * Diagnose the SSH workspace listing path without changing the remote host.
 *
 * Usage:
 *   npm run diagnose:ssh -- <ssh-alias> <remote-root>
 *   DIAG_BRIDGE_API=1 DIAG_API_ONLY=1 npm run diagnose:ssh -- <alias> <root>
 *
 * The script resolves an OpenSSH host alias with `ssh -G`, connects through
 * ssh2/SFTP, prints the raw attributes returned by the server, then compares
 * the bridge's current directory test with the defensive classifier.
 */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '../ssh-bridge/node_modules/ssh2/lib/index.js';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
} from '../ssh-bridge/remoteFind.mjs';
import { classifySftpEntry } from '../ssh-bridge/sftpEntry.mjs';

const [, , sshAlias, remoteRootArg] = process.argv;

if (!sshAlias || !remoteRootArg) {
  console.error(
    'Usage: node scripts/diagnose-ssh-workspace.mjs <ssh-alias> <remote-root>',
  );
  process.exit(2);
}

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt|svg)$/i;
const SKIP = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);
const MAX_FILES = Number(process.env.DIAG_MAX_FILES || 2000);
const MAX_DEPTH = Number(process.env.DIAG_MAX_DEPTH || 12);
const TIMEOUT_MS = Number(process.env.DIAG_TIMEOUT_MS || 30000);
const CONCURRENCY = Number(process.env.DIAG_CONCURRENCY || 16);

function parseSshConfig(alias) {
  const result = spawnSync('ssh', ['-G', alias], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`ssh -G failed: ${result.stderr || `exit ${result.status}`}`);
  }

  const values = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const space = line.indexOf(' ');
    if (space <= 0) {
      continue;
    }
    const key = line.slice(0, space).toLowerCase();
    const value = line.slice(space + 1).trim();
    const list = values.get(key) || [];
    list.push(value);
    values.set(key, list);
  }
  return {
    host: values.get('hostname')?.[0] || alias,
    port: Number(values.get('port')?.[0] || 22),
    username: values.get('user')?.[0] || os.userInfo().username,
    identityFiles: values.get('identityfile') || [],
    proxyCommand: values.get('proxycommand')?.[0],
    proxyJump: values.get('proxyjump')?.[0],
  };
}

function expandHome(file) {
  if (file === '~') {
    return os.homedir();
  }
  if (file.startsWith('~/') || file.startsWith('~\\')) {
    return path.join(os.homedir(), file.slice(2));
  }
  return file;
}

function loadPrivateKey(identityFiles) {
  for (const configured of identityFiles) {
    const file = expandHome(configured);
    try {
      if (fs.statSync(file).isFile()) {
        return { file, content: fs.readFileSync(file) };
      }
    } catch {
      // Try the next IdentityFile.
    }
  }
  return null;
}

async function exerciseBridgeApi(config, key, remoteRoot, alias) {
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

    const useOpenSshConfig = process.env.DIAG_OPENSSH_CONFIG === '1';
    let listedHosts = null;
    if (useOpenSshConfig) {
      const hostsResponse = await fetch(`${baseUrl}/ssh/hosts`, { headers });
      const hostsBody = await hostsResponse.json();
      if (!hostsResponse.ok) {
        throw new Error(
          `/ssh/hosts failed (${hostsResponse.status}): ${hostsBody.error}`,
        );
      }
      listedHosts = hostsBody.hosts;
      if (!listedHosts.includes(alias)) {
        throw new Error(`OpenSSH Host list does not contain "${alias}"`);
      }
    }
    const connectResponse = await fetch(`${baseUrl}/connect`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        useOpenSshConfig
          ? {
              host: alias,
              authMode: 'openssh',
              useOpenSshConfig: true,
              root: remoteRoot,
            }
          : {
              host: config.host,
              port: config.port,
              username: config.username,
              privateKey: key.content.toString('utf8'),
              root: remoteRoot,
            },
      ),
    });
    const connectBody = await connectResponse.json();
    if (!connectResponse.ok) {
      throw new Error(`/connect failed (${connectResponse.status}): ${connectBody.error}`);
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
          authMode: connectBody.meta.authMode || 'manual',
          listedHostCount: listedHosts?.length ?? null,
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

function currentBridgeIsDirectory(entry) {
  return (entry.attrs.mode & 0o170000) === 0o040000;
}

async function classifyWithFallback(sftp, entry, absolutePath) {
  const classification = classifySftpEntry(entry);
  if (classification !== 'unknown') {
    return classification;
  }
  const attrs = await sftpCall(sftp, 'stat', absolutePath);
  return attrs.isDirectory() ? 'dir' : 'file';
}

async function walk(sftp, root, strategy, deadline) {
  const result = {
    files: [],
    directoriesRead: 0,
    entriesRead: 0,
    elapsedMs: 0,
    stopped: null,
  };
  const started = Date.now();

  async function visit(absoluteDir, relativeDir, depth) {
    if (Date.now() >= deadline) {
      result.stopped = `timeout (${TIMEOUT_MS} ms)`;
      return;
    }
    if (depth > MAX_DEPTH || result.files.length >= MAX_FILES || result.stopped) {
      return;
    }
    const entries = await sftpCall(sftp, 'readdir', absoluteDir);
    result.directoriesRead += 1;
    result.entriesRead += entries.length;

    for (const entry of entries) {
      if (Date.now() >= deadline) {
        result.stopped = `timeout (${TIMEOUT_MS} ms)`;
        break;
      }
      if (result.files.length >= MAX_FILES) {
        result.stopped = `file limit (${MAX_FILES})`;
        break;
      }
      const name = entry.filename;
      if (!name || name === '.' || name === '..') {
        continue;
      }
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const absolutePath = absoluteDir.endsWith('/')
        ? `${absoluteDir}${name}`
        : `${absoluteDir}/${name}`;
      const kind =
        strategy === 'current'
          ? currentBridgeIsDirectory(entry)
            ? 'dir'
            : 'file'
          : await classifyWithFallback(sftp, entry, absolutePath);

      if (kind === 'dir') {
        if (!SKIP.has(name) && !name.startsWith('.')) {
          await visit(absolutePath, relativePath, depth + 1);
        }
      } else if (MD_RE.test(name)) {
        result.files.push(relativePath);
      }
      if (result.stopped) {
        break;
      }
    }
  }

  await visit(root, '', 0);
  result.elapsedMs = Date.now() - started;
  return result;
}

async function walkConcurrent(sftp, root, deadline) {
  const started = Date.now();
  const files = [];
  const pending = [{ absoluteDir: root, relativeDir: '', depth: 0 }];
  let directoriesRead = 0;
  let entriesRead = 0;
  let stopped = null;

  while (pending.length > 0 && files.length < MAX_FILES) {
    if (Date.now() >= deadline) {
      stopped = `timeout (${TIMEOUT_MS} ms)`;
      break;
    }
    const batch = pending.splice(0, CONCURRENCY);
    const listings = await Promise.all(
      batch.map(async (dir) => ({
        dir,
        entries: await sftpCall(sftp, 'readdir', dir.absoluteDir),
      })),
    );
    directoriesRead += listings.length;

    for (const { dir, entries } of listings) {
      entriesRead += entries.length;
      if (files.length >= MAX_FILES) {
        stopped = `file limit (${MAX_FILES})`;
        break;
      }
      // Match bridge server.mjs: parallel classify + stat for incomplete attrs/symlinks.
      const resolved = await Promise.all(
        entries.map(async (entry) => {
          const name = entry.filename;
          if (!name || name === '.' || name === '..') {
            return null;
          }
          const relativePath = dir.relativeDir
            ? `${dir.relativeDir}/${name}`
            : name;
          const absolutePath = dir.absoluteDir.endsWith('/')
            ? `${dir.absoluteDir}${name}`
            : `${dir.absoluteDir}/${name}`;
          const kind = await classifyWithFallback(sftp, entry, absolutePath);
          return { name, relativePath, absolutePath, kind };
        }),
      );

      for (const item of resolved) {
        if (!item) {
          continue;
        }
        if (files.length >= MAX_FILES) {
          stopped = `file limit (${MAX_FILES})`;
          break;
        }
        const { name, relativePath, absolutePath, kind } = item;
        if (kind === 'dir') {
          if (
            dir.depth < MAX_DEPTH &&
            !SKIP.has(name) &&
            !name.startsWith('.')
          ) {
            pending.push({
              absoluteDir: absolutePath,
              relativeDir: relativePath,
              depth: dir.depth + 1,
            });
          }
        } else if (kind === 'file' && MD_RE.test(name)) {
          files.push(relativePath);
        }
      }
    }
  }

  return {
    fileCount: files.length,
    sampleFiles: files.slice(0, 20),
    directoriesRead,
    entriesRead,
    elapsedMs: Date.now() - started,
    stopped,
  };
}

function summarizeWalk(result) {
  return {
    fileCount: result.files.length,
    sampleFiles: result.files.slice(0, 20),
    directoriesRead: result.directoriesRead,
    entriesRead: result.entriesRead,
    elapsedMs: result.elapsedMs,
    stopped: result.stopped,
  };
}

function octalMode(entry) {
  return typeof entry.attrs?.mode === 'number'
    ? `0${entry.attrs.mode.toString(8)}`
    : 'unset';
}

const config = parseSshConfig(sshAlias);
if (
  config.proxyCommand &&
  config.proxyCommand.toLowerCase() !== 'none'
) {
  throw new Error(`ProxyCommand is not supported by this diagnostic: ${config.proxyCommand}`);
}
if (config.proxyJump && config.proxyJump.toLowerCase() !== 'none') {
  throw new Error(`ProxyJump is not supported by this diagnostic: ${config.proxyJump}`);
}

const key = loadPrivateKey(config.identityFiles);
if (!key) {
  throw new Error(
    `No readable IdentityFile found (${config.identityFiles.join(', ') || 'none configured'})`,
  );
}

console.log(
  JSON.stringify(
    {
      phase: 'resolved-ssh-config',
      alias: sshAlias,
      host: config.host,
      port: config.port,
      username: config.username,
      identityFile: key.file,
      remoteRoot: remoteRootArg,
      timeoutMs: TIMEOUT_MS,
    },
    null,
    2,
  ),
);

if (process.env.DIAG_BRIDGE_API === '1') {
  await exerciseBridgeApi(config, key, remoteRootArg, sshAlias);
  if (process.env.DIAG_API_ONLY === '1') {
    process.exit(0);
  }
}

const { client, sftp } = await connectSftp({
  host: config.host,
  port: config.port,
  username: config.username,
  privateKey: key.content,
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
          currentBridgeKind: currentBridgeIsDirectory(entry) ? 'dir' : 'file',
          defensiveKind: classifySftpEntry(entry),
        })),
      },
      null,
      2,
    ),
  );

  const remoteFindStarted = Date.now();
  const remoteFindOutput = await execRemote(
    client,
    buildRemoteFindCommand(root, {
      maxDepth: MAX_DEPTH,
      maxFiles: MAX_FILES,
      skip: SKIP,
    }),
  );
  const remoteFindFiles = parseRemoteFindOutput(remoteFindOutput, root, MAX_FILES);
  console.log(
    JSON.stringify(
      {
        phase: 'remote-bulk-list',
        fileCount: remoteFindFiles.length,
        sampleFiles: remoteFindFiles.slice(0, 20).map((file) => file.path),
        elapsedMs: Date.now() - remoteFindStarted,
      },
      null,
      2,
    ),
  );

  if (process.env.DIAG_SKIP_SERIAL !== '1') {
    const current = await walk(
      sftp,
      root,
      'current',
      Date.now() + TIMEOUT_MS,
    );
    console.log(
      JSON.stringify(
        { phase: 'current-bridge-serial-walk', ...summarizeWalk(current) },
        null,
        2,
      ),
    );
  }

  const concurrent = await walkConcurrent(
    sftp,
    root,
    Date.now() + TIMEOUT_MS,
  );
  console.log(
    JSON.stringify({ phase: 'bounded-concurrent-walk', ...concurrent }, null, 2),
  );
} finally {
  client.end();
}
