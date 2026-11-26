// ==UserScript==
// @name         IMDb Regional Cinema Filter v.1.1.1
// @namespace    https://github.com/imdb-master-suite
// @version      1.1.1
// @description  Sistem Filter Benua (Timur/Barat) dengan Zero-Idle Cost (Tidak memindai jika posisi All).
// @author       Willy Kusuma & Dev Team
// @match        https://www.imdb.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/regional-cinema-filter/regional-cinema-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/regional-cinema-filter/regional-cinema-filter.user.js
// ==/UserScript==

/*
*  =====================================================================
*  CHANGE LOG
*  =====================================================================
*  [v1.1.1] - Logic Revamp (Zero-Idle Cost)
*   * Minor (1): Menghentikan pemindaian DOM dan Fetching jika status Toggle adalah 'All'.
*   * Minor (2): Menambahkan fungsi On-Demand Trigger; scanner hanya berjalan ketika user pindah dari 'All' ke 'Timur/Barat'.
*   * Enrichment (1): 'Queue Auto-Kill'. Mengosongkan antrean BackgroundScanner jika user membatalkan filter (kembali ke 'All') di tengah proses.
*  [v1.1.0] - React-Immune Update & Advanced Parsing (CSS Data-Attributes, Badge).
*  =====================================================================
*/

(function () {
    'use strict';

    // ==========================================
    // 1. GLOBAL CONFIG & REGION DATA
    // ==========================================
    const CONFIG = {
        name: "IMDbRegionalFilter",
        version: "1.1.1",
        cacheTtlMs: 30 * 24 * 60 * 60 * 1000,
        throttleMs: 600,
    };

    const REGIONS = {
        all: "",
        timur: "gb,fr,de,it,es,se,dk,no,fi,nl,be,ch,at,pl,ru,jp,kr,in,cn,hk,tw,th,id,my,ph,vn,ir,tr,au,nz,za,eg",
        barat: "us,ca,mx,br,ar,cl,co,pe,ve"
    };

    const WESTERN_CODES = REGIONS.barat.split(',');

    GM_addStyle(`
        body[data-imdb-filter="timur"] [data-movie-region="barat"] { display: none !important; }
        body[data-imdb-filter="barat"] [data-movie-region="timur"] { display: none !important; }

        .region-badge {
            position: absolute; top: 8px; left: 8px; z-index: 99;
            background: rgba(0, 0, 0, 0.85); color: #fff;
            font-size: 11px; font-weight: bold; padding: 3px 6px;
            border-radius: 4px; pointer-events: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        }

        #imdb-region-toggle {
            position: fixed; bottom: 20px; left: 20px; z-index: 999999;
            background: rgba(20,20,20,0.95); border: 1px solid #444;
            border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.8);
            display: flex; align-items: center; padding: 8px; backdrop-filter: blur(5px);
        }
        .region-btn {
            background: transparent; color: #aaa; border: 1px solid transparent;
            padding: 6px 12px; font-weight: bold; border-radius: 4px; cursor: pointer;
            font-size: 13px; margin: 0 4px; transition: all 0.2s;
        }
        .region-btn:hover { color: #fff; background: #333; }
        .region-btn.active { background: #f5c518; color: #000; border: 1px solid #e0b314; }
        #region-scan-indicator {
            position: absolute; top: -22px; left: 10px; font-size: 11px;
            color: #f5c518; opacity: 0; transition: opacity 0.3s; font-weight: bold;
        }
    `);

    // ==========================================
    // 2. CACHE MANAGER
    // ==========================================
    const CacheManager = {
        get(key) {
            const cached = GM_getValue(`REGION_${key}`, null);
            if (!cached) return null;
            if (Date.now() - cached.timestamp > CONFIG.cacheTtlMs) {
                GM_deleteValue(`REGION_${key}`);
                return null;
            }
            return cached.data;
        },
        set(key, data) {
            GM_setValue(`REGION_${key}`, { timestamp: Date.now(), data });
        }
    };

    // ==========================================
    // 3. UI MODULE & STATE MANAGEMENT
    // ==========================================
    function injectToggleUI() {
        if (document.getElementById('imdb-region-toggle')) return;

        const container = document.createElement('div');
        container.id = 'imdb-region-toggle';

        const activeRegion = GM_getValue('activeRegion', 'all');
        document.body.setAttribute('data-imdb-filter', activeRegion);

        container.innerHTML = `
            <div id="region-scan-indicator">⏳ Memindai Film...</div>
            <button class="region-btn ${activeRegion === 'all' ? 'active' : ''}" data-region="all">🌐 All</button>
            <button class="region-btn ${activeRegion === 'timur' ? 'active' : ''}" data-region="timur">⛩️ Timur</button>
            <button class="region-btn ${activeRegion === 'barat' ? 'active' : ''}" data-region="barat">🦅 Barat</button>
        `;

        document.body.appendChild(container);

        container.querySelectorAll('.region-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const selected = e.target.getAttribute('data-region');
                GM_setValue('activeRegion', selected);

                container.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.body.setAttribute('data-imdb-filter', selected);

                if (window.location.pathname.includes('/search/title')) {
                    applyUrlFilter(selected);
                } else {
                    // LOGIC BARU: Kendali Scanner Berdasarkan Pilihan
                    if (selected === 'all') {
                        // Jika pindah ke All, bunuh antrean proses (Queue Auto-Kill)
                        BackgroundScanner.queue = [];
                        const indicator = document.getElementById('region-scan-indicator');
                        if (indicator) indicator.style.opacity = '0';
                    } else if (typeof window.triggerDomScan === 'function') {
                        // Jika pindah dari All ke Timur/Barat, jalankan scanner secara on-demand
                        window.triggerDomScan();
                    }
                }
            });
        });
    }

    function applyUrlFilter(activeRegion) {
        if (activeRegion === 'all') return;
        const url = new URL(window.location.href);
        if (url.pathname.includes('/search/title')) {
            if (url.searchParams.get('countries') !== REGIONS[activeRegion]) {
                url.searchParams.set('countries', REGIONS[activeRegion]);
                url.searchParams.delete('country_of_origin');
                window.location.replace(url.toString());
            }
        }
    }

    // ==========================================
    // 4. HYBRID DOM SCANNER (ANTI-BAN QUEUE)
    // ==========================================
    const BackgroundScanner = {
        queue: [],
        isProcessing: false,

        add(ttId, domElement) {
            if (!this.queue.some(item => item.ttId === ttId)) {
                this.queue.push({ ttId, domElement });
                this.processQueue();
            }
        },

        async processQueue() {
            if (this.isProcessing || this.queue.length === 0) return;
            this.isProcessing = true;

            const indicator = document.getElementById('region-scan-indicator');
            if (indicator) indicator.style.opacity = '1';

            while (this.queue.length > 0) {
                // Mengecek apakah antrean tiba-tiba dikosongkan (Auto-kill trigger)
                if (GM_getValue('activeRegion', 'all') === 'all') {
                    this.queue = [];
                    break;
                }

                const { ttId, domElement } = this.queue.shift();

                const countries = await this.fetchCountryData(ttId);
                CacheManager.set(ttId, countries);
                applyVisibility(domElement, countries);

                await new Promise(r => setTimeout(r, CONFIG.throttleMs));
            }

            if (indicator) indicator.style.opacity = '0';
            this.isProcessing = false;
        },

        async fetchCountryData(ttId) {
            try {
                const response = await fetch(`https://www.imdb.com/title/${ttId}/`);
                if (!response.ok) return ['unknown'];
                const html = await response.text();

                let found = [];
                const urlRegex = /\/search\/title\/\?(?:countries|country_of_origin)=([a-zA-Z]{2})/gi;
                let match;
                while ((match = urlRegex.exec(html)) !== null) {
                    found.push(match[1].toLowerCase());
                }

                if (found.length === 0) {
                    const jsonMatch = html.match(/"countryOfOrigin"\s*:\s*\{\s*"id"\s*:\s*"([a-zA-Z]{2})"/i) ||
                                      html.match(/"countriesOfOrigin"[\s\S]*?"id"\s*:\s*"([a-zA-Z]{2})"/i);
                    if (jsonMatch) found.push(jsonMatch[1].toLowerCase());
                }

                return found.length > 0 ? found : ['unknown'];
            } catch (e) {
                return ['unknown'];
            }
        }
    };

    function applyVisibility(card, countries) {
        const isWestern = countries.some(c => WESTERN_CODES.includes(c));
        const regionTag = isWestern ? 'barat' : (countries.includes('unknown') ? 'unknown' : 'timur');

        const wrapper = card.closest('li') || card.closest('.ipc-poster-card') || card;
        wrapper.setAttribute('data-movie-region', regionTag);

        let badge = card.querySelector('.region-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'region-badge';
            const imgContainer = card.querySelector('.ipc-poster, .ipc-media, .lister-item-image');
            if (imgContainer) {
                imgContainer.style.position = 'relative';
                imgContainer.appendChild(badge);
            } else {
                card.style.position = 'relative';
                card.appendChild(badge);
            }
        }

        if (regionTag === 'barat') badge.innerHTML = '🦅 Barat';
        else if (regionTag === 'timur') badge.innerHTML = '⛩️ Timur';
        else badge.innerHTML = '❓ N/A';
    }

    function initDomHiding() {
        if (window.location.pathname.includes('/search/title')) return;

        const selectors = '.ipc-metadata-list-summary-item, .ipc-poster-card, .lister-item';

        // Jadikan global function agar bisa dipanggil dari tombol On-Demand
        window.triggerDomScan = () => {
            // LOGIC BARU: Langsung berhenti jika filternya "All"
            if (GM_getValue('activeRegion', 'all') === 'all') return;

            const cards = document.querySelectorAll(selectors);
            cards.forEach(card => {
                if (card.dataset.regionProcessed === "true") return;

                const link = card.querySelector('a[href*="/title/tt"]');
                if (!link) return;

                const match = link.getAttribute('href').match(/\/title\/(tt\d+)/);
                if (!match) return;

                const ttId = match[1];
                card.dataset.regionProcessed = "true";

                let initialBadge = document.createElement('div');
                initialBadge.className = 'region-badge';
                initialBadge.innerHTML = '⏳ Scan...';
                const imgContainer = card.querySelector('.ipc-poster, .ipc-media, .lister-item-image');
                if (imgContainer) {
                    imgContainer.style.position = 'relative';
                    imgContainer.appendChild(initialBadge);
                }

                const cachedCountries = CacheManager.get(ttId);
                if (cachedCountries) {
                    applyVisibility(card, cachedCountries);
                } else {
                    BackgroundScanner.add(ttId, card);
                }
            });
        };

        // Trigger inisial (Akan dibatalkan otomatis jika statenya "All")
        window.triggerDomScan();

        const observer = new MutationObserver(() => {
            // Jangan buang CPU untuk observer jika mode "All"
            if (GM_getValue('activeRegion', 'all') === 'all') return;

            clearTimeout(window.regionDebounce);
            window.regionDebounce = setTimeout(window.triggerDomScan, 400);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==========================================
    // 5. BOOTSTRAP PIPELINE
    // ==========================================
    function bootstrap() {
        injectToggleUI();
        applyUrlFilter(GM_getValue('activeRegion', 'all'));
        initDomHiding();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();
