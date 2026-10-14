import { describe, expect, it } from 'vitest';
import { Document, Section, Segment, Line, Word, TimeFragment } from '@tscaps/engine';
import type { Sheet } from '@core/sheets/domain/Sheet';
import { TYPOGRAPHY_DEFAULTS } from '@core/sheets/domain/TypographyConfig';
import { serializeStyledAss } from '@core/export/services/StyledAssSubtitleSerializer';

const sheet = {
  id: 'main', typographyConfig: { ...TYPOGRAPHY_DEFAULTS, fontSize: 5, fontWeight: 700 },
  styleValues: { values: { 'primary-color': '#112233', 'highlight-color': '#ff8800' } },
  alignmentConfig: { horizontalAlign: 'center', horizontalOffset: 0.5, verticalAlign: 'bottom', verticalOffset: 0.9 },
  textDirection: 'ltr',
} as unknown as Sheet;
const document = new Document({ sections: [new Section({ kind: 'main', segments: [new Segment({ lines: [new Line({ words: [new Word({ text: 'Hello {test}', time: new TimeFragment(5, 7) })] })] })] })] });

describe('Styled ASS download', () => {
  it('carries typography, ABGR colours, positioning, timing and safely escaped text', () => {
    const result = serializeStyledAss(document, [sheet], { width: 720, height: 1280 }, 'segment', []);
    expect(result).toContain('PlayResX: 720');
    expect(result).toContain(',64,&H00332211,&H00332211,');
    expect(result).toContain('Dialogue: 0,0:00:05.00,0:00:07.00,Caption0');
    expect(result).toContain('{\\pos(360,1152)}');
    expect(result).toContain('Hello \\{test\\}');
    expect(result).not.toContain('Style: Default');
  });
  it('keeps cut-adjusted timing and karaoke in the styled file', () => {
    const result = serializeStyledAss(document, [sheet], null, 'word', [{ startSec: 2, endSec: 4 }]);
    expect(result).toContain('0:00:03.00,0:00:05.00');
    expect(result).toContain('\\k200');
    expect(result).toContain('&H000088FF');
  });
  it('uses each section’s design instead of the currently selected sheet', () => {
    const other = { ...sheet, id: 'other', typographyConfig: { ...sheet.typographyConfig, fontSize: 10 } } as unknown as Sheet;
    const multi = document.with({ sections: [...document.sections, document.sections[0]!.with({ kind: 'other' })] });
    const result = serializeStyledAss(multi, [sheet, other], null, 'segment', []);
    expect(result).toMatch(/Style: Caption1,[^,]+,128,/);
    expect(result).toContain(',Caption1,');
  });
});
