// ==UserScript==
// @name         Stockbit Stream Auto-Scraper to Markdown
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Scrape postingan Stockbit Stream (/stream & /symbol/*), auto scroll, auto read more, dan export ke Markdown.
// @author       You
// @match        https://stockbit.com/*
// @updateURL    https://github.com/wikusuma/tampermonkey/tree/main/stockbit-com/stream-auto-scrapper-to-markdown/stream-auto-scrapper-to-markdown.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/tree/main/stockbit-com/stream-auto-scrapper-to-markdown/stream-auto-scrapper-to-markdown.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isScraping = false;
    let postsMap = new Map();
    let scrollInterval = null;
    let noChangeCount = 0;
    let lastHeight = 0;

    function cleanText(text) {
        return text ? text.trim().replace(/\r?\n+/g, '\n').replace(/[ \t]+/g, ' ') : '';
    }

    // Ekstraksi data setiap postingan
    function extractFromPostLink(linkEl) {
        try {
            const postUrl = linkEl.href;
            const postIdMatch = postUrl.match(/\/post\/(\d+)/);
            if (!postIdMatch) return;
            const postId = postIdMatch[1];

            if (postsMap.has(postId)) return;

            // Cari kontainer kartu postingan ke atas
            let card = linkEl.parentElement;
            for (let i = 0; i < 10; i++) {
                if (!card || card === document.body) break;
                // Ciri kartu postingan: memiliki ikon interaksi atau avatar
                if (card.querySelector('img') && (card.innerText.includes('Like') || card.innerText.includes('Share') || card.innerText.includes('Tip') || card.querySelector('svg'))) {
                    break;
                }
                card = card.parentElement;
            }
            if (!card) return;

            // Otomatis klik tombol "Read more..." jika ada
            const buttons = card.querySelectorAll('button, a, span');
            buttons.forEach(btn => {
                if (btn.innerText && btn.innerText.trim().toLowerCase().includes('read more')) {
                    btn.click();
                }
            });

            // Penulis & Waktu
            const timeText = cleanText(linkEl.innerText) || '';
            let author = 'Unknown';
            const authorEl = card.querySelector('a[href^="/@"], a[href^="/user/"], a[class*="username"], a[class*="author"]');
            if (authorEl) {
                author = cleanText(authorEl.innerText);
            } else {
                const profileImg = card.querySelector('img[alt], img[src*="profile"]');
                if (profileImg && profileImg.alt && !profileImg.alt.includes('flag')) {
                    author = profileImg.alt;
                }
            }

            // Ticker saham ($IHSG,$BBCA, dll.)
            const tickerLinks = Array.from(card.querySelectorAll('a[href*="/symbol/"]'))
                .map(a => cleanText(a.innerText))
                .filter(t => t.startsWith('$') \vert{}\vert{} /^[A-Z]{4}$/.test(t));
            const uniqueTickers = [...new Set(tickerLinks)].join(', ');

            // Metrik reaksi & komentar
            let reactions = '0';
            let comments = '0';
            const textLines = card.innerText.split('\n').map(l => l.trim()).filter(Boolean);

            for (let line of textLines) {
                if (/^[👍🔥👎😂🥳\d\s\.,KMBkmb]+$/.test(line) && /\d/.test(line)) {
                    reactions = line.replace(/[^\d\.,KMBkmb]/g, '');
                    break;
                }
            }

            const commentSvg = card.querySelector('svg[data-icon="comment"], svg[class*="comment"], i[class*="comment"], img[alt*="Comment"]');
            if (commentSvg) {
                const commentWrap = commentSvg.closest('div, button, a');
                if (commentWrap && /\d+/.test(commentWrap.innerText)) {
                    comments = commentWrap.innerText.match(/\d+[\d\.,KMBkmb]*/)[0];
                }
            }

            // Konten teks
            let fullText = cleanText(card.innerText);
            if (author !== 'Unknown') fullText = fullText.replace(author, '');
            if (timeText) fullText = fullText.replace(timeText, '');
            fullText = fullText.replace(/Read more\.\.\./gi, '')
                               .replace(/Share post|Icon Tip|Tip|Comment/gi, '')
                               .trim();

            if (fullText.length > 5 || uniqueTickers) {
                postsMap.set(postId, {
                    id: postId,
                    author,
                    timestamp: timeText,
                    url: postUrl,
                    tickers: uniqueTickers || '-',
                    content: fullText,
                    reactions,
                    comments
                });
                updateUI();
            }
        } catch (err) {
            console.error('Error saat parse postingan:', err);
        }
    }

    function scrapeVisiblePosts() {
        const postLinks = document.querySelectorAll('a[href*="/post/"]');
        postLinks.forEach(extractFromPostLink);
    }

    function startAutoScroll() {
        isScraping = true;
        const startBtn = document.getElementById('sb-start-btn');
        if (startBtn) {
            startBtn.innerText = 'Stop Scraping';
            startBtn.style.backgroundColor = '#dc2626';
        }

        scrollInterval = setInterval(() => {
            if (!isScraping) return;

            scrapeVisiblePosts();
            window.scrollBy(0, window.innerHeight * 0.85);

            const currentHeight = document.documentElement.scrollHeight;
            if (currentHeight === lastHeight) {
                noChangeCount++;
                if (noChangeCount >= 10) {
                    stopAutoScroll();
                    alert('Selesai: Batas feed tercapai.');
                }
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
            }
        }, 1300);
    }

    function stopAutoScroll() {
        isScraping = false;
        clearInterval(scrollInterval);
        const startBtn = document.getElementById('sb-start-btn');
        if (startBtn) {
            startBtn.innerText = 'Start Auto-Scroll';
            startBtn.style.backgroundColor = '#00aa5b';
        }
    }

    function generateMarkdown() {
        let md = `# Arsip Stockbit Stream\n`;
        md += `**Waktu Ekspor:** ${new Date().toLocaleString()}\n`;
        md += `**URL Asal:** ${window.location.href}\n`;
        md += `**Total Postingan:** ${postsMap.size}\n\n---\n\n`;

        let index = 1;
        for (const [_, item] of postsMap) {
            md += `### ${index}. ${item.author} (${item.timestamp})\n`;
            md += `**Tautan:** [Lihat di Stockbit](${item.url})\n`;
            md += `**Emiten:** ${item.tickers}\n`;
            md += `> 👍 **Reaksi:** ${item.reactions} | 💬 **Komentar:** ${item.comments}\n\n`;
            md += `${item.content}\n\n`;
            md += `---\n\n`;
            index++;
        }
        return md;
    }

    async function exportToMarkdown() {
        scrapeVisiblePosts();
        if (postsMap.size === 0) {
            alert('Belum ada postingan yang terkumpul. Tekan "Start Auto-Scroll" dan biarkan menggulir sejenak.');
            return;
        }

        const mdContent = generateMarkdown();
        const symbolMatch = window.location.pathname.match(/\/symbol\/([A-Za-z]+)/);
        const prefix = symbolMatch ? `stockbit_${symbolMatch[1]}` : 'stockbit_stream';
        const defaultFilename = `${prefix}_${new Date().toISOString().slice(0, 10)}.md`;

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'Markdown File (*.md)',
                        accept: { 'text/markdown': ['.md'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(mdContent);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
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

    function updateUI() {
        const statusText = document.getElementById('sb-status-text');
        if (statusText) {
            statusText.innerText = `Tersimpan: ${postsMap.size} post`;
        }
    }

    // Injeksi Panel langsung ke body
    function mountPanel() {
        if (!document.body) return;
        if (document.getElementById('sb-scraper-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'sb-scraper-panel';
        panel.setAttribute('style', `
            position: fixed !important;
            bottom: 30px !important;
            right: 30px !important;
            z-index: 2147483647 !important;
            background-color: #111827 !important;
            border: 2px solid #00aa5b !important;
            border-radius: 12px !important;
            padding: 12px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            width: 175px !important;
            pointer-events: auto !important;
        `);

        const statusText = document.createElement('div');
        statusText.id = 'sb-status-text';
        statusText.innerText = `Tersimpan: ${postsMap.size} post`;
        statusText.setAttribute('style', 'color: #9ca3af !important; font-size: 12px !important; text-align: center !important; font-weight: bold !important;');

        const startBtn = document.createElement('button');
        startBtn.id = 'sb-start-btn';
        startBtn.innerText = isScraping ? 'Stop Scraping' : 'Start Auto-Scroll';
        startBtn.setAttribute('style', `
            background-color: ${isScraping ? '#dc2626' : '#00aa5b'} !important;
            color: #ffffff !important;
            border: none !important;
            padding: 8px 10px !important;
            border-radius: 6px !important;
            font-weight: 700 !important;
            font-size: 13px !important;
            cursor: pointer !important;
        `);
        startBtn.onclick = () => {
            if (isScraping) {
                stopAutoScroll();
            } else {
                startAutoScroll();
            }
        };

        const exportBtn = document.createElement('button');
        exportBtn.id = 'sb-export-btn';
        exportBtn.innerText = 'Export Markdown';
        exportBtn.setAttribute('style', `
            background-color: #2563eb !important;
            color: #ffffff !important;
            border: none !important;
            padding: 8px 10px !important;
            border-radius: 6px !important;
            font-weight: 700 !important;
            font-size: 13px !important;
            cursor: pointer !important;
        `);
        exportBtn.onclick = exportToMarkdown;

        panel.appendChild(statusText);
        panel.appendChild(startBtn);
        panel.appendChild(exportBtn);
        document.body.appendChild(panel);
    }

    // Interval pengawas agar panel selalu dirender ulang jika tertelan navigasi React
    setInterval(mountPanel, 1000);
})();
