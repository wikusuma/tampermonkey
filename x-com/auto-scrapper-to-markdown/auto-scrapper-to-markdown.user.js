// ==UserScript==
// @name         Auto-Scraper to Markdown
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Auto scrape search + thread (reply > 0), bangun nested indentation bertingkat (reply/sub-reply) dengan highlight postingan utama & tag mirip XML ke Markdown.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://github.com/wikusuma/tampermonkey/raw/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/raw/main/x-com/auto-scrapper-to-markdown/auto-scrapper-to-markdown.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'x_auto_scraper_v20_state';

  let isScraping = false;
  let isExporting = false;
  let tweetsMap = new Map();
  let scrollInterval = null;
  let expandTimer = 0;
  let noChangeCount = 0;
  let lastHeight = 0;
  let lastUrl = location.href;

  // State khusus Mode Search -> Drill Thread (hanya yang punya reply > 0)
  let queuedThreadUrls = [];
  let visitedThreadIds = new Set();
  let searchOriginUrl = '';
  let currentDrillUrl = '';
  let maxSearchThreads = 25;
  let autoExportOnFinish = true;

  let modeBadge = null;
  let statusText = null;
  let threadOnlyCheckbox = null;
  let expandCheckbox = null;
  let drillSearchCheckbox = null;
  let autoExportCheckbox = null;
  let startBtn = null;
  let exportBtn = null;
  let clearBtn = null;

  function saveState() {
    try {
      const payload = {
        isScraping,
        tweets: Array.from(tweetsMap.entries()),
        queuedThreadUrls,
        visitedThreadIds: Array.from(visitedThreadIds),
        searchOriginUrl,
        currentDrillUrl,
        maxSearchThreads,
        threadOnly: Boolean(threadOnlyCheckbox && threadOnlyCheckbox.checked),
        expandMore: Boolean(expandCheckbox && expandCheckbox.checked),
        drillSearch: Boolean(drillSearchCheckbox && drillSearchCheckbox.checked),
        autoExport: Boolean(autoExportCheckbox ? autoExportCheckbox.checked : autoExportOnFinish)
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.debug('[Auto-Scraper] Gagal menyimpan state ke sessionStorage:', err);
    }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);

      if (Array.isArray(data.tweets)) {
        tweetsMap = new Map(data.tweets);
      }
      if (Array.isArray(data.queuedThreadUrls)) {
        queuedThreadUrls = data.queuedThreadUrls;
      }
      if (Array.isArray(data.visitedThreadIds)) {
        visitedThreadIds = new Set(data.visitedThreadIds);
      }
      searchOriginUrl = data.searchOriginUrl || '';
      currentDrillUrl = data.currentDrillUrl || '';
      if (typeof data.maxSearchThreads === 'number' && data.maxSearchThreads > 0) {
        maxSearchThreads = data.maxSearchThreads;
      }
      if (typeof data.autoExport === 'boolean') {
        autoExportOnFinish = data.autoExport;
      }
      isScraping = Boolean(data.isScraping);

      if (threadOnlyCheckbox && typeof data.threadOnly === 'boolean') {
        threadOnlyCheckbox.checked = data.threadOnly;
      }
      if (expandCheckbox && typeof data.expandMore === 'boolean') {
        expandCheckbox.checked = data.expandMore;
      }
      if (drillSearchCheckbox && typeof data.drillSearch === 'boolean') {
        drillSearchCheckbox.checked = data.drillSearch;
      }
      if (autoExportCheckbox && typeof data.autoExport === 'boolean') {
        autoExportCheckbox.checked = data.autoExport;
      }
      return true;
    } catch (err) {
      console.debug('[Auto-Scraper] Gagal memuat state dari sessionStorage:', err);
      return false;
    }
  }

  function isSearchPage() {
    return location.pathname.startsWith('/search');
  }

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

  function extractReplyToHandle(container) {
    const fullText = container.innerText || '';
    const m = fullText.match(/Replying to\s+@([A-Za-z0-9_]+)|Membalas\s+@([A-Za-z0-9_]+)/i);
    return m ? (m[1] || m[2] || '').toLowerCase() : '';
  }

  function parseCountToNumber(rawVal) {
    if (!rawVal) return 0;
    const cleaned = String(rawVal).trim().replace(/,/g, '');
    const m = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
    if (!m) {
      const digits = cleaned.match(/[\d.]+/);
      return digits ? parseFloat(digits[0]) || 0 : 0;
    }
    const num = parseFloat(m[1]) || 0;
    const suffix = (m[2] || '').toUpperCase();
    if (suffix === 'K') return Math.round(num * 1000);
    if (suffix === 'M') return Math.round(num * 1000000);
    if (suffix === 'B') return Math.round(num * 1000000000);
    return Math.round(num);
  }

  function extractMetricFromElement(el) {
    if (!el) return '';
    const textSpan = el.querySelector('span[data-testid="app-text-transition-container"]') || el.querySelector('span');
    const textVal = textSpan ? (textSpan.innerText || '').trim() : (el.innerText || '').trim();
    if (textVal && /^\d[\d,\.]*\s*[KMB]?$/i.test(textVal)) {
      return textVal.trim();
    }

    const aria = el.getAttribute('aria-label') || '';
    const ariaMatch = aria.match(/(\d[\d,\.]*\s*[KMB]?)/i);
    if (ariaMatch) return ariaMatch[1].trim();

    const innerMatch = (el.innerText || '').trim().match(/(\d[\d,\.]*\s*[KMB]?)/i);
    return innerMatch ? innerMatch[1].trim() : '';
  }

  function getMetricValue(container, testId) {
    const directBtn = container.querySelector(
      `button[data-testid="${testId}"], a[data-testid="${testId}"], [data-testid="${testId}"]`
    );
    const directVal = extractMetricFromElement(directBtn);
    if (directVal) return directVal;

    const keywordsByType = {
      reply: [/repl/i, /balas/i],
      retweet: [/repost/i, /retweet/i, /posting ulang/i],
      like: [/like/i, /suka/i],
      bookmark: [/bookmark/i, /markah/i, /simpan/i]
    };

    const patterns = keywordsByType[testId] || [];
    const actionEls = Array.from(container.querySelectorAll('button, [role="button"], a[role="link"]'));
    for (const el of actionEls) {
      const aria = el.getAttribute('aria-label') || '';
      if (patterns.some(rx => rx.test(aria))) {
        const val = extractMetricFromElement(el);
        if (val) return val;
      }
    }

    const group = container.querySelector('div[role="group"]');
    if (group) {
      const groupButtons = Array.from(group.querySelectorAll('button, [role="button"]'));
      const indexMap = { reply: 0, retweet: 1, like: 2 };
      if (testId in indexMap && groupButtons[indexMap[testId]]) {
        const val = extractMetricFromElement(groupButtons[indexMap[testId]]);
        if (val) return val;
      }
    }

    return '0';
  }

  function getViewsValue(container) {
    const viewsEl = container.querySelector(
      'a[href*="/analytics"], a[href*="/status/"][aria-label*="views" i], a[aria-label*="views" i], a[aria-label*="tayangan" i]'
    );
    const val = extractMetricFromElement(viewsEl);
    if (val) return val;

    const group = container.querySelector('div[role="group"]');
    if (group) {
      const linksAndBtns = Array.from(group.querySelectorAll('a, button, [role="button"]'));
      for (const el of linksAndBtns) {
        const aria = el.getAttribute('aria-label') || '';
        const href = el.getAttribute('href') || '';
        if (href.includes('/analytics') || /views|tayangan/i.test(aria)) {
          const v = extractMetricFromElement(el);
          if (v) return v;
        }
      }
    }

    return '0';
  }

  function expandInlineShowMoreInContainer(container) {
    if (!expandCheckbox || !expandCheckbox.checked || !container) return;
    const inlineTriggers = ['show more', 'lihat lainnya', 'tampilkan lainnya', 'see more'];
    const clickables = Array.from(container.querySelectorAll('span, a, div[role="button"], button'));
    for (const el of clickables) {
      const txt = (el.innerText || '').trim().toLowerCase();
      if (inlineTriggers.includes(txt)) {
        try {
          el.click();
        } catch (err) {
          console.debug('[Auto-Scraper] Gagal expand inline Show more:', err);
        }
      }
    }
  }

  function clickExpandButtons() {
    if (!expandCheckbox || !expandCheckbox.checked) return;
    const now = Date.now();
    if (now - expandTimer < 1800) return;
    expandTimer = now;

    const triggers = new Set([
      'show more replies',
      'show probable spam',
      'show additional replies',
      'show this thread',
      'show more',
      'tampilkan balasan lainnya',
      'tampilkan utas ini',
      'tampilkan lebih banyak balasan',
      'tampilkan lainnya'
    ]);

    const candidates = document.querySelectorAll('div[role="button"], button, a[role="link"], span');
    for (const el of candidates) {
      const text = (el.innerText || '').trim().toLowerCase();
      if (triggers.has(text)) {
        try {
          el.click();
        } catch (err) {
          console.debug('[Auto-Scraper] Gagal klik tombol expand:', err);
        }
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

  function cleanTweetText(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/\s*(Show more|Tampilkan lainnya|Lihat lainnya)\s*$/i, '')
      .trim();
  }

  function extractTweetText(container) {
    expandInlineShowMoreInContainer(container);

    const tweetTextEl = container.querySelector('div[data-testid="tweetText"], [data-testid="tweetText"]');
    if (tweetTextEl && (tweetTextEl.innerText || '').trim()) {
      return cleanTweetText(tweetTextEl.innerText);
    }

    const textBlocks = Array.from(container.querySelectorAll('div[lang], span[lang]')).filter(el => {
      if (el.closest('[data-testid="User-Name"]')) return false;
      if (el.closest('time')) return false;
      return (el.innerText || '').trim().length > 0;
    });

    if (textBlocks.length > 0) {
      const sorted = textBlocks
        .map(el => cleanTweetText(el.innerText))
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

  function enqueueThreadUrlIfHasReplies(url, replyCountNum) {
    if (!url || replyCountNum <= 0) return;
    const id = extractTweetIdFromUrl(url);
    if (!id || visitedThreadIds.has(id)) return;
    if (queuedThreadUrls.some(u => extractTweetIdFromUrl(u) === id)) return;
    if (visitedThreadIds.size + queuedThreadUrls.length >= maxSearchThreads) return;
    queuedThreadUrls.push(url);
  }

  function resolveParentAndDepth(ctx, statusId, handle, replyToHandle, allItemsList) {
    const rootId = ctx.targetTweetId ? `id:${ctx.targetTweetId}` : '';

    if (ctx.isThreadPage) {
      if (statusId && statusId === ctx.targetTweetId) {
        return { parentId: '', replyToHandle: '', depth: 0 };
      }

      if (replyToHandle) {
        for (let i = allItemsList.length - 1; i >= 0; i--) {
          const cand = allItemsList[i];
          if (cand.handle && cand.handle.toLowerCase() === replyToHandle) {
            const nextDepth = (typeof cand.depth === 'number' ? cand.depth : 0) + 1;
            return {
              parentId: cand.id,
              replyToHandle,
              depth: Math.max(1, nextDepth)
            };
          }
        }
      }

      if (handle && handle === ctx.targetHandle && rootId) {
        return { parentId: rootId, replyToHandle: ctx.targetHandle, depth: 1 };
      }

      return {
        parentId: rootId || '',
        replyToHandle: replyToHandle || ctx.targetHandle || '',
        depth: 1
      };
    }

    return { parentId: '', replyToHandle, depth: 0 };
  }

  function extractTweetData(container) {
    try {
      const ctx = getStatusContext();
      const { timeEl, tweetUrl, statusId } = extractTweetUrlAndId(container);
      const { author, handle } = extractAuthorAndHandle(container, tweetUrl);
      const tweetText = extractTweetText(container);

      if (!tweetText && !tweetUrl) return;

      const replies = getMetricValue(container, 'reply');
      const replyCountNum = parseCountToNumber(replies);
      const reposts = getMetricValue(container, 'retweet');
      const likes = getMetricValue(container, 'like');
      const bookmarks = getMetricValue(container, 'bookmark');
      const views = getViewsValue(container);

      if (isSearchPage() && drillSearchCheckbox && drillSearchCheckbox.checked && tweetUrl && replyCountNum > 0) {
        enqueueThreadUrlIfHasReplies(tweetUrl, replyCountNum);
      }

      const rawTextSnippet = (container.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      const fallbackId = `${handle || 'unknown'}|${rawTextSnippet}|${ctx.targetTweetId || 'feed'}`;
      const tweetId = statusId ? `id:${statusId}` : `fb:${fallbackId}`;

      const timestamp = timeEl
        ? (timeEl.getAttribute('datetime') || (timeEl.innerText || '').trim())
        : '';

      let role = isSearchPage() ? 'search_result' : 'timeline';
      if (ctx.isThreadPage) {
        if (statusId && statusId === ctx.targetTweetId) {
          role = 'main';
        } else if (handle && handle === ctx.targetHandle) {
          role = 'thread';
        } else {
          role = 'reply';
        }
      }

      const rawReplyTo = extractReplyToHandle(container);
      const currentList = Array.from(tweetsMap.values());
      const { parentId, replyToHandle, depth } = resolveParentAndDepth(
        ctx,
        statusId,
        handle,
        rawReplyTo,
        currentList
      );

      const payload = {
        id: tweetId,
        statusId,
        author,
        handle,
        timestamp,
        url: tweetUrl,
        sourceContext: currentDrillUrl || location.href,
        content: tweetText,
        replies,
        replyCountNum,
        reposts,
        likes,
        views,
        bookmarks,
        role,
        parentId,
        replyToHandle,
        depth
      };

      if (!tweetsMap.has(tweetId)) {
        tweetsMap.set(tweetId, payload);
        updateUI();
        saveState();
      } else {
        const prev = tweetsMap.get(tweetId);
        const updated = {
          ...prev,
          role: (prev.role === 'timeline' || prev.role === 'search_result') && role !== prev.role ? role : prev.role,
          content: (tweetText && tweetText.length > (prev.content || '').length) ? tweetText : (prev.content || payload.content),
          url: prev.url || payload.url,
          timestamp: prev.timestamp || payload.timestamp,
          replies: (replyCountNum > (prev.replyCountNum || 0)) ? replies : prev.replies,
          replyCountNum: Math.max(prev.replyCountNum || 0, replyCountNum),
          reposts: reposts !== '0' ? reposts : prev.reposts,
          likes: likes !== '0' ? likes : prev.likes,
          views: views !== '0' ? views : prev.views,
          parentId: prev.parentId || payload.parentId,
          replyToHandle: prev.replyToHandle || payload.replyToHandle,
          depth: Math.max(prev.depth || 0, depth)
        };
        if (
          updated.role !== prev.role ||
          updated.content !== prev.content ||
          updated.url !== prev.url ||
          updated.timestamp !== prev.timestamp ||
          updated.replyCountNum !== (prev.replyCountNum || 0) ||
          updated.likes !== prev.likes ||
          updated.views !== prev.views ||
          updated.parentId !== prev.parentId ||
          updated.depth !== (prev.depth || 0)
        ) {
          tweetsMap.set(tweetId, updated);
          updateUI();
          saveState();
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
    console.debug(`[Auto-Scraper] Candidates: ${candidates.length} | Tersimpan: ${tweetsMap.size} | Antrean (reply>0): ${queuedThreadUrls.length}`);
  }

  function finishScrapingSession(reasonMessage) {
    isScraping = false;
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    scrapeVisibleTweets();
    saveState();

    if (startBtn) {
      startBtn.innerText = 'Start Auto-Scroll';
      startBtn.style.backgroundColor = '#1d9bf0';
    }

    const shouldAutoExport = Boolean(autoExportCheckbox ? autoExportCheckbox.checked : autoExportOnFinish);
    if (shouldAutoExport && tweetsMap.size > 0) {
      exportToMarkdown().finally(() => {
        if (reasonMessage) alert(reasonMessage);
      });
    } else if (reasonMessage) {
      alert(reasonMessage);
    }
  }

  function advanceToNextQueuedThread() {
    while (queuedThreadUrls.length > 0) {
      const nextUrl = queuedThreadUrls.shift();
      const nextId = extractTweetIdFromUrl(nextUrl);
      if (!nextId || visitedThreadIds.has(nextId)) continue;

      visitedThreadIds.add(nextId);
      currentDrillUrl = nextUrl;
      isScraping = true;
      saveState();

      window.scrollTo({ top: 0, behavior: 'instant' });
      location.href = nextUrl;
      return true;
    }

    if (searchOriginUrl && location.href !== searchOriginUrl) {
      searchOriginUrl = '';
      currentDrillUrl = '';
      isScraping = false;
      saveState();
      finishScrapingSession('Seluruh thread ber-reply dari hasil pencarian selesai di-scrape dan diekspor ke Markdown.');
      return true;
    }
    return false;
  }

  function startAutoScroll(isResume = false) {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    isScraping = true;

    if (!isResume && isSearchPage() && drillSearchCheckbox && drillSearchCheckbox.checked) {
      searchOriginUrl = location.href;
      if (expandCheckbox) expandCheckbox.checked = true;
    } else if (getStatusContext().isThreadPage) {
      if (expandCheckbox) expandCheckbox.checked = true;
    }

    saveState();

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
        lastHeight = 0;
        updateUI();
      }

      scrapeVisibleTweets();

      const step = Math.round(window.innerHeight * 0.72);
      window.scrollBy({ top: step, behavior: 'instant' });

      setTimeout(() => {
        if (isScraping) scrapeVisibleTweets();
      }, 450);

      const currentHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (currentHeight === lastHeight) {
        noChangeCount++;
        scrapeVisibleTweets();
        if (noChangeCount >= 8) {
          const canDrill = isSearchPage() && drillSearchCheckbox && drillSearchCheckbox.checked;
          if (canDrill && advanceToNextQueuedThread()) {
            return;
          }
          finishScrapingSession('Proses scrolling selesai dan data telah diekspor ke Markdown.');
        }
      } else {
        noChangeCount = 0;
        lastHeight = currentHeight;
      }
    }, 1600);
  }

  function stopAutoScroll() {
    isScraping = false;
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    scrapeVisibleTweets();
    saveState();

    if (startBtn) {
      startBtn.innerText = 'Start Auto-Scroll';
      startBtn.style.backgroundColor = '#1d9bf0';
    }
  }

  function escapeXmlAttr(val) {
    return String(val || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeXmlText(val) {
    return String(val || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatNestedTweetBlock(item, badgeLabel, depthLevel) {
    const depth = Math.max(0, Number(depthLevel) || 0);
    const isMainPost = item.role === 'main';
    const indent = '  '.repeat(depth);
    const quotePrefix = depth > 0 ? `${indent}> ` : '';
    const levelTag = depth === 0
      ? (badgeLabel || 'POST')
      : `NESTED REPLY L${depth}`;

    const cleanContent = cleanTweetText(item.content || '');
    const formattedContent = cleanContent
      .split('\n')
      .filter(line => line.trim().length > 0 || line === '')
      .map(line => (isMainPost && depth === 0 ? `**${line}**` : `${quotePrefix}${line}`))
      .join('\n\n');

    let out = '';
    if (isMainPost && depth === 0) {
      out += `> **★ POSTINGAN UTAMA (HIGHLIGHT) ★**\n\n`;
      out += `### **${item.author}** \`[${levelTag}]\`${item.timestamp ? ` ***(${item.timestamp})***` : ''}`;
    } else {
      out += `${indent}- **${item.author}** \`[${levelTag}]\`${item.timestamp ? ` *(${item.timestamp})*` : ''}`;
    }

    if (item.replyToHandle) {
      out += ` → *replying to @${item.replyToHandle}*`;
    }
    if (item.url) {
      out += ` — [Link](${item.url})`;
    }
    out += `\n`;

    const metricLine = `💬 **Replies:** ${item.replies} | 🔁 **Reposts:** ${item.reposts} | ❤️ **Likes:** ${item.likes} | 📊 **Views:** ${item.views} | 🔖 **Bookmarks:** ${item.bookmarks}`;
    out += (isMainPost && depth === 0)
      ? `> **${metricLine}**\n\n`
      : `${quotePrefix}> ${metricLine}\n\n`;

    if (formattedContent) {
      out += `${formattedContent}\n\n`;
    }

    const xmlTag = isMainPost ? 'main_post' : (depth === 0 ? 'post' : 'nested_reply');
    out += `${indent}\`\`\`xml\n`;
    out += `${indent}<${xmlTag} id="${escapeXmlAttr(item.id)}" role="${escapeXmlAttr(item.role)}" highlight="${isMainPost ? 'true' : 'false'}" depth="${depth}" author="${escapeXmlAttr(item.author)}" handle="${escapeXmlAttr(item.handle)}" parent_id="${escapeXmlAttr(item.parentId || '')}" reply_to="${escapeXmlAttr(item.replyToHandle || '')}" timestamp="${escapeXmlAttr(item.timestamp || '')}" url="${escapeXmlAttr(item.url || '')}">\n`;
    out += `${indent}  <metrics replies="${escapeXmlAttr(item.replies)}" reposts="${escapeXmlAttr(item.reposts)}" likes="${escapeXmlAttr(item.likes)}" views="${escapeXmlAttr(item.views)}" bookmarks="${escapeXmlAttr(item.bookmarks)}" />\n`;
    out += `${indent}  <content>${escapeXmlText(cleanContent)}</content>\n`;
    out += `${indent}</${xmlTag}>\n`;
    out += `${indent}\`\`\`\n\n`;
    return out;
  }

  function renderTreeNodes(nodes, childrenMap, badgeFn, fallbackDepth = 0) {
    let md = '';
    const visitedInRender = new Set();

    function walk(node, currentDepth) {
      if (!node || visitedInRender.has(node.id)) return;
      visitedInRender.add(node.id);

      const effectiveDepth = Math.max(currentDepth, Number(node.depth) || 0);
      md += formatNestedTweetBlock(node, badgeFn(node, effectiveDepth), effectiveDepth);

      const kids = childrenMap.get(node.id) || [];
      for (const child of kids) {
        const childDepth = Math.max(effectiveDepth + 1, Number(child.depth) || (effectiveDepth + 1));
        walk(child, childDepth);
      }
    }

    for (const n of nodes) {
      walk(n, fallbackDepth);
    }

    for (const [_parentId, kids] of childrenMap.entries()) {
      for (const child of kids) {
        if (!visitedInRender.has(child.id)) {
          const d = Math.max(1, Number(child.depth) || 1);
          md += formatNestedTweetBlock(child, badgeFn(child, d), d);
          visitedInRender.add(child.id);
        }
      }
    }

    return md;
  }

  function generateMarkdown() {
    const ctx = getStatusContext();
    const allItems = Array.from(tweetsMap.values());
    const threadOnly = Boolean(threadOnlyCheckbox && threadOnlyCheckbox.checked);

    const mainAndThread = allItems.filter(i => i.role === 'main' || i.role === 'thread');
    const otherReplies = allItems.filter(i => i.role === 'reply');
    const searchItems = allItems.filter(i => i.role === 'search_result');
    const timelineItems = allItems.filter(i => i.role === 'timeline');

    const childrenMap = new Map();
    for (const item of allItems) {
      if (item.parentId) {
        if (!childrenMap.has(item.parentId)) childrenMap.set(item.parentId, []);
        childrenMap.get(item.parentId).push(item);
      }
    }

    let md = `# Arsip Postingan & Sentimen X (Twitter)\n`;
    md += `- **Tanggal Ekspor:** ${new Date().toLocaleString()}\n`;
    md += `- **URL Sumber:** ${searchOriginUrl || location.href}\n`;

    if (ctx.isThreadPage || mainAndThread.length > 0 || otherReplies.length > 0) {
      const exportedCount = threadOnly
        ? mainAndThread.length
        : (mainAndThread.length + otherReplies.length + searchItems.length + timelineItems.length);

      md += `- **Mode:** Single Post / Thread + Nested Indentation Replies\n`;
      md += `- **Total Item Diekspor:** ${exportedCount} (Utama & Thread: ${mainAndThread.length}, Balasan/Sentimen: ${otherReplies.length})\n\n---\n\n`;

      if (mainAndThread.length > 0) {
        md += `## **Postingan Utama & Rangkaian Thread Penulis**\n\n`;
        md += renderTreeNodes(
          mainAndThread,
          childrenMap,
          (item) => (item.role === 'main' ? '★ POSTINGAN UTAMA ★' : 'THREAD PENULIS'),
          0
        );
      }

      if (!threadOnly && otherReplies.length > 0) {
        md += `## Balasan & Sentimen Komentar (Nested Indentation)\n\n`;
        const topLevelReplies = otherReplies.filter(
          r => !r.parentId || !tweetsMap.has(r.parentId) || tweetsMap.get(r.parentId)?.role === 'main'
        );
        const nestedOrOtherReplies = otherReplies.filter(r => !topLevelReplies.includes(r));

        md += renderTreeNodes(
          topLevelReplies,
          childrenMap,
          (_item, d) => `BALASAN L${Math.max(1, d)}`,
          1
        );

        if (nestedOrOtherReplies.length > 0) {
          md += renderTreeNodes(
            nestedOrOtherReplies,
            childrenMap,
            (_item, d) => `SUB-BALASAN L${Math.max(2, d)}`,
            2
          );
        }
      }

      if (!threadOnly && searchItems.length > 0) {
        md += `## Hasil Pencarian (Ringkasan Awal)\n\n`;
        md += renderTreeNodes(searchItems, childrenMap, () => 'SEARCH', 0);
      }

      if (!threadOnly && timelineItems.length > 0) {
        md += `## Postingan Lain di Halaman\n\n`;
        md += renderTreeNodes(timelineItems, childrenMap, () => 'TIMELINE', 0);
      }
    } else {
      md += `- **Mode:** Search / Timeline\n`;
      md += `- **Total Postingan:** ${allItems.length}\n\n---\n\n`;
      md += renderTreeNodes(
        allItems,
        childrenMap,
        (item) => (item.role === 'search_result' ? 'SEARCH' : 'POST'),
        0
      );
    }

    return md;
  }

  async function exportToMarkdown() {
    if (isExporting) return;
    isExporting = true;
    try {
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
    } finally {
      isExporting = false;
    }
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
      width: 238px;
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
      cb.addEventListener('change', saveState);
      const span = document.createElement('span');
      span.innerText = labelText;
      row.appendChild(cb);
      row.appendChild(span);
      return { row, cb };
    }

    const threadOnlyToggle = createToggleRow('Thread penulis saja (saat di status)', false);
    threadOnlyCheckbox = threadOnlyToggle.cb;

    const expandToggle = createToggleRow('Auto-klik "Show more"', true);
    expandCheckbox = expandToggle.cb;

    const drillToggle = createToggleRow('Buka thread jika reply > 0', true);
    drillSearchCheckbox = drillToggle.cb;

    const autoExportToggle = createToggleRow('Auto-export MD saat selesai', true);
    autoExportCheckbox = autoExportToggle.cb;

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
      else startAutoScroll(false);
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
      stopAutoScroll();
      tweetsMap.clear();
      queuedThreadUrls = [];
      visitedThreadIds.clear();
      searchOriginUrl = '';
      currentDrillUrl = '';
      sessionStorage.removeItem(STORAGE_KEY);
      updateUI();
    };

    panel.appendChild(modeBadge);
    panel.appendChild(statusText);
    panel.appendChild(threadOnlyToggle.row);
    panel.appendChild(expandToggle.row);
    panel.appendChild(drillToggle.row);
    panel.appendChild(autoExportToggle.row);
    panel.appendChild(startBtn);
    panel.appendChild(exportBtn);
    panel.appendChild(clearBtn);
    document.body.appendChild(panel);

    loadState();
    updateUI();
  }

  function updateUI() {
    if (!modeBadge || !statusText) return;

    const ctx = getStatusContext();
    if (ctx.isThreadPage) {
      modeBadge.innerText = `Mode: Thread (@${ctx.targetHandle})`;
    } else if (isSearchPage()) {
      modeBadge.innerText = 'Mode: Search + Thread';
    } else {
      modeBadge.innerText = 'Mode: Timeline';
    }

    const items = Array.from(tweetsMap.values());
    const mainThreadCount = items.filter(i => i.role === 'main' || i.role === 'thread').length;
    const replyCount = items.filter(i => i.role === 'reply').length;

    if (ctx.isThreadPage || mainThreadCount > 0 || replyCount > 0) {
      statusText.innerText = `Thread: ${mainThreadCount} | Balasan: ${replyCount}`;
    } else if (queuedThreadUrls.length > 0) {
      statusText.innerText = `Tersimpan: ${tweetsMap.size} | Antrean (>0): ${queuedThreadUrls.length}`;
    } else {
      statusText.innerText = `Tersimpan: ${tweetsMap.size} tweet`;
    }
  }

  initUI();

  if (isScraping) {
    setTimeout(() => {
      startAutoScroll(true);
    }, 1200);
  }

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
