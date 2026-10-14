import type { EditorStore } from '@core/editor/store/EditorStore';
import type { HinglishRomanizer } from '@core/transcription/services/HinglishRomanizer';

/** Changes spelling only: do not rerun cuts, timing clamps, or scene effects. */
export class RomanizeCaptionsAction {
  constructor(private readonly store: EditorStore, private readonly romanizer: HinglishRomanizer) {}

  execute(): void {
    const document = this.store.snapshot().document;
    if (!document || !document.getWords().some(word => /[\u0900-\u097f]/u.test(word.text))) return;
    const next = this.romanizer.document(document);
    this.store.commit();
    this.store.patch({ document: next });
  }
}
