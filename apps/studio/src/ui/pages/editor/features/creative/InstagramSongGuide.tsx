import type { InstagramAudioReference } from '@core/creative/InstagramReelAudio';
import { instagramAudioUrl, instagramReferenceUrl } from '@core/creative/InstagramReelAudio';
import { BTN_SECONDARY } from '@ui/_shared/styles/buttons';

const SIGNALS = { 'recent-outlier': 'Recent reel outlier', 'widely-used': 'Widely used audio', 'format-reference': 'Format reference', 'seasonal-reference': 'Seasonal format reference' };
export function InstagramSongGuide({ audio, onBuildWithoutMusic }: { audio: InstagramAudioReference; onBuildWithoutMusic: () => void }) {
  return <section aria-label="Instagram song guide" className="rounded-lg border border-accent/30 bg-accent/5 p-3 flex flex-col gap-2">
    <h4 className="font-semibold text-sm m-0">Suggested Instagram song / audio</h4>
    <p className="text-sm m-0"><strong>{audio.title}</strong><span className="block text-xs text-fg-muted">{audio.artist}</span></p>
    <p className="text-xs text-fg-muted m-0">{SIGNALS[audio.signal]}{audio.observedReels ? ` · ${audio.observedReels} reels observed` : ''} · Checked {audio.observedAt}</p>
    <p className="text-xs text-fg-muted m-0">{audio.note} Usage totals do not measure current growth or predict your reel’s views.</p>
    <div className="flex flex-wrap gap-2"><a className="text-xs text-accent underline" href={instagramAudioUrl(audio)} target="_blank" rel="noopener noreferrer">Open audio on Instagram</a><a className="text-xs text-accent underline" href={instagramReferenceUrl(audio)} target="_blank" rel="noopener noreferrer">View format reference</a></div>
    <p className="text-xs text-fg-muted m-0">Build without music, render/download, then add this audio in Instagram. Song access depends on your account and region. This template’s tempo is an editable starting point; it is not an analysed beat map of the linked song.</p>
    <button type="button" className={BTN_SECONDARY} onClick={onBuildWithoutMusic}>Build for Instagram song (no music)</button>
    <p className="text-xs text-fg-muted m-0">The original song is not bundled or copied. Sample videos use an original instrumental. To include your own licensed song in the downloaded reel, build first, then upload it in Creative → Audio.</p>
  </section>;
}
