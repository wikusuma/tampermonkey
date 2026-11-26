// ==UserScript==
// @name         YouTube Playlist Extractor & Full Display Suite (Optimized)
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  Menampilkan semua video playlist & ekstraksi URL lengkap ke file .txt (Auto-Scroll) dengan optimasi performa.
// @author       Adaptive Suite
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'yt-playlist-suite-btn';
    const STYLE_ID = 'yt-playlist-suite-style';

    let isProcessing = false;
    let activeScrollInterval = null;

    // 1. Injeksi Style Tombol Header
    function ensureButtonStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                background-color: #cc0000;
                color: #ffffff;
                border: none;
                padding: 0 16px;
                font-size: 13px;
                font-family: Roboto, Arial, sans-serif;
                font-weight: 500;
                border-radius: 18px;
                cursor: pointer;
                margin-right: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 36px;
                align-self: center;
                z-index: 9999;
                transition: background-color 0.2s ease, transform 0.1s ease;
                user-select: none;
            }
            #${BUTTON_ID}:hover:not(:disabled) { background-color: #e60000; }
            #${BUTTON_ID}:active:not(:disabled) { transform: scale(0.97); }
            #${BUTTON_ID}:disabled { cursor: not-allowed; opacity: 0.9; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // 2. Ambil ID Playlist Aktif dari URL
    function getActivePlaylistId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('list') || '';
        } catch {
            return '';
        }
    }

    // 3. Sanitasi Nama Berkas Windows (CRLF Safe)
    function sanitizeFileName(rawName) {
        let clean = (rawName || 'YouTube_Playlist')
            .replace(/[\\/:*?"<>|\x00-\x1f\x80-\x9f]/g, '_') // OPTIMASI: Kombinasi regex
            .replace(/[.\s]+$/, '')
            .trim();

        if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(clean)) {
            clean += '_playlist';
        }
        return (clean.length > 120 ? clean.substring(0, 120).trim() : clean) || 'YouTube_Playlist';
    }

    // 4. Pastikan Seluruh Kartu Video Playlist Tetap Ditampilkan (Unhide)
    function unhidePlaylistItems() {
        // OPTIMASI: Gunakan requestAnimationFrame untuk mencegah layout thrashing
        requestAnimationFrame(() => {
            const playlistElements = document.querySelectorAll(`
                ytd-playlist-video-renderer,
                ytd-playlist-panel-video-renderer,
                ytd-item-section-renderer[mini-mode]
            `);
            playlistElements.forEach(el => {
                if (el.style.display === 'none') {
                    el.style.display = '';
                }
            });
        });
    }

    // 5. Ekstraksi URL Video Playlist (Anti-Duplikasi)
    function getPlaylistVideoUrls() {
        const playlistId = getActivePlaylistId();
        if (!playlistId) return [];

        const seenIds = new Set();
        const candidateLinks = document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');

        candidateLinks.forEach(a => {
            try {
                const url = new URL(a.href, window.location.origin);
                const linkPlaylistId = url.searchParams.get('list');

                if (linkPlaylistId !== playlistId) return;

                let videoId = url.searchParams.get('v');
                if (!videoId && url.pathname.startsWith('/shorts/')) {
                    const match = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
                    if (match) videoId = match[1];
                }

                if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                    seenIds.add(videoId);
                }
            } catch {}
        });

        return Array.from(seenIds).map(id => `https://www.youtube.com/watch?v=${id}&list=${playlistId}`);
    }

    // 6. Auto-Scroll Cerdas untuk Memuat Seluruh 100+ Video
    async function startAutoScroll(btnElement) {
        if (isProcessing) return;
        isProcessing = true;

        btnElement.disabled = true;
        btnElement.style.backgroundColor = '#d97706';
        btnElement.textContent = '📜 Memuat...';

        let lastCount = 0;
        let sameCount = 0;

        await new Promise((resolve) => {
            activeScrollInterval = setInterval(() => {
                unhidePlaylistItems();

                const sidebarPanel = document.querySelector('ytd-playlist-panel-renderer #items, #playlist-items');
                if (sidebarPanel) {
                    sidebarPanel.scrollTop = sidebarPanel.scrollHeight;
                }
                window.scrollTo(0, document.documentElement.scrollHeight);

                const currentUrls = getPlaylistVideoUrls();
                btnElement.textContent = `📜 (${currentUrls.length} Video)`;

                if (currentUrls.length === lastCount && currentUrls.length > 0) {
                    sameCount++;
                } else {
                    sameCount = 0;
                    lastCount = currentUrls.length;
                }

                if (sameCount >= 5) {
                    clearInterval(activeScrollInterval);
                    activeScrollInterval = null;
                    resolve();
                }
            }, 800);
        });

        executeDownload(btnElement);
    }

    // 7. Unduh File .txt Berisi Seluruh URL
    function executeDownload(btnElement) {
        btnElement.textContent = '⏳ Mengunduh...';

        const titleElem = document.querySelector(
            'ytd-playlist-header-renderer #text, h1.ytd-playlist-header-renderer, .metadata-wrapper #title, ytd-playlist-panel-renderer .title'
        );
        const playlistTitle = sanitizeFileName(titleElem ? titleElem.textContent : 'YouTube_Playlist');
        const urlList = getPlaylistVideoUrls();

        if (urlList.length === 0) {
            alert('Gagal mendeteksi video playlist! Pastikan halaman sudah termuat.');
            resetButton(btnElement);
            return;
        }

        const fileContent = urlList.join('\r\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${playlistTitle}.txt`;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        btnElement.style.backgroundColor = '#16a34a';
        btnElement.textContent = `✅ Selesai (${urlList.length} Video)`;

        setTimeout(() => {
            resetButton(btnElement);
        }, 3000);
    }

    function resetButton(btnElement) {
        isProcessing = false;
        btnElement.disabled = false;
        btnElement.style.backgroundColor = '';
        btnElement.textContent = '📥 Download Playlist';
    }

    function abortOperation() {
        if (activeScrollInterval) {
            clearInterval(activeScrollInterval);
            activeScrollInterval = null;
        }
        isProcessing = false;
    }

    // 8. Injeksi Tombol Adaptif Khusus Playlist
    function updateButtonState() {
        const playlistId = getActivePlaylistId();
        const existingBtn = document.getElementById(BUTTON_ID);

        // Hanya aktif di area dengan context Playlist
        if (!playlistId) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        unhidePlaylistItems();

        if (existingBtn) return;

        const targetContainer = document.querySelector('ytd-masthead #buttons');
        if (!targetContainer) return;

        ensureButtonStyles();

        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.type = 'button';
        btn.textContent = '📥 Download Playlist';
        btn.title = 'Unduh semua URL video dalam playlist ini (baik yang sudah atau belum ditonton)';
        btn.onclick = () => startAutoScroll(btn);

        targetContainer.insertBefore(btn, targetContainer.firstChild);
    }

    // Tangani Event SPA YouTube
    window.addEventListener('yt-navigate-start', abortOperation);
    window.addEventListener('yt-navigate-finish', () => {
        unhidePlaylistItems();
        updateButtonState();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateButtonState);
    } else {
        updateButtonState();
    }

    // 9. OPTIMASI: Observer dengan Debounce (Anti CPU Spike)
    let observerDebounce;
    const observer = new MutationObserver(() => {
        clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => {
            if (getActivePlaylistId()) {
                unhidePlaylistItems();
                if (!document.getElementById(BUTTON_ID)) {
                    updateButtonState();
                }
            }
        }, 300); // 300ms jeda eksekusi pasca-mutasi DOM
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
