import { AssSubtitleFileSerializer, Document, type SubtitleGranularity } from '@tscaps/engine';
import type { Sheet } from '@core/sheets/domain/Sheet';
import type { VideoLayout } from '@core/editor/domain/VideoState';

/** ASS can carry the base typography, colours, positioning and karaoke.
 * CSS template animation, depth and layered artwork require video export. */
export function serializeStyledAss(document: Document, sheets: readonly Sheet[], layout: VideoLayout | null, granularity: SubtitleGranularity, skipRanges: readonly { startSec: number; endSec: number }[]): string {
  const serializer = new AssSubtitleFileSerializer();
  const width = Math.round(layout?.width || 720);
  const height = Math.round(layout?.height || 1280);
  const styles: string[] = [];
  const events: string[] = [];
  for (const [index, section] of document.sections.entries()) {
    const sheet = sheets.find(item => item.id === section.kind) ?? sheets[0];
    const name = `Caption${index}`;
    let position = '';
    if (sheet) {
      const typography = sheet.typographyConfig;
      const values = sheet.styleValues.values;
      const align = sheet.alignmentConfig;
      const horizontal = align.horizontalAlign;
      const rtl = sheet.textDirection === 'rtl';
      const right = horizontal === 'right' || (horizontal === 'end' && !rtl) || (horizontal === 'start' && rtl);
      const center = horizontal === 'center';
      const alignment = (align.verticalAlign === 'top' ? 6 : align.verticalAlign === 'center' ? 3 : 0) + (center ? 2 : right ? 3 : 1);
      const x = (horizontal === 'start' || horizontal === 'end') && rtl ? 1 - align.horizontalOffset : align.horizontalOffset;
      position = `{\\pos(${Math.round(x * width)},${Math.round(align.verticalOffset * height)})}`;
      const font = typography.fontStack.familyFor(/[\u0a80-\u0aff]/.test(section.getText()) ? 'gujarati' : /[\u0900-\u097f]/.test(section.getText()) ? 'devanagari' : 'latin').replace(/[,\r\n]/g, '');
      const text = assColour(values['primary-color'] ?? values['text-color'], '#ffffff');
      const accent = assColour(values['highlight-color'] ?? values['accent-color'], '#ffd84d');
      styles.push(`Style: ${name},${font},${Math.max(1, Math.round(typography.fontSize * height / 100))},${granularity === 'word' ? accent : text},${text},&H00000000,&H00000000,${typography.fontWeight >= 600 ? -1 : 0},${typography.italic ? -1 : 0},${typography.underline ? -1 : 0},${typography.strikethrough ? -1 : 0},100,100,${typography.letterSpacing},0,1,2,0,${alignment},0,0,0,1`);
    } else {
      styles.push(`Style: ${name},Arial,40,&H00FFFFFF,&H00FFD84D,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1`);
    }
    const sectionDocument = document.with({ sections: [section] });
    const body = serializer.serialize({ document: sectionDocument, granularity, skipRanges });
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('Dialogue: ')) continue;
      events.push(line.replace(/^(Dialogue: [^,]*,[^,]*,[^,]*,)Default(,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,)/, `$1${name}$2${position}`));
    }
  }
  const base = serializer.serialize({ document: new Document({ sections: [] }), granularity });
  const header = base.replace('PlayResX: 1920', `PlayResX: ${width}`).replace('PlayResY: 1080', `PlayResY: ${height}`)
    .replace(/^Style: Default,.*$/m, styles.join('\r\n'));
  return `${header.trimEnd()}\r\n${events.join('\r\n')}\r\n`;
}

function assColour(value: unknown, fallback: string): string {
  const hex = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : fallback.slice(1);
  return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toUpperCase();
}
