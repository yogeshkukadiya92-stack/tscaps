import { newMotionEffect, type MotionEffect } from './MotionEffects';
export const CONTENT_LANGUAGES = { en: 'English', hi: 'हिन्दी', gu: 'ગુજરાતી' } as const;
export type ContentLanguage = keyof typeof CONTENT_LANGUAGES;
export const CONTENT_FORMATS = ['talking-head', 'listicle', 'myth-fact', 'comment-reply', 'before-after', 'breakdown'] as const;
export type ContentFormat = typeof CONTENT_FORMATS[number];
export interface ContentDraft { hook: string; points: string[]; cta: string }
export const CONTENT_COPY = {
  en: {
    heading: 'Content Formats', language: 'Language', topic: 'Topic', topicDefault: 'Better reels', hook: 'Opening hook', cta: 'Call to action', point: 'Point', apply: 'Apply to reel', sample: 'Load example', preview: 'Storyboard preview', duration: 'Scene duration (seconds)',
    intro: 'Choose a format, edit the script, then apply timed cards to your current clips.',
    note: 'Cards use your current video and clip order. Add or replace footage in Clips. Captions are edited separately. Apply replaces previous format cards; Undo restores them.',
    short: 'The scene timings exceed your reel. Shorten the scenes or add footage in Clips.', done: 'Format applied. Play the preview, then render your reel.',
    names: ['Talking Head', 'Listicle', 'Myth vs Fact', 'Comment Reply', 'Before / After', 'Breakdown'],
    hints: ['One idea, explained to camera.', 'Three numbered tips, one at a time.', 'Challenge a belief, explain the fact.', 'Show a viewer question and your answer.', 'Show the before clip, then the after clip.', 'Explain a process in three clear steps.'],
    labels: [['Main idea', 'Example'], ['Tip 1', 'Tip 2', 'Tip 3'], ['Myth', 'Fact'], ['Viewer comment', 'Your reply'], ['Before', 'After'], ['Step 1', 'Step 2', 'Step 3']],
    hooks: ['Let’s talk about {topic}', '3 ways to improve {topic}', 'A common myth about {topic}', 'Your question about {topic}', '{topic}: see the difference', '{topic}, step by step'],
    examples: [['Start with one clear idea.', 'Show a real example.'], ['Start with the result.', 'Explain one useful idea.', 'Make the text easy to read.'], ['More effects always make a better reel.', 'Clear storytelling matters more than extra effects.'], ['How can I make my videos clearer?', 'Keep one idea per scene and use readable captions.'], ['The original version.', 'The result after your changes.'], ['Choose your goal.', 'Show how you do it.', 'Review the result.']],
    ctaDefault: 'Save this for your next reel.',
  },
  hi: {
    heading: 'कॉन्टेंट फ़ॉर्मेट', language: 'भाषा', topic: 'विषय', topicDefault: 'बेहतर रील्स', hook: 'शुरुआती हुक', cta: 'अंतिम संदेश', point: 'बिंदु', apply: 'रील पर लागू करें', sample: 'उदाहरण भरें', preview: 'स्टोरीबोर्ड प्रीव्यू', duration: 'दृश्य की अवधि (सेकंड)',
    intro: 'फ़ॉर्मेट चुनें, अपना संदेश लिखें और मौजूदा क्लिप पर समय के अनुसार कार्ड जोड़ें।',
    note: 'कार्ड मौजूदा वीडियो और क्लिप के क्रम पर लगेंगे। Clips में वीडियो जोड़ें या बदलें। कैप्शन अलग से बदलें। लागू करने पर पिछले फ़ॉर्मेट कार्ड बदलेंगे; Undo से वापस आएँगे।',
    short: 'दृश्यों का समय रील से अधिक है। समय घटाएँ या Clips में वीडियो जोड़ें।', done: 'फ़ॉर्मेट लागू हो गया। प्रीव्यू चलाएँ, फिर रील रेंडर करें।',
    names: ['कैमरे पर बातचीत', 'नंबर वाली सूची', 'मिथक बनाम तथ्य', 'कमेंट का जवाब', 'पहले / बाद में', 'चरणों में समझाएँ'],
    hints: ['कैमरे पर एक विचार समझाएँ।', 'तीन सुझाव, एक-एक करके।', 'मान्यता बताएँ, फिर सही जानकारी दें।', 'दर्शक का सवाल और अपना जवाब दिखाएँ।', 'पहले वाली क्लिप, फिर बदलाव का नतीजा दिखाएँ।', 'प्रक्रिया को तीन चरणों में समझाएँ।'],
    labels: [['मुख्य विचार', 'उदाहरण'], ['सुझाव 1', 'सुझाव 2', 'सुझाव 3'], ['मिथक', 'तथ्य'], ['दर्शक का कमेंट', 'आपका जवाब'], ['पहले', 'बाद में'], ['चरण 1', 'चरण 2', 'चरण 3']],
    hooks: ['आइए बात करें: {topic}', '{topic} के लिए 3 सुझाव', '{topic} से जुड़ा एक मिथक', '{topic} पर आपका सवाल', '{topic}: फ़र्क देखिए', '{topic}, चरण दर चरण'],
    examples: [['एक स्पष्ट विचार से शुरू करें।', 'एक असली उदाहरण दिखाएँ।'], ['पहले नतीजा दिखाएँ।', 'एक उपयोगी बात समझाएँ।', 'लिखावट पढ़ने में आसान रखें।'], ['ज़्यादा इफ़ेक्ट से रील हमेशा बेहतर होती है।', 'अच्छी कहानी अतिरिक्त इफ़ेक्ट से ज़्यादा मायने रखती है।'], ['अपने वीडियो को स्पष्ट कैसे बनाऊँ?', 'हर दृश्य में एक विचार और साफ़ कैप्शन रखें।'], ['बदलाव से पहले का वीडियो।', 'बदलाव के बाद का नतीजा।'], ['अपना लक्ष्य चुनें।', 'तरीका दिखाएँ।', 'नतीजा जाँचें।']],
    ctaDefault: 'अपनी अगली रील के लिए इसे सेव करें।',
  },
  gu: {
    heading: 'કન્ટેન્ટ ફોર્મેટ', language: 'ભાષા', topic: 'વિષય', topicDefault: 'વધુ સારી રીલ્સ', hook: 'શરૂઆતનું હુક', cta: 'અંતિમ સંદેશ', point: 'મુદ્દો', apply: 'રીલ પર લાગુ કરો', sample: 'ઉદાહરણ ભરો', preview: 'સ્ટોરીબોર્ડ પ્રીવ્યૂ', duration: 'દૃશ્યનો સમય (સેકન્ડ)',
    intro: 'ફોર્મેટ પસંદ કરો, તમારું લખાણ બદલો અને હાલની ક્લિપ્સ પર સમય પ્રમાણે કાર્ડ ઉમેરો.',
    note: 'કાર્ડ હાલના વિડિયો અને ક્લિપના ક્રમ પર લાગશે. Clipsમાં વિડિયો ઉમેરો કે બદલો. કેપ્શન અલગથી બદલો. લાગુ કરવાથી અગાઉના ફોર્મેટ કાર્ડ બદલાશે; Undoથી પાછા આવશે.',
    short: 'દૃશ્યોનો સમય રીલ કરતાં વધારે છે. સમય ઘટાડો અથવા Clipsમાં વિડિયો ઉમેરો.', done: 'ફોર્મેટ લાગુ થઈ ગયું. પ્રીવ્યૂ ચલાવો, પછી રીલ રેન્ડર કરો.',
    names: ['કેમેરા સામે વાત', 'નંબરવાળી યાદી', 'માન્યતા સામે હકીકત', 'કમેન્ટનો જવાબ', 'પહેલાં / પછી', 'પગલાંમાં સમજાવો'],
    hints: ['કેમેરા સામે એક વિચાર સમજાવો.', 'ત્રણ સૂચનો, એક પછી એક.', 'માન્યતા બતાવો અને સાચી માહિતી આપો.', 'દર્શકનો સવાલ અને તમારો જવાબ બતાવો.', 'પહેલાંની ક્લિપ પછી બદલાવનું પરિણામ બતાવો.', 'પ્રક્રિયાને ત્રણ સ્પષ્ટ પગલાંમાં સમજાવો.'],
    labels: [['મુખ્ય વિચાર', 'ઉદાહરણ'], ['સૂચન 1', 'સૂચન 2', 'સૂચન 3'], ['માન્યતા', 'હકીકત'], ['દર્શકની કમેન્ટ', 'તમારો જવાબ'], ['પહેલાં', 'પછી'], ['પગલું 1', 'પગલું 2', 'પગલું 3']],
    hooks: ['ચાલો વાત કરીએ: {topic}', '{topic} માટે 3 સૂચનો', '{topic} વિશે એક માન્યતા', '{topic} વિશે તમારો સવાલ', '{topic}: ફરક જુઓ', '{topic}, પગલુંદરપગલું'],
    examples: [['એક સ્પષ્ટ વિચારથી શરૂઆત કરો.', 'એક સાચું ઉદાહરણ બતાવો.'], ['પહેલાં પરિણામ બતાવો.', 'એક ઉપયોગી વાત સમજાવો.', 'લખાણ સરળતાથી વંચાય એવું રાખો.'], ['વધુ ઇફેક્ટ્સથી રીલ હંમેશાં સારી બને છે.', 'વધારાની ઇફેક્ટ્સ કરતાં સારી રજૂઆત વધુ જરૂરી છે.'], ['મારા વિડિયોને વધુ સ્પષ્ટ કેવી રીતે બનાવું?', 'દરેક દૃશ્યમાં એક વિચાર અને વાંચી શકાય એવા કેપ્શન રાખો.'], ['બદલાવ પહેલાંનો વિડિયો.', 'બદલાવ પછીનું પરિણામ.'], ['તમારું લક્ષ્ય પસંદ કરો.', 'કેવી રીતે કરો છો તે બતાવો.', 'પરિણામ તપાસો.']],
    ctaDefault: 'તમારી આગામી રીલ માટે આ સેવ કરો.',
  },
} as const;
export function contentExample(format: ContentFormat, language: ContentLanguage, topic: string): ContentDraft {
  const copy = CONTENT_COPY[language], index = CONTENT_FORMATS.indexOf(format);
  return { hook: copy.hooks[index]!.replace('{topic}', topic.trim() || copy.topicDefault), points: [...copy.examples[index]!], cta: copy.ctaDefault };
}
export function contentScenes(format: ContentFormat, language: ContentLanguage, draft: ContentDraft) {
  const copy = CONTENT_COPY[language], index = CONTENT_FORMATS.indexOf(format);
  return [{ title: draft.hook, body: '', color: '#ffe66d' }, ...copy.labels[index]!.map((label, i) => ({
    title: label, body: draft.points[i] ?? '', color: format === 'myth-fact' || format === 'before-after' ? (i === 0 ? '#fda4af' : '#86efac') : '#93c5fd',
  })), { title: draft.cta, body: '', color: '#ffe66d' }];
}
export function buildContentEffects(format: ContentFormat, language: ContentLanguage, draft: ContentDraft, timings: readonly number[], duration: number): MotionEffect[] {
  const scenes = contentScenes(format, language, draft);
  if (scenes.length !== timings.length || timings.some(t => !Number.isFinite(t) || t < 1 || t > 120)
    || !Number.isFinite(duration) || timings.reduce((a, b) => a + b, 0) > duration + 0.001) throw new Error(CONTENT_COPY[language].short);
  if (draft.points.length !== CONTENT_COPY[language].labels[CONTENT_FORMATS.indexOf(format)]!.length || scenes.some(s => !s.title.trim() || s.title.length > 80 || s.body.length > 240) || draft.points.some(p => !p.trim())) throw new Error('Fill every field (headlines up to 80 characters, points up to 240).');
  let start = 0;
  return scenes.map((scene, index) => {
    const end = start + timings[index]!;
    const effect = { ...newMotionEffect('content-card', start, end), title: scene.title.trim(), lines: scene.body.trim(), color: scene.color, y: format === 'comment-reply' && index === 1 ? 0.13 : 0.55 };
    start = end;
    return effect;
  });
}
