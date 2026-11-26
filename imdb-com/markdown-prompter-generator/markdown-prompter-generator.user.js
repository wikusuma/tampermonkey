// ==UserScript==
// @name         Markdown Prompter Generator
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  Mengubah data halaman IMDb menjadi box Markdown Prompter dengan jumlah rekomendasi dan target kemiripan yang bisa diatur bebas.
// @match        https://www.imdb.com/title/tt*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/markdown-prompter-generator/markdown-prompter-generator.user.js
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/imdb.com/markdown-prompter-generator/markdown-prompter-generator.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Desain Floating Panel & Text Area Markdown
    GM_addStyle(`
        #imdb-prompt-container {
            position: fixed; bottom: 80px; right: 20px; z-index: 999999;
            width: 420px; font-family: Roboto, Helvetica, sans-serif;
        }
        #imdb-prompt-btn {
            background: #f5c518; color: #000; font-weight: 900; border: none;
            padding: 15px 20px; border-radius: 50px; cursor: pointer; width: 100%;
            font-size: 1.1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            transition: transform 0.2s, background 0.2s; display: flex;
            justify-content: center; align-items: center; gap: 10px;
        }
        #imdb-prompt-btn:hover { background: #e3b616; transform: scale(1.03); }

        #imdb-prompt-box {
            display: none; background-color: #121212; border: 2px solid #f5c518;
            border-radius: 12px; padding: 20px; margin-bottom: 15px; color: #fff;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6); line-height: 1.5;
        }
        #imdb-prompt-box h3 { color: #f5c518; margin-top: 0; border-bottom: 1px solid #333; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }

        #imdb-textarea {
            width: 100%; height: 220px; background: #1e1e1e; color: #d4d4d4;
            border: 1px solid #444; border-radius: 6px; padding: 10px; font-family: monospace;
            font-size: 0.85rem; resize: vertical; box-sizing: border-box; margin-top: 10px;
        }

        .imdb-action-row { display: flex; gap: 10px; margin-top: 12px; }

        .imdb-action-btn {
            background: #57b5f9; color: #000; font-weight: bold; border: none;
            padding: 8px 14px; border-radius: 6px; cursor: pointer; flex: 1; font-size: 0.9rem;
            transition: background 0.2s;
        }
        .imdb-action-btn:hover { background: #419bf4; }
        .imdb-copy-success { background: #4caf50 !important; color: #fff !important; }

        .imdb-close-btn { background: transparent; color: #fff; border: none; font-size: 1.2rem; cursor: pointer; }
    `);

    // Fungsi Ekstraksi Data dari Halaman IMDb
    function getMovieProfile() {
        const titleEl = document.querySelector('h1[data-testid="hero__pageTitle"]');
        const plotEl = document.querySelector('span[data-testid="plot-xl"]') ||
                       document.querySelector('span[data-testid="plot-l"]') ||
                       document.querySelector('span[data-testid="plot-xs_to_m"]');
        const genreEls = document.querySelectorAll('.ipc-chip-list__scroller a');

        const title = titleEl ? titleEl.innerText.trim() : 'Unknown Title';
        const plot = plotEl ? plotEl.innerText.trim() : 'No plot available.';
        const genres = Array.from(genreEls).slice(0, 4).map(el => el.innerText.trim()).join(', ');

        return { title, plot, genres };
    }

    // Fungsi untuk Merangkum Profil Menjadi Markdown Prompter yang Rapi
    function generateMarkdownPrompt(profile) {

        // ==========================================
        // ATUR PARAMETER DI SINI SESUAI KEINGINAN
        // ==========================================
        const targetCount = 10;        // Jumlah rekomendasi film yang diinginkan
        const targetMatch = "80%";    // Tingkat kemiripan narasi/tema

        return `### Analisa Profil & Kurasi Narasi Film
Tolong lakukan analisa tipikal dan profil dari film referensi di bawah ini, kemudian berikan ${targetCount} rekomendasi film lain yang memiliki kemiripan narasi, konflik, atau tema psikologis/korporat sekitar ${targetMatch}.

#### **Referensi Film:**
- **Judul:** ${profile.title}
- **Genre:** ${profile.genres}
- **Sinopsis:** ${profile.plot}

#### **Instruksi Output:**
1. Analisa elemen narasi utama dari film di atas.
2. Berikan ${targetCount} rekomendasi film serupa (sertakan tahun rilis).
3. Jelaskan secara spesifik alasan kemiripan narasi (${targetMatch} match) untuk setiap rekomendasi.
4. Format jawaban menggunakan Markdown yang bersih dan terstruktur.`;
    }

    // Injeksi UI Floating Box
    function injectUI() {
        if (document.getElementById('imdb-prompt-container')) return;

        const container = document.createElement('div');
        container.id = 'imdb-prompt-container';

        const resultBox = document.createElement('div');
        resultBox.id = 'imdb-prompt-box';

        const btn = document.createElement('button');
        btn.id = 'imdb-prompt-btn';
        btn.innerHTML = '📝 Buat Prompt Markdown (AI)';

        container.appendChild(resultBox);
        container.appendChild(btn);
        document.body.appendChild(container);

        // Saat tombol utama diklik
        btn.addEventListener('click', () => {
            const profile = getMovieProfile();
            const markdownText = generateMarkdownPrompt(profile);

            resultBox.innerHTML = `
                <h3>
                    <span>📋 Markdown Prompter</span>
                    <button class="imdb-close-btn" id="imdb-close">✖</button>
                </h3>
                <p style="font-size: 0.85rem; color: #aaa; margin: 5px 0;">Salin teks di bawah ini dan tempel ke Google AI Studio, ChatGPT, atau Skill Anda:</p>
                <textarea id="imdb-textarea" readonly>${markdownText}</textarea>
                <div class="imdb-action-row">
                    <button class="imdb-action-btn" id="imdb-copy-btn">📋 Salin ke Clipboard</button>
                </div>
            `;

            resultBox.style.display = 'block';
            btn.style.display = 'none';

            // Event tombol Tutup (X)
            document.getElementById('imdb-close').addEventListener('click', () => {
                resultBox.style.display = 'none';
                btn.style.display = 'flex';
            });

            // Event tombol Salin
            const copyBtn = document.getElementById('imdb-copy-btn');
            const textarea = document.getElementById('imdb-textarea');

            copyBtn.addEventListener('click', () => {
                textarea.select();
                navigator.clipboard.writeText(textarea.value).then(() => {
                    copyBtn.innerText = '✅ Berhasil Disalin!';
                    copyBtn.classList.add('imdb-copy-success');
                    setTimeout(() => {
                        copyBtn.innerText = '📋 Salin ke Clipboard';
                        copyBtn.classList.remove('imdb-copy-success');
                    }, 2000);
                });
            });
        });
    }

    // Jalankan injeksi saat halaman siap
    if (document.readyState === "complete" || document.readyState === "interactive") {
        injectUI();
    } else {
        window.addEventListener('DOMContentLoaded', injectUI);
    }
    setTimeout(injectUI, 1500);

})();
