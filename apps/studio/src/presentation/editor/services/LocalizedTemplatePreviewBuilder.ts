import { Document, Section, Segment, Line, Word, TimeFragment, StructureTagger } from '@tscaps/engine';
import type { Template } from '@core/templates/domain/Template';
import { LineSplitterRegistry } from '@core/line-splitter/services/LineSplitterRegistry';
import { SegmentSplitterRegistry } from '@core/segment-splitter/services/SegmentSplitterRegistry';

export const TEMPLATE_PREVIEW_LANGUAGES = [
  { id: 'en', label: 'English', words: ['Make', 'every', 'video', 'look', 'amazing'] },
  { id: 'hi', label: 'हिन्दी Hindi', words: ['आपके', 'कैप्शन', 'हर', 'वीडियो', 'में', 'शानदार', 'दिखेंगे'] },
  { id: 'gu', label: 'ગુજરાતી Gujarati', words: ['તમારા', 'કૅપ્શન', 'દરેક', 'વીડિયોમાં', 'સરસ', 'દેખાશે'] },
] as const;
export type TemplatePreviewLanguage = typeof TEMPLATE_PREVIEW_LANGUAGES[number]['id'];

export class LocalizedTemplatePreviewBuilder {
  private readonly segments = new SegmentSplitterRegistry();
  private readonly lines = new LineSplitterRegistry();

  build(template: Template, language: TemplatePreviewLanguage, cssVars: Record<string, string>): Document {
    const words = TEMPLATE_PREVIEW_LANGUAGES.find(item => item.id === language)!.words.map((text, i) =>
      new Word({ text, time: new TimeFragment(i * 0.5, (i + 1) * 0.5) }));
    const context = { css: template.getCss(), cssVars, videoWidth: 720, videoHeight: 1280, fontSize: template.typography.fontSize, referenceFontSize: template.typography.fontSize };
    const grouped = this.segments.buildPipeline(template.segmentSplitterConfigs, context)
      .split([new Segment({ lines: [new Line({ words })] })]);
    const split = this.lines.build(template.lineSplitter, context).split(grouped);
    return new StructureTagger().tag(new Document({ sections: [new Section({ kind: 'main', segments: split })] }));
  }
}
