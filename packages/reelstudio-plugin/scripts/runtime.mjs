import { access, realpath, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

export async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function executable(name) {
  for (const dir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const suffix of process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']) {
      const path = join(dir, name + suffix);
      try { await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return path; } catch {}
    }
  }
  return null;
}
export async function npmCli() {
  const npm = await executable('npm');
  const resolved = npm ? await realpath(npm) : '';
  const candidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  if (resolved.endsWith('npm-cli.js')) candidates.unshift(resolved);
  if (npm) candidates.push(join(dirname(npm), 'node_modules/npm/bin/npm-cli.js'));
  for (const file of candidates) if (await exists(file)) return file;
  throw new Error('npm was not found. Install Node.js 22 LTS or newer from https://nodejs.org, then reopen this installer.');
}
export async function chromePath() {
  const paths = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : process.platform === 'win32'
      ? ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].filter(k => process.env[k]).map(k => join(process.env[k], 'Google/Chrome/Application/chrome.exe'))
      : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  for (const path of paths) if (await exists(path)) return path;
  return null;
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
export async function runtimeReady(dataDir, version) {
  try { return JSON.parse(await readFile(join(dataDir, 'node_modules/playwright/package.json'), 'utf8')).version === version; } catch { return false; }
}
