import { useCallback, useRef, useState } from 'react';
import { REEL_PRESETS, reelPresetEffects, REEL_PRESET_CATEGORIES, filterReelPresets, type ReelPresetId } from '@core/creative/ReelPresets';
import type { Template } from '@core/templates/domain/Template';
import { TemplatePreviewFrame } from '@ui/_shared/components/TemplatePreview/TemplatePreviewFrame';

interface Props {
  templates: readonly Template[];
  selected: ReelPresetId | null;
  onSelect: (id: ReelPresetId | null) => void;
}
export function ReelPresetGallery({ templates, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [limit, setLimit] = useState(6);
  const matches = filterReelPresets(query, category);
  const visible = matches.slice(0, limit);
  const chosen = REEL_PRESETS.find(p => p.id === selected);
  return <section aria-label="Reel templates" className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold m-0">Reel templates</h4><button type="button" className="text-xs text-accent" aria-pressed={!selected} onClick={() => onSelect(null)}>Use current caption look</button></div>
    <p className="text-xs text-fg-muted m-0">{REEL_PRESETS.length} editable recipes. The first six include lighting, pause cuts, zooms and opening elements. Hover to preview captions; apply to preview your full reel.</p>
    <input type="search" aria-label="Search reel templates" placeholder="Search templates, topics or styles…" value={query} onChange={e => { setQuery(e.target.value); setLimit(6); }} className="w-full rounded-md border border-edge-medium bg-surface-2 p-2 text-sm" />
    <div role="group" aria-label="Template categories" className="flex flex-wrap gap-2">{REEL_PRESET_CATEGORIES.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(6); }} className={`rounded-full border px-3 py-1 text-xs ${category === item ? 'border-accent bg-surface-3 text-accent' : 'border-edge-medium'}`}>{item}</button>)}</div>
    {chosen && <p aria-live="polite" className="text-xs text-accent m-0">Selected: {chosen.name} · {chosen.style} recommended</p>}
    <p className="text-xs text-fg-muted m-0" aria-live="polite">{matches.length} matching templates</p>
    {!matches.length && <p className="text-sm m-0">No templates match. Try another topic or choose All.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{visible.map(preset => <ReelPresetCard key={preset.id} preset={preset} template={templates.find(t => t.metadata.id === preset.templateId)} selected={selected === preset.id} onSelect={() => onSelect(preset.id)} />)}</div>
    {matches.length > limit && <button type="button" className="rounded-md border border-edge-medium p-2 text-sm" onClick={() => setLimit(value => value + 6)}>Show more templates ({matches.length - limit} remaining)</button>}
    <p className="text-xs text-fg-muted m-0">Original recipes inspired by common reel formats. Results depend on your content, audience and distribution.</p>
  </section>;
}
function ReelPresetCard({ preset, template, selected, onSelect }: { preset: typeof REEL_PRESETS[number]; template: Template | undefined; selected: boolean; onSelect: () => void }) {
  const host = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const stopHover = useCallback(() => setHovered(false), []);
  return <button ref={host} type="button" aria-label={`Use ${preset.name} template`} aria-pressed={selected} disabled={!template} onClick={onSelect} onMouseEnter={() => setHovered(true)} onMouseLeave={stopHover} onFocus={() => setHovered(true)} onBlur={stopHover} className={`rounded-lg border overflow-hidden p-0 text-left disabled:opacity-40 ${selected ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}>
    {template && <TemplatePreviewFrame template={template} isHovered={hovered} hostRef={host} onHoverLost={stopHover} aspectClass="aspect-[3/1]" />}
    <span className="block p-3"><strong className="block text-sm">{preset.name}</strong><span className="block text-xs text-accent mt-1">{preset.bestFor}</span><span className="block text-xs text-fg-muted mt-1">{preset.description}</span>{reelPresetEffects(preset.id) && <span className="flex flex-wrap gap-1 mt-2">{['Lighting', 'Pause cuts', 'Zoom', 'Elements'].map(label => <span key={label} className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{label}</span>)}</span>}<span className="block text-xs text-fg-muted mt-2">{template ? `${template.metadata.name} · ${preset.style} pacing` : 'Caption look unavailable in this browser'}</span></span>
  </button>;
}
