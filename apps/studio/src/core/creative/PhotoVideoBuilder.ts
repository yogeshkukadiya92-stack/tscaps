import { BufferTarget, CanvasSource, Output, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny';

export const isReelPhoto = (file: File) => /^(image\/(jpeg|png|webp))$/.test(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));

/** Encode a still once at one frame per second; subsequent motion uses the shared compositor. */
export async function buildPhotoVideo(file: File, duration = 6): Promise<File> {
  if (!Number.isFinite(duration) || duration < 0.1 || duration > 60) throw new Error('Photo duration must be between 0.1 and 60 seconds.');
  const image = await createImageBitmap(file);
  try {
    const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8']);
    if (!codec) throw new Error('Photo reels need video encoding support. Open this project in Chrome.');
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare this photo.');
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    ctx.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const video = new CanvasSource(canvas, { codec, bitrate: 2_000_000 });
    output.addVideoTrack(video, { frameRate: 1 });
    try {
      await output.start();
      for (let time = 0; time < duration; time++) await video.add(time, Math.min(1, duration - time));
      video.close(); await output.finalize();
    } catch (error) { await output.cancel(); throw error; }
    if (!target.buffer) throw new Error('Could not encode this photo.');
    return new File([target.buffer], `${file.name.replace(/\.[^.]+$/, '')}.webm`, { type: 'video/webm' });
  } finally { image.close(); }
}
