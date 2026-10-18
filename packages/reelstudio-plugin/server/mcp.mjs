import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { projectUrl } from './config.mjs';

export function createServer(service, config) {
  const server = new McpServer({ name: 'reelstudio', version: '0.1.0' });
  const id = z.string().uuid().describe('UUID from the /project/UUID URL in the dedicated ReelStudio plugin browser');
  const response = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
  function tool(name, description, inputSchema, annotations, run) {
    server.registerTool(name, { description, inputSchema, annotations }, async args => {
      try { return response(await run(args)); }
      catch (error) { return { ...response({ error: error instanceof Error ? error.message : 'ReelStudio operation failed.' }), isError: true }; }
    });
  }
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  tool('list_templates', 'Browse 31 editable ReelStudio Auto Edit recipes. Returns IDs, caption looks, categories and recommended intensity. Does not open a browser.', {
    query: z.string().max(200).optional(), category: z.enum(['All', 'Creator', 'Business', 'Education', 'Lifestyle', 'Bold']).optional(),
  }, read, args => ({ templates: service.list(args), catalogVersion: '0.1.0' }));
  tool('open_project', 'Open the dedicated ReelStudio browser. Omit projectId for project selection/manual login; supply it to open an existing project. User signs in themselves. Never request passwords or authentication tokens in chat. Finish/save the current project before switching sessions.', { projectId: id.optional() },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, async ({ projectId }) => { service.idle(); if (projectId) projectUrl(config.origin, projectId); return service.browser.open(projectId); });
  tool('auto_edit', 'Start Auto Edit on the specified already-open project and SAVE it. Generates normal editable captions, quiet-pause cuts, zooms and polish; existing manual customizations are preserved by ReelStudio. Uses the current transcript; does not transcribe new footage. Returns a job ID, not a finished edit. Poll get_job.', {
    projectId: id, preset: z.enum(service.templates.map(t => t.id)).optional().describe('Template ID from list_templates. Omit to keep the current caption look.'),
    style: z.enum(['clean', 'energetic', 'professional']).optional().describe('Optional override of template intensity'),
    options: z.object({ pauses: z.boolean().optional(), zooms: z.boolean().optional(), polish: z.boolean().optional(), captions: z.boolean().optional() }).strict().optional(),
  }, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, args => {
    if (args.options && ['pauses', 'zooms', 'polish', 'captions'].every(key => args.options[key] === false)) throw new Error('Enable at least one Auto Edit option.');
    return service.start('auto_edit', args.projectId, () => service.browser.autoEdit(args, service.templates));
  });
  tool('open_preview', 'Bring the specified already-open project into the foreground in the plugin browser. It remains manually editable. Optional play starts reel playback; previewUrl can be opened by the user on the same account (local projects remain in this browser profile).', { projectId: id, play: z.boolean().default(false) },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, args => { service.idle(); return service.browser.preview(args.projectId, args.play); });
  tool('export_reel', 'Render the specified already-open project using the normal ReelStudio compositor. Saves the project and downloads the finished MP4/WebM to the local plugin export directory. Returns a job ID. Poll get_job; only succeeded with a path means a completed export. Local video processing can take several minutes.', { projectId: id, format: z.enum(['mp4', 'webm']).default('mp4') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, args => service.start('export_reel', args.projectId, () => service.browser.export(args.projectId, args.format)));
  tool('get_job', 'Read the result of an Auto Edit/export job in this session. Poll about every 3–5 seconds. Export success returns the actual local file path; failures are reported without retrying edits automatically.', { jobId: z.string().uuid() }, read, ({ jobId }) => service.get(jobId));
  return server;
}
