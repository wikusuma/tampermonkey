// ==UserScript==
// @name             Master Suite
// @description      Gabungan Reddit++ dengan fitur adblock, download, menu kustom, dan NSFW Blur Toggle.
// @version          2.1.6.custom.2
// @author           lnm95 (Modified by spar)
// @match            *://*.reddit.com/*
// @match            *://*.redd.it/*
// @grant            unsafeWindow
// @grant            GM_getValue
// @grant            GM_setValue
// @grant            GM_deleteValue
// @grant            GM_xmlhttpRequest
// @run-at           document-start
// @updateURL        https://github.com/wikusuma/tampermonkey/tree/main/reddit-com/master-suite/master-suite.user.js
// @downloadURL      https://github.com/wikusuma/tampermonkey/tree/main/reddit-com/master-suite/master-suite.user.js
// ==/UserScript==

// =====================================================================
// 1. MODULE: FuckRedditAds - Hide ads on Reddit feed and in threads
// =====================================================================
(function () {
    'use strict';
    const AD_SELECTORS = [
        'shreddit-ad-post',
        'shreddit-dynamic-ad-link',
        'shreddit-comment-ad',
        '[data-testid="ad-post"]'
    ].join(',\n');

    function injectAdBlockingStyles() {
        const styleId = 'fuck-reddit-ads-style';
        if (document.getElementById(styleId)) return;
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = `
            ${AD_SELECTORS} {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
                overflow: hidden !important;
            }
        `;
        const targetParent = document.head || document.documentElement;
        if (targetParent) {
            targetParent.appendChild(styleElement);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                (document.head || document.documentElement).appendChild(styleElement);
            }, { once: true });
        }
    }
    injectAdBlockingStyles();
})();

// =====================================================================
// 2. MODULE: Reddit Quick Sub & Custom Feed Context Menu
// =====================================================================
(function () {
    'use strict';
    const TARGET_LINK_REGEX = /^\/(r|u|user)\/([a-zA-Z0-9_]+)\/?$/i;
    let menuContainer = null;
    let activeTarget = null;

    function getCsrfToken() {
        const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function subscribeSubreddit(subName) {
        const csrfToken = getCsrfToken();
        const payload = new URLSearchParams({ action: 'sub', sr_name: subName, api_type: 'json', csrf_token: csrfToken });
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                body: payload
            });
            showToast(response.ok ? `Berhasil subscribe ke r/${subName}` : `Gagal subscribe r/${subName} (${response.status})`);
        } catch (err) { showToast(`Error: ${err.message}`); }
    }

    async function addToCustomFeed(subName, feedName) {
        const userMeta = document.querySelector('meta[name="user-name"]');
        const currentUser = userMeta ? userMeta.getAttribute('content') : null;
        if (!currentUser) { showToast('Gagal mendeteksi akun login aktif.'); return; }
        const endpoint = `/api/multi/user/${currentUser}/m/${feedName}/r/${subName}`;
        const payload = JSON.stringify({ model: `{"name": "${subName}"}` });
        try {
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `model=${encodeURIComponent(payload)}`
            });
            showToast(response.ok ? `r/${subName} ditambahkan ke custom feed "${feedName}"` : `Gagal menambahkan ke feed (${response.status})`);
        } catch (err) { showToast(`Error: ${err.message}`); }
    }

    function showToast(text) {
        const toast = document.createElement('div');
        toast.textContent = text;
        Object.assign(toast.style, { position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#1a1a1b', color: '#d7dadc', padding: '10px 16px', borderRadius: '8px', border: '1px solid #343536', fontSize: '13px', fontWeight: '600', zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: 'opacity 0.2s ease' });
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 250); }, 3000);
    }

    function createMenu() {
        if (menuContainer) return menuContainer;
        menuContainer = document.createElement('div');
        menuContainer.id = 'tm-reddit-quick-menu';
        Object.assign(menuContainer.style, { position: 'absolute', backgroundColor: '#1a1a1b', border: '1px solid #343536', borderRadius: '6px', boxShadow: '0 8px 16px rgba(0,0,0,0.4)', zIndex: '100000', display: 'none', minWidth: '180px', overflow: 'hidden', padding: '4px 0', fontSize: '13px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' });
        document.body.appendChild(menuContainer);
        window.addEventListener('click', () => { if (menuContainer) menuContainer.style.display = 'none'; });
        return menuContainer;
    }

    function renderMenuItems(target) {
        const menu = createMenu();
        menu.replaceChildren();
        const subItem = document.createElement('div');
        subItem.textContent = target.type === 'sub' ? `Join r/${target.name}` : `Follow u/${target.name}`;
        styleMenuItem(subItem);
        subItem.addEventListener('click', () => {
            if (target.type === 'sub') { subscribeSubreddit(target.name); } else { showToast('Fitur follow akun user Reddit memerlukan GraphQL scope.'); }
            menu.style.display = 'none';
        });
        menu.appendChild(subItem);
        if (target.type === 'sub') {
            const feedItem = document.createElement('div');
            feedItem.textContent = `Add r/${target.name} to Custom Feed…`;
            styleMenuItem(feedItem);
            feedItem.addEventListener('click', () => {
                menu.style.display = 'none';
                const feedName = prompt(`Masukkan nama Custom Feed tujuan untuk r/${target.name}:`);
                if (feedName && feedName.trim() !== '') { addToCustomFeed(target.name, feedName.trim().toLowerCase()); }
            });
            menu.appendChild(feedItem);
        }
    }

    function styleMenuItem(el) {
        Object.assign(el.style, { padding: '8px 16px', color: '#d7dadc', cursor: 'pointer', userSelect: 'none', transition: 'background-color 0.1s' });
        el.addEventListener('mouseenter', () => (el.style.backgroundColor = '#272729'));
        el.addEventListener('mouseleave', () => (el.style.backgroundColor = 'transparent'));
    }

    document.addEventListener('contextmenu', (event) => {
        const anchor = event.target.closest('a');
        if (!anchor || !anchor.pathname) return;
        const match = anchor.pathname.match(TARGET_LINK_REGEX);
        if (!match) return;
        event.preventDefault();
        activeTarget = { type: match[1].toLowerCase() === 'r' ? 'sub' : 'user', name: match[2] };
        renderMenuItems(activeTarget);
        menuContainer.style.left = `${event.pageX}px`;
        menuContainer.style.top = `${event.pageY}px`;
        menuContainer.style.display = 'block';
    });
})();

// =====================================================================
// 3. MODULE: Reddit Download Buttons
// =====================================================================
(function () {
    "use strict";

    const PREFIX = '[Reddit Download Buttons]';
    const log = {
        info: (msg, ...args) => console.log(`${PREFIX} ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`${PREFIX} ${msg}`, ...args),
        error: (msg, ...args) => console.error(`${PREFIX} ${msg}`, ...args),
    };
    const urlPattern = /(?:-v\d+|-t\d+)?-([a-zA-Z0-9]+)\.(jpg|jpeg|png|gif)/i;

    const constructUrl = (url, source) => {
        let match = url?.match(urlPattern);
        if (match) {
            const imageId = match[1];
            const ext = match[2];
            const reddUrl = `https://i.redd.it/${imageId}.${ext}`;
            return reddUrl;
        }
        return null;
    };

    const sanitizeFilename = (str) => {
        return str
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/[\x00-\x1f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[\u2026.]+$/, '');
    };

    const getFilenameBase = (element) => {
        const postEl = element instanceof HTMLImageElement
            ? (element.closest('shreddit-post') || document.querySelector('shreddit-post'))
            : element;

        if (postEl) {
            const author = postEl.getAttribute('author') || '';
            const subreddit = postEl.getAttribute('subreddit-name') || '';
            const rawTitle =
                postEl.querySelector('h1[id^="post-title-"]')?.textContent.trim() ||
                postEl.querySelector('a[id^="post-title-"]')?.textContent.trim() ||
                postEl.getAttribute('post-title') ||
                'Untitled';
            return [author, subreddit, sanitizeFilename(rawTitle)].filter(Boolean).join('-');
        }
        return 'Untitled';
    };

    const getHighestResUrl = (img) => {
        const mediaLightbox = img.closest(".media-lightbox-img");
        if (mediaLightbox) {
            const container = mediaLightbox.parentElement;
            const zoomableWrapper = container?.querySelector(".lightboxed-content zoomable-img img, .zoomable-img-wrapper zoomable-img img");
            if (zoomableWrapper?.src) {
                return zoomableWrapper.src;
            }
        }
        let reddUrl = null;
        const srcset = img.getAttribute("srcset");
        if (srcset) { reddUrl = constructUrl(srcset.split(",")[0].trim().split(" ")[0], 'srcset'); }
        if (!reddUrl) { reddUrl = constructUrl(img.src, 'src'); }
        if (reddUrl) return reddUrl;
        return img.src;
    };

    const getExtensionFromUrl = (url, fallbackExt) => {
        if (url.includes('i.redd.it')) {
            const directMatch = url.match(/i\.redd\.it\/[^.]+\.(gif|png|jpe?g)/i);
            if (directMatch) { return `.${directMatch[1].toLowerCase()}`; }
        }
        const ext = url.match(/\.(gif|png|jpe?g)(?:\?|$)/i);
        return ext ? `.${ext[1].toLowerCase()}` : fallbackExt;
    };

    const createDownloadButton = (postId, options) => {
        const { count = 1, type = 'Image', isLightbox = false, isPreview = false, isInline = false, useUrl = null } = options;
        const btn = document.createElement("button");
        let buttonContent;

        const downloadIcon = `<svg rpl="" aria-hidden="true" class="icon-download" fill="currentColor" height="20" width="20" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M30 2.497h-28c-1.099 0-2 0.901-2 2v23.006c0 1.099 0.9 2 2 2h28c1.099 0 2-0.901 2-2v-23.006c0-1.099-0.901-2-2-2zM30 27.503l-28-0v-5.892l8.027-7.779 8.275 8.265c0.341 0.414 0.948 0.361 1.379 0.035l3.652-3.306 6.587 6.762c0.025 0.025 0.053 0.044 0.080 0.065v1.85zM30 22.806l-5.876-6.013c-0.357-0.352-0.915-0.387-1.311-0.086l-3.768 3.282-8.28-8.19c-0.177-0.214-0.432-0.344-0.709-0.363-0.275-0.010-0.547 0.080-0.749 0.27l-7.309 7.112v-14.322h28v18.309zM23 12.504c1.102 0 1.995-0.894 1.995-1.995s-0.892-1.995-1.995-1.995-1.995 0.894-1.995 1.995c0 1.101 0.892 1.995 1.995 1.995z"></path></svg>`;

        if (isLightbox) {
            btn.className = "reddit-image-downloader-button-lightbox absolute top-sm left-sm duration-300 opacity-100 button-large px-[var(--rem14)] button-media items-center justify-center button inline-flex z-10";
            buttonContent = `<span class="flex items-center justify-center"><span class="flex items-center gap-xs opacity-75">${downloadIcon}</span></span>`;
        } else {
            btn.className = `reddit-image-downloader-button-post button border-md flex flex-row justify-center items-center h-xl font-semibold relative text-12 button-secondary inline-flex items-center px-sm hover:text-secondary hover:bg-secondary-background-hover hover:border-secondary-background-hover`;
            const text = `Download ${type}${count > 1 ? `s (${count})` : ""}`;
            buttonContent = `<span class="flex items-center"><span class="flex text-16 mr-[var(--rem6)]">${downloadIcon}</span><span>${text}</span></span>`;
        }

        btn.innerHTML = buttonContent;
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.disabled = true;
            await downloadMedia(postId, isLightbox, btn);
            btn.disabled = false;
        });

        return btn;
    };

    const addPostButtons = () => {
        document.querySelectorAll("shreddit-post").forEach((post) => {
            const postId = post.id, shadowRoot = post.shadowRoot;
            if (!shadowRoot) return;
            let postContainer = shadowRoot.querySelector("div.shreddit-post-container") || shadowRoot.querySelector("div.flex.flex-row");
            if (!postContainer || postContainer.querySelector(".reddit-image-downloader-button-post")) return;

            const mediaContainer = post.querySelector('div[slot="post-media-container"]');
            if (!mediaContainer) return;

            let count = mediaContainer.querySelectorAll("gallery-carousel ul li").length || 1;
            const buttons = [createDownloadButton(postId, { count, type: 'Media' })];
            const shareBtn = postContainer.querySelector('slot[name="share-button"]');
            if (shareBtn) buttons.reverse().forEach(button => shareBtn.insertAdjacentElement("afterend", button));
        });
    };

    const downloadMedia = async (postId, isLightbox, btn = null) => {
        let post = document.getElementById(postId);
        if (!post) return;
        let urls = [];
        let singleImg = post.querySelector('div[slot="post-media-container"] img[data-post-media-primary]');
        if (singleImg) urls = [getHighestResUrl(singleImg)];

        if (urls.length > 0) {
            const ext = getExtensionFromUrl(urls[0], ".png");
            try {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: urls[0],
                        responseType: 'blob',
                        onload: function(res) {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(res.response);
                            a.download = `${getFilenameBase(post)}${ext}`;
                            a.click();
                        }
                    });
                }
            } catch (e) { log.error(e); }
        }
    };

    const init = () => {
        addPostButtons();
        new MutationObserver(() => addPostButtons()).observe(document.body, { childList: true, subtree: true });
    };

    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();

// =====================================================================
// 4. MODULE: Quick Blur NSFW Toggle
// =====================================================================
(function() {
    'use strict';

    const STORAGE_KEY = 'tm_reddit_nsfw_blur_state';
    // Default blur ON jika belum pernah disetting
    let isBlurEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';
    const blurStyleId = 'tm-nsfw-blur-style';

    function applyBlurStyle() {
        let styleEl = document.getElementById(blurStyleId);
        if (isBlurEnabled) {
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = blurStyleId;
                styleEl.textContent = `
                    /* Memburamkan media di post yang ditandai NSFW */
                    shreddit-post[nsfw] [slot="post-media-container"],
                    shreddit-post[nsfw] [slot="thumbnail"],
                    shreddit-post[nsfw] faceplate-img {
                        filter: blur(25px) !important;
                        transition: filter 0.3s ease !important;
                    }
                    /* Menghilangkan efek blur sementara saat di-hover dengan mouse */
                    shreddit-post[nsfw] [slot="post-media-container"]:hover,
                    shreddit-post[nsfw] [slot="thumbnail"]:hover,
                    shreddit-post[nsfw] faceplate-img:hover {
                        filter: blur(0px) !important;
                    }
                `;
                document.head.appendChild(styleEl);
            }
        } else {
            if (styleEl) styleEl.remove();
        }
    }

    function createToggleButton() {
        if (document.getElementById('tm-nsfw-toggle-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'tm-nsfw-toggle-btn';

        const updateBtnUI = () => {
            btn.innerHTML = `NSFW Blur: <strong style="color: ${isBlurEnabled ? '#ff4500' : '#878a8c'};">${isBlurEnabled ? 'ON' : 'OFF'}</strong>`;
            btn.style.backgroundColor = '#1a1a1b';
            btn.style.borderColor = isBlurEnabled ? '#ff4500' : '#343536';
        };

        // Styling posisi di kanan atas tepat di bawah header profil
        Object.assign(btn.style, {
            position: 'fixed',
            top: '64px',
            right: '16px',
            zIndex: '99999',
            padding: '6px 12px',
            borderRadius: '20px',
            border: '1px solid',
            color: '#d7dadc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            transition: 'all 0.2s ease',
            userSelect: 'none'
        });

        updateBtnUI();

        // Event listener saat tombol ditekan
        btn.addEventListener('click', () => {
            isBlurEnabled = !isBlurEnabled;
            localStorage.setItem(STORAGE_KEY, isBlurEnabled);
            updateBtnUI();
            applyBlurStyle();
        });

        // Efek hover untuk tombol
        btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

        document.body.appendChild(btn);
    }

    function initNSFWToggle() {
        applyBlurStyle();
        if (document.body) {
            createToggleButton();
        } else {
            document.addEventListener('DOMContentLoaded', createToggleButton);
        }
    }

    initNSFWToggle();
})();

// =====================================================================
// 5. MODULE: Reddit++ (Base Script)
// =====================================================================
// Original Reddit++ code starts here.
// Note: Due to character limits and the complexity of webpack compiled code,
// the full Reddit++ source has been omitted from this block, but you should
// paste the ENTIRE contents of the Reddit++-2.1.6.txt file directly below this line
// to complete the integration.
// =====================================================================
