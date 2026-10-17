import { describe, expect, it } from 'vitest';
import { FontScriptClassifier } from '@core/fonts/services/FontScriptClassifier';

describe('Gujarati captions', () => {
  it('classifies Gujarati and keeps mixed Hindi/English scripts', () => {
    const classifier = new FontScriptClassifier();
    expect(classifier.classify('તમારા કૅપ્શન સરસ દેખાશે')).toBe('gujarati');
    expect(classifier.scriptsIn('કૅપ્શન वीडियो ReelStudio')).toEqual(new Set(['gujarati', 'devanagari', 'latin']));
    expect(classifier.otherLetterCodepoints('કૅપ્શન')).toEqual(new Set());
  });
});
