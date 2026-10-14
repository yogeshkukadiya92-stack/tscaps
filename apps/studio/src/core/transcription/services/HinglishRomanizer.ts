import Sanscript from '@indic-transliteration/sanscript';
import type { Document, Word } from '@tscaps/engine';

// Familiar caption spellings, including English loanwords commonly emitted in Hindi script.
const SPELLINGS: Readonly<Record<string, string>> = {
  आज: 'aaj', हम: 'hum', मैं: 'main', में: 'mein', हैं: 'hain', हूँ: 'hoon', है: 'hai',
  नहीं: 'nahi', हाँ: 'haan', ये: 'ye', यह: 'yeh', वो: 'wo', वह: 'woh', आप: 'aap',
  आपको: 'aapko', आपका: 'aapka', आपकी: 'aapki', आपके: 'aapke', तुम: 'tum', तुम्हें: 'tumhe',
  मुझे: 'mujhe', मेरा: 'mera', मेरी: 'meri', मेरे: 'mere', हमारे: 'hamare', हमारा: 'hamara',
  करना: 'karna', करें: 'karein', करेंगे: 'karenge', करेगा: 'karega', किया: 'kiya',
  किए: 'kiye', करके: 'karke', करते: 'karte', करती: 'karti', करता: 'karta', करो: 'karo',
  हो: 'ho', होता: 'hota', होती: 'hoti', होते: 'hote', होगा: 'hoga', होगी: 'hogi',
  रहे: 'rahe', रहा: 'raha', रही: 'rahi', था: 'tha', थी: 'thi', थे: 'the',
  और: 'aur', लेकिन: 'lekin', क्योंकि: 'kyunki', इसलिए: 'isliye', अगर: 'agar', तो: 'to',
  क्या: 'kya', क्यों: 'kyun', कैसे: 'kaise', कब: 'kab', कहाँ: 'kahan', कौन: 'kaun',
  अच्छा: 'achha', अच्छी: 'achhi', अच्छे: 'achhe', बहुत: 'bahut', ज्यादा: 'zyada',
  ज़्यादा: 'zyada', बिल्कुल: 'bilkul', सिर्फ: 'sirf', अभी: 'abhi', फिर: 'phir',
  यहाँ: 'yahan', वहां: 'wahan', वहाँ: 'wahan', सब: 'sab', कुछ: 'kuch', कोई: 'koi',
  के: 'ke', की: 'ki', का: 'ka', को: 'ko', से: 'se', पर: 'par', भी: 'bhi', ही: 'hi',
  इस: 'is', इसका: 'iska', इसके: 'iske', इसमें: 'ismein', इससे: 'isse', इसे: 'ise',
  उस: 'us', उसका: 'uska', उसके: 'uske', उसे: 'use', एक: 'ek', दो: 'do', तीन: 'teen',
  चाहिए: 'chahiye', सकते: 'sakte', सकता: 'sakta', सकती: 'sakti', साथ: 'saath',
  लिए: 'liye', बना: 'bana', बनी: 'bani', बने: 'bane', बनाना: 'banana', बनाएं: 'banayein', बनाओ: 'banao', बनाएंगे: 'banayenge',
  देखो: 'dekho', देखें: 'dekhein', देखने: 'dekhne', सीखो: 'seekho',
  वीडियो: 'video', विडियो: 'video', वीडियोज़: 'videos', रील: 'reel', रील्स: 'reels',
  एडिट: 'edit', एडिटिंग: 'editing', कैप्शन: 'caption', कैप्शन्स: 'captions',
  इंस्टाग्राम: 'Instagram', यूट्यूब: 'YouTube', फेसबुक: 'Facebook',
  लाइक: 'like', शेयर: 'share', कमेंट: 'comment', सब्सक्राइब: 'subscribe',
  फॉलो: 'follow', डाउनलोड: 'download', अपलोड: 'upload', म्यूजिक: 'music',
  टेक्स्ट: 'text', स्पीड: 'speed', फिल्टर: 'filter', फ़िल्टर: 'filter',
  ऐप: 'app', एप: 'app', फोन: 'phone', फ़ोन: 'phone', मोबाइल: 'mobile',
  ट्रांजिशन: 'transition', टेम्पलेट: 'template', एआई: 'AI',
};

/** Spelling normalization, not translation: existing Latin text remains byte-for-byte unchanged. */
export class HinglishRomanizer {
  text(text: string): string {
    return text.replace(/[\u0900-\u0963\u0971-\u097f]+/gu, run => {
      run = run.normalize('NFC');
      const known = SPELLINGS[run];
      if (known) return known;
      // Use a tested Indic script converter, then simplify scholarly notation for captions.
      let roman = Sanscript.t(run, 'devanagari', 'iast')
        .replace(/ch/g, 'chh').replace(/c(?!h)/g, 'ch')
        .replace(/ś|ṣ/g, 'sh').replace(/ṛ|ṝ/g, 'ri')
        .replace(/ṅ|ñ/g, 'n').replace(/ṃ|ṁ|~/g, 'n')
        .replace(/ā/g, 'aa').replace(/ī/g, 'ee').replace(/ū/g, 'oo')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      // Hindi drops terminal inherent 'a'; long 'aa' and standalone vowels stay intact.
      if (roman.length > 1 && /[^aeiou]a$/.test(roman)) roman = roman.slice(0, -1);
      // Conservative internal schwa deletion (sakatā → saktaa, isake → iske).
      roman = roman.replace(/([aeiou](?:kh|gh|chh|ch|jh|th|dh|ph|bh|sh|[bcdfghjklmnpqrstvwxyz]))a(?=(?:kh|gh|chh|ch|jh|th|dh|ph|bh|sh|[bcdfghjklmnpqrstvwxyz])[aeiou])/g, '$1');
      return roman;
    }).replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966))
      .replace(/।/g, '.').replace(/॥/g, '.');
  }

  words(words: readonly Word[]): readonly Word[] {
    return words.map(word => {
      const text = this.text(word.text), displayText = this.text(word.displayText);
      return text === word.text && displayText === word.displayText ? word : word.with({ text, displayText });
    });
  }

  document(document: Document): Document {
    return document.with({
      language: 'hi-Latn',
      sections: document.sections.map(section => section.with({
        segments: section.segments.map(segment => segment.with({
          lines: segment.lines.map(line => line.with({ words: this.words(line.words) })),
        })),
      })),
    });
  }
}
