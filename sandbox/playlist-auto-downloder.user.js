// ==UserScript==
// @name         YouTube Playlist Auto-Downloader (.txt) + Auto-Scroll
// @namespace    https://github.com/wikusuma/scripts
// @version      3.7
// @description  Ekstraktor Playlist YouTube Presisi Berbasis URL-Parsing & Event SPA (Bebas Polling, Anti-Duplicate & Windows-Safe)
// @author       Willy Kusuma
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @license      MIT
// @homepageURL  https://github.com/wikusuma/scripts/tree/main/TamperMonkey
// @supportURL   https://github.com/wikusuma/scripts/issues
// @downloadURL  https://raw.githubusercontent.com/wikusuma/scripts/main/TamperMonkey/YouTube%20Playlist%20Auto-Downloader%20%28.txt%29%20%2B%20Auto-Scroll.user.js
// @updateURL    https://raw.githubusercontent.com/wikusuma/scripts/main/TamperMonkey/YouTube%20Playlist%20Auto-Downloader%20%28.txt%29%20%2B%20Auto-Scroll.user.js
// ==/UserScript==

(function () {
    'use strict';

    // State lock & referensi timer untuk mencegah duplikasi eksekusi atau memory leak
    let isProcessing = false;
    let activeScrollInterval = null;

    // ID Unik spesifik fitur untuk menghindari tabrakan namespace antarskrip
    const BUTTON_ID = 'yt-playlist-download-btn';
    const STYLE_ID = 'yt-playlist-download-style';

    /**
     * Menyuntikkan stylesheet sekali saja ke dokumen untuk efisiensi render
     * dan menggantikan inline event onmouseover/onmouseout.
     */
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
            #${BUTTON_ID}:hover:not(:disabled) {
                background-color: #e60000;
            }
            #${BUTTON_ID}:active:not(:disabled) {
                transform: scale(0.97);
            }
            #${BUTTON_ID}:disabled {
                cursor: not-allowed;
                opacity: 0.9;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    /**
     * Mengambil ID Playlist aktif dari URL halaman secara aman menggunakan URL API.
     */
    function getActivePlaylistId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('list') || '';
        } catch {
            return '';
        }
    }

    /**
     * 1. Ekstraksi ID Video Menggunakan Native URL Parsing
     * Mendukung format video reguler (/watch?v=...) dan Shorts (/shorts/...) yang masuk dalam playlist.
     */
    function getPlaylistVideoIds() {
        const playlistId = getActivePlaylistId();
        if (!playlistId) return [];

        const seenIds = new Set();
        // Query seluruh tautan video watch dan shorts di halaman
        const candidateLinks = document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');

        candidateLinks.forEach(a => {
            try {
                // Parsing URL absolut menggunakan constructor bawaan peramban
                const url = new URL(a.href, window.location.origin);
                const linkPlaylistId = url.searchParams.get('list');

                // Validasi ketat: tautan harus eksplisit milik playlist yang sedang aktif
                if (linkPlaylistId !== playlistId) return;

                let videoId = url.searchParams.get('v');
                if (!videoId && url.pathname.startsWith('/shorts/')) {
                    const match = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
                    if (match) videoId = match[1];
                }

                if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                    seenIds.add(videoId);
                }
            } catch {
                // Abaikan jika ada tautan malformed
            }
        });

        return Array.from(seenIds);
    }

    /**
     * 2. Auto-Scroll Pintar Berbasis Batas Waktu dan Idle-Check yang Tangguh
     */
    async function autoScrollAndExtract(btnElement) {
        if (isProcessing) return;
        isProcessing = true;

        btnElement.disabled = true;
        btnElement.style.backgroundColor = '#d97706';
        btnElement.textContent = '📜 Memuat...';

        let lastCount = 0;
        let sameCount = 0;

        await new Promise((resolve) => {
            activeScrollInterval = setInterval(() => {
                // Scroll container panel samping (jika di watch page) atau window utama (playlist page)
                const sidebarPanel = document.querySelector('ytd-playlist-panel-renderer #items, #playlist-items');
                if (sidebarPanel) {
                    sidebarPanel.scrollTop = sidebarPanel.scrollHeight;
                }
                window.scrollTo(0, document.documentElement.scrollHeight);

                const currentIds = getPlaylistVideoIds();
                btnElement.textContent = `📜 (${currentIds.length} Video)`;

                if (currentIds.length === lastCount && currentIds.length > 0) {
                    sameCount++;
                } else {
                    sameCount = 0;
                    lastCount = currentIds.length;
                }

                // Ditingkatkan menjadi 5 siklus berturut-turut (~4 detik) agar tidak premature abort pada koneksi lambat
                if (sameCount >= 5) {
                    clearInterval(activeScrollInterval);
                    activeScrollInterval = null;
                    resolve();
                }
            }, 800);
        });

        executeDownload(btnElement);
    }

    /**
     * 3. Sanitasi Nama Berkas Windows (Karakter Ilegal, Reserved Words, Titik/Spasi di Ujung, & Panjang Maksimal)
     */
    function sanitizeWindowsFileName(rawName) {
        let clean = (rawName || 'YouTube_Playlist')
            .replace(/[\\/:*?"<>|]/g, '_')         // Karakter terlarang Windows
            .replace(/[\x00-\x1f\x80-\x9f]/g, '')   // Control characters
            .replace(/[.\s]+$/, '')                // Hapus trailing dots dan spaces
            .trim();

        // Cegah tabrakan dengan Windows Reserved Device Names
        if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(clean)) {
            clean += '_playlist';
        }

        // Batasi panjang nama berkas agar tidak melebihi batas Windows MAX_PATH
        if (clean.length > 120) {
            clean = clean.substring(0, 120).trim();
        }

        return clean || 'YouTube_Playlist';
    }

    /**
     * 4. Ekstraksi Akhir & Unduh Berkas .txt
     */
    function executeDownload(btnElement) {
        btnElement.textContent = '⏳ Mengunduh...';

        const playlistTitleElem = document.querySelector(
            'ytd-playlist-header-renderer #text, h1.ytd-playlist-header-renderer, .metadata-wrapper #title, ytd-playlist-panel-renderer .title'
        );
        const rawTitle = playlistTitleElem ? playlistTitleElem.textContent : 'YouTube_Playlist';
        const playlistTitle = sanitizeWindowsFileName(rawTitle);

        const playlistId = getActivePlaylistId();
        const uniqueVideoIds = getPlaylistVideoIds();

        if (uniqueVideoIds.length === 0) {
            alert('Gagal mendeteksi video playlist!\nPastikan halaman playlist sudah terbuka dan termuat sepenuhnya.');
            resetButton(btnElement);
            return;
        }

        // Format URL absolut murni
        const urlList = uniqueVideoIds.map(id =>
            `https://www.youtube.com/watch?v=${id}${playlistId ? '&list=' + playlistId : ''}`
        );

        // Standar teks Windows CRLF (\r\n)
        const fileContent = urlList.join('\r\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = `${playlistTitle}.txt`;
        document.body.appendChild(downloadLink);
        downloadLink.click();

        document.body.removeChild(downloadLink);
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
        btnElement.textContent = '📥 Download YT Playlist';
    }

    /**
     * Batalkan scroll aktif dan bersihkan state saat pengguna berpindah halaman
     */
    function abortOngoingOperation() {
        if (activeScrollInterval) {
            clearInterval(activeScrollInterval);
            activeScrollInterval = null;
        }
        isProcessing = false;
        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) {
            resetButton(existingBtn);
        }
    }

    /**
     * 5. Injeksi Tombol ke Header YouTube Menggunakan Pola Event SPA (Zero Polling)
     */
    function updateButtonState() {
        const playlistId = getActivePlaylistId();
        const existingBtn = document.getElementById(BUTTON_ID);

        // Jika bukan di halaman yang memuat playlist, bersihkan tombol jika ada
        if (!playlistId) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (existingBtn) return;

        const targetContainer = document.querySelector('ytd-masthead #buttons');
        if (!targetContainer) return;

        ensureButtonStyles();

        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.type = 'button';
        btn.textContent = '📥 Download YT Playlist';
        btn.title = 'Unduh seluruh URL video dalam playlist ini ke berkas .txt';
        btn.onclick = () => autoScrollAndExtract(btn);

        targetContainer.insertBefore(btn, targetContainer.firstChild);
    }

    // Tangani navigasi SPA YouTube secara instan
    window.addEventListener('yt-navigate-finish', updateButtonState);
    window.addEventListener('yt-navigate-start', abortOngoingOperation);

    // Initial check saat halaman pertama kali dimuat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateButtonState);
    } else {
        updateButtonState();
    }

    // Observer hemat resource: hanya memicu injeksi jika berada di halaman playlist dan tombol belum ada
    const observer = new MutationObserver(() => {
        if (getActivePlaylistId() && !document.getElementById(BUTTON_ID)) {
            updateButtonState();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
