import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

export const DEFAULT_SITE = 'https://vge2ejzplpz2k1eqjurvhnsj.13.140.130.27.sslip.io';
export const PLAYWRIGHT_VERSION = '1.63.0';
export function pluginConfig(env = process.env) {
  const url = new URL(env.REELSTUDIO_URL || DEFAULT_SITE);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('REELSTUDIO_URL must be an HTTPS origin (HTTP is allowed only for localhost).');
  }
  const dataDir = resolve(env.REELSTUDIO_PLUGIN_DATA || join(homedir(), '.reelstudio-plugin'));
  return { origin: url.origin, dataDir, profileDir: join(dataDir, 'browser-profile'), exportDir: join(dataDir, 'exports'), channel: env.REELSTUDIO_BROWSER_CHANNEL || 'chrome' };
}
export function projectUrl(origin, projectId) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(projectId)) throw new Error('Supply the project UUID from your ReelStudio project URL.');
  return `${origin}/project/${projectId}`;
}
