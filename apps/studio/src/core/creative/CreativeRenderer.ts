import { paintMotionEffects } from '@core/creative/MotionEffects';
import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec } from 'mediabunny';
import type { CaptionsOverlayFramePainterFactory, RenderOutputChunk } from '@tscaps/engine';
import type { ExportRenderPlan } from '@core/export/services/ExportRenderPlanner';
import type { CreativeProject, CreativeSpan } from '@core/creative/CreativeProject';
import { compositionSpans, creativeResolution, spanAt } from '@core/creative/CreativeProject';
import { CreativeAssetRepository } from '@core/creative/CreativeAssetRepository';
import { cleanVoice, decodeCreativeAudio, mixCreativeAudio, toAudioBuffer, type PCM } from '@core/creative/CreativeAudio';
import { paintFrame, type EditRange } from '@core/creative/creativeModel';

type Painter = ReturnType<CaptionsOverlayFramePainterFactory['create']>;
interface Media { input: Input; sink: CanvasSink | null; width: number; height: number; sequence?: ReturnType<CanvasSink['canvasesAtTimestamps']> }
export interface CreativeRenderRequest {
  original: File;
  /** Used only by interactive preview; export explicitly discards this field. */
  previewOriginal?: Blob | undefined;
  project: CreativeProject;
  cuts: readonly EditRange[];
  plan: ExportRenderPlan | null;
}
export class CreativeSession {
  readonly spans: CreativeSpan[];
  readonly duration: number;
  readonly canvas = document.createElement('canvas');
  private readonly base = document.createElement('canvas');
  private readonly effectScratch = document.createElement('canvas');
  private readonly media = new Map<string, Media>();
  private painter: Painter | null = null;
  private previousSourceTime = -1;
  private audio: PCM | null = null;
  private closed = false;
  private pending: Promise<void> = Promise.resolve();
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => {
      if (this.closed) throw new DOMException('Preview closed', 'AbortError');
      return operation();
    });
    this.pending = result.then(() => {}, () => {});
    return result;
  }

  constructor(readonly request: CreativeRenderRequest, private readonly painterFactory: () => CaptionsOverlayFramePainterFactory) {
    this.spans = compositionSpans(request.project, request.cuts);
    this.duration = this.spans.at(-1)?.outputEnd ?? 0;
  }
  private async addMedia(id: string, blob: Blob) {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track && !await track.canDecode()) throw new Error('This video codec cannot be decoded. Replace it with an H.264 MP4.');
      this.media.set(id, { input, sink: track ? new CanvasSink(track, { poolSize: 2 }) : null,
        width: track?.displayWidth ?? 0, height: track?.displayHeight ?? 0 });
    } catch (error) { input.dispose(); throw error; }
  }
  async open(shortSide = 1080, signal?: AbortSignal): Promise<void> {
    if (this.duration < 0.1) throw new Error('Keep at least 0.1 seconds of video.');
    if (this.duration > 600) throw new Error('Keep the edited reel under 10 minutes for browser audio mixing.');
    try {
      await this.addMedia('original', this.request.previewOriginal ?? this.request.original);
      if (this.request.previewOriginal) await this.addMedia('original-audio', this.request.original);
      signal?.throwIfAborted();
      const original = this.media.get('original')!;
      if (!original.sink) throw new Error('The original file has no video track.');
      const size = creativeResolution(original.width, original.height, this.request.project.settings.portrait, shortSide);
      this.canvas.width = this.base.width = this.effectScratch.width = size.width;
      this.canvas.height = this.base.height = this.effectScratch.height = size.height;
      const assets = new Map(this.request.project.clips.flatMap(clip => clip.asset ? [[clip.asset.id, clip.asset] as const] : []));
      this.request.project.overlays.forEach(overlay => assets.set(overlay.asset.id, overlay.asset));
      if (this.request.project.music) assets.set(this.request.project.music.id, this.request.project.music);
      const repository = new CreativeAssetRepository();
      for (const asset of assets.values()) {
        await this.addMedia(asset.id, await repository.get(asset));
        signal?.throwIfAborted();
      }
    } catch (error) { this.close(); throw error; }
  }
  /** Exports know every requested timestamp. Sequential sinks decode each packet once. */
  prepareSequentialVideo(): void {
    const times = new Map<string, number[]>();
    const add = (id: string, time: number) => {
      const list = times.get(id) ?? []; list.push(time); times.set(id, list);
    };
    for (let i = 0; i < Math.ceil(this.duration * 30); i++) {
      const time = i / 30;
      const span = spanAt(this.spans, time)!;
      add(span.clip.asset?.id ?? 'original', span.sourceStart + (time - span.outputStart) * this.request.project.settings.speed);
      for (const overlay of this.request.project.overlays) {
        const sourceTime = overlay.sourceStart + time - overlay.start;
        if (time >= overlay.start && time < overlay.end && sourceTime < overlay.asset.duration) add(overlay.asset.id, sourceTime);
      }
    }
    for (const [id, timestamps] of times) {
      const media = this.media.get(id);
      if (media?.sink) media.sequence = media.sink.canvasesAtTimestamps(timestamps);
    }
  }
  private async picture(media: Media, time: number) {
    return media.sequence ? (await media.sequence.next()).value ?? null : await media.sink!.getCanvas(time);
  }
  prepareAudio(signal?: AbortSignal): Promise<PCM> {
    return this.enqueue(() => this.prepareAudioNow(signal));
  }
  private async prepareAudioNow(signal?: AbortSignal): Promise<PCM> {
    if (this.audio) return this.audio;
    const sourceIds = new Set(this.spans.map(span => span.clip.asset?.id ?? 'original'));
    const sources = new Map<string, PCM | null>();
    for (const id of sourceIds) {
      const pcm = await decodeCreativeAudio(this.media.get(id === 'original' && this.request.previewOriginal ? 'original-audio' : id)!.input, signal);
      sources.set(id, pcm ? cleanVoice(pcm, this.request.project.settings.cleanup, this.request.project.settings.normalize) : null);
    }
    const musicId = this.request.project.music?.id;
    const music = musicId ? await decodeCreativeAudio(this.media.get(musicId)!.input, signal) : null;
    if (musicId && !music) throw new Error('The selected music file has no audio track.');
    signal?.throwIfAborted();
    this.audio = mixCreativeAudio(this.request.project, this.spans, sources, music);
    return this.audio;
  }
  private async resetPainter() {
    this.painter?.end(); this.painter = null;
    const plan = this.request.plan;
    if (!plan) return;
    this.painter = this.painterFactory().create(plan.document, plan.styles, plan.overlayHtml ?? undefined, plan.topLayer);
    await this.painter.begin(this.canvas.width, this.canvas.height, 30);
  }
  private fit(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement | OffscreenCanvas, x: number, y: number, width: number, height: number) {
    const scale = Math.min(width / source.width, height / source.height);
    ctx.drawImage(source, x + (width - source.width * scale) / 2, y + (height - source.height * scale) / 2, source.width * scale, source.height * scale);
  }
  paint(time: number): Promise<void> {
    return this.enqueue(() => this.paintNow(time));
  }
  private async paintNow(time: number): Promise<void> {
    if (this.closed) throw new Error('This preview session is closed.');
    const span = spanAt(this.spans, Math.min(Math.max(0, time), this.duration - 0.00001));
    if (!span) return;
    const sourceTime = span.sourceStart + (time - span.outputStart) * this.request.project.settings.speed;
    const media = this.media.get(span.clip.asset?.id ?? 'original');
    if (!media?.sink) throw new Error('A clip has no video track. Replace the clip.');
    const source = await this.picture(media, Math.max(span.sourceStart, sourceTime));
    if (!source) throw new Error('A video frame could not be decoded.');
    const base = this.base.getContext('2d')!;
    base.fillStyle = '#000'; base.fillRect(0, 0, this.base.width, this.base.height);
    this.fit(base, source.canvas, 0, 0, this.base.width, this.base.height);
    // Looks and camera motion affect the picture; text and captions stay crisp.
    paintFrame(this.canvas, this.base, { ...this.request.project.settings, text: '' }, time);
    const ctx = this.canvas.getContext('2d')!;
    for (const overlay of this.request.project.overlays) {
      if (time < overlay.start || time >= overlay.end) continue;
      const overlayMedia = this.media.get(overlay.asset.id);
      if (!overlayMedia?.sink) throw new Error('A B-roll file has no video track. Replace it.');
      const overlayTime = overlay.sourceStart + time - overlay.start;
      if (overlayTime >= overlay.asset.duration) continue;
      const picture = await this.picture(overlayMedia, overlayTime);
      if (picture) this.fit(ctx, picture.canvas, overlay.x * this.canvas.width, overlay.y * this.canvas.height,
        overlay.width * this.canvas.width, overlay.height * this.canvas.height);
    }
    if (!span.clip.asset && this.request.plan) {
      if (!this.painter || sourceTime < this.previousSourceTime) await this.resetPainter();
      this.previousSourceTime = sourceTime;
      base.clearRect(0, 0, this.base.width, this.base.height); base.drawImage(this.canvas, 0, 0);
      const baseCanvas = this.base;
      const frames = await this.painter!.paint([{ frame: {
        timestamp: sourceTime, duration: 1 / 30,
        draw: (context, x, y, width, height) => context.drawImage(baseCanvas, x, y, width, height), close: () => {},
      }, outputTimestamp: time }]);
      frames[0]?.(ctx);
    }
    // The title is rendered by the same routine in preview and export, with no second color pass.
    if (this.request.project.settings.text.trim()) {
      base.clearRect(0, 0, this.base.width, this.base.height); base.drawImage(this.canvas, 0, 0);
      paintFrame(this.canvas, this.base, { ...this.request.project.settings, look: 'clean', brightness: 1, contrast: 1, saturation: 1, motion: 'none' }, time);
    }
    paintMotionEffects(this.canvas, this.effectScratch, this.request.project.effects ?? [], time, this.spans.slice(1).map(s => s.outputStart));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    void this.pending.then(async () => {
      this.painter?.end(); this.painter = null;
      for (const media of this.media.values()) {
        try { await media.sequence?.return(); } catch { /* input disposal below still releases the decoder */ }
        media.input.dispose();
      }
      this.media.clear(); this.audio = null;
    });
  }
}

export class CreativeRenderer {
  constructor(private readonly painterFactory: () => CaptionsOverlayFramePainterFactory) {}
  session(request: CreativeRenderRequest) { return new CreativeSession(request, this.painterFactory); }
  async render(request: CreativeRenderRequest, options: {
    format?: 'mp4' | 'webm'; shortSide?: number; bitrate?: number; signal?: AbortSignal;
    outputStream?: WritableStream<RenderOutputChunk>; onProgress?: (percent: number) => void;
  } = {}): Promise<Blob | null> {
    const session = this.session({ ...request, previewOriginal: undefined });
    let output: Output | null = null;
    try {
      await session.open(options.shortSide ?? 1080, options.signal);
      const format = options.format ?? 'mp4';
      const videoCodec = await getFirstEncodableVideoCodec(format === 'mp4' ? ['avc'] : ['vp9', 'vp8'], { width: session.canvas.width, height: session.canvas.height });
      const audioCodec = await getFirstEncodableAudioCodec(format === 'mp4' ? ['aac'] : ['opus']);
      if (!videoCodec || !audioCodec) throw new Error(`This browser cannot encode ${format.toUpperCase()}. Choose WebM or use a browser with H.264/AAC support.`);
      const audio = await session.prepareAudio(options.signal);
      session.prepareSequentialVideo();
      const target = options.outputStream ? new StreamTarget(options.outputStream) : new BufferTarget();
      output = new Output({ target, format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: options.outputStream ? false : 'in-memory' }) : new WebMOutputFormat() });
      const videoSource = new CanvasSource(session.canvas, { codec: videoCodec, bitrate: options.bitrate ?? 8_000_000 });
      const audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
      output.addVideoTrack(videoSource, { frameRate: 30 }); output.addAudioTrack(audioSource);
      await output.start();
      const total = Math.ceil(session.duration * 30);
      let audioPosition = 0;
      for (let i = 0; i < total; i++) {
        options.signal?.throwIfAborted();
        await session.paint(i / 30);
        await videoSource.add(i / 30, Math.min(1 / 30, session.duration - i / 30));
        // Interleave audio and video so the muxer does not accumulate an entire track.
        const audioEnd = Math.min(audio.channels[0]!.length, Math.round(Math.min(session.duration, (i + 1) / 30) * audio.sampleRate));
        if (audioEnd > audioPosition) {
          await audioSource.add(toAudioBuffer(audio, audioPosition, audioEnd - audioPosition));
          audioPosition = audioEnd;
        }
        options.onProgress?.((i + 1) / total * 99);
        if (i % 15 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      options.signal?.throwIfAborted();
      videoSource.close(); audioSource.close();
      await output.finalize();
      options.onProgress?.(100);
      return target instanceof BufferTarget ? new Blob([target.buffer!], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }) : null;
    } catch (error) { await output?.cancel().catch(() => {}); throw error; }
    finally { session.close(); }
  }
}
