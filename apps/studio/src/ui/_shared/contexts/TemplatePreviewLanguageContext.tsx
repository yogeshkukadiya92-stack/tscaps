import { createContext, useContext } from 'react';
import type { TemplatePreviewLanguage } from '@presentation/editor/services/LocalizedTemplatePreviewBuilder';
export { TEMPLATE_PREVIEW_LANGUAGES, type TemplatePreviewLanguage } from '@presentation/editor/services/LocalizedTemplatePreviewBuilder';

export const TemplatePreviewLanguageContext = createContext<TemplatePreviewLanguage>('en');
export const useTemplatePreviewLanguage = () => useContext(TemplatePreviewLanguageContext);
