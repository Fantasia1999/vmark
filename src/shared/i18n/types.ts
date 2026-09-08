export type SupportedLocale = 'en' | 'zh-CN';

export type TranslationMap = Record<string, string>;

export interface I18nState {
  locale: SupportedLocale;
}
