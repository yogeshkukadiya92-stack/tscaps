import { useEffect, useRef, useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
import { AppDialog } from '@ui/_shared/components/Dialog/AppDialog';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';
import { reelTemplateDuration, type ReelTemplate } from '@core/creative/ReelTemplates';

export const reelSampleUrl = (id: string, extension: 'mp4' | 'jpg') => `${import.meta.env.BASE_URL}reel-previews/${id}.${extension}`;

export function ReelTemplateSampleCard({ template, selected, active, onActivate, onSelect, onWatch }: {
  template: ReelTemplate; selected: boolean; active: boolean; onActivate: (active: boolean) => void; onSelect: () => void; onWatch: () => void;
}) {
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = player.current;
    if (!video || !active) return;
    let visible = true;
    const play = () => { if (visible && !document.hidden) void video.play().catch(() => {}); };
    const visibility = () => { if (document.hidden) video.pause(); else play(); };
    const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible) play(); else video.pause(); });
    observer.observe(video); document.addEventListener('visibilitychange', visibility); play();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); video.pause(); };
  }, [active]);
  const activate = () => { if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) onActivate(true); };
  return <article className={`rounded-lg border overflow-hidden ${selected ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}>
    <button type="button" aria-label={`Use ${template.name} template`} aria-pressed={selected} onClick={onSelect}
      onMouseEnter={activate} onMouseLeave={() => onActivate(false)} onFocus={activate} onBlur={() => onActivate(false)} className="block w-full text-left p-0">
      <span className="relative block aspect-[4/3] bg-black overflow-hidden">
        <video ref={player} src={active ? reelSampleUrl(template.id, 'mp4') : undefined} poster={reelSampleUrl(template.id, 'jpg')}
          muted loop playsInline preload="none" aria-hidden="true" className="w-full h-full object-contain" />
        <span className="absolute top-2 left-2 rounded-full bg-black/70 text-white text-[10px] px-2 py-1">8s sample</span>
        {!active && <span className="absolute right-2 bottom-2 rounded-full bg-black/70 text-white p-2" aria-hidden="true"><Play size={14} /></span>}
      </span>
      <span className="block p-3">{template.instagram && <span className="block text-[10px] text-accent mb-1">Instagram-inspired · Song guide</span>}<strong className="block text-sm">{template.name}</strong><span className="block text-xs text-accent">{reelTemplateDuration(template).toFixed(0)}s reel · {template.beats.length} scenes · {template.bpm} BPM</span><span className="block text-xs text-fg-muted mt-1">{template.description}</span></span>
    </button>
    <div className="px-3 pb-3"><button type="button" onClick={onWatch} aria-label={`Watch ${template.name} sample`} className={`${BTN_SECONDARY} w-full flex items-center justify-center gap-2`}><Volume2 size={14} />Watch sample</button></div>
  </article>;
}

export function ReelTemplateSampleDialog({ template, onClose, onSelect }: { template: ReelTemplate; onClose: () => void; onSelect: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const video = player.current; return () => { video?.pause(); video?.removeAttribute('src'); video?.load(); }; }, []);
  return <AppDialog open onClose={onClose} title={`${template.name} sample`} showCloseButton size="lg"
    description="8-second excerpt with preset music, timing and effects. Your own photos and videos replace this sample media.">
    <video ref={player} src={reelSampleUrl(template.id, 'mp4')} poster={reelSampleUrl(template.id, 'jpg')} aria-label={`${template.name} sample video`}
      controls autoPlay playsInline preload="metadata" onError={() => setFailed(true)} className="w-full max-h-[52dvh] bg-black rounded-lg object-contain" />
    {failed && <p role="alert" className="text-sm text-danger">The sample could not load. Close and reopen it to retry.</p>}
    <p className="text-xs text-fg-muted m-0">{template.instagram && 'Sample soundtrack: original instrumental; the linked Instagram song is added separately. '}Full reel: {reelTemplateDuration(template).toFixed(1)}s · {template.bpm} BPM · {template.look} look · {template.motion} motion. Sample photos: Unsplash.</p>
    <div className="flex gap-2 justify-end"><button type="button" className={BTN_SECONDARY} onClick={onClose}>Close sample</button><button type="button" className={BTN_PRIMARY} onClick={onSelect}>Use this template</button></div>
  </AppDialog>;
}
