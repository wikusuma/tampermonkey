// ==UserScript==
// @name         Review Pareto Extractor
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automate navigation to User Reviews, calculate rating Pareto, and sample reviews per rating stratum.
// @author       Willy Kusuma Hanum
// @match        https://www.imdb.com/title/tt*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/review-pareto-extractor/review-pareto-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/review-pareto-extractor/review-pareto-extractor.user.js
// ==/UserScript==

(function () {
    'use strict';

    const currentUrl = window.location.href;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // ----------------------------------------------------
    // TAHAP 1: Navigasi Otomatis dari Halaman Detail Film
    // ----------------------------------------------------
    if (!currentUrl.includes('/reviews')) {
        window.addEventListener('load', () => {
            // Panel kontrol mengambang
            const btn = document.createElement('button');
            btn.innerText = '⚡ Jalankan Ekstraksi Pareto';
            btn.style.position = 'fixed';
            btn.style.bottom = '20px';
            btn.style.right = '20px';
            btn.style.zIndex = '99999';
            btn.style.padding = '12px 20px';
            btn.style.backgroundColor = '#f5c518';
            btn.style.color = '#000';
            btn.style.fontWeight = 'bold';
            btn.style.border = 'none';
            btn.style.borderRadius = '6px';
            btn.style.cursor = 'pointer';

            btn.onclick = () => {
                // Ekstraksi ID film langsung dari URL (contoh: tt5446858)
                const match = window.location.pathname.match(/\/title\/(tt\d+)/);
                if (match && match[1]) {
                    const titleId = match[1];
                    GM_setValue('pareto_auto_run', true);
                    // Langsung arahkan ke URL ulasan film tanpa bergantung pada selector HTML
                    window.location.href = `https://www.imdb.com/title/${titleId}/reviews/?sort=submissionDate&dir=desc&ratingFilter=0`;
                } else {
                    alert('ID film tidak terdeteksi di URL ini.');
                }
            };
            document.body.appendChild(btn);
        });
        return;
    }

    // ----------------------------------------------------
    // TAHAP 2: Ekstraksi & Sampling di Tab User Reviews
    // ----------------------------------------------------
    if (currentUrl.includes('/reviews')) {
        window.addEventListener('load', async () => {
            const isAuto = GM_getValue('pareto_auto_run', false);

            // Buat Floating HUD status
            const statusBox = document.createElement('div');
            statusBox.id = 'pareto-hud';
            statusBox.style.position = 'fixed';
            statusBox.style.top = '70px';
            statusBox.style.right = '20px';
            statusBox.style.zIndex = '99999';
            statusBox.style.backgroundColor = '#1f1f1f';
            statusBox.style.color = '#fff';
            statusBox.style.padding = '14px';
            statusBox.style.borderRadius = '8px';
            statusBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            statusBox.style.fontSize = '12px';
            statusBox.style.maxWidth = '300px';
            statusBox.innerHTML = `<b>Pareto Extractor:</b> Standby <br><button id="manual-run-btn" style="margin-top:8px;padding:4px 8px;">Mulai Ekstraksi</button>`;
            document.body.appendChild(statusBox);

            const startProcess = async () => {
                statusBox.innerHTML = `<b>Pareto Extractor:</b> Memuat ulasan tambahan...`;

                // 1. Eksekusi Load More secara berkala
                let loadMoreAttempts = 0;
                const maxAttempts = 8;

                while (loadMoreAttempts < maxAttempts) {
                    const loadMoreBtn = document.querySelector('button.ipc-see-more__button') ||
                                        document.querySelector('.ipl-load-more__button');
                    if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
                        loadMoreBtn.click();
                        await wait(2200);
                        loadMoreAttempts++;
                        statusBox.innerHTML = `<b>Pareto Extractor:</b> Loading batch ${loadMoreAttempts}/${maxAttempts}...`;
                    } else {
                        break;
                    }
                }

                // 2. Ekstraksi kartu ulasan dari DOM
                statusBox.innerHTML = `<b>Pareto Extractor:</b> Mengagregasi data rating...`;
                const reviewCards = document.querySelectorAll('article.user-review-item, div.imdb-user-review, div[data-testid="review-overflow"]');

                const rawDataset = [];
                const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, unrated: 0 };

                reviewCards.forEach(card => {
                    const ratingEl = card.querySelector('.rating-other-user-rating span, .ipc-rating-star');
                    const titleEl = card.querySelector('a.title, .ipc-title__text');
                    const textEl = card.querySelector('.text, .ipc-html-content-inner-div');

                    let rating = null;
                    if (ratingEl) {
                        const parsed = parseInt(ratingEl.textContent.trim().split('/')[0]);
                        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
                            rating = parsed;
                        }
                    }

                    const record = {
                        rating: rating,
                        title: titleEl ? titleEl.textContent.trim() : '',
                        snippet: textEl ? textEl.textContent.trim().substring(0, 300) : ''
                    };

                    if (rating) {
                        ratingDistribution[rating]++;
                    } else {
                        ratingDistribution.unrated++;
                    }
                    rawDataset.push(record);
                });

                // 3. Kalkulasi Pareto (80/20)
                const totalScored = Object.keys(ratingDistribution)
                    .filter(k => k !== 'unrated')
                    .reduce((acc, k) => acc + ratingDistribution[k], 0);

                const sortedRatings = Object.keys(ratingDistribution)
                    .filter(k => k !== 'unrated')
                    .map(k => ({ rating: parseInt(k), count: ratingDistribution[k], share: (ratingDistribution[k] / (totalScored || 1)) }))
                    .sort((a, b) => b.count - a.count);

                let cumulative = 0;
                const paretoSummary = sortedRatings.map(item => {
                    cumulative += item.share;
                    return {
                        ...item,
                        cumulativeShare: parseFloat((cumulative * 100).toFixed(1))
                    };
                });

                // 4. Sampling Representatif per Rating (Stratified Sampling)
                const stratifiedSample = {};
                for (let r = 1; r <= 10; r++) {
                    stratifiedSample[`rating_${r}`] = rawDataset
                        .filter(item => item.rating === r)
                        .slice(0, 5);
                }

                const finalPayload = {
                    metadata: {
                        url: currentUrl,
                        scrapedTotal: rawDataset.length,
                        populationScored: totalScored
                    },
                    distribution: ratingDistribution,
                    paretoAnalysis: paretoSummary,
                    sampleReviewReviews: stratifiedSample
                };

                // Output ke clipboard dan konsol
                const jsonText = JSON.stringify(finalPayload, null, 2);
                GM_setClipboard(jsonText);
                console.log('HASIL EKSTRAKSI PARETO:', finalPayload);

                GM_setValue('pareto_auto_run', false);
                statusBox.innerHTML = `
                    <b>Selesai!</b><br>
                    Terekstraksi: ${rawDataset.length} ulasan.<br>
                    <span style="color:#f5c518">Data JSON sudah disalin ke Clipboard.</span><br>
                    Tinggal Paste (Ctrl+V) ke chat.
                `;
            };

            document.getElementById('manual-run-btn')?.addEventListener('click', startProcess);

            if (isAuto) {
                await wait(1500);
                startProcess();
            }
        });
    }
})();
