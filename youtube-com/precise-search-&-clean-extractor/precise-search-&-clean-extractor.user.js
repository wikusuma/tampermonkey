// ==UserScript==
// @name         Precise Search & Clean Extractor
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  Hapus Total Video Irrelevan di Layar + Hapus Shelf/Explore + Download Sorted .txt
// @author       You
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube.com/precise-search-&-clean-extractor/precise-search-&-clean-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube.com/precise-search-&-clean-extractor/precise-search-&-clean-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. PEMBERSIH VISUAL DOM & STRICT KEYWORD FILTERING (Real-Time)
    function cleanAndFilterSearchDOM() {
        if (!window.location.href.includes('/results?')) return;

        // A. Sembunyikan elemen rak bawaan (Shorts, Carousel, Promosi, dll)
        const globalJunkSelectors = [
            'ytd-reel-shelf-renderer',
            'ytd-horizontal-card-list-renderer',
            'ytd-search-pyv-renderer',
            'ytd-rich-shelf-renderer'
        ];

        globalJunkSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
        });

        // B. Sembunyikan Shelf berdasarkan Teks Header (Explore More, Previously Watched, dll)
        const targetKeywords = [
            'explore more', 'jelajahi lebih banyak', 'previously watched', 'pernah ditonton',
            'people also watched', 'orang lain juga menonton', 'for you', 'untuk anda',
            'related to your search', 'terkait dengan pencarian'
        ];

        document.querySelectorAll('ytd-shelf-renderer #title, ytd-shelf-renderer #title-text, ytd-item-section-renderer #title, ytd-shelf-renderer h2').forEach(titleEl => {
            const text = titleEl.innerText ? titleEl.innerText.toLowerCase().trim() : '';
            if (text && targetKeywords.some(kw => text.includes(kw))) {
                const shelf = titleEl.closest('ytd-shelf-renderer, ytd-item-section-renderer');
                if (shelf) shelf.style.display = 'none';
            }
        });

        // C. STRICT VISUAL KEYWORD FILTER (Sembunyikan video melenceng dari layar secara langsung)
        const urlParams = new URLSearchParams(window.location.search);
        const rawQuery = urlParams.get('search_query') || '';
        if (!rawQuery) return;

        // Ambil kata kunci pencarian (abaikan kata pendek seperti "in", "to", "and", "yg")
        const queryTerms = decodeURIComponent(rawQuery)
            .toLowerCase()
            .replace(/['"]/g, '')
            .split(/\s+|\+/)
            .filter(t => t.length > 2);

        if (queryTerms.length === 0) return;

        // Pindai semua item video biasa di layar
        document.querySelectorAll('ytd-video-renderer').forEach(item => {
            // Abaikan jika video memang ada di dalam shelf rekomendasi
            if (item.closest('ytd-shelf-renderer, ytd-reel-shelf-renderer')) {
                item.style.display = 'none';
                return;
            }

            const linkElem = item.querySelector('a#video-title, a#video-title-link');
            if (!linkElem) return;

            const title = (linkElem.getAttribute('title') || linkElem.innerText || '').toLowerCase();

            // Cek apakah judul mengandung minimal salah satu kata kunci pencarian
            const isMatch = queryTerms.some(term => title.includes(term));

            if (!isMatch) {
                // SEMBUNYIKAN PAKSA DARI LAYAR BROWSER!
                item.style.display = 'none';
            } else {
                // Tampilkan hanya jika cocok
                item.style.display = '';
            }
        });
    }

    // 2. FUNGSI KONVERSI TEKS TANGGAL RELATIF YOUTUBE KE BOBOT HARI
    function parseRelativeToDays(dateString) {
        if (!dateString) return 999999;

        const lower = dateString.toLowerCase();
        const match = lower.match(/(\d+)\s+(second|minute|hour|day|week|month|year|detik|menit|jam|hari|minggu|bulan|tahun)/);

        if (!match) return 999998;

        const amount = parseInt(match[1], 10);
        const unit = match[2];

        switch (unit) {
            case 'second': case 'minute': case 'hour':
            case 'detik': case 'menit': case 'jam':
                return 0;
            case 'day': case 'hari':
                return amount;
            case 'week': case 'minggu':
                return amount * 7;
            case 'month': case 'bulan':
                return amount * 30;
            case 'year': case 'tahun':
                return amount * 365;
            default:
                return 999998;
        }
    }

    // 3. EKSTRAKSI DAN PENGURUTAN DATA VIDEO (TERBARU -> TERLAMA)
    function getSortedVideoData() {
        let extractedData = [];
        let seenIds = new Set();

        const videoElements = document.querySelectorAll('ytd-video-renderer');

        videoElements.forEach(item => {
            // Hanya ambil video yang lolos filter (tampil di layar)
            if (item.style.display === 'none' || item.offsetParent === null) return;

            const linkElem = item.querySelector('a#video-title, a#video-title-link');
            if (!linkElem) return;

            const href = linkElem.getAttribute('href');
            if (!href) return;

            const match = href.match(/v=([a-zA-Z0-9_-]{11})/);
            if (!match || seenIds.has(match[1])) return;

            const videoId = match[1];
            let title = linkElem.getAttribute('title') || linkElem.innerText.trim();

            const metadataElements = item.querySelectorAll('#metadata-line span.inline-metadata-item, #metadata-line span');
            let dateText = '';

            metadataElements.forEach(el => {
                const txt = el.innerText.trim();
                if (txt.includes('ago') || txt.includes('lalu') || txt.includes('Streamed')) {
                    dateText = txt;
                }
            });

            const daysAgo = parseRelativeToDays(dateText);

            seenIds.add(videoId);
            extractedData.push({
                id: videoId,
                title: title.replace(/\s+/g, ' ').trim(),
                url: `https://www.youtube.com/watch?v=${videoId}`,
                dateText: dateText || 'Tanggal tidak terdeteksi',
                daysAgo: daysAgo
            });
        });

        // Urutkan dari Terbaru ke Terlama
        extractedData.sort((a, b) => a.daysAgo - b.daysAgo);

        return extractedData;
    }

    // 4. EKSEKUSI UNDUH FILE .TXT BERBASIS CR-LF WINDOWS
    function executeDownload(btnElement) {
        const data = getSortedVideoData();

        if (data.length === 0) {
            alert('Tidak ditemukan video presisi yang cocok dengan kata kunci Anda.');
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('search_query') || 'Search_Result';
        const fileName = `Sorted_Latest_${query}`.replace(/[\\/:*?"<>|]/g, '_');

        const urlList = data.map(v => v.url);
        const fileContent = urlList.join('\r\n');

        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${fileName}.txt`;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        btnElement.style.backgroundColor = '#16a34a';
        btnElement.innerText = `✅ Saved (${data.length})`;
        setTimeout(() => {
            btnElement.style.backgroundColor = '#cc0000';
            btnElement.innerText = '📥 Download YT Search';
        }, 3000);
    }

    // 5. INJEKSI TOMBOL DENGAN DUKUNGAN SPA NAVIGATION
    function injectToHeader() {
        const isSearchPage = window.location.href.includes('/results?');
        const existingBtn = document.getElementById('yt-sort-extractor-btn');

        if (!isSearchPage) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (existingBtn) return;

        const targetContainer = document.querySelector('ytd-masthead #buttons');
        if (!targetContainer) return;

        const btn = document.createElement('button');
        btn.id = 'yt-sort-extractor-btn';
        btn.innerText = '📥 Download YT Search';
        btn.style.cssText = `
            background-color: #cc0000;
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: bold;
            border-radius: 18px;
            cursor: pointer;
            margin-right: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 36px;
            align-self: center;
            z-index: 9999;
        `;

        btn.onclick = () => executeDownload(btn);
        targetContainer.insertBefore(btn, targetContainer.firstChild);
    }

    // Eksekusi pembersihan visual & injeksi tombol secara periodik
    setInterval(() => {
        cleanAndFilterSearchDOM();
        injectToHeader();
    }, 400);
})();
