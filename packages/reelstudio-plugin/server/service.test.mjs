import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReelService } from './service.mjs';
import { pluginConfig, projectUrl } from './config.mjs';
import templates from './catalog.json' with { type: 'json' };

const tick = () => new Promise(resolve => setImmediate(resolve));
test('catalog search and category filtering use real unique recipe IDs', () => {
  const service = new ReelService({}, templates);
  assert.equal(service.list().length, 31);
  assert.equal(new Set(templates.map(t => t.id)).size, 31);
  assert.deepEqual(service.list({ query: 'Gujarati', category: 'Creator' }).map(t => t.id), ['desi-creator']);
  assert.equal(service.list({ query: 'neon', category: 'Business' }).length, 0);
});
test('running edits are serialized, completion is explicit and failures remain inspectable', async () => {
  const service = new ReelService({}, templates);
  let finish;
  const job = service.start('auto_edit', 'project', () => new Promise(resolve => { finish = resolve; }));
  assert.equal(service.get(job.id).status, 'running');
  assert.throws(() => service.start('export_reel', 'project', () => {}), /still running/);
  await tick(); finish({ saved: true }); await tick();
  assert.equal(service.get(job.id).status, 'succeeded');
  assert.equal(service.get(job.id).result.saved, true);
  const failed = service.start('export_reel', 'project', () => { throw new Error('Source media missing'); });
  await tick();
  assert.equal(service.get(failed.id).status, 'failed');
  assert.equal(service.get(failed.id).error, 'Source media missing');
  assert.throws(() => service.get('unknown'), /Unknown job/);
});
test('origin and project validation prevent arbitrary URL navigation', () => {
  for (const origin of ['http://example.com', 'https://user:password@example.com', 'file:///tmp/video.mp4', 'https://example.com/path', 'https://example.com?token=x']) assert.throws(() => pluginConfig({ REELSTUDIO_URL: origin }));
  assert.equal(pluginConfig({ REELSTUDIO_URL: 'http://localhost:4173' }).origin, 'http://localhost:4173');
  assert.throws(() => projectUrl('https://example.com', '../signin'));
  assert.equal(projectUrl('https://example.com', '4886d0ed-9757-45b6-9c46-05612133cc2e'), 'https://example.com/project/4886d0ed-9757-45b6-9c46-05612133cc2e');
});
