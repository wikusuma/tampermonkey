// ==UserScript==
// @name         Auto-Scraper to Markdown
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Auto scroll timeline, pencarian, atau thread postingan X, ekstrak postingan & metrik, dan simpan sebagai Markdown.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://github.com/wikusuma/tampermonkey/raw/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/raw/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
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

  let modeBadge = null;
  let statusText = null;
  let threadOnlyCheckbox = null;
  let expandCheckbox = null;
  let startBtn = null;
  let exportBtn = null;
  let clearBtn = null;

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
      const candidate = (urlMatch[1] || urlMatch[2] || '').toLowerCase();
      if (candidate && candidate !== 'i' && candidate !== 'web') {
        return candidate;
      }
    }
    const handleMatch = (authorText || '').match(/@([A-Za-z0-9_]+)/);
    return handleMatch ? handleMatch[1].toLowerCase() : '';
  }

  function getMetricValue(container, testId) {
    const btn = container.querySelector(`button[data-testid="${testId}"], a[data-testid="${testId}"]`);
    if (!btn) return '0';

    const textSpan = btn.querySelector('span[data-testid="app-text-transition-container"]') || btn.querySelector('span');
    const textVal = textSpan ? (textSpan.innerText || '').trim() : (btn.innerText || '').trim();
    if (textVal) return textVal;

    const aria = btn.getAttribute('aria-label') || '';
    const match = aria.match(/\d[\d,\.]*[KMB]?/i);
    return match ? match[0] : '0';
  }

  function getViewsValue(container) {
    const viewsEl = container.querySelector('a[href*="/analytics"], a[href*="/status/"][aria-label*="views" i], a[aria-label*="views" i], a[aria-label*="tayangan" i]');
    if (!viewsEl) return '0';

    const viewsSpan = viewsEl.querySelector('span[data-testid="app-text-transition-container"]') || viewsEl.querySelector('span');
    const spanText = viewsSpan ? (viewsSpan.innerText || '').trim() : '';
    if (spanText) return spanText;

    const aria = viewsEl.getAttribute('aria-label') || '';
    const match = aria.match(/\d[\d,\.]*[KMB]?/i);
    return match ? match[0] : ((viewsEl.innerText || '').trim() || '0');
  }

  function clickExpandButtons() {
    if (!expandCheckbox || !expandCheckbox.checked) return;
    const now = Date.now();
    if (now - expandTimer < 2200) return;
    expandTimer = now;

    const triggers = new Set([
      'show more replies',
      'show probable spam',
      'show additional replies',
      'show this thread',
      'tampilkan balasan lainnya',
      'tampilkan utas ini',
      'tampilkan lebih banyak balasan'
    ]);

    const candidates = document.querySelectorAll('div[role="button"], button');
    for (const el of candidates) {
      const text = (el.innerText || '').trim().toLowerCase();
      if (triggers.has(text)) {
        try {
          el.click();
        } catch (err) {
          console.debug('[Auto-Scraper] Gagal klik tombol expand:', err);
        }
        break;
      }
    }
  }

  function getTweetCandidates() {
    const set = new Set();

    document.querySelectorAll('article[data-testid="tweet"], article').forEach(el => set.add(el));

    document.querySelectorAll('[data-testid="cellInnerDiv"]').forEach(cell => {
      if (cell.closest('article[data-testid="tweet"], article')) return;
      if (cell.querySelector('a[href*="/status/"], [data-testid="tweetText"], [data-testid="User-Name"]')) {
        set.add(cell);
      }
    });

    if (set.size === 0) {
      document.querySelectorAll('a[href*="/status/"]').forEach(link => {
        const wrapper = link.closest('article, [data-testid="cellInnerDiv"]') || link.parentElement?.parentElement?.parentElement;
        if (wrapper) set.add(wrapper);
      });
    }

    return Array.from(set);
  }

  function extractTweetText(container) {
    const tweetTextEl = container.querySelector('div[data-testid="tweetText"], [data-testid="tweetText"]');
    if (tweetTextEl && (tweetTextEl.innerText || '').trim()) {
      return tweetTextEl.innerText.trim();
    }

    const textBlocks = Array.from(container.querySelectorAll('div[lang], span[lang]')).filter(el => {
      if (el.closest('[data-testid="User-Name"]')) return false;
      if (el.closest('time')) return false;
      return (el.innerText || '').trim().length > 0;
    });

    if (textBlocks.length > 0) {
      const sorted = textBlocks
        .map(el => el.innerText.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      return sorted[0] || '';
    }

    return '';
  }

  function extractTweetUrlAndId(container) {
    const timeEl = container.querySelector('time');
    const timeLink = timeEl ? timeEl.closest('a[href*="/status/"]') : null;
    const anyStatusLink = timeLink || container.querySelector('a[href*="/status/"]');
    const tweetUrl = anyStatusLink ? anyStatusLink.href : '';
    const statusId = extractTweetIdFromUrl(tweetUrl);
    return { timeEl, tweetUrl, statusId };
  }

  function extractAuthorAndHandle(container, tweetUrl) {
    const userNames = container.querySelector('div[data-testid="User-Name"], [data-testid="User-Name"]');
    const rawUserText = userNames ? (userNames.innerText || '') : '';
    const authorLines = rawUserText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s && s !== '·' && !s.startsWith('@'));

    let author = authorLines.length ? authorLines.slice(0, 2).join(' ') : '';
    let handle = extractHandleFromUrlOrAuthor(tweetUrl, rawUserText);

    if (!handle && rawUserText) {
      const m = rawUserText.match(/@([A-Za-z0-9_]+)/);
      if (m) handle = m[1].toLowerCase();
    }

    if (!author && handle) {
      author = `@${handle}`;
    } else if (!author) {
      author = 'Unknown';
    }

    return { author, handle };
  }

  function extractTweetData(container) {
    try {
      const ctx = getStatusContext();
      const { timeEl, tweetUrl, statusId } = extractTweetUrlAndId(container);
      const { author, handle } = extractAuthorAndHandle(container, tweetUrl);
      const tweetText = extractTweetText(container);

      if (!tweetText && !tweetUrl) return;

      const rawTextSnippet = (container.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      const fallbackId = `${handle || 'unknown'}|${rawTextSnippet}|${ctx.targetTweetId || 'feed'}`;
      const tweetId = statusId ? `id:${statusId}` : `fb:${fallbackId}`;

      const timestamp = timeEl
        ? (timeEl.getAttribute('datetime') || (timeEl.innerText || '').trim())
        : '';

      const replies = getMetricValue(container, 'reply');
      const reposts = getMetricValue(container, 'retweet');
      const likes = getMetricValue(container, 'like');
      const bookmarks = getMetricValue(container, 'bookmark');
      const views = getViewsValue(container);

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
        const updated = {
          ...prev,
          role: (prev.role === 'timeline' && role !== 'timeline') ? role : prev.role,
          content: prev.content || payload.content,
          url: prev.url || payload.url,
          timestamp: prev.timestamp || payload.timestamp
        };
        if (
          updated.role !== prev.role ||
          updated.content !== prev.content ||
          updated.url !== prev.url ||
          updated.timestamp !== prev.timestamp
        ) {
          tweetsMap.set(tweetId, updated);
          updateUI();
        }
      }
    } catch (err) {
      console.error('[Auto-Scraper] Gagal mengekstrak tweet:', err);
    }
  }

  function scrapeVisibleTweets() {
    clickExpandButtons();
    const candidates = getTweetCandidates();
    candidates.forEach(extractTweetData);
    console.debug(`[Auto-Scraper] Candidates: ${candidates.length} | Tersimpan: ${tweetsMap.size}`);
  }

  function startAutoScroll() {
    if (isScraping) return;
    isScraping = true;

    if (startBtn) {
      startBtn.innerText = 'Stop Scraping';
      startBtn.style.backgroundColor = '#dc2626';
    }

    scrapeVisibleTweets();
    lastHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    noChangeCount = 0;

    scrollInterval = setInterval(() => {
      if (!isScraping) return;

      if (location.href !== lastUrl) {
        lastUrl = location.href;
        noChangeCount = 0;
        updateUI();
      }

      scrapeVisibleTweets();

      const step = Math.round(window.innerHeight * 0.72);
      window.scrollBy({ top: step, behavior: 'instant' });

      setTimeout(() => {
        if (isScraping) scrapeVisibleTweets();
      }, 350);

      const currentHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (currentHeight === lastHeight) {
        noChangeCount++;
        scrapeVisibleTweets();
        if (noChangeCount >= 12) {
          stopAutoScroll();
          alert('Sudah mencapai bagian paling bawah atau limit feed tercapai.');
        }
      } else {
        noChangeCount = 0;
        lastHeight = currentHeight;
      }
    }, 1500);
  }

  function stopAutoScroll() {
    isScraping = false;
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    scrapeVisibleTweets();

    if (startBtn) {
      startBtn.innerText = 'Start Auto-Scroll';
      startBtn.style.backgroundColor = '#1d9bf0';
    }
  }

  function formatTweetBlock(num, item, badgeLabel) {
    let block = `### ${num}. ${item.author}${badgeLabel ? ` [${badgeLabel}]` : ''}${item.timestamp ? ` (${item.timestamp})` : ''}\n`;
    if (item.url) {
      block += `**Link:** [Lihat Tweet](${item.url})\n\n`;
    }
    block += `> 💬 **Replies:** ${item.replies} | 🔁 **Reposts:** ${item.reposts} | ❤️ **Likes:** ${item.likes} | 📊 **Views:** ${item.views} | 🔖 **Bookmarks:** ${item.bookmarks}\n\n`;
    block += `${(item.content || '').replace(/\n/g, '\n\n')}\n\n`;
    block += `---\n\n`;
    return block;
  }

  function generateMarkdown() {
    const ctx = getStatusContext();
    const allItems = Array.from(tweetsMap.values());
    const threadOnly = Boolean(threadOnlyCheckbox && threadOnlyCheckbox.checked);

    const mainAndThread = allItems.filter(i => i.role === 'main' || i.role === 'thread');
    const otherReplies = allItems.filter(i => i.role === 'reply');
    const timelineItems = allItems.filter(i => i.role === 'timeline');

    let md = `# Arsip Postingan X (Twitter)\n`;
    md += `- **Tanggal Ekspor:** ${new Date().toLocaleString()}\n`;
    md += `- **URL Sumber:** ${location.href}\n`;

    if (ctx.isThreadPage || mainAndThread.length > 0 || otherReplies.length > 0) {
      const exportedCount = threadOnly
        ? mainAndThread.length
        : (mainAndThread.length + otherReplies.length + timelineItems.length);

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
      ? `x_thread_${ctx.targetHandle || 'user'}_${ctx.targetTweetId}_${dateStr}.md`
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
        if (err && err.name === 'AbortError') return;
        console.warn('[Auto-Scraper] File picker tidak tersedia/ditolak, beralih ke download langsung.', err);
      }
    }

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function initUI() {
    if (!document.body || document.getElementById('x-auto-scraper-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'x-auto-scraper-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #15202b;
      color: #fff;
      padding: 14px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      border: 1px solid #38444d;
      width: 204px;
    `;

    modeBadge = document.createElement('div');
    modeBadge.style.cssText = 'font-size: 11px; text-align: center; font-weight: bold; color: #1d9bf0;';

    statusText = document.createElement('div');
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

    const threadOnlyToggle = createToggleRow('Thread penulis saja (saat di status)', false);
    threadOnlyCheckbox = threadOnlyToggle.cb;

    const expandToggle = createToggleRow('Auto-klik "Show more"', false);
    expandCheckbox = expandToggle.cb;

    startBtn = document.createElement('button');
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

    exportBtn = document.createElement('button');
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

    clearBtn = document.createElement('button');
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

    panel.appendChild(modeBadge);
    panel.appendChild(statusText);
    panel.appendChild(threadOnlyToggle.row);
    panel.appendChild(expandToggle.row);
    panel.appendChild(startBtn);
    panel.appendChild(exportBtn);
    panel.appendChild(clearBtn);
    document.body.appendChild(panel);

    updateUI();
  }

  function updateUI() {
    if (!modeBadge || !statusText) return;

    const ctx = getStatusContext();
    modeBadge.innerText = ctx.isThreadPage ? `Mode: Thread (@${ctx.targetHandle})` : 'Mode: Timeline / Search';

    const items = Array.from(tweetsMap.values());
    const mainThreadCount = items.filter(i => i.role === 'main' || i.role === 'thread').length;
    const replyCount = items.filter(i => i.role === 'reply').length;

    if (ctx.isThreadPage || mainThreadCount > 0 || replyCount > 0) {
      statusText.innerText = `Thread: ${mainThreadCount} | Balasan: ${replyCount}`;
    } else {
      statusText.innerText = `Tersimpan: ${tweetsMap.size} tweet`;
    }
  }

  initUI();

  setInterval(() => {
    if (!document.getElementById('x-auto-scraper-panel')) {
      initUI();
    }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      updateUI();
    }
  }, 800);
})();
