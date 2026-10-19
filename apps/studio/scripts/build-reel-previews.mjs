/** Run from apps/studio: pnpm reel-previews:build. Uses the real template and canvas compositor.
 * Requires Chromium (Playwright) and FFmpeg. Source photos and credits live beside this script. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = join(root, 'public/reel-previews');
await mkdir(target, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const staging = join(tmpdir(), `reel-previews-${process.pid}`);
await mkdir(staging, { recursive: true });
try {
  // Avoid loading the editor/account application in this build-only page.
  await page.route('**/__reel-preview-build', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Reel sample renderer</title>' }));
  await page.goto(new URL('__reel-preview-build', origin).href);
  const templates = await page.evaluate(async () => {
    const { REEL_TEMPLATES } = await import('/src/core/creative/ReelTemplates.ts');
    return REEL_TEMPLATES.map(t => ({ id: t.id, name: t.name }));
  });
  const manifest = {};
  for (const template of templates) {
    const requested = process.argv.slice(2);
    if (requested.length && !requested.includes(template.id)) continue;
    const rendered = await page.evaluate(async id => {
      const [{ REEL_TEMPLATES, assembleReelTemplate }, { compositionSpans }, { paintFrame }, { paintMotionEffects }, { createTemplateMusic }, bunny] = await Promise.all([
        import('/src/core/creative/ReelTemplates.ts'), import('/src/core/creative/CreativeProject.ts'),
        import('/src/core/creative/creativeModel.ts'), import('/src/core/creative/MotionEffects.ts'),
        import('/src/core/creative/ReelTemplateMusic.ts'), import('/node_modules/mediabunny/dist/bundles/mediabunny.mjs'),
      ]);
      const template = REEL_TEMPLATES.find(t => t.id === id);
      const pools = {
        Travel: ['lake', 'mountain', 'city', 'lake'], Celebration: ['wedding', 'flowers', 'cake', 'flowers'],
        Business: ['headphones', 'office', 'interior', 'headphones'], Lifestyle: ['coffee', 'food', 'fitness', 'flowers'],
        Creator: ['camera', 'music', 'office', 'camera'], Fashion: ['fashion', 'clothes', 'flowers', 'fashion'],
      };
      const specific = {
        'desi-garba-recap': ['fashion', 'flowers', 'wedding', 'clothes'],
        'desi-mela-memories': ['city', 'wedding', 'flowers', 'lake'],
        'desi-raat-bhar-glow': ['wedding', 'flowers', 'fashion', 'city'],
        'desi-gujju-portrait': ['fashion', 'clothes', 'lake', 'flowers'],
        'desi-manzar-journey': ['office', 'camera', 'interior', 'mountain'],
        'desi-late-night-diary': ['city', 'coffee', 'music', 'lake'],
        'city-lights': ['city', 'office', 'city', 'interior'], 'nature-diary': ['mountain', 'lake', 'flowers', 'mountain'],
        'birthday-confetti': ['cake', 'flowers', 'wedding', 'cake'], 'wedding-memories': ['wedding', 'flowers', 'wedding', 'flowers'],
        'property-tour': ['interior', 'office', 'interior', 'office'], 'cafe-menu': ['coffee', 'food', 'coffee', 'food'],
        'food-journal': ['food', 'coffee', 'food', 'coffee'], 'fitness-drive': ['fitness', 'mountain', 'fitness', 'mountain'],
        'morning-routine': ['coffee', 'flowers', 'food', 'lake'], 'slow-sunday': ['flowers', 'coffee', 'lake', 'interior'],
        'product-drop': ['headphones', 'camera', 'headphones', 'camera'], 'sale-showcase': ['headphones', 'clothes', 'camera', 'fashion'],
        'before-after': ['office', 'interior'], 'beauty-details': ['flowers', 'fashion', 'flowers', 'clothes'],
        'jewellery-glow': ['fashion', 'flowers', 'clothes', 'fashion'],
      };
      const photos = specific[id] ?? pools[template.category];
      const images = await Promise.all(photos.map(async name => {
        const response = await fetch(`/scripts/reel-preview-source/${name}.jpg`);
        if (!response.ok) throw new Error(`Missing photo ${name}`);
        return createImageBitmap(await response.blob());
      }));
      const duration = 8, fps = 24;
      const project = assembleReelTemplate(template, images.map((_, i) => ({ asset: { id: String(i), duration: 60 }, duration: 60 })), null, template.name);
      const spans = compositionSpans(project, []);
      // An unsped excerpt around the first real transition demonstrates even long-hold templates.
      const excerptStart = Math.max(0, spans[0].outputEnd - 2);
      const canvas = document.createElement('canvas'), base = document.createElement('canvas'), scratch = document.createElement('canvas');
      for (const c of [canvas, base, scratch]) { c.width = 360; c.height = 640; }
      const ctx = base.getContext('2d');
      const codec = await bunny.getFirstEncodableVideoCodec(['vp9', 'vp8']);
      if (!codec) throw new Error('No browser video encoder');
      const audioCodec = await bunny.getFirstEncodableAudioCodec(['opus']);
      if (!audioCodec) throw new Error('No browser audio encoder');
      const outputTarget = new bunny.BufferTarget();
      const output = new bunny.Output({ format: new bunny.WebMOutputFormat(), target: outputTarget });
      const video = new bunny.CanvasSource(canvas, { codec, bitrate: 550000 });
      const audio = new bunny.AudioBufferSource({ codec: audioCodec, bitrate: 64000 });
      output.addVideoTrack(video, { frameRate: fps }); output.addAudioTrack(audio);
      const audioContext = new AudioContext();
      let poster = '';
      try {
        const music = await audioContext.decodeAudioData(await createTemplateMusic(template.music, template.bpm).arrayBuffer());
        const buffer = audioContext.createBuffer(1, Math.round(duration * music.sampleRate), music.sampleRate);
        const samples = buffer.getChannelData(0), source = music.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          const t = i / music.sampleRate;
          samples[i] = source[(Math.round(excerptStart * music.sampleRate) + i) % source.length] * project.settings.musicVolume * Math.min(1, t / .04, (duration - t) / .08);
        }
        await output.start();
        for (let frame = 0; frame < duration * fps; frame++) {
          const time = excerptStart + frame / fps;
          const span = spans.find(s => time >= s.outputStart && time < s.outputEnd);
          const image = images[Number(span.clip.asset.id)];
          const scale = Math.max(base.width / image.width, base.height / image.height);
          ctx.drawImage(image, (base.width - image.width * scale) / 2, (base.height - image.height * scale) / 2, image.width * scale, image.height * scale);
          paintFrame(canvas, base, project.settings, time);
          paintMotionEffects(canvas, scratch, project.effects, time, spans.slice(1).map(s => s.outputStart));
          if (!frame) poster = canvas.toDataURL('image/jpeg', .84).split(',')[1];
          await video.add(frame / fps, 1 / fps);
        }
        video.close(); await audio.add(buffer); audio.close(); await output.finalize();
        const bytes = new Uint8Array(outputTarget.buffer);
        let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        return { video: btoa(binary), poster, duration, excerptStart, photos, recipe: template };
      } catch (error) { await output.cancel(); throw error; }
      finally { images.forEach(image => image.close()); await audioContext.close(); }
    }, template.id);
    const intermediate = join(staging, `${template.id}.webm`);
    await writeFile(intermediate, Buffer.from(rendered.video, 'base64'));
    await writeFile(join(target, `${template.id}.jpg`), Buffer.from(rendered.poster, 'base64'));
    const mp4 = join(target, `${template.id}.mp4`);
    const encoded = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', intermediate, '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
    if (encoded.status !== 0) throw new Error(encoded.stderr || 'FFmpeg failed');
    manifest[template.id] = { duration: rendered.duration, excerptStart: rendered.excerptStart, photos: rendered.photos, recipe: rendered.recipe, bytes: (await readFile(mp4)).length };
    console.log(`${template.id}: 8s, ${Math.round(manifest[template.id].bytes / 1024)} KiB`);
  }
  const manifestPath = join(target, 'manifest.json');
  const previous = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
  await writeFile(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2) + '\n');
} finally { await browser.close(); await server.close(); await rm(staging, { recursive: true, force: true }); }
