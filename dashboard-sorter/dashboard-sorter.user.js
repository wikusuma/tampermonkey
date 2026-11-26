// ==UserScript==
// @name         Dashboard Sorter
// @namespace    https://github.com/wikusuma/tampermonkey
// @version      1.1.0
// @description  Menambahkan dropdown sort berdasarkan Name dan Sites pada halaman options.html Tampermonkey.
// @author       wikusuma
// @match        chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/dashboard-sorter/dashboard-sorter.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/dashboard-sorter/dashboard-sorter.user.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BAR_ID = 'tm-sorter-toolbar';
    const FIELD_ID = 'tm-sorter-field';
    const DIR_ID = 'tm-sorter-dir';
    const ORIG_IDX_ATTR = 'data-tm-orig-idx';

    GM_addStyle(`
        #${BAR_ID} {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 6px 10px;
            padding: 5px 10px;
            background: #23272e;
            color: #e6edf3;
            border: 1px solid #3d444d;
            border-radius: 6px;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            font-size: 12.5px;
            z-index: 99999;
        }
        #${BAR_ID} label {
            font-weight: 600;
            color: #9da7b3;
        }
        #${BAR_ID} select {
            background: #0d1117;
            color: #f0f6fc;
            border: 1px solid #484f58;
            border-radius: 4px;
            padding: 3px 8px;
            font-size: 12.5px;
            cursor: pointer;
        }
        #${BAR_ID} select:focus {
            outline: 2px solid #f5c518;
            outline-offset: 1px;
        }
    `);

    function findHeaderIndexMap(table) {
        const map = {};
        const headerCells = table ? table.querySelectorAll('thead th, [role="columnheader"]') : [];
        headerCells.forEach((th, idx) => {
            const label = (th.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (label.includes('name')) map.name = idx;
            if (label.includes('sites')) map.sites = idx;
        });
        return map;
    }

    function findScriptTable() {
        const tables = Array.from(document.querySelectorAll('table'));
        let best = null;

        for (const table of tables) {
            const tbody = table.tBodies[0] || table.querySelector('tbody') || table;
            const rows = Array.from(tbody.children).filter(
                (el) => el.nodeType === 1 && el.tagName === 'TR' && !el.closest('thead')
            );
            if (rows.length >= 2 && (!best || rows.length > best.rows.length)) {
                best = { table, container: tbody, rows, headers: findHeaderIndexMap(table) };
            }
        }
        return best;
    }

    function ensureOriginalOrder(rows) {
        rows.forEach((row, idx) => {
            if (!row.hasAttribute(ORIG_IDX_ATTR)) {
                row.setAttribute(ORIG_IDX_ATTR, String(idx));
            }
        });
    }

    function getCellText(row, colIndex, fallbackSelectorList) {
        if (typeof colIndex === 'number' && row.cells && row.cells[colIndex]) {
            const cell = row.cells[colIndex];
            const attrLabels = Array.from(cell.querySelectorAll('[title], [aria-label], img[alt]'))
                .map((el) => el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('alt') || '')
                .filter(Boolean);
            const rawText = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
            return [...attrLabels, rawText].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        }

        for (const sel of fallbackSelectorList) {
            const found = row.querySelector(sel);
            if (found) {
                return (found.innerText || found.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            }
        }
        return '';
    }

    function getSortValue(row, field, headers) {
        if (field === 'name') {
            return getCellText(row, headers.name, ['a[href]', '[class*="name" i]', 'td:nth-child(3)', 'td:nth-child(4)']);
        }
        if (field === 'sites') {
            return getCellText(row, headers.sites, ['[class*="site" i]', 'td:nth-child(6)', 'td:nth-child(5)']);
        }
        return '';
    }

    function applySort() {
        const fieldEl = document.getElementById(FIELD_ID);
        const dirEl = document.getElementById(DIR_ID);
        const target = findScriptTable();
        if (!fieldEl || !dirEl || !target) return;

        const { container, rows, headers } = target;
        ensureOriginalOrder(rows);

        const field = fieldEl.value;
        const dir = dirEl.value;
        const factor = dir === 'desc' ? -1 : 1;

        const sorted = [...rows].sort((a, b) => {
            if (field === 'default') {
                return Number(a.getAttribute(ORIG_IDX_ATTR)) - Number(b.getAttribute(ORIG_IDX_ATTR));
            }

            const valA = getSortValue(a, field, headers);
            const valB = getSortValue(b, field, headers);

            if (!valA && valB) return 1;
            if (valA && !valB) return -1;
            const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) return cmp * factor;

            return Number(a.getAttribute(ORIG_IDX_ATTR)) - Number(b.getAttribute(ORIG_IDX_ATTR));
        });

        sorted.forEach((row) => container.appendChild(row));
    }

    function mountToolbar() {
        if (document.getElementById(BAR_ID)) return;
        const target = findScriptTable();
        if (!target) return;

        ensureOriginalOrder(target.rows);

        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.innerHTML = `
            <label for="${FIELD_ID}">Sort:</label>
            <select id="${FIELD_ID}">
                <option value="default">Default</option>
                <option value="name">Name</option>
                <option value="sites">Sites</option>
            </select>
            <select id="${DIR_ID}" aria-label="Sort direction">
                <option value="asc">Asc (A–Z)</option>
                <option value="desc">Desc (Z–A)</option>
            </select>
        `;

        const tableParent = target.table.parentElement;
        if (tableParent) {
            tableParent.insertBefore(bar, target.table);
        } else {
            document.body.prepend(bar);
        }

        document.getElementById(FIELD_ID).addEventListener('change', applySort);
        document.getElementById(DIR_ID).addEventListener('change', applySort);
    }

    mountToolbar();

    const observer = new MutationObserver(() => {
        mountToolbar();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
