/**
 * Header Hydration
 * Renders the header for static pages
 */

import { t, setLang, initTranslations } from '../engine/i18n.js';
import locales from '../config/locales.js';

/**
 * Read the base path from the meta tag injected at build time.
 * Falls back to '/' for local dev.
 */
function getBasePath() {
    const meta = document.querySelector('meta[name="base-path"]');
    return meta ? meta.getAttribute('content') : '/';
}

/**
 * Get current route info from URL path (for static site)
 * Accounts for base path prefix (e.g. /portfolio/en/about/)
 */
function getRouteFromPath() {
    const basePath = getBasePath();
    let pathname = window.location.pathname;

    // Strip base path prefix to get the route portion
    if (basePath !== '/' && pathname.startsWith(basePath)) {
        pathname = pathname.slice(basePath.length);
    }

    const parts = pathname.split('/').filter(Boolean);

    // Format: en/, en/about/, en/projects/nota/
    const lang = parts[0] || 'en';
    const page = parts[1];
    const slug = parts[2];

    if (page === 'projects' && slug) {
        return { name: 'project', lang, slug };
    } else if (page === 'about') {
        return { name: 'about', lang, slug: null };
    } else {
        return { name: 'home', lang, slug: null };
    }
}

/**
 * Render and inject the header
 */
export function initHeader() {
    const headerEl = document.getElementById('header');
    if (!headerEl) return;

    const basePath = getBasePath();
    const route = getRouteFromPath();
    const lang = route.lang;
    const otherLang = lang === 'en' ? 'el' : 'en';

    // Initialize translations (required for t() to work)
    initTranslations(locales);
    setLang(lang);

    // Build the switch URL (same page, other language) — base-path-aware
    let switchUrl = `${basePath}${otherLang}/`;
    if (route.name === 'project' && route.slug) {
        switchUrl = `${basePath}${otherLang}/projects/${route.slug}/`;
    } else if (route.name === 'about') {
        switchUrl = `${basePath}${otherLang}/about/`;
    }

    headerEl.innerHTML = `
        <nav class="site-header">
            <a href="${basePath}${lang}/" class="header-title">
                ${t('site.title') || 'Portfolio'}
            </a>
            <div class="nav-right">
                <a href="${basePath}${lang}/" class="nav-link">${t('nav.home')}</a>
                <a href="${basePath}${lang}/about/" class="nav-link">${t('nav.about')}</a>
                <a href="${switchUrl}" class="lang-switch">${t('lang.switch')}</a>
            </div>
        </nav>
    `;
}
