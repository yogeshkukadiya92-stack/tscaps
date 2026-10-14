import { describe, expect, it } from 'vitest';
import { Document, Line, Section, Segment, TimeFragment, Word } from '@tscaps/engine';
import { HinglishRomanizer } from '@core/transcription/services/HinglishRomanizer';

const romanizer = new HinglishRomanizer();
describe('Roman Hinglish captions', () => {
  it('uses natural spellings for mixed Hindi and English without translating the sentence', () => {
    expect(romanizer.text('आज हम video एडिट करेंगे।')).toBe('aaj hum video edit karenge.');
    expect(romanizer.text('मैं अभी Instagram पर रील्स बना रहा हूँ।')).toBe('main abhi Instagram par reels bana raha hoon.');
    expect(romanizer.text('इसके लिए आप ये कर सकते हैं!')).toBe('iske liye aap ye kar sakte hain!');
  });
  it('handles unknown Hindi words, digits, and punctuation', () => {
    expect(romanizer.text('कमल, भारत १२३!')).toBe('kamal, bhaarat 123!');
    expect(romanizer.text('रचना')).toBe('rachnaa');
  });
  it('leaves Latin words, spelling, numbers, and emojis untouched', () => {
    const text = 'ReelStudio AI — 1080p cafe\u0301 🚀';
    expect(romanizer.text(text)).toBe(text);
  });
  it('retains word IDs, timing, metadata, and section topology for karaoke and undo', () => {
    const hindi = new Word({ id: 'w1', text: 'आज', time: new TimeFragment(0.2, 0.6), metadata: { source: 'asr' }, speakerId: 'speaker1' });
    const english = new Word({ id: 'w2', text: 'video', time: new TimeFragment(0.6, 1) });
    const original = new Document({ sections: [new Section({ id: 'sheet', kind: 'main', segments: [new Segment({ id: 'scene', lines: [new Line({ id: 'line', words: [hindi, english] })] })] })] });
    const result = romanizer.document(original);
    const words = result.getWords();
    expect(words[0]?.text).toBe('aaj'); expect(words[0]?.displayText).toBe('aaj');
    expect(words[0]?.id).toBe(hindi.id); expect(words[0]?.time).toBe(hindi.time);
    expect(words[0]?.speakerId).toBe('speaker1'); expect(words[0]?.metadata).toBe(hindi.metadata);
    expect(words[1]).toBe(english); expect(result.sections[0]?.id).toBe('sheet');
    expect(result.getSegments()[0]?.id).toBe('scene'); expect(result.language).toBe('hi-Latn');
    expect(original.getWords()[0]?.text).toBe('आज');
  });
});
