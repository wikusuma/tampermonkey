// ==UserScript==
// @name         IMDb Search Result Exporter for List Importer (Optimized)
// @namespace    Willy_imdb_search_exporter
// @version      1.1
// @description  Ekspor hasil IMDb Search ke CSV tanpa lag / freeze
// @author       Willy
// @match        https://www.imdb.com/search/title/*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb-com/search-result-exporter-for-list-importer/search-result-exporter-for-list-importer.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb-com/search-result-exporter-for-list-importer/search-result-exporter-for-list-importer.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CHECKBOX_CLASS = 'imdb-export-select-cb';
  let observer = null;
  let debounceTimer = null;
  let isMutating = false;

  function injectFloatingBar() {
    if (document.getElementById('imdb-exporter-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'imdb-exporter-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      background: #1f1f1f;
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: sans-serif;
      font-size: 13px;
      border: 1px solid #333;
    `;

    panel.innerHTML = `
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="imdb-cb-toggle-all" checked style="accent-color: #f5c518; cursor: pointer; width: 16px; height: 16px;">
        <span style="font-weight: 500;">Pilih Semua</span>
      </label>
      <span style="color: #666;">|</span>
      <span id="imdb-selected-count" style="font-weight: 600; color: #f5c518;">0 terpilih</span>
      <button id="imdb-btn-export-csv" style="
        background: #f5c518;
        color: #000;
        border: none;
        padding: 6px 12px;
        font-weight: bold;
        border-radius: 4px;
        cursor: pointer;
      ">
        ⬇ Export CSV
      </button>
    `;

    document.body.appendChild(panel);

    const toggleAll = panel.querySelector('#imdb-cb-toggle-all');
    toggleAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}`);
      checkboxes.forEach(cb => { cb.checked = e.target.checked; });
      updateCounter();
    });

    panel.querySelector('#imdb-btn-export-csv').addEventListener('click', exportToCSV);
  }

  function updateCounter() {
    const totalSelected = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`).length;
    const countLabel = document.getElementById('imdb-selected-count');
    if (countLabel) {
      countLabel.textContent = `${totalSelected} terpilih`;
    }
  }

  function injectCheckboxes() {
    const listItems = document.querySelectorAll('li.ipc-metadata-list-summary-item, div.ipc-metadata-list-summary-item');
    if (listItems.length === 0) return;

    isMutating = true;

    listItems.forEach(item => {
      if (item.hasAttribute('data-imdb-exporter-ready')) return;

      const titleLink = item.querySelector('a[href*="/title/tt"]');
      if (!titleLink) return;

      const match = titleLink.href.match(/(tt\d{7,8})/i);
      if (!match) return;

      const constId = match[1];
      item.setAttribute('data-imdb-exporter-ready', 'true');
      item.setAttribute('data-const-id', constId);

      const cbWrapper = document.createElement('div');
      cbWrapper.style.cssText = 'display: inline-flex; align-items: center; margin-right: 8px; z-index: 5;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = CHECKBOX_CLASS;
      checkbox.checked = true;
      checkbox.dataset.constId = constId;
      checkbox.style.cssText = 'width: 17px; height: 17px; cursor: pointer; accent-color: #f5c518;';
      checkbox.addEventListener('change', updateCounter);

      cbWrapper.appendChild(checkbox);

      const headerTarget = item.querySelector('.ipc-title, h3') || item.firstElementChild;
      if (headerTarget) {
        headerTarget.prepend(cbWrapper);
      }
    });

    isMutating = false;
    updateCounter();
  }

  function cleanCSVField(text) {
    if (!text) return '""';
    return `"${text.replace(/"/g, '""').trim()}"`;
  }

  function exportToCSV() {
    const checkedBoxes = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`);
    if (checkedBoxes.length === 0) {
      alert('Tidak ada judul yang dipilih.');
      return;
    }

    const csvRows = ['"Const","Title","Description"'];

    checkedBoxes.forEach(cb => {
      const itemCard = cb.closest('li.ipc-metadata-list-summary-item, div.ipc-metadata-list-summary-item') || cb.parentElement;
      const constId = cb.dataset.constId;

      let title = '';
      if (itemCard) {
        const titleEl = itemCard.querySelector('.ipc-title__text, h3');
        if (titleEl) {
          title = titleEl.textContent.replace(/^\d+\.\s*/, '').trim();
        }
      }

      csvRows.push(`${cleanCSVField(constId)},${cleanCSVField(title)},""`);
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imdb_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function setupObserver() {
    const targetNode = document.querySelector('section[data-testid="chart-layout-parent"]') || document.body;

    observer = new MutationObserver(() => {
      if (isMutating) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectCheckboxes, 300);
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    injectFloatingBar();
    injectCheckboxes();
    setupObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
