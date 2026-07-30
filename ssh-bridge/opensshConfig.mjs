import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Parse the key/value format emitted by `ssh -G`. */
export function parseOpenSshConfig(output) {
  const values = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const separator = line.indexOf(' ');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).toLowerCase();
    const value = line.slice(separator + 1).trim();
    const list = values.get(key) || [];
    list.push(value);
    values.set(key, list);
  }
  return values;
}

export function expandOpenSshPath(value, connection = {}) {
  let expanded = String(value).replace(/^"(.*)"$/, '$1');
  const replacements = {
    '%d': os.homedir(),
    '%u': os.userInfo().username,
    '%h': connection.host || '',
    '%r': connection.username || '',
    '%p': String(connection.port || 22),
    '%%': '%',
  };
  expanded = expanded.replace(/%[duhrp%]/g, (token) => replacements[token] ?? token);
  if (expanded === '~') {
    return os.homedir();
  }
  if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  return expanded;
}

function configTokens(line) {
  const withoutComment = String(line).replace(/\s+#.*$/, '').trim();
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  for (const match of withoutComment.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function expandSimpleGlob(pattern) {
  if (!/[*?]/.test(pattern)) {
    return fs.existsSync(pattern) ? [pattern] : [];
  }
  const directory = path.dirname(pattern);
  const basename = path.basename(pattern);
  if (/[*?]/.test(directory)) {
    return [];
  }
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const regex = new RegExp(
    `^${basename
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
  );
  return names
    .filter((name) => regex.test(name))
    .map((name) => path.join(directory, name))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Enumerate concrete Host aliases from the user's OpenSSH config. Wildcard
 * patterns are connection rules rather than selectable destinations, so they
 * are intentionally omitted.
 */
export function listOpenSshHosts(configFile = path.join(os.homedir(), '.ssh', 'config')) {
  const hosts = new Set();
  const visited = new Set();

  function readConfig(file, depth) {
    if (depth > 8) {
      return;
    }
    let realFile;
    let content;
    try {
      realFile = fs.realpathSync(file);
      if (visited.has(realFile)) {
        return;
      }
      visited.add(realFile);
      content = fs.readFileSync(realFile, 'utf8');
    } catch {
      return;
    }

    for (const line of content.split(/\r?\n/)) {
      const tokens = configTokens(line);
      if (tokens.length < 2) {
        continue;
      }
      const keyword = tokens[0].toLowerCase();
      if (keyword === 'host') {
        for (const alias of tokens.slice(1)) {
          if (
            alias &&
            !alias.startsWith('!') &&
            !alias.includes('*') &&
            !alias.includes('?') &&
            !alias.includes('%')
          ) {
            hosts.add(alias);
          }
        }
      } else if (keyword === 'include') {
        for (const included of tokens.slice(1)) {
          const expanded = expandOpenSshPath(included);
          const absolute = path.isAbsolute(expanded)
            ? expanded
            : path.resolve(path.dirname(realFile), expanded);
          for (const match of expandSimpleGlob(absolute)) {
            readConfig(match, depth + 1);
          }
        }
      }
    }
  }

  readConfig(configFile, 0);
  return [...hosts].sort((a, b) => a.localeCompare(b));
}

function sshConfigOutput(alias) {
  return new Promise((resolve, reject) => {
    execFile(
      'ssh',
      ['-G', '--', alias],
      {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `无法解析 OpenSSH 配置 "${alias}"：${String(stderr || error.message).trim()}`,
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Resolve an OpenSSH Host alias into ssh2 connection options. Key contents
 * remain inside the local Bridge process and are never returned to the browser.
 */
export async function resolveOpenSshConnection(alias, passphrase) {
  const hostAlias = String(alias || '').trim();
  if (!hostAlias) {
    throw new Error('OpenSSH Host 别名不能为空');
  }

  const config = parseOpenSshConfig(await sshConfigOutput(hostAlias));
  const host = config.get('hostname')?.[0] || hostAlias;
  const port = Number(config.get('port')?.[0] || 22);
  const username = config.get('user')?.[0] || os.userInfo().username;
  const proxyJump = config.get('proxyjump')?.[0];
  const proxyCommand = config.get('proxycommand')?.[0];

  if (proxyJump && proxyJump.toLowerCase() !== 'none') {
    throw new Error('暂不支持 OpenSSH ProxyJump；请使用可直接连接的 Host 配置');
  }
  if (proxyCommand && proxyCommand.toLowerCase() !== 'none') {
    throw new Error('暂不支持 OpenSSH ProxyCommand；请使用可直接连接的 Host 配置');
  }

  const connection = { host, port, username };
  let privateKey;
  let identityFile;
  for (const configuredPath of config.get('identityfile') || []) {
    const candidate = expandOpenSshPath(configuredPath, connection);
    try {
      if (fs.statSync(candidate).isFile()) {
        privateKey = fs.readFileSync(candidate);
        identityFile = candidate;
        break;
      }
    } catch {
      // OpenSSH emits default identity paths even when they do not exist.
    }
  }

  const configuredAgent = config.get('identityagent')?.[0];
  const agent =
    configuredAgent && configuredAgent.toLowerCase() !== 'none'
      ? expandOpenSshPath(configuredAgent, connection)
      : process.env.SSH_AUTH_SOCK || undefined;

  if (!privateKey && !agent) {
    throw new Error(
      `OpenSSH 配置 "${hostAlias}" 没有可读取的 IdentityFile，且未检测到 SSH Agent`,
    );
  }

  return {
    alias: hostAlias,
    host,
    port,
    username,
    privateKey,
    passphrase: passphrase || undefined,
    agent,
    identityFile,
  };
}
