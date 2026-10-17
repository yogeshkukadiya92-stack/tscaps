import { LocalizedTemplatePreviewBuilder } from '@presentation/editor/services/LocalizedTemplatePreviewBuilder';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { Template } from '@core/templates/domain/Template';
import { TEMPLATE_PREVIEW_LANGUAGES, type TemplatePreviewLanguage } from '@ui/_shared/contexts/TemplatePreviewLanguageContext';

const builder = new LocalizedTemplatePreviewBuilder();

/** Localized samples use the preset's grouping and narration clock, including hero lines. */
export function TemplatePreviewLocalized({ template, language, isHovered, hostRef, onHoverLost, cssVars }: {
  template: Template;
  language: TemplatePreviewLanguage;
  isHovered: boolean;
  hostRef: RefObject<HTMLElement>;
  onHoverLost: () => void;
  cssVars: Record<string, string>;
}) {
  const [time, setTime] = useState(0.75);
  const document = useMemo(() => builder.build(template, language, cssVars), [template, language, cssVars]);
  const duration = TEMPLATE_PREVIEW_LANGUAGES.find(item => item.id === language)!.words.length * 0.5;

  useEffect(() => {
    if (!isHovered) return;
    let start: number | undefined;
    let frame: number;
    const tick = (now: number) => {
      if (hostRef.current && !hostRef.current.matches(':hover')) { onHoverLost(); return; }
      start ??= now;
      setTime(((now - start) / 1000) % duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isHovered, duration, hostRef, onHoverLost, language]);

  const t = isHovered ? time : 0.75;
  const all = document.sections[0]!.segments;
  const index = Math.max(0, all.findIndex(segment => segment.time.start <= t && t < segment.time.end));
  const segment = all[index]!;
  const segTime = segment.time;
  return <div lang={language} className={segment.getCssClasses(t).join(' ')} style={segment.getCssVariables(t, { indexInSection: index }) as React.CSSProperties}>
    {segment.lines.map((line, i) => <div key={i} className={line.getCssClasses(t).join(' ')} style={line.getCssVariables(t, { segTime }) as React.CSSProperties}>
      {line.words.map((word, indexInLine) => <span key={indexInLine} className={word.getCssClasses(t).join(' ')} style={word.getCssVariables(t, { segTime, indexInLine }) as React.CSSProperties}>{word.text}</span>)}
    </div>)}
  </div>;
}
