import { useLocation } from 'react-router-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { translations } from '@ui/i18n/translations';

export type Locale = 'en' | 'hi' | 'gu';
export const LOCALE_KEY = 'reelstudio.ui-language';
const names = { en: 'English', hi: 'हिन्दी', gu: 'ગુજરાતી' };
export function isLocale(value: unknown): value is Locale { return value === 'en' || value === 'hi' || value === 'gu'; }
export function translate(text: string, locale: Locale, values?: Record<string, string | number>): string {
  const key = text.trim();
  const copy = locale === 'en' ? undefined : translations[key]?.[locale];
  const result = copy ? text.replace(key, () => copy) : text;
  return values ? result.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match) : result;
}
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: 'en', setLocale: () => {} });
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try { const saved = localStorage.getItem(LOCALE_KEY); return isLocale(saved) ? saved : 'en'; } catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* Session language still works when storage is blocked. */ }
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === LOCALE_KEY && isLocale(event.newValue)) setLocale(event.newValue); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}
export function useTranslation() {
  const { locale, setLocale } = useContext(LocaleContext);
  const t = useCallback((text: string, values?: Record<string, string | number>) => translate(text, locale, values), [locale]);
  return { locale, setLocale, t };
}
export function UiText({ text }: { text: ReactNode }) { const { t } = useTranslation(); return <>{typeof text === 'string' ? t(text) : text}</>; }
export function LanguageSelector() {
  const { locale, setLocale, t } = useTranslation();
  return <label className="inline-flex items-center gap-2 text-xs shrink-0"><span>{t('Language')}</span><select data-testid="app-language" aria-label={t("App language")} value={locale} onChange={e => { if (isLocale(e.target.value)) setLocale(e.target.value); }} className="rounded-md border border-edge-medium bg-surface-1 text-fg-primary px-2 py-1 min-h-9 max-w-32">{Object.entries(names).map(([id, name]) => <option key={id} value={id} lang={id}>{name}</option>)}</select></label>;
}

/** Route titles follow the UI language, including transitions out of the public site. */
export function LocalizedPageTitle() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  useEffect(() => {
    const title = pathname === '/' ? 'Create reels that sound like you'
      : pathname.endsWith('/pricing') ? 'Pricing' : pathname.endsWith('/features') ? 'Features'
      : pathname.endsWith('/signup') ? 'Create an account' : pathname.endsWith('/signin') ? 'Sign in'
      : pathname.endsWith('/projects') ? 'Projects' : pathname.endsWith('/admin') ? 'Administration' : 'Editor workspace';
    document.title = `${t(title)} · ReelStudio`;
  }, [pathname, t]);
  return null;
}
