// ==UserScript==
// @name         NewsBlur AI Enhancement & Topic Clustering
// @namespace    https://www.newsblur.com/
// @version      1.3.0
// @description  AI Summarizer for active feeds, searches, and topic clustering in NewsBlur using Google Gemini API.
// @author       Willy Kusuma Hanum
// @match        *://*.newsblur.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// @updateURL    https://github.com/wikusuma/tampermonkey/tree/main/newsblur-com/ai-enhancement-and-topic-clustering/ai-enhancement-and-topic-clustering.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/tree/main/newsblur-com/ai-enhancement-and-topic-clustering/ai-enhancement-and-topic-clustering.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Abaikan jika dieksekusi di dalam iframe (misal embed YouTube)
    if (window.top !== window.self) return;

    // ----------------------------------------------------
    // Configuration & State
    // ----------------------------------------------------
    const GEMINI_MODEL = 'gemini-3.8-flash';
    let apiKey = GM_getValue('gemini_api_key', '');

    // ----------------------------------------------------
    // UI Helpers & Injections
    // ----------------------------------------------------
    function injectStyles() {
        if (document.getElementById('nb-ai-styles')) return;
        const style = document.createElement('style');
        style.id = 'nb-ai-styles';
        style.textContent = `
            #nb-ai-toolbar {
                position: fixed !important;
                top: 45px !important;
                right: 25px !important;
                z-index: 2147483647 !important;
                display: flex !important;
                gap: 8px !important;
                background: #181920 !important;
                padding: 6px 12px !important;
                border-radius: 20px !important;
                box-shadow: 0 4px 16px rgba(0,0,0,0.6) !important;
                border: 1px solid #4a4d62 !important;
                align-items: center !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            }
            .nb-ai-btn {
                background: #2b2d3c !important;
                color: #f1f5f9 !important;
                border: 1px solid #565a73 !important;
                padding: 5px 12px !important;
                border-radius: 12px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
            }
            .nb-ai-btn:hover {
                background: #434760 !important;
                color: #38bdf8 !important;
                border-color: #38bdf8 !important;
            }
            #nb-ai-modal {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: 650px !important;
                max-width: 90vw !important;
                max-height: 82vh !important;
                background: #16171d !important;
                border: 1px solid #3c4053 !important;
                border-radius: 12px !important;
                z-index: 2147483647 !important;
                box-shadow: 0 16px 40px rgba(0,0,0,0.7) !important;
                display: none;
                flex-direction: column !important;
                color: #e2e8f0 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            }
            #nb-ai-modal-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                padding: 12px 18px !important;
                border-bottom: 1px solid #2d2f3d !important;
                background: #1f212a !important;
                border-radius: 12px 12px 0 0 !important;
            }
            #nb-ai-modal-title {
                font-size: 13px !important;
                font-weight: 700 !important;
                letter-spacing: 0.5px !important;
                text-transform: uppercase !important;
                color: #38bdf8 !important;
            }
            #nb-ai-modal-close {
                background: transparent !important;
                border: none !important;
                color: #94a3b8 !important;
                font-size: 20px !important;
                cursor: pointer !important;
            }
            #nb-ai-modal-close:hover {
                color: #ffffff !important;
            }
            #nb-ai-modal-body {
                padding: 18px !important;
                overflow-y: auto !important;
                font-size: 13px !important;
                line-height: 1.6 !important;
                white-space: pre-wrap !important;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureUI() {
        injectStyles();

        // Toolbar
        if (!document.getElementById('nb-ai-toolbar')) {
            const toolbar = document.createElement('div');
            toolbar.id = 'nb-ai-toolbar';
            toolbar.innerHTML = `
                <button class="nb-ai-btn" id="btn-ai-resume">⚡ Resume View</button>
                <button class="nb-ai-btn" id="btn-ai-cluster">🔍 Cluster Topics</button>
                <button class="nb-ai-btn" id="btn-ai-config">⚙️ Key</button>
            `;
            document.body.appendChild(toolbar);

            document.getElementById('btn-ai-config').onclick = configureApiKey;
            document.getElementById('btn-ai-resume').onclick = () => runTask('resume');
            document.getElementById('btn-ai-cluster').onclick = () => runTask('cluster');
        }

        // Modal
        if (!document.getElementById('nb-ai-modal')) {
            const modal = document.createElement('div');
            modal.id = 'nb-ai-modal';
            modal.innerHTML = `
                <div id="nb-ai-modal-header">
                    <span id="nb-ai-modal-title">AI Output</span>
                    <button id="nb-ai-modal-close">&times;</button>
                </div>
                <div id="nb-ai-modal-body">Loading...</div>
            `;
            document.body.appendChild(modal);

            document.getElementById('nb-ai-modal-close').onclick = () => {
                modal.style.display = 'none';
            };
        }
    }

    // ----------------------------------------------------
    // API Key Handling
    // ----------------------------------------------------
    function configureApiKey() {
        const input = prompt('Masukkan Google Gemini API Key Anda:', apiKey);
        if (input !== null) {
            apiKey = input.trim();
            GM_setValue('gemini_api_key', apiKey);
            alert(apiKey ? 'Gemini API Key tersimpan.' : 'API Key dikosongkan.');
        }
    }

    function checkApiKey() {
        if (!apiKey) configureApiKey();
        return !!apiKey;
    }

    // ----------------------------------------------------
    // Story Extractor
    // ----------------------------------------------------
    function extractVisibleStories(limit = 25) {
        let stories = [];

        // 1. Ambil dari objek Backbone global NewsBlur jika tersedia
        try {
            const nb = window.NEWSBLUR || (window.top && window.top.NEWSBLUR);
            if (nb && nb.assets && nb.assets.stories && nb.assets.stories.models) {
                const models = nb.assets.stories.models;
                if (models.length > 0) {
                    stories = models.slice(0, limit).map(m => {
                        const a = m.attributes || {};
                        return {
                            title: a.story_title || '',
                            content: (a.story_content || '').replace(/<[^>]*>?/gm, '').slice(0, 300),
                            feed: a.story_feed_title || ''
                        };
                    });
                }
            }
        } catch (e) {
            console.warn('[NewsBlur AI] Fallback ke pembacaan DOM', e);
        }

        // 2. Ambil dari elemen daftar judul di layar NewsBlur
        if (stories.length === 0) {
            const titleNodes = document.querySelectorAll('.story_title, .NB-story-title, .NB-feed-story a.story_title');
            titleNodes.forEach((node, idx) => {
                if (idx >= limit) return;
                const txt = node.textContent.trim();
                if (txt.length > 5) {
                    stories.push({ title: txt, content: '', feed: '' });
                }
            });
        }

        return stories;
    }

    // ----------------------------------------------------
    // Gemini Request Handler
    // ----------------------------------------------------
    function callGemini(promptText, onComplete) {
        const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 1500
                }
            }),
            onload: function (response) {
                try {
                    const res = JSON.parse(response.responseText);
                    if (res.error) {
                        onComplete(`Error API: ${res.error.message || JSON.stringify(res.error)}`);
                    } else if (res.candidates && res.candidates[0].content && res.candidates[0].content.parts.length > 0) {
                        onComplete(res.candidates[0].content.parts[0].text);
                    } else {
                        onComplete('Respon API kosong.');
                    }
                } catch (err) {
                    onComplete(`Error Response:\n${response.responseText}`);
                }
            },
            onerror: function (err) {
                onComplete(`Gagal koneksi ke Google API: ${JSON.stringify(err)}`);
            }
        });
    }

    function showModal(title, text) {
        const modal = document.getElementById('nb-ai-modal');
        document.getElementById('nb-ai-modal-title').textContent = title;
        document.getElementById('nb-ai-modal-body').textContent = text;
        modal.style.display = 'flex';
    }

    function runTask(type) {
        if (!checkApiKey()) return;

        const stories = extractVisibleStories(25);
        if (stories.length === 0) {
            alert('Tidak menemukan judul artikel di layar saat ini.');
            return;
        }

        const formattedPayload = stories
            .map((s, i) => `${i + 1}. ${s.feed ? '[' + s.feed + '] ' : ''}${s.title}\n${s.content ? '   Snippet: ' + s.content : ''}`)
            .join('\n');

        let prompt = '';
        let modalTitle = '';

        if (type === 'resume') {
            modalTitle = 'Executive Summary';
            prompt = `Kamu adalah analis berita. Berikut daftar artikel NewsBlur:\n\n${formattedPayload}\n\nInstruksi:\n1. Tulis ringkasan eksekutif dari isu-isu utama.\n2. Kelompokkan dalam 3-5 poin tematik ringkas.\n3. Gunakan bahasa Indonesia lugas.`;
        } else if (type === 'cluster') {
            modalTitle = 'Topic Clustering & Trends';
            prompt = `Kamu adalah analis intelijen tren. Berikut daftar artikel NewsBlur:\n\n${formattedPayload}\n\nInstruksi:\n1. Kelompokkan artikel ke dalam kluster tema yang relevan.\n2. Tuliskan nama tema dan sertakan judul artikelnya.\n3. Berikan 1-2 kalimat tren utama hari ini.`;
        }

        showModal(modalTitle, 'Memproses ke Gemini 3.8 Flash...');

        callGemini(prompt, (resultText) => {
            document.getElementById('nb-ai-modal-body').textContent = resultText;
        });
    }

    // ----------------------------------------------------
    // Persistent Watchdog Loop
    // Memastikan toolbar tetap ada meski SPA berpindah feed
    // ----------------------------------------------------
    setInterval(ensureUI, 1000);

})();
