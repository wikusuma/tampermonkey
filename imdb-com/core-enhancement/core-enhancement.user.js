// ==UserScript==
// @name         Core Enhancement
// @namespace    https://github.com/wikusuma/tampermonkey
// @version      1.0.16.1
// @description  Framework modular IMDb: Anti-Looping Switch View Enforcer, Vidfast Player, Smart CrossSearch Media & Social Icons (Title & Name), Adaptive Uindex & 1337x Query, Comprehensive Parents Guide, dan Safe On-Demand Single-Bar Scanner.
// @author       Willy Kusuma & Dev Team
// @match        https://*.imdb.com/title/tt*
// @match        https://*.imdb.com/name/nm*
// @match        https://*.imdb.com/list/*
// @match        https://*.imdb.com/find/*
// @match        https://*.imdb.com/chart/*
// @match        https://*.imdb.com/user/*/watchlist*
// @include      https://*imdb.com/search/title*
// @exclude      https://*.imdb.com/title/tt*/parentalguide*
// @exclude      https://*.imdb.com/title/tt*/fullcredits*
// @exclude      https://*.imdb.com/title/tt*/reviews*
// @exclude      https://*.imdb.com/title/tt*/ratings*
// @exclude      https://*.imdb.com/title/tt*/episodes*
// @exclude      https://*.imdb.com/title/tt*/trivia*
// @exclude      https://*.imdb.com/title/tt*/goofs*
// @exclude      https://*.imdb.com/title/tt*/quotes*
// @exclude      https://*.imdb.com/title/tt*/faq*
// @exclude      https://*.imdb.com/title/tt*/awards*
// @exclude      https://*.imdb.com/title/tt*/technical*
// @exclude      https://*.imdb.com/title/tt*/mediaindex*
// @exclude      https://*.imdb.com/title/tt*/videogallery*
// @exclude      https://*.imdb.com/title/tt*/plotsummary*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/core-enhancement/core-enhancement.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/core-enhancement/core-enhancement.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      www.imdb.com
// @connect      imdb.com
// @run-at       document-idle
// ==/UserScript==

/*
*  =====================================================================
*  CHANGELOG & TRACEABILITY (IMDb Core Enhancement)
*  =====================================================================
*  [1.0.14] - 2026-10-19
*   * Added 1337x to OFFICIAL SVG ICON MAP & GLOBAL STYLES.
*   * Implemented custom formatting for 1337x search queries (replaces spaces with '+').
*   * Verified uindex search queries use standard URI encoding (spaces as '%20').
*  [1.0.13] - 2026-10-14
*   * Adaptive UIndex Query Endpoint: Deteksi tipe konten (Movie vs TV Series).
*  [1.0.12] - 2026-10-11
*   * Search Titles Activation Fix
*  =====================================================================
*/

(function () {
    'use strict';

    // ==========================================
    // 0. MODERN VIEW ENFORCER (ANTI-LOOPING)
    // ==========================================
    if (window.location.hostname.includes('imdb.com')) {
        const url = new URL(window.location.href);
        const path = url.pathname;

        if (path.startsWith('/title/tt')) {
            let needsRedirect = false;

            if (path.includes('/reference') && url.searchParams.get('allowRefView') !== '1') {
                url.pathname = path.replace(/\/reference\/?$/, '/');
                needsRedirect = true;
            }

            if (url.searchParams.get('bypassRefViewPref') !== '1') {
                url.searchParams.set('bypassRefViewPref', '1');
                needsRedirect = true;
            }

            if (needsRedirect) {
                window.location.replace(url.toString());
                return;
            }
        }
    }

    // ==========================================
    // 1. GLOBAL CONFIG & LOGGER
    // ==========================================
    const CONFIG = {
        name: "IMDbCoreEnhancement",
        version: "1.0.14",
        cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
        throttleMs: 220,
        debug: true
    };

    const Logger = {
        info: (msg) => CONFIG.debug && console.log(`[${CONFIG.name} INFO]:`, msg),
        error: (msg) => console.error(`[${CONFIG.name} ERROR]:`, msg)
    };

    // ==========================================
    // 2. OFFICIAL SVG ICON MAP & GLOBAL STYLES
    // ==========================================
    const SVG_MAP = {
        uindex: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>`,
        x1337: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12,2A10,10,0,0,0,2,12v7h5V12a5,5,0,0,1,10,0v7h5V12A10,10,0,0,0,12,2ZM9,19H4V12a8,8,0,0,1,16,0v7H15V12a3,3,0,0,0-6,0Z"/></svg>`,
        vidfast: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M8 5v14l11-7z"/></svg>`,
        stremio: (c) => `<svg width="16" height="16" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="${c}"/><path d="M9 7l8 5-8 5V7z" fill="#ffffff"/></svg>`,
        tmdb: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm3.89 17.18h-2.18V9.16l-2.31 8.02H9.37L7.06 9.16v8.02H4.88V6.82h3.29l2.12 7.55L12.41 6.82h3.48v10.36z"/></svg>`,
        allmovie: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>`,
        rottentomatoes: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.5 13.5l-3.5-2-3.5 2 1-4-3-2.5h4l1.5-3.5L14 9h4l-3 2.5z"/></svg>`,
        metacritic: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><rect width="24" height="24" rx="3"/><text x="4" y="17" font-size="12" font-weight="bold" fill="#000">M</text></svg>`,
        justwatch: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5" stroke="#000" stroke-width="2" fill="none"/></svg>`,
        plex: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M11.532 0L4.148 7.384v9.232l7.384 7.384 7.384-7.384V7.384L11.532 0zm3.176 13.792h-3.176v3.176h-3.176v-3.176H8.356V10.616h3.176V7.44h3.176v3.176h3.176v3.176z"/></svg>`,
        reddit: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z"/></svg>`,
        google: () => `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`,
        youtube: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
        x: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
        instagram: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
        facebook: (c) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/></svg>`
    };

    const injectGlobalCSS = () => {
        if (document.getElementById('imdb-core-enhancement-css')) return;
        const style = document.createElement('style');
        style.id = 'imdb-core-enhancement-css';
        style.textContent = `
            .search-icons-container { margin-left: 10px; display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
            .search-icon { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.15s ease, opacity 0.15s ease; padding: 2px; border-radius: 4px; }
            .search-icon:hover { transform: scale(1.18); opacity: 0.85; }

            /* Badge Severity Styles */
            .nudity-badge { display: inline-flex !important; align-items: center !important; padding: 3px 8px !important; border-radius: 4px !important; font-size: 11px !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
            .nudity-badge--none { background-color: rgba(76, 175, 80, 0.25) !important; color: #4ade80 !important; border: 1px solid #22c55e !important; }
            .nudity-badge--mild { background-color: rgba(205, 220, 57, 0.25) !important; color: #facc15 !important; border: 1px solid #eab308 !important; }
            .nudity-badge--moderate { background-color: rgba(255, 152, 0, 0.25) !important; color: #fb923c !important; border: 1px solid #f97316 !important; }
            .nudity-badge--severe { background-color: rgba(244, 67, 54, 0.25) !important; color: #f87171 !important; border: 1px solid #ef4444 !important; }
            .nudity-badge--unknown, .nudity-badge--error { background-color: rgba(158, 158, 158, 0.25) !important; color: #9ca3af !important; border: 1px solid #6b7280 !important; }

            /* Single Movie Parents Guide Box */
            #single-movie-pg-box { margin: 14px 0 16px 0; background: #1b1b1b; border: 1px solid #383838; border-radius: 6px; padding: 12px 16px; font-family: Roboto, Helvetica, Arial, sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,0.4); width: 100%; box-sizing: border-box; }
            .single-pg-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2d2d2d; padding-bottom: 8px; margin-bottom: 8px; }
            .single-pg-header-left { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
            .single-pg-header-left span { color: #fff; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
            .single-pg-link { color: #5799ef; font-size: 12px; text-decoration: none; font-weight: 500; }
            .single-pg-link:hover { text-decoration: underline; }
            .single-pg-toggle-chevron { width: 16px; height: 16px; fill: #fff; transition: transform 0.2s ease; }
            #single-movie-pg-box.is-collapsed #comprehensive-pg-content { display: none; }
            #single-movie-pg-box.is-collapsed .single-pg-toggle-chevron { transform: rotate(-90deg); }

            .pg-category-row { margin-bottom: 10px; border-bottom: 1px dashed #2a2a2a; padding-bottom: 8px; }
            .pg-category-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; padding: 4px 0; }
            .pg-category-header:hover { opacity: 0.85; }
            .pg-category-title { font-size: 12px; font-weight: bold; color: #d1d5db; text-transform: uppercase; }
            .pg-category-details { margin-top: 6px; padding-left: 12px; font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.5; }
            .pg-category-details ul { margin: 0; padding-left: 16px; list-style-type: disc; }
            .pg-category-details li { margin-bottom: 4px; }
            .pg-chevron { width: 14px; height: 14px; fill: #aaa; transition: transform 0.2s ease; }
            .pg-category-row.is-open .pg-chevron { transform: rotate(180deg); }

            /* Standard Horizontal Single-Bar Design */
            .pg-inline-wrapper {
                margin: 8px 0 10px 0 !important;
                padding: 6px 12px !important;
                background-color: #1f1f1f !important;
                border: 1px solid #333333 !important;
                border-radius: 4px !important;
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                clear: both !important;
            }
            .pg-inline-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                cursor: pointer !important;
                user-select: none !important;
                height: 28px !important;
            }
            .pg-inline-title {
                font-size: 11px !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                color: #e5e7eb !important;
                letter-spacing: 0.5px !important;
            }
            .pg-inline-details {
                margin-top: 8px !important;
                padding-top: 8px !important;
                border-top: 1px solid #2d2d2d !important;
                color: #f3f4f6 !important;
                font-size: 12px !important;
                line-height: 1.6 !important;
            }
            .pg-inline-details ul { margin: 0 !important; padding-left: 18px !important; color: #f3f4f6 !important; list-style-type: disc !important; }
            .pg-inline-details li { margin-bottom: 6px !important; color: #e5e7eb !important; }

            /* Floating Scan Panel (Always On Top) */
            .list-scan-panel {
                position: fixed !important;
                bottom: 24px !important;
                right: 24px !important;
                z-index: 2147483647 !important;
                background: #1a1a1a !important;
                border: 1px solid #f5c518 !important;
                padding: 10px 14px !important;
                border-radius: 8px !important;
                box-shadow: 0 4px 16px rgba(0,0,0,0.8) !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                font-family: Roboto, sans-serif !important;
            }
            .list-scan-btn {
                background: #f5c518 !important;
                color: #000 !important;
                border: none !important;
                padding: 6px 14px !important;
                font-weight: bold !important;
                border-radius: 4px !important;
                cursor: pointer !important;
                font-size: 12px !important;
            }
            .list-scan-btn:hover { background: #e0b314 !important; }
        `;
        document.head.appendChild(style);
    };

    // ==========================================
    // 3. STORAGE & CACHE MANAGER
    // ==========================================
    const CacheManager = {
        get(key) {
            const cached = GM_getValue(key, null);
            if (!cached) return null;
            if (Date.now() - cached.timestamp > CONFIG.cacheTtlMs) {
                GM_deleteValue(key);
                return null;
            }
            return cached.data;
        },
        set(key, data) {
            GM_setValue(key, { timestamp: Date.now(), data });
        },
        clearAppCache() {
            if (typeof GM_listValues === "function" && typeof GM_deleteValue === "function") {
                GM_listValues().forEach((k) => {
                    if (k.startsWith(`${CONFIG.name}_`)) GM_deleteValue(k);
                });
                Logger.info("Cache lokal berhasil dibersihkan.");
            }
        }
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function createIconElement(p) {
        const icon = document.createElement('span');
        icon.className = 'search-icon';
        icon.title = `Cari di ${p.name}`;
        const svgFn = SVG_MAP[p.id];
        if (svgFn) {
            icon.innerHTML = svgFn(p.color);
        } else {
            icon.style.cssText = `color: ${p.color}; font-weight: bold; font-size: 12px; padding: 0 4px;`;
            icon.textContent = `[${p.name[0]}]`;
        }
        icon.onclick = (e) => {
            e.stopPropagation();
            window.open(p.url, '_blank');
        };
        return icon;
    }

    // ==========================================
    // 4. MODULE 1: TITLE PAGES (PLAYER & CROSSSEARCH)
    // ==========================================
    const TitleModules = {
        init() {
            const path = window.location.pathname;
            if (!path.startsWith('/title/tt')) return;

            const match = path.match(/\/title\/(tt\d+)/);
            if (!match) return;
            const imdbId = match[1];

            this.injectPlayerButton(imdbId);
            this.injectCrossSearch(imdbId);
            renderComprehensivePG(imdbId);
        },

        injectPlayerButton(imdbId) {
            const container = document.querySelector('[data-testid^="watched-button-"]');
            if (!container || document.getElementById('free-watch-button')) return;

            const seasonEpisode = document
                .querySelector('[data-testid="hero-subnav-bar-season-episode-numbers-section"]')
                ?.textContent.match(/([ST])\s?\.?\s?(\d+)\.\s?([EBP])\s?\.?\s?(\d+)/i);

            let watchUrl = seasonEpisode
                ? `https://vidfast.vc/tv/${imdbId}/${seasonEpisode[2]}/${seasonEpisode[4]}`
                : (/Episode guide/i.test(document.body.innerText) ? `https://vidfast.vc/tv/${imdbId}/1/1` : `https://vidfast.vc/movie/${imdbId}`);

            const btn = document.createElement('button');
            btn.id = 'free-watch-button';
            btn.className = 'ipc-btn ipc-btn--full-width ipc-btn--left-align-content ipc-btn--large-height ipc-btn--core-baseAlt ipc-secondary-button';
            btn.style.marginTop = '8px';
            btn.innerHTML = `▶ Watch for Free (Vidfast)`;
            btn.onclick = () => window.open(watchUrl, '_blank');

            container.parentNode.appendChild(btn);
        },

        injectCrossSearch(imdbId) {
            const targetElem = document.querySelector(
                'h1[data-testid="hero__pageTitle"], h1.hero__primary-text, section.ipc-page-section h1, h1'
            );
            if (!targetElem || targetElem.querySelector('.search-icons-container')) return;

            // 1. Ekstraksi Judul Asli (Original Title)
            let originalTitle = "";
            const originalTitleElem = document.querySelector(
                '[data-testid="hero__pageTitle"] ~ [class*="OriginalTitle"], [data-testid="hero-title-block__original-title"]'
            );
            if (originalTitleElem) {
                originalTitle = originalTitleElem.textContent.replace(/^Original title:\s*/i, '').trim();
            }

            // Ekstrak teks judul utama
            let titleText = "";
            for (const child of targetElem.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    titleText += child.textContent;
                } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('search-icons-container')) {
                    titleText += child.textContent;
                }
            }
            titleText = (originalTitle || titleText).trim();

            // 2. Deteksi Tipe Konten
            const metaList = document.querySelector('ul[data-testid="hero-title-block__metadata"]');
            const metaText = metaList ? metaList.textContent : "";
            const isTvSeries = /TV\s*Series|TV\s*Mini\s*Series|Series/i.test(metaText) ||
                               Boolean(document.querySelector('[data-testid="hero-subnav-bar-season-episode-numbers-section"]')) ||
                               /Episode guide/i.test(document.body.innerText);

            // 3. Ekstrak Tahun Rilis
            let releaseYear = "";
            if (metaList) {
                const yearMatch = metaList.textContent.match(/\b(19\d{2}|20\d{2})\b/);
                if (yearMatch) releaseYear = yearMatch[1];
            }

            // Helper format untuk 1337x (mengganti spasi dengan +)
            const format1337x = (str) => str.trim().replace(/\s+/g, '+');

            // 4. Bangun URL Torrent
            let uindexUrl = "";
            let uindexLabel = "";
            let x1337Url = "";
            let x1337Label = "";

            if (isTvSeries) {
                uindexUrl = `https://uindex.org/search.php?search=${encodeURIComponent(titleText)}&c=2`;
                uindexLabel = 'UIndex (TV Series Torrent)';
                x1337Url = `https://1337x.la/search/${format1337x(titleText)}/1/`;
                x1337Label = '1337x (TV Series Torrent)';
            } else {
                const movieSearchQuery = releaseYear ? `${titleText} (${releaseYear})` : titleText;
                uindexUrl = `https://uindex.org/search.php?search=${encodeURIComponent(movieSearchQuery)}&c=1&p=1`;
                uindexLabel = 'UIndex (Movies Torrent)';

                const query1337x = releaseYear ? `${titleText} ${releaseYear}` : titleText;
                x1337Url = `https://1337x.la/search/${format1337x(query1337x)}/1/`;
                x1337Label = '1337x (Movies Torrent)';
            }

            const container = document.createElement('span');
            container.className = 'search-icons-container';

            const searchPlatforms = [
                { id: 'uindex', name: uindexLabel, color: '#00b4d8', url: uindexUrl },
                { id: 'x1337', name: x1337Label, color: '#ff3333', url: x1337Url },
                { id: 'vidfast', name: 'Vidfast', color: '#00E676', url: isTvSeries ? `https://vidfast.vc/tv/${imdbId}/1/1` : `https://vidfast.vc/movie/${imdbId}` },
                { id: 'stremio', name: 'Stremio', color: '#7c3aed', url: isTvSeries ? `https://web.stremio.com/#/detail/series/${imdbId}` : `https://web.stremio.com/#/detail/movie/${imdbId}` },
                { id: 'tmdb', name: 'TMDB', color: '#01b4e4', url: `https://www.themoviedb.org/search?query=${encodeURIComponent(titleText)}` },
                { id: 'allmovie', name: 'AllMovie', color: '#e50914', url: `https://www.allmovie.com/search/all/${encodeURIComponent(titleText)}` },
                { id: 'rottentomatoes', name: 'Rotten Tomatoes', color: '#fa320a', url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(titleText)}` },
                { id: 'metacritic', name: 'Metacritic', color: '#f5c518', url: `https://www.metacritic.com/search/${encodeURIComponent(titleText)}/` },
                { id: 'justwatch', name: 'JustWatch', color: '#ffe100', url: `https://www.justwatch.com/us/search?q=${encodeURIComponent(titleText)}` },
                { id: 'plex', name: 'Plex', color: '#e5a00d', url: `https://watch.plex.tv/search?q=${encodeURIComponent(titleText)}&query=${encodeURIComponent(titleText)}` },
                { id: 'reddit', name: 'Reddit', color: '#FF4500', url: `https://www.reddit.com/search/?q=${encodeURIComponent(titleText)}` },
                { id: 'google', name: 'Google', color: '#4285F4', url: `https://www.google.com/search?q=${encodeURIComponent(titleText)}` },
                { id: 'youtube', name: 'YouTube', color: '#FF0000', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(titleText)}` },
                { id: 'x', name: 'X (Twitter)', color: '#1DA1F2', url: `https://x.com/search?q=${encodeURIComponent(titleText)}` },
                { id: 'instagram', name: 'Instagram', color: '#E1306C', url: `https://www.instagram.com/explore/tags/${encodeURIComponent(titleText.replace(/\s+/g, ''))}/` },
                { id: 'facebook', name: 'Facebook', color: '#1877F2', url: `https://www.facebook.com/search/top?q=${encodeURIComponent(titleText)}` }
            ];

            searchPlatforms.forEach(p => container.appendChild(createIconElement(p)));
            targetElem.appendChild(container);
        }
    };

    // ==========================================
    // 5. MODULE 2: NAME PAGES (CELEBRITY / ARTIST)
    // ==========================================
    const NameModules = {
        init() {
            const path = window.location.pathname;
            if (!path.startsWith('/name/nm')) return;

            const match = path.match(/\/name\/(nm\d+)/);
            if (!match) return;

            this.injectNameSearch();
        },

        injectNameSearch() {
            const targetElem = document.querySelector(
                'h1[data-testid="hero__pageTitle"], h1.hero__primary-text, .name-overview-widget h1, h1'
            );
            if (!targetElem || targetElem.querySelector('.search-icons-container')) return;

            let nameText = "";
            for (const child of targetElem.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    nameText += child.textContent;
                } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('search-icons-container')) {
                    nameText += child.textContent;
                }
            }
            nameText = nameText.trim();
            if (!nameText) return;

            const container = document.createElement('span');
            container.className = 'search-icons-container';

            const searchPlatforms = [
                { id: 'tmdb', name: 'TMDB', color: '#01b4e4', url: `https://www.themoviedb.org/search/person?query=${encodeURIComponent(nameText)}` },
                { id: 'allmovie', name: 'AllMovie', color: '#e50914', url: `https://www.allmovie.com/search/all/${encodeURIComponent(nameText)}` },
                { id: 'rottentomatoes', name: 'Rotten Tomatoes', color: '#fa320a', url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(nameText)}` },
                { id: 'metacritic', name: 'Metacritic', color: '#f5c518', url: `https://www.metacritic.com/search/${encodeURIComponent(nameText)}/` },
                { id: 'plex', name: 'Plex', color: '#e5a00d', url: `https://watch.plex.tv/search?q=${encodeURIComponent(nameText)}&query=${encodeURIComponent(nameText)}` },
                { id: 'x', name: 'X (Twitter)', color: '#1DA1F2', url: `https://x.com/search?q=${encodeURIComponent(nameText)}` },
                { id: 'instagram', name: 'Instagram', color: '#E1306C', url: `https://www.instagram.com/explore/tags/${encodeURIComponent(nameText.replace(/\s+/g, ''))}/` },
                { id: 'facebook', name: 'Facebook', color: '#1877F2', url: `https://www.facebook.com/search/top?q=${encodeURIComponent(nameText)}` },
                { id: 'youtube', name: 'YouTube', color: '#FF0000', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(nameText)}` },
                { id: 'google', name: 'Google', color: '#4285F4', url: `https://www.google.com/search?q=${encodeURIComponent(nameText)}` },
                { id: 'reddit', name: 'Reddit', color: '#FF4500', url: `https://www.reddit.com/search/?q=${encodeURIComponent(nameText)}` }
            ];

            searchPlatforms.forEach(p => container.appendChild(createIconElement(p)));
            targetElem.appendChild(container);
        }
    };

    // ==========================================
    // 6. MODULE 3: COMPREHENSIVE PARENTAL GUIDE
    // ==========================================
    function escapeHTML(str) {
        if (!str) return "";
        return String(str).replace(/[&<>'"]/g, (tag) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
        }[tag] || tag));
    }

    function cleanText(el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [class*="vote"], [class*="edit"], [class*="btn"], [class*="severity"]').forEach((child) => child.remove());
        const text = clone.textContent.replace(/\s+/g, " ").trim().replace(/\s*Edit\s*$/i, "").trim();
        if (!text || text.length < 5 || /^(none|mild|moderate|severe)$/i.test(text)) return "";
        return text;
    }

    function parseComprehensiveGuide(html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const categories = [
            { key: 'certifications', regex: /^certificates?$/i, label: 'Content Rating' },
            { key: 'nudity', regex: /^sex\s*[&]\s*nudity$/i, label: 'Sex & Nudity' },
            { key: 'violence', regex: /^violence\s*[&]\s*gore$/i, label: 'Violence & Gore' },
            { key: 'profanity', regex: /^profanity$/i, label: 'Profanity' },
            { key: 'alcohol', regex: /^alcohol[,\s]*drugs\s*[&]\s*smoking$/i, label: 'Alcohol, Drugs & Smoking' },
            { key: 'frightening', regex: /^frightening\s*[&]\s*intense\s*scenes$/i, label: 'Frightening & Intense Scenes' }
        ];

        const results = {};
        categories.forEach(cat => {
            results[cat.key] = { label: cat.label, severity: 'unknown', items: [] };
        });

        const sections = doc.querySelectorAll('section, .ipc-page-section, div[id]');
        sections.forEach(sec => {
            const header = sec.querySelector('h2, h3, h4, [data-testid*="section"]');
            if (!header) return;
            const hText = header.textContent.trim();

            categories.forEach(cat => {
                if (cat.regex.test(hText) || sec.id === cat.key) {
                    const topText = (sec.querySelector('.ipc-signpost__text') || sec).textContent.slice(0, 300).toLowerCase();
                    const matchTop = topText.match(/(?:^|[^a-zA-Z])(severe|moderate|mild|none)(?:$|[^a-zA-Z])/i);
                    if (matchTop) results[cat.key].severity = matchTop[1].toLowerCase();

                    const items = [];
                    sec.querySelectorAll('.ipc-html-content-inner-div, .ipl-zebra-list__item, li').forEach(el => {
                        const t = cleanText(el);
                        if (t && !items.includes(t)) items.push(t);
                    });
                    results[cat.key].items = items;
                }
            });
        });

        return results;
    }

    async function fetchComprehensivePG(titleId) {
        const cacheKey = `${CONFIG.name}_comprehensive_pg_${titleId}`;
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://www.imdb.com/title/${titleId}/parentalguide`,
                onload: (res) => {
                    const data = parseComprehensiveGuide(res.responseText);
                    CacheManager.set(cacheKey, data);
                    resolve(data);
                },
                onerror: () => resolve(null)
            });
        });
    }

    async function renderComprehensivePG(titleId) {
        if (document.getElementById("single-movie-pg-box")) return;

        let targetAnchor = document.querySelector(
            'ul.ipc-metadata-list--base, [data-testid="hero-subnav-bar-left-block"] ~ ul, div[data-testid="title-pc-expanded-section"], li[data-testid="title-pc-principal-credit"]'
        );
        if (!targetAnchor) {
            targetAnchor = document.querySelector('[data-testid="plot-xl"], [data-testid="plot-l"], [data-testid="plot"]');
        }
        if (!targetAnchor || !targetAnchor.parentNode) return;

        const box = document.createElement("div");
        box.id = "single-movie-pg-box";
        box.innerHTML = `
          <div class="single-pg-header">
            <div class="single-pg-header-left" id="single-pg-main-toggle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#f5c518"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              <span>Parents Guide: Comprehensive Content Overview</span>
              <svg class="single-pg-toggle-chevron" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
            </div>
            <a href="/title/${escapeHTML(titleId)}/parentalguide" class="single-pg-link" target="_blank">Lihat Detail &rarr;</a>
          </div>
          <div id="comprehensive-pg-content" style="color: rgba(255,255,255,0.88);">
            <div style="color: #888; font-size: 12px; padding: 6px 0;">Memuat rincian Parental Guide dari semua kategori...</div>
          </div>
        `;

        targetAnchor.parentNode.insertBefore(box, targetAnchor);

        box.querySelector("#single-pg-main-toggle").addEventListener("click", () => {
            box.classList.toggle("is-collapsed");
        });

        const data = await fetchComprehensivePG(titleId);
        const contentContainer = box.querySelector("#comprehensive-pg-content");
        if (!data) {
            contentContainer.innerHTML = `<div style="color: #f87171; font-size: 12px;">Gagal memuat data Parental Guide.</div>`;
            return;
        }

        contentContainer.innerHTML = "";
        Object.values(data).forEach(cat => {
            const row = document.createElement("div");
            row.className = "pg-category-row";

            const sev = cat.severity || "unknown";
            const itemsHtml = cat.items.length > 0
                ? `<ul>${cat.items.map(i => `<li>${escapeHTML(i)}</li>`).join("")}</ul>`
                : `<div style="color:#777; font-style:italic; font-size:11px;">Tidak ada catatan narasi spesifik.</div>`;

            row.innerHTML = `
                <div class="pg-category-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="pg-category-title">${cat.label}</span>
                        <span class="nudity-badge nudity-badge--${sev}">${sev}</span>
                    </div>
                    <svg class="pg-chevron" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                </div>
                <div class="pg-category-details" style="display: none;">${itemsHtml}</div>
            `;

            row.querySelector(".pg-category-header").addEventListener("click", () => {
                const details = row.querySelector(".pg-category-details");
                const isOpen = details.style.display !== "none";
                details.style.display = isOpen ? "none" : "block";
                row.classList.toggle("is-open", !isOpen);
            });

            contentContainer.appendChild(row);
        });
    }

    // ==========================================
    // 7. MODULE 4: ON-DEMAND LIST SCANNER (SAFE & FIXED)
    // ==========================================
    const SafeListScannerModule = {
        isTargetPage() {
            const p = window.location.pathname.toLowerCase();
            return p.startsWith('/find') ||
                   p.startsWith('/list/') ||
                   p.startsWith('/name/nm') ||
                   p.includes('/watchlist') ||
                   p.startsWith('/chart/') ||
                   p.includes('/search/title');
        },

        init() {
            if (!this.isTargetPage()) return;
            if (document.getElementById('imdb-safe-scan-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'imdb-safe-scan-panel';
            panel.className = 'list-scan-panel';
            panel.innerHTML = `
                <span style="color: #f5c518; font-size: 12px; font-weight: bold;">IMDb Guide Scanner:</span>
                <button class="list-scan-btn" id="run-safe-scan-btn">🔍 Muat Parents Guide List</button>
                <span id="scan-status-text" style="color: #aaa; font-size: 11px;">Siap</span>
            `;

            (document.body || document.documentElement).appendChild(panel);

            document.getElementById('run-safe-scan-btn').addEventListener('click', async () => {
                const btn = document.getElementById('run-safe-scan-btn');
                const status = document.getElementById('scan-status-text');
                btn.disabled = true;
                btn.style.opacity = '0.6';

                const candidateContainers = [
                    'li.ipc-metadata-list-summary-item',
                    '.ipc-metadata-list-summary-item',
                    'ul.ipc-metadata-list > li',
                    'div[data-testid="chart-layout-main-column"] li',
                    'section[data-testid="find-results-section-title"] li',
                    'li.find-title-result',
                    'li[data-testid="find-results-section-title"]',
                    'li[data-testid="list-page-mc-total-items"]',
                    '.cli-parent',
                    '.lister-item',
                    'tr.findResult',
                    '.list_item'
                ].join(', ');

                const containers = Array.from(document.querySelectorAll(candidateContainers));
                const scanQueue = [];
                const registeredTtIds = new Set();

                document.querySelectorAll('.pg-inline-wrapper').forEach(w => {
                    const parent = w.closest('li, tr, .lister-item, .list_item');
                    if (parent && parent.querySelectorAll('.pg-inline-wrapper').length > 1) {
                        w.remove();
                    }
                });

                containers.forEach(container => {
                    if (container.dataset.pgProcessed === "true") return;
                    if (container.querySelector('.pg-inline-wrapper')) {
                        container.dataset.pgProcessed = "true";
                        return;
                    }

                    const link = container.querySelector('a[href*="/title/tt"]');
                    if (!link) return;

                    const match = link.getAttribute('href').match(/\/title\/(tt\d+)/);
                    if (!match) return;

                    const titleId = match[1];

                    if (registeredTtIds.has(titleId)) return;
                    registeredTtIds.add(titleId);

                    scanQueue.push({ container, titleId });
                });

                let count = 0;
                const total = scanQueue.length;

                if (total === 0) {
                    status.textContent = "Semua item sudah dipindai.";
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    return;
                }

                for (const entry of scanQueue) {
                    const { container, titleId } = entry;
                    if (container.dataset.pgProcessed === "true" || container.querySelector('.pg-inline-wrapper')) continue;
                    container.dataset.pgProcessed = "true";

                    status.textContent = `Memproses (${++count}/${total})...`;

                    const wrapper = document.createElement('div');
                    wrapper.className = 'pg-inline-wrapper';
                    wrapper.innerHTML = `
                        <div class="pg-inline-header">
                            <span class="pg-inline-title">SEX & NUDITY:</span>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="nudity-badge nudity-badge--unknown">...</span>
                                <svg class="pg-chevron" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                            </div>
                        </div>
                        <div class="pg-inline-details" style="display: none;">Memuat rincian adegan...</div>
                    `;

                    const targetArea = container.querySelector(
                        '.ipc-metadata-list-summary-item__c, .ipc-metadata-list-summary-item__tc, [class*="ipc-metadata-list-summary-item__c"], .cli-children, .result_text, .lister-item-content, .info'
                    );

                    if (targetArea) {
                        targetArea.appendChild(wrapper);
                    } else {
                        container.appendChild(wrapper);
                    }

                    const badge = wrapper.querySelector('.nudity-badge');
                    const details = wrapper.querySelector('.pg-inline-details');
                    const header = wrapper.querySelector('.pg-inline-header');
                    const chevron = wrapper.querySelector('.pg-chevron');

                    const pgData = await fetchComprehensivePG(titleId);
                    const nudityObj = pgData ? pgData.nudity : { severity: 'unknown', items: [] };

                    badge.className = `nudity-badge nudity-badge--${nudityObj.severity}`;
                    badge.textContent = nudityObj.severity;

                    if (nudityObj.items && nudityObj.items.length > 0) {
                        details.innerHTML = `<ul>${nudityObj.items.map(i => `<li>${escapeHTML(i)}</li>`).join('')}</ul>`;
                    } else {
                        details.innerHTML = `<div style="color:#9ca3af; font-style:italic;">Tidak ada catatan spesifik.</div>`;
                    }

                    header.onclick = (e) => {
                        e.stopPropagation();
                        const isOpen = details.style.display !== 'none';
                        details.style.display = isOpen ? 'none' : 'block';
                        chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                    };

                    await sleep(CONFIG.throttleMs);
                }

                status.textContent = `Selesai (${count} judul dipindai).`;
                btn.disabled = false;
                btn.style.opacity = '1';
            });
        }
    };

    // ==========================================
    // 8. BOOTSTRAP PIPELINE & RELIABLE SPA OBSERVER
    // ==========================================
    function bootstrap() {
        Logger.info(`Memuat ${CONFIG.name} v${CONFIG.version}`);

        if (typeof GM_registerMenuCommand === "function") {
            GM_registerMenuCommand("🧹 Bersihkan Cache IMDb Suite", () => CacheManager.clearAppCache());
        }

        injectGlobalCSS();
        TitleModules.init();
        NameModules.init();
        SafeListScannerModule.init();

        setInterval(() => {
            if (SafeListScannerModule.isTargetPage() && !document.getElementById('imdb-safe-scan-panel')) {
                SafeListScannerModule.init();
            }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();
