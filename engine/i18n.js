/**
 * Internationalization (i18n) Module
 */

let translations = { en: {}, el: {} };

/**
 * Initialize translations with external data
 */
export function initTranslations(data) {
    if (data) {
        translations = data;
    }
}

let currentLang = 'en';

/**
 * Set the current language
 */
export function setLang(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        document.documentElement.lang = lang;
    }
}

/**
 * Get the current language
 */
export function getLang() {
    return currentLang;
}

/**
 * Initialize language from storage or browser
 */
export function initLang() {
    const stored = localStorage.getItem('lang');
    if (stored && translations[stored]) {
        currentLang = stored;
    } else {
        currentLang = navigator.language.startsWith('el') ? 'el' : 'en';
    }
    document.documentElement.lang = currentLang;
    return currentLang;
}

/**
 * Translate a key
 */
export function t(key) {
    return translations[currentLang]?.[key] || translations.en[key] || key;
}

/**
 * Get the opposite language (for switcher)
 */
export function getOtherLang() {
    return currentLang === 'en' ? 'el' : 'en';
}
