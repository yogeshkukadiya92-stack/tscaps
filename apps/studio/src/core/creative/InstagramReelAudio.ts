/** Public Instagram observations, checked manually on 2026-10-19.
 * Counts are rounded cumulative usage, not a current growth rate or a music license. */
export interface InstagramAudioReference {
  title: string;
  artist: string;
  audioId: string;
  observedAt: string;
  observedReels: string | null;
  signal: 'recent-outlier' | 'widely-used' | 'format-reference' | 'seasonal-reference';
  sourceReel: string;
  note: string;
}
export const INSTAGRAM_TEMPLATE_AUDIO: Readonly<Record<string, InstagramAudioReference>> = {
  'desi-garba-recap': {
    title: 'Original audio · TGGV Garba', artist: 'tggv.stv / iconic_films__', audioId: '28400625469639238', observedAt: '2026-10-19', observedReels: null, signal: 'seasonal-reference',
    sourceReel: 'DerUaQKu0wh', note: 'Two Day 8 Surat Garba reels were inspected on the day of posting. Detail shots, outfit reveals and group moments inform an original seasonal arrangement; virality and song identity were not verified.',
  },
  'desi-mela-memories': {
    title: 'Do Din Ka Ye Mela - Reprise', artist: 'Tochi Raina', audioId: '249576719642025', observedAt: '2026-10-19', observedReels: '95K', signal: 'recent-outlier',
    sourceReel: 'DecB_vRpD-E', note: 'A five-day-old fairground reel showed 521K views, above its creator’s recent reel baseline. Festival and memory formats appeared repeatedly on this audio page.',
  },
  'desi-raat-bhar-glow': {
    title: 'Raat Bhar (From "De De Pyaar De 2")', artist: 'Aditya Rikhari, Payal Dev, Aditya Dev, Kumaar', audioId: '782386811335435', observedAt: '2026-10-19', observedReels: '84K', signal: 'widely-used',
    sourceReel: 'DdvLvVMot6j', note: 'Romantic and festive couple formats were visible across this audio page. Current growth and account-relative outliers were not verified.',
  },
  'desi-gujju-portrait': {
    title: 'Mv Studio Bidada', artist: 'mv_studio_bidada', audioId: '25256576454027145', observedAt: '2026-10-19', observedReels: '8K', signal: 'format-reference',
    sourceReel: 'DeRu8H7s6tb', note: 'Gujarati portrait and lifestyle formats appeared repeatedly. The audio’s displayed title differs from older original-audio labels; no official song title is inferred.',
  },
  'desi-manzar-journey': {
    title: 'Manzar Hai Ye Naya - Trending Version', artist: 'Shantanu Sudame, Shashwat Sachdev', audioId: '376259955294256', observedAt: '2026-10-19', observedReels: '188K', signal: 'widely-used',
    sourceReel: 'DZeeX4vzEqE', note: 'Business-journey and progress formats were visible. “Trending Version” is part of the audio title, not a verified current trend ranking.',
  },
  'desi-late-night-diary': {
    title: 'Der Raat Tak', artist: 'the.untravel.show', audioId: '1016445040446893', observedAt: '2026-10-19', observedReels: '1.6K', signal: 'format-reference',
    sourceReel: 'DeU0m0gzRZf', note: 'Night-time memories and friendship diary formats were visible. This is a smaller format reference, not a confirmed current viral song.',
  },
};
export const instagramAudioUrl = (audio: InstagramAudioReference) => `https://www.instagram.com/reels/audio/${audio.audioId}/`;
export const instagramReferenceUrl = (audio: InstagramAudioReference) => `https://www.instagram.com/reel/${audio.sourceReel}/`;
