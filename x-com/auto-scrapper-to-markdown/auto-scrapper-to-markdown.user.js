// ==UserScript==
// @name         Auto-Scraper to Markdown 
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Auto scroll timeline atau thread postingan X, pisahkan postingan utama & thread penulis dari balasan lain, ekstrak metrik, dan simpan sebagai Markdown.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://github.com/wikusuma/tampermonkey/tree/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/tree/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let isScraping = false;
  let tweetsMap = new Map();
  let scrollInterval = null;
  let expandTimer = 0;
  let noChangeCount = 0;
  let lastHeight = 0;
  let lastUrl = location.href;

  // --- Helper URL & Identitas Tweet ---
  function getStatusContext() {
    const match = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match) {
      return { isThreadPage: false, targetHandle: '', targetTweetId: '' };
    }
    return {
      isThreadPage: true,
      targetHandle: match[1].toLowerCase(),
      targetTweetId: match[2]
    };
  }

  function extractTweetIdFromUrl(url) {
    const match = (url || '').match(/\/status\/(\d+)/);
    return match ? match[1] : '';
  }

  function extractHandleFromUrlOrAuthor(url, authorText) {
    const urlMatch = (url || '').match(/x\.com\/([^/]+)\/status\/\d+|twitter\.com\/([^/]+)\/status\/\d+/i);
    if (urlMatch) {
      return (urlMatch[1] || urlMatch[2] || '').toLowerCase();
    }
    const handleMatch = (authorText || '').match(/@([A-Za-z0-9_]+)/);
    return handleMatch ? handleMatch[1].toLowerCase() : '';
  }

  // --- Helper Metrik Engagement ---
  function getMetricValue(article, testId) {
    const btn = article.querySelector(`button[data-testid="${testId}"], a[data-testid="${testId}"]`);
    if (!btn) return '0';

    const textSpan = btn.querySelector('span[data-testid="app-text-transition-container"]') || btn.querySelector('span');
    const textVal = textSpan ? textSpan.innerText.trim() : btn.innerText.trim();

    if (!textVal && btn.getAttribute('aria-label')) {
      const match = btn.getAttribute('aria-label').match(/\d+[\d,\.]*[KMB]?/i);
      return match ? match[0] : '0';
    }
    return textVal || '0';
  }

  // --- Klik Tombol "Show more" Secara Selektif ---
  function clickExpandButtons() {
    if (!expandCheckbox.checked) return;
    const now = Date.now();
    if (now - expandTimer < 2200) return;
    expandTimer = now;

    const candidates = document.querySelectorAll('div[role="button"], button');
    for (const el of candidates) {
      const text = (el.innerText || '').trim().toLowerCase();
      if (
        text === 'show more replies' ||
        text === 'show probable spam' ||
        text === 'show additional replies' ||
        text === 'show this thread' ||
        text === 'tampilkan balasan lainnya' ||
        text === 'tampilkan utas ini'
      ) {
        el.click();
        break;
      }
    }
  }

  // --- Ekstraksi Data Per Tweet ---
  function extractTweetData(article) {
    try {
      const ctx = getStatusContext();
      const timeEl = article.querySelector('time');
      const linkEl = timeEl ? timeEl.closest('a') : null;
      const tweetUrl = linkEl ? linkEl.href : '';
      const statusId = extractTweetIdFromUrl(tweetUrl);

      const fallbackId = `${article.innerText.trim().slice(0, 80)}|${ctx.targetTweetId || 'feed'}`;
      const tweetId = statusId ? `id:${statusId}` : `fb:${fallbackId}`;

      const userNames = article.querySelector('div[data-testid="User-Name"]');
      const authorLines = userNames ? userNames.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const author = authorLines.length ? authorLines.slice(0, 2).join(' ') : 'Unknown';
      const handle = extractHandleFromUrlOrAuthor(tweetUrl, userNames ? userNames.innerText : '');
      const timestamp = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText.trim()) : '';

      const tweetTextEl = article.querySelector('div[data-testid="tweetText"]');
      const tweetText = tweetTextEl ? tweetTextEl.innerText.trim() : '';

      if (!tweetText && !tweetUrl) return;

      const replies = getMetricValue(article, 'reply');
      const reposts = getMetricValue(article, 'retweet');
      const likes = getMetricValue(article, 'like');
      const bookmarks = getMetricValue(article, 'bookmark');

      const viewsEl = article.querySelector('a[href*="/analytics"], a[href*="/status/"][aria-label*="views"]');
      let views = '0';
      if (viewsEl) {
        const viewsSpan = viewsEl.querySelector('span[data-testid="app-text-transition-container"]') || viewsEl.querySelector('span');
        views = viewsSpan ? viewsSpan.innerText.trim() : (viewsEl.innerText.trim() || '0');
      }

      let role = 'timeline';
      if (ctx.isThreadPage) {
        if (statusId && statusId === ctx.targetTweetId) {
          role = 'main';
        } else if (handle && handle === ctx.targetHandle) {
          role = 'thread';
        } else {
          role = 'reply';
        }
      }

      const payload = {
        id: tweetId,
        statusId,
        author,
        handle,
        timestamp,
        url: tweetUrl,
        content: tweetText,
        replies,
        reposts,
        likes,
        views,
        bookmarks,
        role
      };

      if (!tweetsMap.has(tweetId)) {
        tweetsMap.set(tweetId, payload);
        updateUI();
      } else {
        const prev = tweetsMap.get(tweetId);
        // Perbarui role jika konteks halaman berubah ke thread spesifik
        if (prev.role === 'timeline' && role !== 'timeline') {
          tweetsMap.set(tweetId, { ...prev, role });
          updateUI();
        }
      }
    } catch (err) {
      console.error('Gagal mengekstrak tweet:', err);
    }
  }

  function scrapeVisibleTweets() {
    clickExpandButtons();
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(extractTweetData);
  }

  // --- Kontrol Auto-Scroll ---
  function startAutoScroll() {
    if (isScraping) return;
    isScraping = true;
    startBtn.innerText = 'Stop Scraping';
    startBtn.style.backgroundColor = '#dc2626';

    scrapeVisibleTweets();
    lastHeight = document.documentElement.scrollHeight;
    noChangeCount = 0;

    scrollInterval = setInterval(() => {
      if (!isScraping) return;

      if (location.href !== lastUrl) {
        lastUrl = location.href;
        noChangeCount = 0;
      }

      scrapeVisibleTweets();
      window.scrollBy(0, window.innerHeight * 0.85);

      const currentHeight = document.documentElement.scrollHeight;
      if (currentHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 12) {
          stopAutoScroll();
          alert('Sudah mencapai bagian paling bawah atau limit pemuatan halaman tercapai.');
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

  // --- Format Markdown ---
  function formatTweetBlock(num, item, badgeLabel) {
    let block = `### ${num}. ${item.author}${badgeLabel ? ` [${badgeLabel}]` : ''} (${item.timestamp})\n`;
    if (item.url) {
      block += `**Link:** [Lihat Tweet](${item.url})\n\n`;
    }
    block += `> 💬 **Replies:** ${item.replies} | 🔁 **Reposts:** ${item.reposts} | ❤️ **Likes:** ${item.likes} | 📊 **Views:** ${item.views} | 🔖 **Bookmarks:** ${item.bookmarks}\n\n`;
    block += `${item.content.replace(/\n/g, '\n\n')}\n\n`;
    block += `---\n\n`;
    return block;
  }

  function generateMarkdown() {
    const ctx = getStatusContext();
    const allItems = Array.from(tweetsMap.values());
    const threadOnly = threadOnlyCheckbox.checked;

    const mainAndThread = allItems.filter(i => i.role === 'main' || i.role === 'thread');
    const otherReplies = allItems.filter(i => i.role === 'reply');
    const timelineItems = allItems.filter(i => i.role === 'timeline');

    let md = `# Arsip Postingan X (Twitter)\n`;
    md += `- **Tanggal Ekspor:** ${new Date().toLocaleString()}\n`;
    md += `- **URL Sumber:** ${location.href}\n`;

    if (ctx.isThreadPage || mainAndThread.length > 0 || otherReplies.length > 0) {
      const exportedCount = threadOnly ? mainAndThread.length : (mainAndThread.length + otherReplies.length + timelineItems.length);
      md += `- **Mode:** Thread / Postingan Detail\n`;
      md += `- **Total Item Diekspor:** ${exportedCount} (Utama & Thread: ${mainAndThread.length}, Balasan Lain: ${otherReplies.length})\n\n---\n\n`;

      if (mainAndThread.length > 0) {
        md += `## Postingan Utama & Rangkaian Thread Penulis\n\n`;
        let idx = 1;
        for (const item of mainAndThread) {
          const tag = item.role === 'main' ? 'POSTINGAN UTAMA' : 'THREAD PENULIS';
          md += formatTweetBlock(idx++, item, tag);
        }
      }

      if (!threadOnly && otherReplies.length > 0) {
        md += `## Komentar & Balasan Lain\n\n`;
        let idx = 1;
        for (const item of otherReplies) {
          md += formatTweetBlock(idx++, item, 'BALASAN');
        }
      }

      if (!threadOnly && timelineItems.length > 0) {
        md += `## Postingan Lain di Halaman\n\n`;
        let idx = 1;
        for (const item of timelineItems) {
          md += formatTweetBlock(idx++, item, 'TIMELINE');
        }
      }
    } else {
      md += `- **Mode:** Timeline / Feed\n`;
      md += `- **Total Postingan:** ${allItems.length}\n\n---\n\n`;
      let idx = 1;
      for (const item of allItems) {
        md += formatTweetBlock(idx++, item, '');
      }
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
    const ctx = getStatusContext();
    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultFilename = ctx.isThreadPage
      ? `x_thread_${ctx.targetHandle}_${ctx.targetTweetId}_${dateStr}.md`
      : `x_archive_${dateStr}.md`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{ description: 'Markdown File', accept: { 'text/markdown': ['.md'] } }]
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

  // --- Floating UI Widget ---
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
    width: 196px;
  `;

  const modeBadge = document.createElement('div');
  modeBadge.style.cssText = 'font-size: 11px; text-align: center; font-weight: bold; color: #1d9bf0;';

  const statusText = document.createElement('div');
  statusText.innerText = 'Tersimpan: 0 tweet';
  statusText.style.cssText = 'font-size: 12px; text-align: center; color: #8899a6;';

  function createToggleRow(labelText, defaultChecked) {
    const row = document.createElement('label');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 11px; color: #cfd9de; cursor: pointer; user-select: none;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = defaultChecked;
    const span = document.createElement('span');
    span.innerText = labelText;
    row.appendChild(cb);
    row.appendChild(span);
    return { row, cb };
  }

  const { row: threadOnlyRow, cb: threadOnlyCheckbox } = createToggleRow('Thread penulis saja (saat di status)', false);
  const { row: expandRow, cb: expandCheckbox } = createToggleRow('Auto-klik "Show more"', false);

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
    if (isScraping) stopAutoScroll();
    else startAutoScroll();
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

  const clearBtn = document.createElement('button');
  clearBtn.innerText = 'Reset Data';
  clearBtn.style.cssText = `
    background-color: transparent;
    color: #8899a6;
    border: 1px solid #38444d;
    padding: 5px 10px;
    border-radius: 9999px;
    font-size: 11px;
    cursor: pointer;
  `;
  clearBtn.onclick = () => {
    tweetsMap.clear();
    updateUI();
  };

  function updateUI() {
    const ctx = getStatusContext();
    modeBadge.innerText = ctx.isThreadPage ? `Mode: Thread (@${ctx.targetHandle})` : 'Mode: Timeline';

    const items = Array.from(tweetsMap.values());
    const mainThreadCount = items.filter(i => i.role === 'main' || i.role === 'thread').length;
    const replyCount = items.filter(i => i.role === 'reply').length;

    if (ctx.isThreadPage || mainThreadCount > 0 || replyCount > 0) {
      statusText.innerText = `Thread: ${mainThreadCount} | Balasan: ${replyCount}`;
    } else {
      statusText.innerText = `Tersimpan: ${tweetsMap.size} tweet`;
    }
  }

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      updateUI();
    }
  }, 800);

  updateUI();
  panel.appendChild(modeBadge);
  panel.appendChild(statusText);
  panel.appendChild(threadOnlyRow);
  panel.appendChild(expandRow);
  panel.appendChild(startBtn);
  panel.appendChild(exportBtn);
  panel.appendChild(clearBtn);
  document.body.appendChild(panel);
})();
