import { useRef, useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { AppDialog } from '@ui/_shared/components/Dialog/AppDialog';
import { useTranslation } from '@ui/i18n/Locale';
import type { CaptionsTabId } from '@presentation/editor/stores/CaptionsTabStore';

const captionTools: { tab: CaptionsTabId; label: string }[] = [
  { tab: 'transcript', label: 'Edit words' }, { tab: 'templates', label: 'Choose style' },
  { tab: 'typography', label: 'Typography' }, { tab: 'style', label: 'Colors' },
  { tab: 'position', label: 'Position' }, { tab: 'motion', label: 'Animation' },
  { tab: 'effects', label: 'Effects' }, { tab: 'layout', label: 'Layout' }, { tab: 'code', label: 'Code' },
];
const creativeTools = [
  { tab: 'Auto', label: 'Auto Edit' }, { tab: 'Templates', label: 'Reel templates' },
  { tab: 'Clips', label: 'Clips' }, { tab: 'B-roll', label: 'B-roll / picture-in-picture' },
  { tab: 'Audio', label: 'Voice & music' }, { tab: 'Effects', label: 'Motion Effects' },
  { tab: 'Timing', label: 'Trim' }, { tab: 'Background', label: 'Change background' }, { tab: 'Look', label: 'Look & motion' },
];

export function EditorToolFinder({ onCaption, onCreative, disabled = false }: {
  disabled?: boolean;
  onCaption: (tab: CaptionsTabId) => void;
  onCreative: (tool: string) => void;
}) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = (label: string) => `${label} ${t(label)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const captions = captionTools.filter(tool => matches(tool.label));
  const creative = creativeTools.filter(tool => matches(tool.label));
  return <>
    <button ref={trigger} disabled={disabled} type="button" onClick={() => { setQuery(''); setOpen(true); }} className="inline-flex shrink-0 items-center gap-2 rounded-md border border-edge-medium bg-surface-1 px-3 py-2 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <Search size={16} /><span>{t('All tools')}</span>
    </button>
    {open && <AppDialog onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} open={open} onClose={() => setOpen(false)} title={t('All tools')} description={t('Choose a tool to open it directly.')} showCloseButton size="lg">
      <input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('Find a tool')} placeholder={t('Find a tool')} className="w-full rounded-md border border-edge-medium bg-surface-1 p-3 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      {captions.length > 0 && <section><h3 className="mb-2 text-sm text-fg-muted">{t('Captions')}</h3><div className="grid grid-cols-2 gap-2">{captions.map(tool => <button type="button" key={tool.tab} className="flex items-center justify-between gap-2 rounded-md border border-edge-subtle p-3 text-left text-sm hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent" onClick={() => { onCaption(tool.tab); setOpen(false); }}>{t(tool.label)}<ArrowRight size={14} className="shrink-0" /></button>)}</div></section>}
      {creative.length > 0 && <section><h3 className="mb-2 text-sm text-fg-muted">{t('Creative')}</h3><div className="grid grid-cols-2 gap-2">{creative.map(tool => <button type="button" key={tool.tab} className="flex items-center justify-between gap-2 rounded-md border border-edge-subtle p-3 text-left text-sm hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent" onClick={() => { onCreative(tool.tab); setOpen(false); }}>{t(tool.label)}<ArrowRight size={14} className="shrink-0" /></button>)}</div></section>}
      {!captions.length && !creative.length && <p role="status" className="text-sm text-fg-muted">{t('No tools found. Try another word.')}</p>}
    </AppDialog>}
  </>;
}
