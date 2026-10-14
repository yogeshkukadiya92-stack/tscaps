import { AudioBufferSource, BufferTarget, CanvasSource, Output, WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec } from 'mediabunny';

/** Gives audio a neutral caption canvas, reusing the editor's transcription,
 * project persistence, template preview and export pipeline. No real-time recording. */
export async function buildAudioCaptionVideo(file: File): Promise<File> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('This audio file has no playable duration.');
    const videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8']);
    const audioCodec = await getFirstEncodableAudioCodec(['opus']);
    if (!videoCodec || !audioCodec) throw new Error('Audio captions need a browser with video and audio encoding support. Please use the latest Chrome.');
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 1280;
    const painter = canvas.getContext('2d');
    if (!painter) throw new Error('Could not create your caption preview.');
    painter.fillStyle = '#101014'; painter.fillRect(0, 0, canvas.width, canvas.height);
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: 500_000 });
    const audio = new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 });
    output.addVideoTrack(video, { frameRate: 1 }); output.addAudioTrack(audio);
    await output.start();
    try {
      await Promise.all([
        audio.add(buffer).then(() => audio.close()),
        (async () => {
          for (let time = 0; time < buffer.duration; time += 1) await video.add(time, Math.min(1, buffer.duration - time));
          video.close();
        })(),
      ]);
      await output.finalize();
    } catch (cause) { await output.cancel(); throw cause; }
    if (!target.buffer) throw new Error('Could not prepare your audio captions.');
    return new File([target.buffer], `${file.name.replace(/\.[^.]+$/, '')}.webm`, { type: 'video/webm' });
  } finally { await context.close(); }
}
