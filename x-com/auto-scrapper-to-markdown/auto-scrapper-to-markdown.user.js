// ==UserScript==
// @name         Auto-Scraper to Markdown (with Metrics)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Auto scroll timeline postingan X, ekstrak teks, link, replies, reposts, likes, views/trend, bookmarks, dan simpan sebagai file Markdown.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://github.com/wikusuma/tampermonkey/tree/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/tree/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isScraping = false;
    let tweetsMap = new Map();
    let scrollInterval = null;
    let noChangeCount = 0;
    let lastHeight = 0;

    // Helper untuk mengambil angka metrik berdasarkan testid tombol
    function getMetricValue(article, testId) {
        const btn = article.querySelector(`button[data-testid="${testId}"], a[data-testid="${testId}"]`);
        if (!btn) return '0';

        // Coba cari text di dalam elemen span angka
        const textSpan = btn.querySelector('span[data-testid="app-text-transition-container"]') || btn.querySelector('span');
        const textVal = textSpan ? textSpan.innerText.trim() : btn.innerText.trim();

        // Cek aria-label jika angka tidak tertulis langsung
        if (!textVal && btn.getAttribute('aria-label')) {
            const match = btn.getAttribute('aria-label').match(/\d+[\d,\.]*[KMB]?/i);
            return match ? match[0] : '0';
        }
        return textVal || '0';
    }

    // Helper ekstraksi data lengkap tiap tweet
    function extractTweetData(article) {
        try {
            const timeEl = article.querySelector('time');
            const linkEl = timeEl ? timeEl.closest('a') : null;
            const tweetUrl = linkEl ? linkEl.href : '';

            // Identifier unik tweet
            const tweetId = tweetUrl || article.innerText.slice(0, 60);
            if (tweetsMap.has(tweetId)) return;

            // Penulis & Waktu
            const userNames = article.querySelector('div[data-testid="User-Name"]');
            const author = userNames ? userNames.innerText.split('\n').slice(0, 2).join(' ') : 'Unknown';
            const timestamp = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText) : '';

            // Teks Tweet
            const tweetTextEl = article.querySelector('div[data-testid="tweetText"]');
            const tweetText = tweetTextEl ? tweetTextEl.innerText.trim() : '';

            // Metrik Interaksi (Replies, Reposts, Likes, Views/Trend, Bookmarks)
            const replies = getMetricValue(article, 'reply');
            const reposts = getMetricValue(article, 'retweet');
            const likes = getMetricValue(article, 'like');
            const bookmarks = getMetricValue(article, 'bookmark');

            // Views / Impressions (Trend metrics)
            const viewsEl = article.querySelector('a[href*="/analytics"], a[href*="/status/"][aria-label*="views"]');
            let views = '0';
            if (viewsEl) {
                const viewsSpan = viewsEl.querySelector('span[data-testid="app-text-transition-container"]') || viewsEl.querySelector('span');
                views = viewsSpan ? viewsSpan.innerText.trim() : (viewsEl.innerText.trim() || '0');
            }

            if (tweetText || tweetUrl) {
                tweetsMap.set(tweetId, {
                    author,
                    timestamp,
                    url: tweetUrl,
                    content: tweetText,
                    replies,
                    reposts,
                    likes,
                    views,
                    bookmarks
                });
                updateUI();
            }
        } catch (err) {
            console.error('Gagal mengekstrak tweet:', err);
        }
    }

    function scrapeVisibleTweets() {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(extractTweetData);
    }

    function startAutoScroll() {
        isScraping = true;
        startBtn.innerText = 'Stop Scraping';
        startBtn.style.backgroundColor = '#dc2626';

        scrollInterval = setInterval(() => {
            if (!isScraping) return;

            scrapeVisibleTweets();
            window.scrollBy(0, window.innerHeight * 0.85);

            const currentHeight = document.documentElement.scrollHeight;
            if (currentHeight === lastHeight) {
                noChangeCount++;
                if (noChangeCount >= 12) {
                    stopAutoScroll();
                    alert('Sudah mencapai bagian paling bawah atau limit feed tercapai.');
                }
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
            }
        }, 1200);
    }

    function stopAutoScroll() {
        isScraping = false;
        clearInterval(scrollInterval);
        startBtn.innerText = 'Start Auto-Scroll';
        startBtn.style.backgroundColor = '#1d9bf0';
    }

    // Format Markdown dengan tabel / ringkasan metrik
    function generateMarkdown() {
        let md = `# Arsip Postingan X (Twitter)\n`;
        md += `Tanggal Ekspor: ${new Date().toLocaleString()}\n`;
        md += `Total Postingan: ${tweetsMap.size}\n\n---\n\n`;

        let index = 1;
        for (const [_, item] of tweetsMap) {
            md += `### ${index}. ${item.author} (${item.timestamp})\n`;
            if (item.url) {
                md += `**Link:** [Lihat Tweet](${item.url})\n\n`;
            }

            // Baris statistik engagement
            md += `> 💬 **Replies:** ${item.replies} | 🔁 **Reposts:** ${item.reposts} | ❤️ **Likes:** ${item.likes} | 📊 **Views:** ${item.views} | 🔖 **Bookmarks:** ${item.bookmarks}\n\n`;

            md += `${item.content.replace(/\n/g, '\n\n')}\n\n`;
            md += `---\n\n`;
            index++;
        }
        return md;
    }

    async function exportToMarkdown() {
        scrapeVisibleTweets();
        if (tweetsMap.size === 0) {
            alert('Belum ada postingan yang terambil!');
            return;
        }

        const mdContent = generateMarkdown();
        const defaultFilename = `x_archive_${new Date().toISOString().slice(0, 10)}.md`;

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'Markdown File',
                        accept: { 'text/markdown': ['.md'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(mdContent);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('File picker dibatalkan atau tidak diizinkan, beralih ke download langsung.', err);
            }
        }

        const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = defaultFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // Floating UI Widget
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        background: #15202b;
        color: #fff;
        padding: 14px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        border: 1px solid #38444d;
        width: 170px;
    `;

    const statusText = document.createElement('div');
    statusText.innerText = 'Tersimpan: 0 tweet';
    statusText.style.fontSize = '12px';
    statusText.style.textAlign = 'center';
    statusText.style.color = '#8899a6';

    const startBtn = document.createElement('button');
    startBtn.innerText = 'Start Auto-Scroll';
    startBtn.style.cssText = `
        background-color: #1d9bf0;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 9999px;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
    `;
    startBtn.onclick = () => {
        if (isScraping) {
            stopAutoScroll();
        } else {
            startAutoScroll();
        }
    };

    const exportBtn = document.createElement('button');
    exportBtn.innerText = 'Export Markdown';
    exportBtn.style.cssText = `
        background-color: #00ba7c;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 9999px;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
    `;
    exportBtn.onclick = exportToMarkdown;

    function updateUI() {
        statusText.innerText = `Tersimpan: ${tweetsMap.size} tweet`;
    }

    panel.appendChild(statusText);
    panel.appendChild(startBtn);
    panel.appendChild(exportBtn);
    document.body.appendChild(panel);
})();
