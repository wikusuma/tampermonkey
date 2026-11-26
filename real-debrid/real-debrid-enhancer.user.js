// ==UserScript==
// @name         Real-Debrid Enhancer
// @namespace    local.tampermonkey
// @version      1.2
// @description  Aman tanpa dependency luar. Hanya aktif di /torrents dan /downloader. Multi-select via checkbox, copy link batch, debrid batch, dan bulk delete terpilih.
// @author       Custom Hardened
// @match        https://real-debrid.com/torrents*
// @match        https://real-debrid.com/downloader*
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/real-debrid-enhancer/real-debrid-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/real-debrid-enhancer/real-debrid-enhancer.user.js
// @run-at       document-end
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;

    /* -------------------------------------------------------------
     * GAYA TAMPILAN (LOKAL CSS SAJA, TANPA LOAD FONT EKSTERNAL)
     * ----------------------------------------------------------- */
    GM_addStyle(`
        .tr.g1, .tr.g2 {
            transition: background-color 0.15s ease-in-out !important;
        }
        .tr.g1.rd-selected, .tr.g2.rd-selected,
        .tr.g1.rd-selected + tr, .tr.g2.rd-selected + tr {
            background-color: rgba(40, 167, 69, 0.15) !important;
        }
        .rd-checkbox {
            cursor: pointer;
            width: 16px;
            height: 16px;
            margin-right: 8px;
            vertical-align: middle;
        }
        #rdFloatingPanel {
            position: fixed;
            bottom: 25px;
            right: 25px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 99999;
        }
        .rd-btn {
            padding: 10px 16px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 3px 6px rgba(0,0,0,0.2);
            text-transform: uppercase;
            transition: opacity 0.2s, transform 0.1s;
        }
        .rd-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .rd-btn:active { transform: translateY(1px); }
        .rd-btn-copy { background-color: #28a745; color: #fff; }
        .rd-btn-debrid { background-color: #007bff; color: #fff; }
        .rd-btn-del { background-color: #dc3545; color: #fff; }
        .rd-ctrl-container {
            display: flex;
            gap: 8px;
            margin: 10px 0;
            align-items: center;
        }
        .rd-ctrl-btn {
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #f8f9fa;
            cursor: pointer;
        }
        .rd-ctrl-btn:hover { background: #e2e6ea; }
        #rdExtractBtn {
            margin-top: 6px;
            padding: 6px 12px;
            background: #007bff;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
        }
    `);

    /* -------------------------------------------------------------
     * FITUR UNTUK HALAMAN /torrents
     * ----------------------------------------------------------- */
    if (currentUrl.includes('/torrents')) {
        let copyBtn, debridBtn, deleteBtn;

        function initTorrentsPage() {
            createControlButtons();
            createFloatingActions();
            bindRowCheckboxes();
            observeDomMutations();
        }

        function createControlButtons() {
            const wrapper = document.querySelector('div.full_width_wrapper form');
            if (!wrapper || document.getElementById('rdSelectionControls')) return;

            const container = document.createElement('div');
            container.id = 'rdSelectionControls';
            container.className = 'rd-ctrl-container';

            const btnAll = document.createElement('button');
            btnAll.type = 'button';
            btnAll.className = 'rd-ctrl-btn';
            btnAll.textContent = 'Pilih Semua';
            btnAll.onclick = () => toggleAllCheckboxes(true);

            const btnNone = document.createElement('button');
            btnNone.type = 'button';
            btnNone.className = 'rd-ctrl-btn';
            btnNone.textContent = 'Batalkan Semua';
            btnNone.onclick = () => toggleAllCheckboxes(false);

            container.appendChild(btnAll);
            container.appendChild(btnNone);
            wrapper.parentNode.insertBefore(container, wrapper);
        }

        function createFloatingActions() {
            if (document.getElementById('rdFloatingPanel')) return;

            const panel = document.createElement('div');
            panel.id = 'rdFloatingPanel';

            debridBtn = document.createElement('button');
            debridBtn.className = 'rd-btn rd-btn-debrid';
            debridBtn.style.display = 'none';
            debridBtn.onclick = handleBatchDebrid;

            copyBtn = document.createElement('button');
            copyBtn.className = 'rd-btn rd-btn-copy';
            copyBtn.style.display = 'none';
            copyBtn.onclick = handleBatchCopy;

            deleteBtn = document.createElement('button');
            deleteBtn.className = 'rd-btn rd-btn-del';
            deleteBtn.style.display = 'none';
            deleteBtn.onclick = handleBatchDelete;

            panel.appendChild(debridBtn);
            panel.appendChild(copyBtn);
            panel.appendChild(deleteBtn);
            document.body.appendChild(panel);
        }

        function bindRowCheckboxes() {
            const rows = document.querySelectorAll('.tr.g1, .tr.g2');
            rows.forEach(row => {
                if (row.hasAttribute('data-rd-bound')) return;
                row.setAttribute('data-rd-bound', 'true');

                // Sisipkan checkbox di awal kolom pertama baris
                const firstCol = row.querySelector('.tr td') || row.firstElementChild;
                if (firstCol && !firstCol.querySelector('.rd-checkbox')) {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'rd-checkbox';
                    // Default tercentang (checked) sesuai permintaan
                    checkbox.checked = true;
                    row.classList.add('rd-selected');

                    checkbox.addEventListener('click', (e) => {
                        e.stopPropagation(); // Mencegah bentrok dengan event lain
                    });

                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            row.classList.add('rd-selected');
                            highlightNextRow(row, true);
                        } else {
                            row.classList.remove('rd-selected');
                            highlightNextRow(row, false);
                        }
                        updateFloatingState();
                    });

                    firstCol.prepend(checkbox);
                }

                // Klik pada baris juga dapat mencentang/menghapus centang checkbox
                row.addEventListener('click', (e) => {
                    // Jangan trigger jika klik langsung pada link asli bawaan
                    if (e.target.tagName === 'A') return;

                    const checkbox = row.querySelector('.rd-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });
            });
            updateFloatingState();
        }

        function highlightNextRow(row, state) {
            const nextRow = row.nextElementSibling;
            if (nextRow && !nextRow.classList.contains('g1') && !nextRow.classList.contains('g2')) {
                if (state) nextRow.classList.add('rd-selected');
                else nextRow.classList.remove('rd-selected');
            }
        }

        function toggleAllCheckboxes(status) {
            const rows = document.querySelectorAll('.tr.g1, .tr.g2');
            rows.forEach(row => {
                const checkbox = row.querySelector('.rd-checkbox');
                if (!checkbox) return;

                checkbox.checked = status;
                if (status) {
                    row.classList.add('rd-selected');
                    highlightNextRow(row, true);
                } else {
                    row.classList.remove('rd-selected');
                    highlightNextRow(row, false);
                }
            });
            updateFloatingState();
        }

        function getSelectedRows() {
            return document.querySelectorAll('.tr.g1.rd-selected, .tr.g2.rd-selected');
        }

        function getSelectedLinks() {
            const links = new Set();
            const selectedRows = getSelectedRows();

            selectedRows.forEach(row => {
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                    const textarea = nextRow.querySelector('textarea');
                    if (textarea && textarea.value.trim()) {
                        textarea.value.split('\n').forEach(line => {
                            const trimmed = line.trim();
                            if (trimmed) links.add(trimmed);
                        });
                    }
                }
            });
            return Array.from(links);
        }

        function updateFloatingState() {
            const selectedRows = getSelectedRows();
            const links = getSelectedLinks();
            const count = selectedRows.length;

            if (count > 0) {
                deleteBtn.textContent = `Hapus (${count})`;
                deleteBtn.style.display = 'block';

                if (links.length > 0) {
                    copyBtn.textContent = `Salin Link (${links.length})`;
                    copyBtn.style.display = 'block';

                    debridBtn.textContent = `Unrestrict (${links.length})`;
                    debridBtn.style.display = 'block';
                } else {
                    copyBtn.style.display = 'none';
                    debridBtn.style.display = 'none';
                }
            } else {
                deleteBtn.style.display = 'none';
                copyBtn.style.display = 'none';
                debridBtn.style.display = 'none';
            }
        }

        function handleBatchCopy() {
            const links = getSelectedLinks();
            if (links.length > 0) {
                GM_setClipboard(links.join('\n'));
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Berhasil Disalin!';
                setTimeout(() => { copyBtn.textContent = originalText; }, 1500);
            }
        }

        function handleBatchDebrid(e) {
            e.preventDefault();
            const links = getSelectedLinks();
            if (links.length === 0) return;

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/downloader';

            const textarea = document.createElement('textarea');
            textarea.name = 'links';
            textarea.value = links.join('\n');
            form.appendChild(textarea);

            document.body.appendChild(form);
            form.submit();
        }

        function handleBatchDelete() {
            const selectedRows = getSelectedRows();
            if (selectedRows.length === 0) return;

            if (!confirm(`Konfirmasi menghapus ${selectedRows.length} item torrent yang dicentang?`)) {
                return;
            }

            const deleteUrls = [];
            selectedRows.forEach(row => {
                const delLink = row.querySelector('a[href*="del="]');
                if (delLink && delLink.href) {
                    deleteUrls.push(delLink.href);
                }
            });

            if (deleteUrls.length === 0) return;

            deleteUrls.reduce((promise, url) => {
                return promise.then(() => fetch(url, { credentials: 'same-origin' }));
            }, Promise.resolve()).then(() => {
                window.location.reload();
            }).catch(() => {
                window.location.reload();
            });
        }

        function observeDomMutations() {
            const observer = new MutationObserver(() => {
                bindRowCheckboxes();
            });
            const target = document.querySelector('div.full_width_wrapper') || document.body;
            observer.observe(target, { childList: true, subtree: true });
        }

        initTorrentsPage();
    }

    /* -------------------------------------------------------------
     * FITUR UNTUK HALAMAN /downloader
     * ----------------------------------------------------------- */
    if (currentUrl.includes('/downloader')) {
        function initDownloaderPage() {
            const textarea = document.getElementById('links');
            if (!textarea || document.getElementById('rdExtractBtn')) return;

            const extractBtn = document.createElement('button');
            extractBtn.id = 'rdExtractBtn';
            extractBtn.type = 'button';
            extractBtn.textContent = 'Ekstrak URL Saja';

            extractBtn.onclick = () => {
                const text = textarea.value;
                const urlPattern = /(https?:\/\/[^\s<>'"]+)/gi;
                const matches = text.match(urlPattern);

                if (matches && matches.length > 0) {
                    const uniqueUrls = [...new Set(matches)];
                    textarea.value = uniqueUrls.join('\n');
                    extractBtn.textContent = `${uniqueUrls.length} URL Ditemukan`;
                } else {
                    extractBtn.textContent = 'Tidak Ada URL Valid';
                }
                setTimeout(() => { extractBtn.textContent = 'Ekstrak URL Saja'; }, 2000);
            };

            textarea.parentNode.insertBefore(extractBtn, textarea.nextSibling);
        }

        initDownloaderPage();
    }
})();
