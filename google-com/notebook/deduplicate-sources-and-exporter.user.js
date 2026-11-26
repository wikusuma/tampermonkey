// ==UserScript==
// @name         Deduplicate Sources & Exporter
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Centang duplikat otomatis & sediakan runner script console F12 yang presisi
// @author       You
// @match        https://notebook.google.com/notebook/*
// @grant        GM_setClipboard
// @updateURL    https://github.com/wikusuma/tampermonkey/tree/main/google-com/notebook/deduplicate-sources-and-exporter.user.js
// @downloadURL  https://github.com/wikusuma/tampermonkey/tree/main/google-com/notebook/deduplicate-sources-and-exporter.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Runner script yang akan disalin langsung ke clipboard
    const RUNNER_SCRIPT = `
(async function deleteCheckedSources() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function triggerNativeClick(el) {
        if (!el) return;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
            el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
        });
    }

    // 1. Kumpulkan semua baris sumber yang aktif dicentang
    const checkboxes = Array.from(document.querySelectorAll('mat-checkbox, [role="checkbox"], input[type="checkbox"]'));
    const targetRows = [];

    checkboxes.forEach(cb => {
        const isChecked = cb.checked ||
                          cb.getAttribute('aria-checked') === 'true' ||
                          cb.classList.contains('mat-mdc-checkbox-checked');
        if (!isChecked) return;

        // Cari baris container terdekat
        const row = cb.closest('[role="listitem"]') || cb.closest('div[style*="display: flex"]') || cb.parentElement?.parentElement;
        const isSelectAll = row?.innerText.toLowerCase().includes('select all');

        if (row && !isSelectAll && !targetRows.includes(row)) {
            targetRows.push(row);
        }
    });

    console.log(\`%c[Deleter] Ditemukan \${targetRows.length} item tercentang. Memulai penghapusan...\`, 'color: #0b57d0; font-weight: bold;');
    if (targetRows.length === 0) {
        console.warn('[Deleter] Tidak ada sumber yang tercentang.');
        return;
    }

    for (let i = 0; i < targetRows.length; i++) {
        const row = targetRows[i];
        console.log(\`[Deleter] (\${i + 1}/\${targetRows.length}) Menghapus sumber...\`);

        // Gulir ke elemen & munculkan tombol menu titik tiga
        row.scrollIntoView({ block: 'nearest' });
        row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(200);

        // 2. Ambil tombol titik tiga (more_vert)
        let menuBtn = Array.from(row.querySelectorAll('button, [role="button"], mat-icon, span'))
            .find(el => el.innerText?.trim() === 'more_vert' ||
                        el.getAttribute('aria-label')?.toLowerCase().includes('more') ||
                        el.getAttribute('data-icon') === 'more_vert');

        if (menuBtn && menuBtn.tagName !== 'BUTTON') {
            menuBtn = menuBtn.closest('button') || menuBtn;
        }

        if (menuBtn) {
            triggerNativeClick(menuBtn);
            await sleep(350);

            // 3. Cari tombol "Remove source" pada popover yang muncul
            const menuOptions = Array.from(document.querySelectorAll('.cdk-overlay-container [role="menuitem"], .cdk-overlay-container button, mat-menu-item, [role="menuitem"]'));
            const removeBtn = menuOptions.find(el => {
                const txt = el.innerText?.toLowerCase().replace(/\\s+/g, ' ').trim() || '';
                return txt.includes('remove source') || txt.includes('remove');
            });

            if (removeBtn) {
                triggerNativeClick(removeBtn);
                await sleep(300);

                // 4. Konfirmasi dialog modal jika ada konfirmasi penghapusan
                const dialogConfirmBtn = Array.from(document.querySelectorAll('mat-dialog-container button, [role="dialog"] button'))
                    .find(b => {
                        const txt = b.innerText?.toLowerCase().trim() || '';
                        return txt.includes('remove') || txt.includes('delete') || txt.includes('confirm');
                    });

                if (dialogConfirmBtn) {
                    triggerNativeClick(dialogConfirmBtn);
                    await sleep(250);
                }
            } else {
                document.body.click(); // Tutup dropdown jika tidak ketemu tombol Remove
            }
        }
        await sleep(300);
    }

    console.log('%c[Deleter] Proses selesai!', 'color: #34a853; font-weight: bold;');
})();
    `.trim();

    function createUI() {
        if (document.getElementById('nb-dedup-container')) return;

        const container = document.createElement('div');
        container.id = 'nb-dedup-container';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 99999;
            display: flex;
            gap: 8px;
            background: #1e1f20;
            padding: 8px 12px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            border: 1px solid #444746;
            font-family: sans-serif;
            font-size: 13px;
        `;

        // Tombol 1: Centang Duplikat
        const btnSelect = document.createElement('button');
        btnSelect.innerText = 'Centang Duplikat';
        btnSelect.style.cssText = `
            background: #0b57d0;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
        `;
        btnSelect.onclick = processDuplicates;

        // Tombol 2: Copy Runner Script F12
        const btnCopy = document.createElement('button');
        btnCopy.innerText = '📋 Copy Script F12';
        btnCopy.style.cssText = `
            background: #2e7d32;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
        `;
        btnCopy.onclick = () => {
            if (typeof GM_setClipboard !== 'undefined') {
                GM_setClipboard(RUNNER_SCRIPT);
            } else {
                navigator.clipboard.writeText(RUNNER_SCRIPT);
            }
            btnCopy.innerText = '✅ Tersalin!';
            setTimeout(() => { btnCopy.innerText = '📋 Copy Script F12'; }, 2000);
        };

        // Tombol 3: Reset Pilihan
        const btnClear = document.createElement('button');
        btnClear.innerText = 'Reset Pilihan';
        btnClear.style.cssText = `
            background: transparent;
            color: #c4c7c5;
            border: 1px solid #444746;
            padding: 6px 10px;
            border-radius: 6px;
            cursor: pointer;
        `;
        btnClear.onclick = deselectAll;

        container.appendChild(btnSelect);
        container.appendChild(btnCopy);
        container.appendChild(btnClear);
        document.body.appendChild(container);
    }

    function getSourceRows() {
        const checkboxes = Array.from(document.querySelectorAll('mat-checkbox, [role="checkbox"], input[type="checkbox"]'));
        const rows = [];
        checkboxes.forEach(cb => {
            const labelText = cb.closest('label, div')?.innerText || '';
            if (labelText.toLowerCase().includes('select all')) return;

            const row = cb.closest('[role="listitem"]') || cb.closest('div[style*="display: flex"]') || cb.parentElement?.parentElement;
            if (row && !rows.some(r => r.rowElement === row)) {
                rows.push({ rowElement: row, checkboxElement: cb });
            }
        });
        return rows;
    }

    function extractTitle(rowEl) {
        const textElements = Array.from(rowEl.querySelectorAll('*'))
            .filter(el => el.children.length === 0 && el.innerText && el.innerText.trim().length > 3)
            .map(el => el.innerText.trim())
            .filter(txt => !['video_youtube', 'check_box', 'check_box_outline_blank', 'arrow_drop_down', 'more_vert', 'info'].includes(txt));

        if (textElements.length > 0) {
            return textElements.reduce((a, b) => (a.length > b.length ? a : b));
        }
        const titledEl = rowEl.querySelector('[title], [aria-label]');
        return titledEl ? (titledEl.getAttribute('title') || titledEl.getAttribute('aria-label') || '') : '';
    }

    function isRowChecked(cb) {
        return cb.checked ||
               cb.getAttribute('aria-checked') === 'true' ||
               cb.classList.contains('mat-mdc-checkbox-checked');
    }

    function processDuplicates() {
        deselectAll();

        const sourceItems = getSourceRows();
        if (sourceItems.length === 0) {
            alert('Tidak ditemukan item sumber.');
            return;
        }

        const seenTitles = new Map();
        let duplicateCount = 0;

        sourceItems.forEach(({ rowElement, checkboxElement }, index) => {
            const rawTitle = extractTitle(rowElement);
            const cleanTitle = rawTitle.toLowerCase().replace(/\s+/g, ' ').trim();

            if (!cleanTitle || cleanTitle.includes('chats from gemini') || cleanTitle.length < 3) return;

            if (seenTitles.has(cleanTitle)) {
                duplicateCount++;
                rowElement.style.outline = '2px solid #ea4335';
                rowElement.style.backgroundColor = 'rgba(234, 67, 53, 0.12)';

                if (!isRowChecked(checkboxElement)) {
                    checkboxElement.click();
                }
            } else {
                seenTitles.set(cleanTitle, index);
            }
        });

        alert(duplicateCount === 0
            ? 'Tidak ditemukan judul duplikat.'
            : `Ditemukan ${duplicateCount} item duplikat dan sudah dicentang. Klik "Copy Script F12" untuk menghapusnya lewat Console.`);
    }

    function deselectAll() {
        getSourceRows().forEach(({ rowElement, checkboxElement }) => {
            rowElement.style.outline = '';
            rowElement.style.backgroundColor = '';
            if (isRowChecked(checkboxElement)) {
                checkboxElement.click();
            }
        });
    }

    setTimeout(createUI, 1500);
})();
