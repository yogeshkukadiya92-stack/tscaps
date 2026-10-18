import type { Document } from '@tscaps/engine';
import { useState } from 'react';
import type { Template } from '@core/templates/domain/Template';
import type { TemplateLibraryView } from '@core/templates/store/TemplateLibraryStore';
import type { SheetScope } from '@ui/pages/editor/components/sidebar/tabs/EditorTab';
import { TemplatesTab } from '@ui/pages/editor/components/sidebar/tabs/TemplatesTab';
import { TypographyTab } from '@ui/pages/editor/components/sidebar/tabs/TypographyTab';
import { StyleTab } from '@ui/pages/editor/components/sidebar/tabs/StyleTab';
import { PositionTab } from '@ui/pages/editor/components/sidebar/tabs/PositionTab';
import { MotionTab } from '@ui/pages/editor/components/sidebar/tabs/motion/MotionTab';

const sections = ['Templates', 'Font & size', 'Style & colour', 'Position', 'Animation'] as const;
type Section = typeof sections[number];

export function CreativeCaptionControls({ sheetScope, templates, library, document }: {
  document: Document | null; sheetScope: SheetScope; templates: Template[]; library: TemplateLibraryView;
}) {
  const [section, setSection] = useState<Section>('Templates');
  return <div className="flex flex-col gap-3 min-w-0">
    <h3 className="font-semibold m-0">Customize captions</h3>
    <p className="text-xs text-fg-muted m-0">Make this reel yours. Changes update the reel preview. Use Undo to restore a change, then Save creative changes to keep it.</p>
    <label className="text-xs flex flex-col gap-1">Caption settings
      <select className="w-full min-w-0 bg-surface-1 border border-edge-medium rounded-sm p-2 text-sm text-fg-primary" value={section} onChange={event => setSection(event.target.value as Section)}>
        {sections.map(name => <option key={name}>{name}</option>)}
      </select>
    </label>
    {section === 'Templates' && <TemplatesTab sheetScope={sheetScope} templates={templates} library={library} />}
    {section === 'Font & size' && <TypographyTab sheetScope={sheetScope} />}
    {section === 'Style & colour' && <StyleTab sheetScope={sheetScope} />}
    {section === 'Position' && <PositionTab sheetScope={sheetScope} />}
    {section === 'Animation' && <MotionTab sheetScope={sheetScope} document={document} />}
  </div>;
}
