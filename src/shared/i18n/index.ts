import type { SupportedLocale, TranslationMap } from './types';
import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

export type { SupportedLocale } from './types';

const DICTIONARIES: Record<SupportedLocale, TranslationMap> = {
  en,
  'zh-CN': zhCN,
};

let activeLocale: SupportedLocale = 'en';
const listeners = new Set<(locale: SupportedLocale) => void>();

let storageListenerWired = false;

function wireStorageListener(): void {
  if (storageListenerWired || typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return;
  }
  storageListenerWired = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.locale?.newValue) {
      const nextLocale = changes.locale.newValue as SupportedLocale;
      if (nextLocale !== activeLocale && (nextLocale === 'en' || nextLocale === 'zh-CN')) {
        activeLocale = nextLocale;
        notifyListeners();
      }
    }
  });
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(activeLocale);
    } catch (e) {
      console.error('[i18n] listener failed', e);
    }
  }
}

/**
 * Get the currently active locale.
 */
export function getLocale(): SupportedLocale {
  return activeLocale;
}

/**
 * Set the current locale and notify subscribers.
 */
export function setLocale(locale: SupportedLocale): void {
  if (locale !== 'en' && locale !== 'zh-CN') {
    return;
  }
  if (activeLocale !== locale) {
    activeLocale = locale;
    notifyListeners();
  }
}

/**
 * Initialize i18n with an initial locale. Also wires chrome.storage sync listener.
 */
export function initI18n(initialLocale?: SupportedLocale): void {
  if (initialLocale === 'en' || initialLocale === 'zh-CN') {
    activeLocale = initialLocale;
  }
  wireStorageListener();
}

/**
 * Subscribe to locale change events. Returns an unsubscribe function.
 */
export function onLocaleChange(listener: (locale: SupportedLocale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Format a localized message with interpolation parameters.
 *
 * Example: t('source.lines', { count: 42 }) -> "42 lines" or "42 行"
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
  localeOverride?: SupportedLocale,
): string {
  const loc = localeOverride || activeLocale;
  const dict = DICTIONARIES[loc] || DICTIONARIES.en;
  let text = dict[key] ?? DICTIONARIES.en[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}

/**
 * Declaratively localize all elements in a DOM subtree matching data-i18n* attributes.
 *
 * Supported attributes:
 * - data-i18n: updates element textContent
 * - data-i18n-html: updates element innerHTML
 * - data-i18n-title: updates element title attribute
 * - data-i18n-placeholder: updates input/textarea placeholder attribute
 * - data-i18n-aria: updates aria-label attribute
 */
export function localizeDom(root: ParentNode = document): void {
  if (!root || typeof (root as HTMLElement).querySelectorAll !== 'function') {
    return;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder;
    if (key && 'placeholder' in el) (el as HTMLInputElement).placeholder = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute('aria-label', t(key));
  }
}
