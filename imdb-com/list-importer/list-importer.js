// ==UserScript==
// @name            List Importer
// @namespace       List Importer
// @match           https://www.imdb.com/list/*
// @version         11.2
// @license         GNU General Public License v3.0 or later
// @description     Import batch titles/people into IMDb lists with CSRF handling and dynamic DOM injection
// @updateURL       https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb-com/list-importer/list-importer.js
// @downloadURL     https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb-com/list-importer/list-importer.js
// @grant           none
// ==/UserScript==

(function () {
  'use strict';

  // Validasi ID List (lsxxxxxxxxx)
  const listMatch = location.pathname.match(/\/list\/(ls\d+)/i);
  if (!listMatch) return;
  const listId = listMatch[1];

  const GRAPHQL_ENDPOINT = 'https://api.graphql.imdb.com/';

  // Mutasi GraphQL ringkas (menghindari payload bloat dan mismatch schema)
  const GQL_ADD_ITEM = `
    mutation AddConstToList($listId: ID!, $constId: ID!) {
      addItemToList(input: {listId: $listId, item: {itemElementId: $constId}}) {
        listId
        modifiedItem {
          itemId
        }
      }
    }
  `;

  const GQL_EDIT_DESC = `
    mutation EditListItemDescription($listId: ID!, $itemId: ID!, $itemDescription: String!) {
      editListItemDescription(
        input: {listId: $listId, itemId: $itemId, itemDescription: $itemDescription}
      ) {
        formattedItemDescription {
          originalText {
            plainText
          }
        }
      }
    }
  `;

  let isImporting = false;
  let abortController = null;

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }

  function parseCSVLine(line) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    values.push(cur.trim().replace(/^"|"$/g, ''));
    return values;
  }

  function parseInput(rawText, isUnique) {
    if (!rawText.trim()) return [];

    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const items = [];
    const seen = new Set();
    const idRegex = /(?:title\/|name\/)?((?:tt|nm)\d{7,8})/i;

    let isCSV = false;
    let idIdx = 0;
    let descIdx = -1;

    if (lines.length > 0) {
      const headerCols = lines[0].toLowerCase().split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const foundIdx = headerCols.findIndex(c => ['const', 'id', 'imdb id', 'imdbid', 'title_id'].includes(c));
      if (foundIdx !== -1) {
        isCSV = true;
        idIdx = foundIdx;
        descIdx = headerCols.findIndex(c => ['description', 'comment', 'notes', 'your_comments'].includes(c));
      }
    }

    if (isCSV) {
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row[idIdx]) {
          const match = row[idIdx].match(idRegex);
          if (match) {
            const constId = match[1].toLowerCase();
            const desc = (descIdx !== -1 && row[descIdx]) ? row[descIdx] : '';
            if (isUnique && seen.has(constId)) continue;
            seen.add(constId);
            items.push({ constId, description: desc });
          }
        }
      }
    } else {
      const globalRegex = /(?:title\/|name\/)?((?:tt|nm)\d{7,8})/gi;
      let match;
      while ((match = globalRegex.exec(rawText)) !== null) {
        const constId = match[1].toLowerCase();
        if (isUnique && seen.has(constId)) continue;
        seen.add(constId);
        items.push({ constId, description: '' });
      }
    }

    return items;
  }

  function getExistingListConstIds() {
    const existing = new Set();
    document.querySelectorAll('[data-item-element-id]').forEach(el => {
      const id = el.getAttribute('data-item-element-id');
      if (id) existing.add(id.toLowerCase());
    });
    // Fallback deteksi link judul di DOM
    document.querySelectorAll('a[href*="/title/tt"]').forEach(a => {
      const m = a.getAttribute('href').match(/(tt\d{7,8})/i);
      if (m) existing.add(m[1].toLowerCase());
    });
    return existing;
  }

  async function sendGQL(query, operationName, variables, signal, retryCount = 0) {
    try {
      const sessionId = getCookie('session-id');
      const headers = {
        'Accept': 'application/graphql+json, application/json',
        'Content-Type': 'application/json'
      };

      if (sessionId) {
        headers['x-amzn-sessionid'] = sessionId;
      }

      const res = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          query,
          operationName,
          variables
        }),
        signal
      });

      if (res.status === 429) {
        if (retryCount >= 4) throw new Error('Rate limit (429)');
        const delay = Math.pow(2, retryCount) * 2000;
        await new Promise(r => setTimeout(r, delay));
        return sendGQL(query, operationName, variables, signal, retryCount + 1);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0].message);
      }
      return json;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (retryCount < 2) {
        await new Promise(r => setTimeout(r, 1000));
        return sendGQL(query, operationName, variables, signal, retryCount + 1);
      }
      throw err;
    }
  }

  async function runImport(panel) {
    if (isImporting) return;

    const rawText = panel.querySelector('#cli-input-text').value;
    const isUnique = panel.querySelector('#cli-opt-unique').checked;
    const skipExisting = panel.querySelector('#cli-opt-skip-existing').checked;
    const isReverse = panel.querySelector('#cli-opt-reverse').checked;
    const concurrency = parseInt(panel.querySelector('#cli-concurrency').value, 10) || 1;

    let items = parseInput(rawText, isUnique);

    if (skipExisting) {
      const existing = getExistingListConstIds();
      items = items.filter(it => !existing.has(it.constId));
    }

    if (isReverse) items.reverse();

    if (items.length === 0) {
      alert('Tidak ada ID yang dapat diimpor atau semua ID sudah ada di daftar.');
      return;
    }

    const startBtn = panel.querySelector('#cli-btn-start');
    const cancelBtn = panel.querySelector('#cli-btn-cancel');
    const progWrapper = panel.querySelector('#cli-progress-wrapper');
    const progBar = panel.querySelector('#cli-progress-bar');
    const statusText = panel.querySelector('#cli-status-text');

    isImporting = true;
    abortController = new AbortController();
    const signal = abortController.signal;

    startBtn.style.display = 'none';
    cancelBtn.style.display = 'inline-block';
    progWrapper.style.display = 'block';

    let completed = 0;
    let failed = 0;

    async function worker(queue) {
      while (queue.length > 0) {
        if (signal.aborted) break;
        const target = queue.shift();
        try {
          const res = await sendGQL(GQL_ADD_ITEM, 'AddConstToList', {
            listId,
            constId: target.constId
          }, signal);

          const addedItemId = res.data?.addItemToList?.modifiedItem?.itemId;
          if (addedItemId && target.description) {
            await sendGQL(GQL_EDIT_DESC, 'EditListItemDescription', {
              listId,
              itemId: addedItemId,
              itemDescription: target.description
            }, signal);
          }
          completed++;
        } catch (err) {
          if (err.name === 'AbortError') break;
          console.error(`Gagal memproses ${target.constId}:`, err);
          failed++;
        }

        const pct = Math.round(((completed + failed) / items.length) * 100);
        progBar.style.width = `${pct}%`;
        statusText.textContent = `Progres: ${completed}/${items.length} (${failed} gagal) - [${target.constId}]`;

        await new Promise(r => setTimeout(r, 300));
      }
    }

    const queue = [...items];
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker(queue));
    }

    await Promise.all(workers);

    isImporting = false;
    startBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'none';

    if (signal.aborted) {
      statusText.textContent = `Proses dibatalkan. Selesai: ${completed}, Gagal: ${failed}.`;
    } else {
      statusText.textContent = `Selesai! Berhasil: ${completed}, Gagal: ${failed}. Memuat ulang list...`;
      setTimeout(() => location.reload(), 1500);
    }
  }

  function initUI(container) {
    if (document.getElementById('cli-importer-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'cli-importer-panel';
    panel.style.margin = '20px 0';
    panel.style.padding = '16px';
    panel.style.borderRadius = '8px';
    panel.style.backgroundColor = '#1f1f1f';
    panel.style.color = '#ffffff';
    panel.style.border = '1px solid #333';

    panel.innerHTML = `
      <div style="font-size: 15px; font-weight: bold; margin-bottom: 10px; color: #f5c518;">
        IMDb List Importer (lsId: ${listId})
      </div>

      <textarea id="cli-input-text" rows="4" placeholder="Tempel URL IMDb (tt1234567 / nm1234567), link, atau CSV..."
        style="width: 100%; box-sizing: border-box; background: #121212; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 13px;"></textarea>

      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 13px;">
        <label><input type="file" id="cli-file-input" style="display: none;"><button type="button" id="cli-file-btn" style="padding: 3px 8px; cursor: pointer;">Pilih File</button> <span id="cli-file-name" style="color: #888;">Belum ada file</span></label>
        <label><input type="checkbox" id="cli-opt-unique" checked> Abaikan Duplikat</label>
        <label><input type="checkbox" id="cli-opt-skip-existing" checked> Lewati yang Ada di List</label>
        <label><input type="checkbox" id="cli-opt-reverse"> Balik Urutan</label>
        <span>Concurrency:</span>
        <select id="cli-concurrency" style="background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 2px;">
          <option value="1" selected>1 (Aman)</option>
          <option value="2">2 (Cepat)</option>
        </select>
      </div>

      <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center;">
        <button id="cli-btn-start" style="background: #f5c518; color: #000; border: none; padding: 6px 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">Mulai Impor</button>
        <button id="cli-btn-cancel" style="background: #dc3545; color: #fff; border: none; padding: 6px 16px; font-weight: bold; border-radius: 4px; cursor: pointer; display: none;">Batal</button>
      </div>

      <div id="cli-progress-wrapper" style="margin-top: 10px; display: none;">
        <div style="background: #333; border-radius: 4px; height: 6px; width: 100%; overflow: hidden;">
          <div id="cli-progress-bar" style="background: #f5c518; width: 0%; height: 100%; transition: width 0.2s;"></div>
        </div>
        <div id="cli-status-text" style="font-size: 12px; margin-top: 6px; color: #aaa; font-family: monospace;">Menunggu...</div>
      </div>
    `;

    container.prepend(panel);

    const fileInput = panel.querySelector('#cli-file-input');
    const fileBtn = panel.querySelector('#cli-file-btn');
    const fileName = panel.querySelector('#cli-file-name');
    const textArea = panel.querySelector('#cli-input-text');
    const startBtn = panel.querySelector('#cli-btn-start');
    const cancelBtn = panel.querySelector('#cli-btn-cancel');

    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      fileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => { textArea.value = evt.target.result; };
      reader.readAsText(file);
    });

    startBtn.addEventListener('click', () => runImport(panel));
    cancelBtn.addEventListener('click', () => {
      if (abortController) abortController.abort();
    });
  }

  // Observer agar UI langsung muncul saat DOM list siap (mengatasi SPA React)
  const observer = new MutationObserver(() => {
    const target = document.querySelector('section.ipc-page-section--base') || document.querySelector('main');
    if (target && !document.getElementById('cli-importer-panel')) {
      initUI(target);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
