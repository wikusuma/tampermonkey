// ==UserScript==
// @name         Custom Muted Words & Regex Filter
// @namespace    https://github.com/wikusuma/tampermonkey
// @version      1.0.0
// @description  Menyembunyikan tweet di X.com berdasarkan daftar keywords & regex eksternal di GitHub
// @author       wikusuma
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/custom-muted-words-regex-filter/custom-muted-words-regex-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/custom-muted-words-regex-filter/custom-muted-words-regex-filter.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const JSON_URL = 'https://raw.githubusercontent.com/wikusuma/tampermonkey/main/custom-muted-words-regex-filter/muted_words.json';

    let filterConfig = GM_getValue('x_filter_config', {
        keywords: [],
        regex: []
    });

    let compiledRegexes = [];

    function compileRules(config) {
        const rules = [];

        if (Array.isArray(config.keywords)) {
            config.keywords.forEach(word => {
                if (word && word.trim() !== '') {
                    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    rules.push(new RegExp(`\\b${escaped}\\b`, 'i'));
                }
            });
        }

        if (Array.isArray(config.regex)) {
            config.regex.forEach(pattern => {
                if (pattern && pattern.trim() !== '') {
                    try {
                        rules.push(new RegExp(pattern.trim(), 'i'));
                    } catch (e) {
                        console.warn('[X-Filter] Pola regex tidak valid:', pattern, e);
                    }
                }
            });
        }

        compiledRegexes = rules;
    }

    function syncFromGitHub() {
        const cacheBusterUrl = `${JSON_URL}?t=${Date.now()}`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: cacheBusterUrl,
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const remoteData = JSON.parse(response.responseText);
                        if (remoteData && (Array.isArray(remoteData.keywords) || Array.isArray(remoteData.regex))) {
                            filterConfig = remoteData;
                            GM_setValue('x_filter_config', remoteData);
                            compileRules(filterConfig);
                            scanAllTweets();
                            console.log(`[X-Filter] Sinkronisasi sukses. Total aturan aktif: ${compiledRegexes.length}`);
                        }
                    } catch (err) {
                        console.error('[X-Filter] Gagal parsing JSON dari GitHub:', err);
                    }
                } else {
                    console.warn(`[X-Filter] Gagal mengambil file GitHub (HTTP ${response.status}).`);
                }
            },
            onerror: function (err) {
                console.error('[X-Filter] Kesalahan jaringan saat menghubungi GitHub:', err);
            }
        });
    }

    function evaluateTweet(article) {
        if (article.dataset.xFilterChecked === 'true') return;

        const textNodes = article.querySelectorAll('[data-testid="tweetText"], [data-testid="User-Name"]');
        if (textNodes.length === 0) return;

        let combinedText = '';
        textNodes.forEach(node => {
            combinedText += ' ' + node.innerText;
        });

        article.dataset.xFilterChecked = 'true';

        const isMatched = compiledRegexes.some(rx => rx.test(combinedText));

        if (isMatched) {
            const cell = article.closest('[data-testid="cellInnerDiv"]');
            if (cell) {
                cell.style.display = 'none';
            } else {
                article.style.display = 'none';
            }
        }
    }

    function scanAllTweets() {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(article => {
            delete article.dataset.xFilterChecked;
            evaluateTweet(article);
        });
    }

    compileRules(filterConfig);
    scanAllTweets();
    syncFromGitHub();

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches('article[data-testid="tweet"]')) {
                            evaluateTweet(node);
                        } else if (node.querySelectorAll) {
                            const nestedTweets = node.querySelectorAll('article[data-testid="tweet"]');
                            nestedTweets.forEach(evaluateTweet);
                        }
                    }
                });
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
