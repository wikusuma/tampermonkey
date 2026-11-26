// ==UserScript==
// @name         YouTube Channel Search URL Extractor (.txt) + Auto-Scroll
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Ekstraksi URL video dari halaman pencarian Channel YouTube (Auto-Scroll, Auto-Deduplicate, & Download .txt)
// @author       You
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isProcessing = false;

    // 1. Ekstraksi ID & URL Video Khusus dari Hasil Pencarian Channel
    function getSearchVideoData() {
        let extractedData = [];
        let seenIds = new Set();

        // Mengambil seluruh elemen video hasil pencarian (kebal pembaruan DOM)
        const selectors = [
            'ytd-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-rich-item-renderer'
        ];

        let videoElements = document.querySelectorAll(selectors.join(', '));

        // Fallback jika YouTube menggunakan struktur minimalis
        if (videoElements.length === 0) {
            videoElements = document.querySelectorAll('a#video-title, a#video-title-link');
        }

        videoElements.forEach(item => {
            const linkElem = item.matches('a') ? item : item.querySelector('a#video-title, a#video-title-link, a[href*="watch?v="]');
            if (!linkElem) return;

            const href = linkElem.getAttribute('href');
            if (!href) return;

            const match = href.match(/v=([a-zA-Z0-9_-]{11})/);
            if (match && !seenIds.has(match[1])) {
                seenIds.add(match[1]); // Mencegah Duplikasi

                let title = linkElem.getAttribute('title') ||
                            linkElem.innerText.trim() ||
                            linkElem.getAttribute('aria-label') ||
                            'YouTube_Video';

                title = title.replace(/\s+/g, ' ').trim();

                extractedData.push({
                    id: match[1],
                    title: title,
                    url: `https://www.youtube.com/watch?v=${match[1]}`
                });
            }
        });

        return extractedData;
    }

    // 2. Fungsi Auto-Scroll Pintar Hingga Seluruh Hasil Pencarian Termuat
    async function autoScrollAndExtract(btnElement) {
        if (isProcessing) return;
        isProcessing = true;

        btnElement.style.backgroundColor = '#d97706'; // Warna oranye indikator proses
        btnElement.innerText = '📜 Memuat...';

        let lastCount = 0;
        let sameCount = 0;

        await new Promise((resolve) => {
            const scrollInterval = setInterval(() => {
                // Scroll ke bawah halaman secara otomatis
                window.scrollTo(0, document.documentElement.scrollHeight);

                const currentData = getSearchVideoData();
                btnElement.innerText = `📜 (${currentData.length} Video)`;

                if (currentData.length === lastCount && currentData.length > 0) {
                    sameCount++;
                } else {
                    sameCount = 0;
                    lastCount = currentData.length;
                }

                // Hentikan scroll jika tinggi/jumlah video tidak bertambah setelah 3x pengecekan (pencarian habis)
                if (sameCount >= 3) {
                    clearInterval(scrollInterval);
                    resolve();
                }
            }, 800); // Interval scroll 800ms
        });

        executeDownload(btnElement);
    }

    // 3. Ekstraksi Akhir & Unduh File .txt Windows-Safe (CRLF)
    function executeDownload(btnElement) {
        btnElement.innerText = '⏳ Mengunduh...';

        // Deteksi Nama Channel & Keyword Pencarian untuk Judul File .txt
        const channelNameElem = document.querySelector('ytd-channel-name #text, #channel-header #text, yt-formatted-string#text.ytd-channel-name');
        let channelName = channelNameElem ? channelNameElem.innerText.trim() : 'Channel_Search';

        // Ambil query pencarian dari URL
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('query') || 'Hasil_Pencarian';

        let fileName = `${channelName}_${searchQuery}`.replace(/[\\/:*?"<>|]/g, '_');

        const videoData = getSearchVideoData();

        if (videoData.length === 0) {
            alert('Gagal mendeteksi video!\nPastikan Anda sedang berada di halaman pencarian channel dan hasil video sudah tampil.');
            resetButton(btnElement);
            return;
        }

        // Susun daftar URL murni
        const urlList = videoData.map(v => v.url);

        // Format Teks Windows CRLF (\r\n) agar rapi di Notepad
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

        btnElement.style.backgroundColor = '#16a34a'; // Warna hijau saat sukses
        btnElement.innerText = `✅ Selesai (${videoData.length} Video)`;

        setTimeout(() => {
            resetButton(btnElement);
        }, 3000);
    }

    function resetButton(btnElement) {
        isProcessing = false;
        btnElement.style.backgroundColor = '#cc0000';
        btnElement.innerText = '📥 Download YT Channel';
    }

    // 4. Inject Tombol ke Header Navigasi YouTube (Pojok Kanan Atas)
    function injectToHeader() {
        // Cek apakah halaman merupakan halaman pencarian channel atau memuat pencarian
        const isSearchPage = window.location.href.includes('/search?') || window.location.href.includes('query=');
        const existingBtn = document.getElementById('yt-txt-download-btn');

        if (!isSearchPage) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (existingBtn) return;

        // Target kontainer header YouTube (sebelah tombol + Create)
        const targetContainer = document.querySelector('ytd-masthead #buttons');
        if (!targetContainer) return;

        const btn = document.createElement('button');
        btn.id = 'yt-txt-download-btn';
        btn.innerText = '📥 Download YT Channel';
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
            transition: background-color 0.2s, transform 0.2s;
            height: 36px;
            align-self: center;
            z-index: 9999;
        `;

        btn.onmouseover = () => { if (!isProcessing) btn.style.backgroundColor = '#ff0000'; };
        btn.onmouseout = () => { if (!isProcessing) btn.style.backgroundColor = '#cc0000'; };
        btn.onclick = () => autoScrollAndExtract(btn);

        targetContainer.insertBefore(btn, targetContainer.firstChild);
    }

    // Jalankan pemantauan secara berkala untuk menangani navigasi SPA YouTube
    setInterval(injectToHeader, 1000);
})();
