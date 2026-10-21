import { UiText, useTranslation } from '@ui/i18n/Locale';
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
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [limit, setLimit] = useState(6);
  const matches = filterReelPresets('', category).filter(preset => `${preset.name} ${preset.description} ${preset.bestFor} ${t(preset.description)} ${t(preset.bestFor)}`.toLowerCase().includes(query.toLowerCase()));
  const visible = matches.slice(0, limit);
  const chosen = REEL_PRESETS.find(p => p.id === selected);
  return <section data-ui="reel-presets" aria-label={t("Reel templates")} className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold m-0"><UiText text="Reel templates" /></h4><button type="button" className="text-xs text-accent" aria-pressed={!selected} data-ui="current-caption-look" onClick={() => onSelect(null)}><UiText text="Use current caption look" /></button></div>
    <p className="text-xs text-fg-muted m-0">{REEL_PRESETS.length}<UiText text=" editable recipes. The first six include lighting, pause cuts, zooms and opening elements. Hover to preview captions; apply to preview your full reel." /></p>
    <input data-ui="search-reel-presets" type="search" aria-label={t("Search reel templates")} placeholder={t("Search templates, topics or styles…")} value={query} onChange={e => { setQuery(e.target.value); setLimit(6); }} className="w-full rounded-md border border-edge-medium bg-surface-2 p-2 text-sm" />
    <div role="group" aria-label={t("Template categories")} className="flex flex-wrap gap-2">{REEL_PRESET_CATEGORIES.map(item => <button key={item} data-category={item} type="button" aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(6); }} className={`rounded-full border px-3 py-1 text-xs ${category === item ? 'border-accent bg-surface-3 text-accent' : 'border-edge-medium'}`}><UiText text={item} /></button>)}</div>
    {chosen && <p aria-live="polite" className="text-xs text-accent m-0"><UiText text="Selected: " />{chosen.name} · {chosen.style}<UiText text=" recommended" /></p>}
    <p className="text-xs text-fg-muted m-0" aria-live="polite">{matches.length}<UiText text=" matching templates" /></p>
    {!matches.length && <p className="text-sm m-0"><UiText text="No templates match. Try another topic or choose All." /></p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{visible.map(preset => <ReelPresetCard key={preset.id} preset={preset} template={templates.find(t => t.metadata.id === preset.templateId)} selected={selected === preset.id} onSelect={() => onSelect(preset.id)} />)}</div>
    {matches.length > limit && <button type="button" className="rounded-md border border-edge-medium p-2 text-sm" onClick={() => setLimit(value => value + 6)}><UiText text="Show more templates (" />{matches.length - limit}<UiText text=" remaining)" /></button>}
    <p className="text-xs text-fg-muted m-0"><UiText text="Original recipes inspired by common reel formats. Results depend on your content, audience and distribution." /></p>
  </section>;
}
function ReelPresetCard({ preset, template, selected, onSelect }: { preset: typeof REEL_PRESETS[number]; template: Template | undefined; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const host = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const stopHover = useCallback(() => setHovered(false), []);
  return <button data-reel-preset={preset.id} ref={host} type="button" aria-label={t("Use {0} template", { 0: preset.name })} aria-pressed={selected} disabled={!template} onClick={onSelect} onMouseEnter={() => setHovered(true)} onMouseLeave={stopHover} onFocus={() => setHovered(true)} onBlur={stopHover} className={`rounded-lg border overflow-hidden p-0 text-left disabled:opacity-40 ${selected ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}>
    {template && <TemplatePreviewFrame template={template} isHovered={hovered} hostRef={host} onHoverLost={stopHover} aspectClass="aspect-[3/1]" />}
    <span className="block p-3"><strong className="block text-sm"><UiText text={preset.name} /></strong><span className="block text-xs text-accent mt-1"><UiText text={preset.bestFor} /></span><span className="block text-xs text-fg-muted mt-1"><UiText text={preset.description} /></span>{reelPresetEffects(preset.id) && <span className="flex flex-wrap gap-1 mt-2">{['Lighting', 'Pause cuts', 'Zoom', 'Elements'].map(label => <span key={label} className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"><UiText text={label} /></span>)}</span>}<span className="block text-xs text-fg-muted mt-2">{template ? t("{0} · {1} pacing", { 0: template.metadata.name, 1: preset.style }) : t('Caption look unavailable in this browser')}</span></span>
  </button>;
}
