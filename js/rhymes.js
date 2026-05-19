/**
 * rhymes.js
 * 中醫歌訣 page:
 *   - 選擇歌訣後顯示說明與全文
 *   - 播放按鈕觸發 TTS 朗讀
 *   - 聲音性別從 Settings 取得
 *   - Fallback：中文女聲 → 中文任意聲 → 提示不支援
 *   - 離開頁面或選新歌訣時自動停止播放
 */

const Rhymes = (() => {
  let _data    = null;
  let _inited  = false;
  let _synth   = window.speechSynthesis || null;
  let _voices  = [];
  let _playing = false;
  let _curText = '';    // 目前載入的歌訣文字

  // 盡早取得聲音清單（部分瀏覽器需等 onvoiceschanged）
  if (_synth) {
    _voices = _synth.getVoices();
    _synth.onvoiceschanged = () => { _voices = _synth.getVoices(); };
  }

  /* ── TTS ── */
  function _pickVoice() {
    const gender  = Settings.get('voiceGender') || 'female';
    const zhList  = _voices.filter(v => v.lang && v.lang.startsWith('zh'));
    if (!zhList.length) return null;

    const femaleKw = /female|woman|girl|Ting|Mei|Yating|Yaoyao|Huihui/i;
    const maleKw   = /male|man|Ming|Liang|Kangkang/i;

    if (gender === 'female') {
      return zhList.find(v => femaleKw.test(v.name))  || zhList[0];
    } else {
      return zhList.find(v => maleKw.test(v.name))    || zhList[0];
    }
  }

  function play(text) {
    if (!_synth) { UI.toast('您的裝置不支援語音功能'); return; }
    _voices = _synth.getVoices(); // 刷新清單
    _synth.cancel();

    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = 'zh-TW';
    utt.rate   = 0.88;
    const v    = _pickVoice();
    if (v) utt.voice = v;
    else UI.toast('找不到中文語音，使用系統預設聲音');

    utt.onstart = () => { _playing = true;  _updateBar(); };
    utt.onend   = () => { _playing = false; _updateBar(); };
    utt.onerror = (e) => {
      _playing = false; _updateBar();
      if (e.error !== 'interrupted') UI.toast('語音播放失敗');
    };
    _synth.speak(utt);
  }

  function stop() {
    if (_synth) _synth.cancel();
    _playing = false;
    _updateBar();
  }

  function _updateBar() {
    const bar = document.getElementById('rhyme-tts-bar');
    if (!bar) return;
    const hasText = !!_curText;

    bar.innerHTML = `
      <span class="tts-label">
        ${_playing ? '朗讀中…' : (hasText ? '點擊播放歌訣' : '請先選擇歌訣')}
      </span>
      ${_playing
        ? `<button class="btn-tts stop" id="btn-tts-stop" aria-label="停止朗讀">
             <svg viewBox="0 0 24 24" fill="currentColor">
               <rect x="4" y="4" width="16" height="16" rx="2"/>
             </svg>
           </button>`
        : `<button class="btn-tts play" id="btn-tts-play"
             ${!hasText ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}
             aria-label="播放歌訣">
             <svg viewBox="0 0 24 24" fill="currentColor">
               <polygon points="5 3 19 12 5 21 5 3"/>
             </svg>
           </button>`
      }`;

    if (_playing) {
      document.getElementById('btn-tts-stop')
        ?.addEventListener('click', stop);
    } else if (hasText) {
      document.getElementById('btn-tts-play')
        ?.addEventListener('click', () => play(_curText));
    }
  }

  /* ── Init ── */
  async function init() {
    stop();
    if (_inited) { _restoreUI(); return; }

    const container = document.getElementById('rhymes-content');
    container.innerHTML = _loadingHTML(120);

    try {
      _data   = await Cache.loadJSON('rhymes-data.json');
      _inited = true;
      _buildUI(container);
    } catch (e) {
      container.innerHTML = _errorHTML('資料載入失敗，請檢查網路連線。', e.message);
    }
  }

  function _restoreUI() {
    _curText = '';
    _buildUI(document.getElementById('rhymes-content'));
  }

  function _buildUI(container) {
    container.innerHTML = `
      <div class="flex-col gap-md">

        <!-- 選歌訣 -->
        <div class="form-group">
          <label class="form-label" for="sel-rhyme">歌訣名稱</label>
          <div class="select-wrap">
            <select class="styled-select" id="sel-rhyme">
              <option value="">— 請選擇歌訣 —</option>
              ${_data.map(r =>
                `<option value="${r['檔名']}">${r['名稱']}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <!-- TTS 播放列 -->
        <div class="tts-bar" id="rhyme-tts-bar">
          <span class="tts-label">請先選擇歌訣</span>
          <button class="btn-tts play" disabled style="opacity:0.4;cursor:not-allowed" aria-label="播放歌訣">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
        </div>

        <!-- 歌訣說明 -->
        <div id="rhyme-desc" class="card" style="padding:var(--sp-md) var(--sp-lg);display:none;">
          <p style="font-size:var(--fs-sm);color:var(--clr-muted);line-height:1.7;"></p>
        </div>

      </div>

      <div class="divider" id="rhyme-divider" style="display:none"></div>
      <div id="rhyme-panel"></div>
    `;

    _bindEvents();
  }

  function _bindEvents() {
    document.getElementById('sel-rhyme').addEventListener('change', async (e) => {
      stop();
      _curText = '';
      _updateBar();

      const filename = e.target.value;
      const rec      = _data.find(r => r['檔名'] === filename);
      const descEl   = document.getElementById('rhyme-desc');
      const divider  = document.getElementById('rhyme-divider');
      const panel    = document.getElementById('rhyme-panel');

      if (!filename || !rec) {
        descEl.style.display  = 'none';
        divider.style.display = 'none';
        panel.innerHTML       = '';
        return;
      }

      // 說明
      descEl.querySelector('p').textContent = rec['說明'];
      descEl.style.display = 'block';

      // 載入文字
      divider.style.display = '';
      panel.innerHTML = `<div class="info-panel"><div class="info-text">
        <div class="img-placeholder" style="position:relative;height:80px;">
          <div class="spinner"></div>
        </div></div></div>`;

      try {
        const text = await Cache.loadRhymeText(filename);
        _curText   = text.trim();
        panel.innerHTML = `
          <div class="info-panel">
            <div class="info-text">
              <h4>${rec['名稱']}<span class="badge">${rec['類別']}</span></h4>
              <p style="line-height:2.2;letter-spacing:0.05em;">${_curText}</p>
            </div>
          </div>`;
        _updateBar();
        setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
      } catch {
        panel.innerHTML = `<div class="info-panel"><div class="info-text">
          <p style="color:var(--clr-muted)">
            歌訣內容尚未提供，請確認 GitHub 上已上傳
            <strong>${filename}.txt</strong>。
          </p>
        </div></div>`;
        _updateBar();
      }
    });
  }

  function _loadingHTML(h) {
    return `<div class="img-placeholder" style="position:relative;height:${h}px;">
              <div class="spinner"></div>
            </div>`;
  }

  function _errorHTML(msg, detail) {
    return `<div style="text-align:center;padding:var(--sp-xl);color:var(--clr-muted)">
              <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ ${msg}</p>
              ${detail ? `<p style="font-size:var(--fs-xs)">${detail}</p>` : ''}
            </div>`;
  }

  return { init, stop };
})();
