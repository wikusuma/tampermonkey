// ==UserScript==
// @name         YouTube URL Exporter Suite (Playlist & Search)
// @namespace    https://github.com/wikusuma/tampermonkey
// @version      1.0.0
// @description  Ekstrak & unduh daftar URL video YouTube (.txt) dengan auto-scroll untuk halaman Playlist maupun Hasil Pencarian/Channel.
// @author       wikusuma
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube-com/url-exporter-suite/url-exporter-suite.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube-com/url-exporter-suite/url-exporter-suite.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        btnId: 'yt-url-exporter-btn',
        styleId: 'yt-url-exporter-style',
        scrollIntervalMs: 800,
        playlistMaxIdleCycles: 5,
        searchMaxIdleCycles: 3,
        observerDebounceMs: 300,
        maxFileNameLength: 120,
        includeListParamInPlaylistUrls: true
    };

    const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
    const WINDOWS_RESERVED_NAMES = new Set([
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ]);

    let isProcessing = false;
    let activeScrollInterval = null;
    let observerDebounceTimer = null;
    let resetBtnTimer = null;

    function injectStyles() {
        if (document.getElementById(CONFIG.styleId)) return;

        const style = document.createElement('style');
        style.id = CONFIG.styleId;
        style.textContent = `
            #${CONFIG.btnId} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                height: 36px;
                padding: 0 14px;
                margin-right: 8px;
                background-color: #cc0000;
                color: #ffffff;
                border: none;
                border-radius: 18px;
                font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.2px;
                cursor: pointer;
                white-space: nowrap;
                transition: background-color 0.2s ease, transform 0.12s ease, opacity 0.2s ease;
                z-index: 2020;
            }
            #${CONFIG.btnId}:hover:not(:disabled) {
                background-color: #ff0000;
            }
            #${CONFIG.btnId}:active:not(:disabled) {
                transform: scale(0.97);
            }
            #${CONFIG.btnId}:disabled {
                cursor: default;
                opacity: 0.92;
            }
            #${CONFIG.btnId}.is-loading {
                background-color: #d97706;
                color: #ffffff;
            }
            #${CONFIG.btnId}.is-done {
                background-color: #16a34a;
                color: #ffffff;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function getActivePlaylistId() {
        try {
            const url = new URL(window.location.href);
            const listId = url.searchParams.get('list');
            return listId && listId.trim() ? listId.trim() : null;
        } catch {
            return null;
        }
    }

    function isSearchPage() {
        const href = window.location.href;
        const path = window.location.pathname || '';
        return path.includes('/results') || path.includes('/search') || href.includes('/search?') || href.includes('query=');
    }

    function getPageMode() {
        const playlistId = getActivePlaylistId();
        if (playlistId) {
            return { mode: 'playlist', playlistId };
        }
        if (isSearchPage()) {
            return { mode: 'search', playlistId: null };
        }
        return { mode: null, playlistId: null };
    }

    function extractVideoId(rawHref) {
        if (!rawHref) return null;
        try {
            const parsed = new URL(rawHref, window.location.origin);
            const vParam = parsed.searchParams.get('v');
            if (vParam && VIDEO_ID_REGEX.test(vParam)) {
                return vParam;
            }
            const shortsMatch = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shortsMatch && VIDEO_ID_REGEX.test(shortsMatch[1])) {
                return shortsMatch[1];
            }
        } catch {
            const fallbackMatch = rawHref.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/);
            const candidate = fallbackMatch ? (fallbackMatch[1] || fallbackMatch[2]) : null;
            if (candidate && VIDEO_ID_REGEX.test(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    function unhidePlaylistItems() {
        const selectors = [
            'ytd-playlist-video-renderer',
            'ytd-playlist-panel-video-renderer',
            'ytd-item-section-renderer[mini-mode]'
        ];

        requestAnimationFrame(() => {
            selectors.forEach((sel) => {
                document.querySelectorAll(sel).forEach((el) => {
                    if (el.style.display === 'none') {
                        el.style.display = '';
                    }
                    if (el.hasAttribute('hidden')) {
                        el.removeAttribute('hidden');
                    }
                });
            });
        });
    }

    function getPlaylistVideoUrls(playlistId) {
        unhidePlaylistItems();

        const seenIds = new Set();
        const urls = [];
        const links = document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');

        links.forEach((anchor) => {
            const href = anchor.getAttribute('href');
            if (!href) return;

            try {
                const parsed = new URL(href, window.location.origin);
                const linkListId = parsed.searchParams.get('list');
                if (linkListId !== playlistId) return;

                const videoId = extractVideoId(parsed.href);
                if (!videoId || seenIds.has(videoId)) return;

                seenIds.add(videoId);
                const finalUrl = CONFIG.includeListParamInPlaylistUrls
                    ? `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(playlistId)}`
                    : `https://www.youtube.com/watch?v=${videoId}`;
                urls.push(finalUrl);
            } catch {
                // Abaikan URL tidak valid
            }
        });

        return urls;
    }

    function getSearchVideoUrls() {
        const seenIds = new Set();
        const urls = [];
        const containers = document.querySelectorAll(
            'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer'
        );

        const anchors = containers.length > 0
            ? Array.from(containers).flatMap((item) =>
                Array.from(item.querySelectorAll('a#video-title, a#video-title-link, a[href*="/watch?v="]'))
            )
            : Array.from(document.querySelectorAll('a#video-title, a#video-title-link, a[href*="/watch?v="]'));

        anchors.forEach((anchor) => {
            const href = anchor.getAttribute('href');
            const videoId = extractVideoId(href);
            if (!videoId || seenIds.has(videoId)) return;

            seenIds.add(videoId);
            urls.push(`https://www.youtube.com/watch?v=${videoId}`);
        });

        return urls;
    }

    function sanitizeWindowsFileName(rawName, fallbackName = 'YouTube_Export') {
        let cleaned = (rawName || '')
            .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/g, '');

        if (!cleaned) {
            cleaned = fallbackName;
        }

        const upperBase = cleaned.split('.')[0].toUpperCase();
        if (WINDOWS_RESERVED_NAMES.has(upperBase)) {
            cleaned = `_${cleaned}`;
        }

        if (cleaned.length > CONFIG.maxFileNameLength) {
            cleaned = cleaned.slice(0, CONFIG.maxFileNameLength).trim().replace(/[. ]+$/g, '');
        }

        return cleaned || fallbackName;
    }

    function getPlaylistTitle() {
        const selectors = [
            'ytd-playlist-header-renderer #text',
            'h1.ytd-playlist-header-renderer',
            '.metadata-wrapper #title',
            'ytd-playlist-panel-renderer .title'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            const text = el && (el.innerText || el.textContent || '').trim();
            if (text) return text;
        }

        return 'YouTube_Playlist';
    }

    function getSearchFileName() {
        const channelSelectors = [
            'ytd-channel-name #text',
            '#channel-header #text',
            'yt-formatted-string#text.ytd-channel-name'
        ];

        let channelName = '';
        for (const sel of channelSelectors) {
            const el = document.querySelector(sel);
            const text = el && (el.innerText || el.textContent || '').trim();
            if (text) {
                channelName = text;
                break;
            }
        }

        let queryText = '';
        try {
            const url = new URL(window.location.href);
            queryText = (url.searchParams.get('search_query') || url.searchParams.get('query') || '').trim();
        } catch {
            queryText = '';
        }

        const combined = [channelName || 'Channel_Search', queryText || 'Hasil_Pencarian']
            .filter(Boolean)
            .join(' - ');

        return sanitizeWindowsFileName(combined, 'YouTube_Search');
    }

    function triggerTextDownload(lines, fileNameBase) {
        const safeName = sanitizeWindowsFileName(fileNameBase, 'YouTube_URLs');
        const content = lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${safeName}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    }

    function setButtonState(state, text, disabled = false) {
        const btn = document.getElementById(CONFIG.btnId);
        if (!btn) return;

        clearTimeout(resetBtnTimer);
        btn.classList.remove('is-loading', 'is-done');
        if (state === 'loading') btn.classList.add('is-loading');
        if (state === 'done') btn.classList.add('is-done');

        btn.textContent = text;
        btn.disabled = disabled;
    }

    function getDefaultButtonLabel(mode) {
        return mode === 'playlist' ? '📥 Download Playlist' : '📥 Download Search';
    }

    function abortOngoingOperation() {
        if (activeScrollInterval !== null) {
            clearInterval(activeScrollInterval);
            activeScrollInterval = null;
        }
        isProcessing = false;

        const { mode } = getPageMode();
        if (mode) {
            setButtonState('idle', getDefaultButtonLabel(mode), false);
        }
    }

    function scrollTargets(mode) {
        if (mode === 'playlist') {
            const panelContainer = document.querySelector('ytd-playlist-panel-renderer #items, #playlist-items');
            if (panelContainer) {
                panelContainer.scrollTop = panelContainer.scrollHeight;
            }
        }
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'instant'
        });
    }

    function executeDownload(urls, mode) {
        setButtonState('loading', '⏳ Mengunduh...', true);

        if (mode === 'playlist') {
            const title = getPlaylistTitle();
            triggerTextDownload(urls, sanitizeWindowsFileName(title, 'YouTube_Playlist'));
        } else {
            triggerTextDownload(urls, getSearchFileName());
        }

        setButtonState('done', `✅ Selesai (${urls.length} Video)`, false);
        resetBtnTimer = setTimeout(() => {
            isProcessing = false;
            const current = getPageMode();
            if (current.mode) {
                setButtonState('idle', getDefaultButtonLabel(current.mode), false);
            }
        }, 3000);
    }

    function startAutoScrollAndExtract() {
        if (isProcessing) return;

        const { mode, playlistId } = getPageMode();
        if (!mode) return;

        isProcessing = true;
        setButtonState('loading', '📜 Memuat...', true);

        let lastCount = 0;
        let idleCycles = 0;
        const maxIdle = mode === 'playlist' ? CONFIG.playlistMaxIdleCycles : CONFIG.searchMaxIdleCycles;

        const collectUrls = () => {
            if (mode === 'playlist') {
                return getPlaylistVideoUrls(playlistId);
            }
            return getSearchVideoUrls();
        };

        activeScrollInterval = setInterval(() => {
            if (!isProcessing) {
                clearInterval(activeScrollInterval);
                activeScrollInterval = null;
                return;
            }

            const currentUrls = collectUrls();
            const currentCount = currentUrls.length;

            setButtonState('loading', `📜 (${currentCount} Video)`, true);
            scrollTargets(mode);

            if (currentCount > lastCount) {
                lastCount = currentCount;
                idleCycles = 0;
            } else {
                idleCycles += 1;
            }

            const hasEnoughData = mode === 'playlist' ? currentCount > 0 : true;
            if (idleCycles >= maxIdle && hasEnoughData) {
                clearInterval(activeScrollInterval);
                activeScrollInterval = null;

                const finalUrls = collectUrls();
                executeDownload(finalUrls, mode);
            }
        }, CONFIG.scrollIntervalMs);
    }

    function ensureButtonMounted() {
        injectStyles();

        const { mode } = getPageMode();
        const existingBtn = document.getElementById(CONFIG.btnId);

        if (!mode) {
            if (existingBtn && !isProcessing) {
                existingBtn.remove();
            }
            return;
        }

        const headerButtons = document.querySelector('ytd-masthead #buttons');
        if (!headerButtons) return;

        if (!existingBtn) {
            const btn = document.createElement('button');
            btn.id = CONFIG.btnId;
            btn.type = 'button';
            btn.textContent = getDefaultButtonLabel(mode);
            btn.addEventListener('click', startAutoScrollAndExtract);
            headerButtons.prepend(btn);
        } else if (!isProcessing) {
            const desiredLabel = getDefaultButtonLabel(mode);
            if (existingBtn.textContent !== desiredLabel && !existingBtn.classList.contains('is-done')) {
                existingBtn.textContent = desiredLabel;
            }
            if (headerButtons.firstElementChild !== existingBtn) {
                headerButtons.prepend(existingBtn);
            }
        }
    }

    function scheduleButtonSync() {
        clearTimeout(observerDebounceTimer);
        observerDebounceTimer = setTimeout(ensureButtonMounted, CONFIG.observerDebounceMs);
    }

    window.addEventListener('yt-navigate-start', abortOngoingOperation);
    window.addEventListener('yt-navigate-finish', ensureButtonMounted);

    ensureButtonMounted();

    const observer = new MutationObserver((mutations) => {
        const onlySelfMutations = mutations.every((m) => {
            const target = m.target;
            return target instanceof Element && (target.id === CONFIG.btnId || target.id === CONFIG.styleId);
        });
        if (!onlySelfMutations) {
            scheduleButtonSync();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
