import { useCallback, useRef, useState } from 'react';
import { REEL_PRESETS, type ReelPresetId } from '@core/creative/ReelPresets';
import type { Template } from '@core/templates/domain/Template';
import { TemplatePreviewFrame } from '@ui/_shared/components/TemplatePreview/TemplatePreviewFrame';

interface Props {
  templates: readonly Template[];
  selected: ReelPresetId | null;
  onSelect: (id: ReelPresetId | null) => void;
}
export function ReelPresetGallery({ templates, selected, onSelect }: Props) {
  return <section aria-label="Reel templates" className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold m-0">Reel templates</h4><button type="button" className="text-xs text-accent" aria-pressed={!selected} onClick={() => onSelect(null)}>Use current caption look</button></div>
    <p className="text-xs text-fg-muted m-0">Creator-style recipes pair a caption look with pacing and zooms. Hover to preview captions; apply to preview your full reel.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{REEL_PRESETS.map(preset => <ReelPresetCard key={preset.id} preset={preset} template={templates.find(t => t.metadata.id === preset.templateId)} selected={selected === preset.id} onSelect={() => onSelect(preset.id)} />)}</div>
    <p className="text-xs text-fg-muted m-0">Original recipes inspired by common reel formats. Results depend on your content, audience and distribution.</p>
  </section>;
}
function ReelPresetCard({ preset, template, selected, onSelect }: { preset: typeof REEL_PRESETS[number]; template: Template | undefined; selected: boolean; onSelect: () => void }) {
  const host = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const stopHover = useCallback(() => setHovered(false), []);
  return <button ref={host} type="button" aria-label={`Use ${preset.name} template`} aria-pressed={selected} disabled={!template} onClick={onSelect} onMouseEnter={() => setHovered(true)} onMouseLeave={stopHover} onFocus={() => setHovered(true)} onBlur={stopHover} className={`rounded-lg border overflow-hidden p-0 text-left disabled:opacity-40 ${selected ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}>
    {template && <TemplatePreviewFrame template={template} isHovered={hovered} hostRef={host} onHoverLost={stopHover} aspectClass="aspect-[3/1]" />}
    <span className="block p-3"><strong className="block text-sm">{preset.name}</strong><span className="block text-xs text-accent mt-1">{preset.bestFor}</span><span className="block text-xs text-fg-muted mt-1">{preset.description}</span><span className="block text-xs text-fg-muted mt-2">{template ? `${template.metadata.name} · ${preset.style} pacing` : 'Caption look unavailable in this browser'}</span></span>
  </button>;
}
