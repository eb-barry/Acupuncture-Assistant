/**
 * rhymes.js
 * 中醫歌訣 page: select rhyme, view text, TTS playback with play/stop controls.
 * Voice gender uses Settings.get('voiceGender').
 */

const Rhymes = (() => {
  let _data     = null;
  let _synth    = window.speechSynthesis || null;
  let _voices   = [];
  let _playing  = false;

  // Pre-load voices (async on some browsers)
  if (_synth) {
    _voices = _synth.getVoices();
    if (!_voices.length) {
      _synth.onvoiceschanged = () => { _voices = _synth.getVoices(); };
    }
  }

  function pickVoice() {
    const gender = Settings.get('voiceGender') || 'female';
    const zhVoices = _voices.filter(v => v.lang && v.lang.startsWith('zh'));
    if (!zhVoices.length) return null;
    if (gender === 'female') {
      return zhVoices.find(v => /female|woman|girl|Ting|Meijia|Mei-Jia|Yating/i.test(v.name))
          || zhVoices[0];
    } else {
      return zhVoices.find(v => /male|man|ming|Liang/i.test(v.name))
          || zhVoices[0];
    }
  }

  function stop() {
    if (_synth) _synth.cancel();
    _playing = false;
    updateTTSBar();
  }

  function updateTTSBar(text) {
    const bar = document.getElementById('rhyme-tts-bar');
    if (!bar) return;
    bar.innerHTML = `
      <span class="tts-label" id="tts-label">
        ${_playing ? '朗讀中…' : (text ? '點擊播放歌訣' : '請先選擇歌訣')}
      </span>
      ${_playing
        ? `<button class="btn-tts stop" id="btn-tts-stop" aria-label="停止">
             <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
           </button>`
        : `<button class="btn-tts play" id="btn-tts-play" ${!text ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''} aria-label="播放">
             <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
           </button>`
      }
    `;
    if (_playing) {
      document.getElementById('btn-tts-stop').addEventListener('click', stop);
    } else if (text) {
      document.getElementById('btn-tts-play').addEventListener('click', () => play(text));
    }
  }

  function play(text) {
    if (!_synth) { UI.toast('您的裝置不支援語音功能'); return; }
    _synth.cancel();
    _voices = _synth.getVoices();  // refresh
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-TW';
    utt.rate = 0.9;
    const voice = pickVoice();
    if (voice) utt.voice = voice;
    utt.onstart = () => { _playing = true;  updateTTSBar(text); };
    utt.onend   = () => { _playing = false; updateTTSBar(text); };
    utt.onerror = () => { _playing = false; updateTTSBar(text); UI.toast('語音播放失敗'); };
    _synth.speak(utt);
  }

  async function init() {
    const container = document.getElementById('rhymes-content');
    container.innerHTML = `<div class="img-placeholder" style="position:relative;height:120px;">
      <div class="spinner"></div></div>`;
    try {
      _data = await Cache.loadJSON('rhymes-data.json');
      renderUI(container);
    } catch (e) {
      container.innerHTML = `<p style="color:var(--clr-muted);text-align:center;padding:var(--sp-lg)">
        資料載入失敗，請檢查網路連線。<br><small>${e.message}</small></p>`;
    }
  }

  function renderUI(container) {
    container.innerHTML = `
      <!-- 歌訣選擇 + TTS 控制 -->
      <div class="flex-col gap-md">

        <div class="form-group">
          <label class="form-label" for="sel-rhyme">歌訣名稱</label>
          <div class="select-wrap">
            <select class="styled-select" id="sel-rhyme">
              <option value="">— 請選擇歌訣 —</option>
            </select>
          </div>
        </div>

        <!-- TTS Bar -->
        <div class="tts-bar" id="rhyme-tts-bar">
          <span class="tts-label">請先選擇歌訣</span>
          <button class="btn-tts play" disabled style="opacity:0.4;cursor:not-allowed" aria-label="播放">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>

        <!-- 說明文字 -->
        <div id="rhyme-desc" style="font-size:var(--fs-sm);color:var(--clr-muted);
             background:var(--clr-bg-card);border:var(--border);border-radius:var(--radius-md);
             padding:var(--sp-md) var(--sp-lg);display:none;">
        </div>

      </div>

      <div class="divider" id="rhyme-divider" style="display:none"></div>

      <!-- 歌訣內容 -->
      <div id="rhyme-text-panel"></div>
    `;

    // Populate select
    const sel = document.getElementById('sel-rhyme');
    _data.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r['檔名'];
      opt.textContent = r['名稱'];
      sel.appendChild(opt);
    });

    sel.addEventListener('change', async () => {
      stop();
      const filename = sel.value;
      const rec = _data.find(r => r['檔名'] === filename);

      const descEl  = document.getElementById('rhyme-desc');
      const divider = document.getElementById('rhyme-divider');
      const panel   = document.getElementById('rhyme-text-panel');

      if (!filename || !rec) {
        descEl.style.display  = 'none';
        divider.style.display = 'none';
        panel.innerHTML = '';
        updateTTSBar('');
        return;
      }

      // Show description
      descEl.textContent    = rec['說明'];
      descEl.style.display  = 'block';

      // Show loading
      divider.style.display = '';
      panel.innerHTML = `<div class="info-panel"><div class="info-text">
        <div class="img-placeholder" style="position:relative;height:80px;">
          <div class="spinner"></div>
        </div></div></div>`;

      updateTTSBar('');

      try {
        const text = await Cache.loadRhymeText(filename);
        panel.innerHTML = `
          <div class="info-panel">
            <div class="info-text">
              <h4>${rec['名稱']}<span class="badge">${rec['類別']}</span></h4>
              <p style="line-height:2.0;">${text.trim()}</p>
            </div>
          </div>`;
        updateTTSBar(text.trim());
      } catch {
        panel.innerHTML = `<div class="info-panel"><div class="info-text">
          <p style="color:var(--clr-muted)">歌訣內容暫未提供，請確認 GitHub 上已上傳對應的 .txt 檔案。</p>
        </div></div>`;
        updateTTSBar('');
      }
    });
  }

  return { init, stop };
})();
