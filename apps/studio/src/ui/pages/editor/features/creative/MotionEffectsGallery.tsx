import { MOTION_EFFECTS, chartRows, newMotionEffect, transitionBoundary, type MotionEffect, type MotionEffectKind } from '@core/creative/MotionEffects';

const INPUT = 'w-full min-w-0 bg-surface-1 border border-edge-medium rounded-sm p-2 text-sm text-fg-primary';
interface Props {
  effects: readonly MotionEffect[];
  duration: number;
  time: number;
  boundaries: readonly number[];
  onChange: (effects: MotionEffect[]) => void;
  onSeek: (time: number) => void;
  ready: boolean;
}
export function MotionEffectsGallery({ effects, duration, time, boundaries, onChange, onSeek, ready }: Props) {
  const update = (id: string, patch: Partial<MotionEffect>) => onChange(effects.map(e => e.id === id ? { ...e, ...patch } : e));
  const add = (kind: MotionEffectKind) => {
    let start = Math.min(time, Math.max(0, duration - 1));
    let end = Math.min(duration, start + 4);
    if (kind === 'zoom-through') {
      const boundary = [...boundaries].sort((a, b) => Math.abs(a - time) - Math.abs(b - time))[0];
      if (boundary === undefined) return;
      start = Math.max(0, boundary - 0.4); end = Math.min(duration, boundary + 0.4);
    }
    onChange([...effects, newMotionEffect(kind, start, end)]);
  };
  return <section className="flex flex-col gap-3" aria-label="Motion Effects">
    <div><h3 className="font-semibold m-0">Motion Effects</h3><p className="text-xs text-fg-muted mt-1">Choose a look for your reel. Effects use the edited reel timeline and include your captions and B-roll.</p></div>
    <div className="grid grid-cols-2 gap-2">{MOTION_EFFECTS.map(preset => <button key={preset.kind} type="button" disabled={duration < 0.1 || effects.length >= 40 || (preset.kind === 'zoom-through' && !boundaries.length)}
      onClick={() => add(preset.kind)} className="text-left rounded-lg border border-edge-medium bg-surface-2 p-3 hover:border-accent disabled:opacity-40" aria-label={`Add ${preset.name}`}>
      <span className="text-xl text-accent block mb-2" aria-hidden="true">{preset.icon}</span><span className="text-sm font-semibold block">{preset.name}</span><span className="text-xs text-fg-muted block mt-1">{preset.hint}</span>
    </button>)}</div>
    {!boundaries.length && <p className="text-xs text-fg-muted m-0">Split a clip or add another clip to enable Zoom-through Cut.</p>}
    {effects.map((effect, index) => <div key={effect.id} className="rounded-lg border border-edge-medium p-3 flex flex-col gap-3" data-testid="motion-effect">
      <div className="flex justify-between gap-2"><strong className="text-sm">{index + 1}. {MOTION_EFFECTS.find(p => p.kind === effect.kind)?.name}</strong><button type="button" className="text-xs text-danger" onClick={() => onChange(effects.filter(e => e.id !== effect.id))}>Remove effect</button></div>
      <div className="grid grid-cols-2 gap-2">{(['start', 'end'] as const).map(key => <label key={key} className="text-xs">{key === 'start' ? 'Start' : 'End'} (seconds)<input className={INPUT} aria-label={`Effect ${index + 1} ${key}`} type="number" step="0.1" min={key === 'start' ? 0 : effect.start + 0.05} max={key === 'start' ? effect.end - 0.05 : duration} value={Number(effect[key].toFixed(3))} onChange={event => {
        const n = event.target.valueAsNumber;
        if (Number.isFinite(n)) update(effect.id, { [key]: Math.max(key === 'start' ? 0 : effect.start + 0.05, Math.min(key === 'start' ? effect.end - 0.05 : duration, n)) });
      }} /></label>)}</div>
      {effect.end > duration && <p role="status" className="text-xs text-danger">This effect extends past the reel. Adjust its end time.</p>}
      {effect.kind === 'zoom-through' && transitionBoundary(effect.start, effect.end, boundaries) === undefined && <p role="status" className="text-xs text-danger">No cut inside this range. Move the range across a clip boundary to activate this effect.</p>}
      {!['digital-zoom', 'zoom-through'].includes(effect.kind) && <>
        <label className="text-xs">Title<input className={INPUT} aria-label={`Effect ${index + 1} title`} maxLength={80} value={effect.title} onChange={e => update(effect.id, { title: e.target.value })} /></label>
        <label className="text-xs">{effect.kind === 'chart-grow' ? 'Data: label | number, one per line (up to 6)' : 'One headline or point per line (up to 6)'}<textarea className={INPUT} aria-label={`Effect ${index + 1} content`} rows={3} maxLength={600} value={effect.lines} onChange={e => update(effect.id, { lines: e.target.value })} /></label>
        {effect.kind === 'chart-grow' && chartRows(effect.lines).length !== effect.lines.split('\n').filter(s => s.trim()).length && <p role="status" className="text-xs text-danger">Use up to six rows such as Sales | 50. Values must be non-negative numbers; invalid rows are skipped.</p>}
        <label className="text-xs flex items-center gap-2">Accent colour<input type="color" aria-label={`Effect ${index + 1} colour`} value={effect.color} onChange={e => update(effect.id, { color: e.target.value })} /></label>
      </>}
      {['digital-zoom', 'zoom-through', 'phone-mockup', 'headline-wall', 'pull-back'].includes(effect.kind) && <label className="text-xs">Intensity<input className="w-full" aria-label={`Effect ${index + 1} intensity`} type="range" min="0" max="1" step="0.05" value={effect.intensity} onChange={e => update(effect.id, { intensity: Number(e.target.value) })} /></label>}
      {['digital-zoom', 'zoom-through', 'checklist'].includes(effect.kind) && <div className="grid grid-cols-2 gap-2">{(['x', 'y'] as const).filter(key => effect.kind !== 'checklist' || key === 'y').map(key => <label key={key} className="text-xs">{key.toUpperCase()} position<input className="w-full" aria-label={`Effect ${index + 1} ${key} position`} type="range" min="0" max="1" step="0.01" value={effect[key]} onChange={e => update(effect.id, { [key]: Number(e.target.value) })} /></label>)}</div>}
      <div className="flex gap-3 text-xs"><button type="button" disabled={!ready || effect.start >= duration} onClick={() => onSeek(Math.min(duration - 0.001, (effect.start + effect.end) / 2))}>Preview effect</button><button type="button" disabled={index === 0} onClick={() => { const next = [...effects]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; onChange(next); }}>Move earlier in layer order</button></div>
    </div>)}
    {!!effects.length && <p className="text-xs text-fg-muted m-0">Overlapping effects combine in the order shown. Timing stays at these reel seconds when you trim or reorder clips. Save to keep your effects.</p>}
  </section>;
}
