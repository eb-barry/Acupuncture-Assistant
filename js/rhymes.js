/**
 * rhymes.js — 中醫歌訣
 * UI 改動：歌訣名稱選單 + 播放按鈕並排同一列
 */

const Rhymes = (() => {
  let _data    = null;
  let _inited  = false;
  let _synth   = window.speechSynthesis || null;
  let _playing = false;
  let _curText = '';

  if (_synth) {
    _synth.onvoiceschanged = () => {};
  }

  /* ── TTS ── */
  function play(text) {
    if (!_synth) { UI.toast('您的裝置不支援語音功能'); return; }
    _synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.88;
    const gender = Settings.get('voiceGender') || 'female';
    const v = Settings.pickTTSVoice(gender);
    if (v) {
      utt.voice = v;
      utt.lang  = v.lang || 'zh-TW';
    } else {
      utt.lang = 'zh-TW';
      UI.toast('找不到中文語音，使用系統預設聲音');
    }
    utt.onstart = () => { _playing = true;  _updateBtn(); };
    utt.onend   = () => { _playing = false; _updateBtn(); };
    utt.onerror = (e) => {
      _playing = false; _updateBtn();
      if (e.error !== 'interrupted') UI.toast('語音播放失敗');
    };
    _synth.speak(utt);
  }

  function stop() {
    if (_synth) _synth.cancel();
    _playing = false;
    _updateBtn();
  }

  /* 只更新播放按鈕狀態，不重繪整列 */
  function _updateBtn() {
    const btn = document.getElementById('btn-tts-play');
    if (!btn) return;
    const hasText = !!_curText;

    if (_playing) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
      btn.style.background = 'var(--clr-danger)';
      btn.setAttribute('aria-label', '停止朗讀');
      btn.onclick = stop;
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      btn.style.background = hasText ? 'var(--clr-teal)' : 'var(--clr-disabled)';
      btn.disabled = !hasText;
      btn.style.cursor = hasText ? 'pointer' : 'not-allowed';
      btn.setAttribute('aria-label', '播放歌訣');
      btn.onclick = hasText ? () => play(_curText) : null;
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

        <!-- ── 歌訣選單 + 播放按鈕 並排 ── -->
        <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);align-items:flex-end">

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

          <!-- 播放按鈕：高度與 select 齊平 -->
          <button class="btn-tts play" id="btn-tts-play" disabled
                  style="width:46px;height:46px;border-radius:var(--radius-full);
                         background:var(--clr-disabled);cursor:not-allowed;flex-shrink:0"
                  aria-label="播放歌訣">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>

        </div>

        <!-- 歌訣說明 -->
        <div id="rhyme-desc" class="card"
             style="padding:var(--sp-md) var(--sp-lg);display:none;">
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
      _updateBtn();

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

      descEl.querySelector('p').textContent = rec['說明'];
      descEl.style.display = 'block';

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
        _updateBtn();
        setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
      } catch {
        panel.innerHTML = `<div class="info-panel"><div class="info-text">
          <p style="color:var(--clr-muted)">歌訣內容尚未提供，請確認 GitHub 上已上傳
            <strong>${filename}.txt</strong>。</p>
        </div></div>`;
        _updateBtn();
      }
    });
  }

  function _loadingHTML(h) {
    return `<div class="img-placeholder" style="position:relative;height:${h}px;">
              <div class="spinner"></div></div>`;
  }
  function _errorHTML(msg, detail) {
    return `<div style="text-align:center;padding:var(--sp-xl);color:var(--clr-muted)">
              <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ ${msg}</p>
              ${detail ? `<p style="font-size:var(--fs-xs)">${detail}</p>` : ''}
            </div>`;
  }

  return { init, stop };
})();
