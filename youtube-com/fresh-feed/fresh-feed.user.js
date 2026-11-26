// ==UserScript==
// @name         [YouTube] Fresh Feed (Auto "New to you" & Hide Watched)
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Otomatis mengaktifkan filter "New to you" secara akurat saat refresh/navigasi dan menyembunyikan video yang sudah ditonton.
// @author       wikusuma
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube-com/fresh-feed/yt-fresh-feed.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube-com/fresh-feed/yt-fresh-feed.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_LABELS = ['new to you', 'baru untuk anda'];
    let isSwitching = false;
    let hasSwitchedThisSession = false;

    // 1. Injeksi CSS untuk menyembunyikan video yang sudah ditonton (Watched) secara instan
    // serta menyembunyikan grid sementara saat proses transisi ke "New to you"
    const style = document.createElement('style');
    style.textContent = `
        /* Sembunyikan item grid yang memiliki progress bar (sudah ditonton) */
        ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer),
        ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(#progress) {
            display: none !important;
        }
        /* Anti-flicker saat sedang berpindah dari tab All ke New to you */
        ytd-browse[page-subtype="home"].yt-fresh-switching #contents.ytd-rich-grid-renderer {
            opacity: 0.15 !important;
            pointer-events: none !important;
            transition: opacity 0.2s ease !important;
        }
    `;
    document.head.appendChild(style);

    // 2. Fungsi untuk memeriksa apakah berada di Beranda
    function isHomePage() {
        return location.pathname === '/';
    }

    // 3. Cari elemen Chip "New to you"
    function findNewToYouChip() {
        const chips = document.querySelectorAll('ytd-browse[page-subtype="home"] yt-chip-cloud-chip-renderer');
        for (const chip of chips) {
            const text = (chip.innerText || chip.textContent || '').trim().toLowerCase();
            if (TARGET_LABELS.includes(text)) {
                return chip;
            }
        }
        return null;
    }

    // 4. Cek apakah chip sudah benar-benar aktif menurut state Polymer/DOM
    function isChipSelected(chip) {
        if (!chip) return false;
        return (
            chip.hasAttribute('selected') ||
            chip.getAttribute('aria-selected') === 'true' ||
            chip.classList.contains('iron-selected')
        );
    }

    // 5. Eksekusi klik yang meniru interaksi asli pengguna pada komponen Polymer
    function triggerPolymerClick(chip) {
        const innerTarget = chip.querySelector('button, yt-formatted-string, #chip-container') || chip;

        const mouseEvents = ['mousedown', 'mouseup', 'click'];
        mouseEvents.forEach(eventType => {
            const evt = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            });
            innerTarget.dispatchEvent(evt);
        });

        if (typeof chip.click === 'function') {
            chip.click();
        }
    }

    // 6. Logika utama pemindahan tab dengan verifikasi berulang (Retry & Verify)
    function ensureNewToYouActive() {
        if (!isHomePage() || isSwitching || hasSwitchedThisSession) return;

        const homeBrowse = document.querySelector('ytd-browse[page-subtype="home"]');
        const chip = findNewToYouChip();

        if (!chip || !homeBrowse) return;

        if (isChipSelected(chip)) {
            hasSwitchedThisSession = true;
            homeBrowse.classList.remove('yt-fresh-switching');
            return;
        }

        isSwitching = true;
        homeBrowse.classList.add('yt-fresh-switching');

        let attempts = 0;
        const maxAttempts = 12;

        const interval = setInterval(() => {
            attempts++;
            const currentChip = findNewToYouChip();

            if (!isHomePage()) {
                clearInterval(interval);
                isSwitching = false;
                homeBrowse.classList.remove('yt-fresh-switching');
                return;
            }

            if (currentChip && isChipSelected(currentChip)) {
                clearInterval(interval);
                isSwitching = false;
                hasSwitchedThisSession = true;
                homeBrowse.classList.remove('yt-fresh-switching');
                return;
            }

            if (currentChip) {
                triggerPolymerClick(currentChip);
            }

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                isSwitching = false;
                homeBrowse.classList.remove('yt-fresh-switching');
            }
        }, 300);
    }

    // 7. Pembersihan tambahan via JS untuk elemen yang lolos dari selector CSS :has()
    function hideWatchedVideosFallback() {
        if (!isHomePage()) return;
        const watchedIndicators = document.querySelectorAll(
            'ytd-browse[page-subtype="home"] ytd-thumbnail-overlay-resume-playback-renderer'
        );
        watchedIndicators.forEach(indicator => {
            const richItem = indicator.closest('ytd-rich-item-renderer');
            if (richItem && richItem.style.display !== 'none') {
                richItem.style.display = 'none';
            }
        });
    }

    // 8. Event Listeners untuk Siklus Navigasi SPA YouTube
    window.addEventListener('yt-navigate-start', () => {
        if (isHomePage()) {
            hasSwitchedThisSession = false;
        }
    });

    window.addEventListener('yt-navigate-finish', () => {
        if (isHomePage()) {
            hasSwitchedThisSession = false;
            setTimeout(ensureNewToYouActive, 250);
        }
    });

    // 9. Observer untuk memantau perubahan DOM saat halaman pertama kali di-refresh
    const observer = new MutationObserver(() => {
        if (!isHomePage()) return;
        if (!hasSwitchedThisSession && !isSwitching) {
            const chip = findNewToYouChip();
            const gridReady = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
            if (chip && gridReady) {
                setTimeout(ensureNewToYouActive, 200);
            }
        }
        hideWatchedVideosFallback();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
