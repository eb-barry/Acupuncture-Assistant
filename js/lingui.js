/**
 * lingui.js — 靈龜八法
 *
 * 兩種模式（Tab 切換）：
 *   A. 依時取穴：顯示當前/自訂時辰的開穴結果
 *   B. 依穴取時：使用者選穴位，列出當日所有符合的時辰
 */

const Lingui = (() => {

  /* ── 狀態 ── */
  let _timer       = null;
  let _clockTimer  = null;
  let _lastRem     = null;
  let _currentText = {};
  let _gender      = null;
  let _customDate  = null;
  let _activeMode  = 'A';   // 'A'=依時取穴  'B'=依穴取時
  let _selectedPoint = null; // 依穴取時模式中使用者選的穴位

  /* ── 八組穴位完整對照（含餘數=5 的雙性別） ── */
  const BAFA_POINTS = [
    { rem:1, gua:'坎', main:'申脈', paired:'後溪',   vessel:'陽蹻脈' },
    { rem:2, gua:'坤', main:'照海', paired:'列缺',   vessel:'陰蹻脈' },
    { rem:3, gua:'震', main:'外關', paired:'足臨泣', vessel:'陽維脈' },
    { rem:4, gua:'巽', main:'足臨泣', paired:'外關', vessel:'帶脈'   },
    { rem:5, gua:'坤', main:'照海', paired:'列缺',   vessel:'陰蹻脈',
      male:   { main:'照海',  paired:'列缺',  vessel:'陰蹻脈' },
      female: { main:'內關',  paired:'公孫',  vessel:'陰維脈' },
      genderDependent: true },
    { rem:6, gua:'乾', main:'公孫', paired:'內關',   vessel:'沖脈'   },
    { rem:7, gua:'兌', main:'後溪', paired:'申脈',   vessel:'督脈'   },
    { rem:8, gua:'艮', main:'內關', paired:'公孫',   vessel:'陰維脈' },
    { rem:9, gua:'離', main:'列缺', paired:'照海',   vessel:'任脈'   },
  ];

  // 8 個主穴清單（供依穴取時使用）
  const ALL_MAIN_POINTS = [
    '申脈','照海','外關','足臨泣','公孫','後溪','內關','列缺'
  ];

  /* ── 時辰名稱與時間範圍 ── */
  const SHICHEN = [
    { zhi:'子', label:'子時', range:'23:00–01:00', hourStart:23 },
    { zhi:'丑', label:'丑時', range:'01:00–03:00', hourStart:1  },
    { zhi:'寅', label:'寅時', range:'03:00–05:00', hourStart:3  },
    { zhi:'卯', label:'卯時', range:'05:00–07:00', hourStart:5  },
    { zhi:'辰', label:'辰時', range:'07:00–09:00', hourStart:7  },
    { zhi:'巳', label:'巳時', range:'09:00–11:00', hourStart:9  },
    { zhi:'午', label:'午時', range:'11:00–13:00', hourStart:11 },
    { zhi:'未', label:'未時', range:'13:00–15:00', hourStart:13 },
    { zhi:'申', label:'申時', range:'15:00–17:00', hourStart:15 },
    { zhi:'酉', label:'酉時', range:'17:00–19:00', hourStart:17 },
    { zhi:'戌', label:'戌時', range:'19:00–21:00', hourStart:19 },
    { zhi:'亥', label:'亥時', range:'21:00–23:00', hourStart:21 },
  ];

  /* ── Init ── */
  function init() {
    _lastRem = null;
    _currentText = {};
    _gender = null;
    renderShell();
    if (_activeMode === 'A') renderModeA();
    else                     renderModeB();

    clearInterval(_timer);
    _timer = setInterval(() => {
      if (_activeMode !== 'A' || _customDate) return;
      const calc = GanZhi.calculate(new Date());
      if (calc.remainder !== _lastRem) { _gender = null; renderModeA(); }
    }, 30000);
  }

  /* ── 外層 Shell（tab 切換列 + 內容容器） ── */
  function renderShell() {
    document.getElementById('lingui-content').innerHTML = `
      <div class="page-content">
        <!-- Mode tabs -->
        <div class="lingui-mode-tabs">
          <button class="lingui-mode-tab ${_activeMode==='A'?'active':''}" data-mode="A">
            依時取穴
          </button>
          <button class="lingui-mode-tab ${_activeMode==='B'?'active':''}" data-mode="B">
            依穴取時
          </button>
        </div>
      </div>
      <div id="lingui-mode-content"></div>
    `;

    document.querySelectorAll('.lingui-mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeMode = btn.dataset.mode;
        _currentText = {};
        document.querySelectorAll('.lingui-mode-tab')
          .forEach(b => b.classList.toggle('active', b.dataset.mode === _activeMode));
        if (_activeMode === 'A') renderModeA();
        else                     renderModeB();
      });
    });
  }

  /* ════════════════════════════════════════
     MODE A：依時取穴
  ════════════════════════════════════════ */
  function renderModeA() {
    const targetDate = _customDate || new Date();
    const isCustom   = !!_customDate;
    let calc;
    try { calc = GanZhi.calculate(targetDate); }
    catch (e) { _renderError(e.message); return; }

    _lastRem = calc.remainder;
    const isYang     = calc.isYang;
    const mod        = isYang ? 9 : 6;
    const isGenderDep = !!calc.genderDependent;
    let main = calc.main, paired = calc.paired, vessel = calc.vessel;
    if (isGenderDep && _gender) {
      main   = calc[_gender].main;
      paired = calc[_gender].paired;
      vessel = calc[_gender].vessel;
    }
    const openLabel = isCustom ? `自訂時間：${_fmtCustom(targetDate)}` : '本時辰開穴';

    document.getElementById('lingui-mode-content').innerHTML = `
      <div class="page-content">

        <!-- 日期橫幅 -->
        <div class="ganzhi-banner">
          <div style="display:flex;align-items:center;justify-content:center;
                      gap:var(--sp-sm);margin-bottom:4px;">
            <button id="btn-calendar"
                    style="background:var(--clr-teal);border:none;cursor:pointer;
                           color:#fff;padding:7px 10px;border-radius:var(--radius-sm);
                           display:flex;align-items:center;gap:5px;
                           font-size:var(--fs-sm);font-weight:500;box-shadow:var(--shadow-sm);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:18px;height:18px;flex-shrink:0;">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>查詢
            </button>
            <div id="lingui-clock" class="solar-date" style="margin-bottom:0;">
              ${isCustom ? _fmtDisplay(targetDate) : calc.solarStr + '　' + _timeStr(targetDate)}
            </div>
            ${isCustom ? `
            <button id="btn-reset-time"
                    style="background:var(--clr-gold);border:none;cursor:pointer;
                           color:#fff;padding:7px 10px;border-radius:var(--radius-sm);
                           display:flex;align-items:center;gap:5px;
                           font-size:var(--fs-sm);font-weight:500;box-shadow:var(--shadow-sm);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:18px;height:18px;flex-shrink:0;">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>當前時間
            </button>` : ''}
          </div>
          <div class="lunar-date">${calc.lunarStr}</div>
          <div class="gua-row">
            <span class="gua-tag">${calc.gua}卦</span>
            <span class="yinyang-tag ${isYang?'yang':'yin'}">${isYang?'陽日':'陰日'}</span>
          </div>
          <div style="margin-top:6px;font-size:var(--fs-xs);color:var(--clr-muted)">
            ${calc.total} ÷ ${mod} 餘 ${calc.remainder}　通 ${vessel}
          </div>
        </div>

        <!-- 自訂日期輸入面板 -->
        <div id="calendar-panel" style="display:none;">
          <div class="calendar-input-box">
            <div class="calendar-input-title">自訂查詢日期與時間</div>
            <div class="calendar-input-grid">
              <div class="form-group">
                <label class="form-label" for="ci-date">日期</label>
                <input type="date" id="ci-date" class="styled-input"
                       value="${_isoDate(_customDate||new Date())}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="ci-time">時間</label>
                <input type="time" id="ci-time" class="styled-input"
                       value="${_isoTime(_customDate||new Date())}" />
              </div>
            </div>
            <div style="display:flex;gap:var(--sp-sm);margin-top:var(--sp-sm);">
              <button class="btn btn-primary" id="btn-ci-confirm" style="flex:1;">確認</button>
              <button class="btn btn-secondary" id="btn-ci-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 標題 + 男/女切換 -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:var(--sp-sm);">
          <p class="section-title" style="margin-bottom:0;
             ${isCustom?'font-size:var(--fs-sm);color:var(--clr-gold);':''}">
            ${openLabel}
          </p>
          ${isGenderDep ? `
          <div class="gender-toggle">
            <button class="gender-btn ${(!_gender||_gender==='male')?'active':''}"
                    data-gender="male">男</button>
            <button class="gender-btn ${_gender==='female'?'active':''}"
                    data-gender="female">女</button>
          </div>` : ''}
        </div>

        <!-- 主穴 / 配穴並排 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm);"
             id="lingui-btns">
          <button class="btn-point btn-point--main" data-point="${main}" data-label="主穴">
            <span class="point-label">主穴</span>${main}
          </button>
          <button class="btn-point btn-point--paired" data-point="${paired}" data-label="配穴">
            <span class="point-label">配穴</span>${paired}
          </button>
        </div>

        <div class="divider" id="lingui-divider" style="display:none;"></div>
      </div>

      <div id="lingui-panel"></div>
    `;

    // ── 事件綁定 ──
    document.getElementById('btn-calendar').addEventListener('click', () => {
      const p = document.getElementById('calendar-panel');
      const open = p.style.display !== 'none';
      p.style.display = open ? 'none' : 'block';
      if (!open) {
        document.getElementById('ci-date').value = _isoDate(_customDate||new Date());
        document.getElementById('ci-time').value = _isoTime(_customDate||new Date());
        setTimeout(() => p.scrollIntoView({behavior:'smooth',block:'nearest'}), 80);
      }
    });
    document.getElementById('btn-ci-confirm').addEventListener('click', () => {
      const dv = document.getElementById('ci-date').value;
      const tv = document.getElementById('ci-time').value;
      if (!dv||!tv) { UI.toast('請選擇日期與時間'); return; }
      _customDate = new Date(`${dv}T${tv}:00`);
      _gender = null; _currentText = {};
      renderModeA();
    });
    document.getElementById('btn-ci-cancel').addEventListener('click', () => {
      document.getElementById('calendar-panel').style.display = 'none';
    });
    document.getElementById('btn-reset-time')?.addEventListener('click', () => {
      _customDate = null; _gender = null; _currentText = {};
      renderModeA();
    });

    document.querySelectorAll('#lingui-btns .btn-point').forEach(btn =>
      btn.addEventListener('click', () => _onPointClick(btn))
    );

    if (isGenderDep) {
      document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          _gender = btn.dataset.gender; _currentText = {};
          renderModeA();
        });
      });
    }

    if (!isCustom) _startClock(); else clearInterval(_clockTimer);

    if (_currentText.name) {
      const match = document.querySelector(
        `#lingui-btns .btn-point[data-point="${_currentText.name}"]`
      );
      if (match) _onPointClick(match);
    }
  }

  /* ════════════════════════════════════════
     MODE B：依穴取時
  ════════════════════════════════════════ */
  function renderModeB() {
    clearInterval(_clockTimer);
    const baseDate = _customDate || new Date();

    document.getElementById('lingui-mode-content').innerHTML = `
      <div class="page-content">

        <!-- 日期顯示 + 切換日期 -->
        <div class="ganzhi-banner">
          <div style="display:flex;align-items:center;justify-content:center;
                      gap:var(--sp-sm);margin-bottom:4px;">
            <button id="btn-calendar-b"
                    style="background:var(--clr-teal);border:none;cursor:pointer;
                           color:#fff;padding:7px 10px;border-radius:var(--radius-sm);
                           display:flex;align-items:center;gap:5px;
                           font-size:var(--fs-sm);font-weight:500;box-shadow:var(--shadow-sm);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:18px;height:18px;flex-shrink:0;">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>選擇日期
            </button>
            <div class="solar-date" style="margin-bottom:0;" id="b-date-display">
              ${_fmtDateOnly(baseDate)}
            </div>
            ${_customDate ? `
            <button id="btn-reset-b"
                    style="background:var(--clr-gold);border:none;cursor:pointer;
                           color:#fff;padding:7px 10px;border-radius:var(--radius-sm);
                           display:flex;align-items:center;gap:5px;
                           font-size:var(--fs-sm);font-weight:500;box-shadow:var(--shadow-sm);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:18px;height:18px;flex-shrink:0;">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>今日
            </button>` : ''}
          </div>
        </div>

        <!-- 日期選擇面板 -->
        <div id="calendar-panel-b" style="display:none;">
          <div class="calendar-input-box">
            <div class="calendar-input-title">選擇查詢日期</div>
            <div class="form-group">
              <label class="form-label" for="bi-date">日期</label>
              <input type="date" id="bi-date" class="styled-input"
                     value="${_isoDate(baseDate)}" />
            </div>
            <div style="display:flex;gap:var(--sp-sm);margin-top:var(--sp-sm);">
              <button class="btn btn-primary" id="btn-bi-confirm" style="flex:1;">確認</button>
              <button class="btn btn-secondary" id="btn-bi-cancel" style="flex:1;">取消</button>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 穴位選擇 -->
        <p class="section-title">選擇穴位</p>
        <div class="lingui-point-selector" id="lingui-point-btns">
          ${ALL_MAIN_POINTS.map(pt => `
            <button class="lingui-point-chip ${_selectedPoint===pt?'active':''}"
                    data-point="${pt}">${pt}</button>
          `).join('')}
        </div>

        <div class="divider" id="b-divider" style="${_selectedPoint?'':'display:none'}"></div>
      </div>

      <!-- 時辰列表（在 page-content 外，靠近邊緣） -->
      <div id="b-shichen-list" class="page-content"></div>

      <!-- 穴位配伍說明 -->
      <div id="b-pairing-section" style="${_selectedPoint?'':'display:none'}">
        <div class="page-content">
          <div class="divider"></div>
          <p class="section-title">穴位配伍</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm);"
               id="b-point-btns"></div>
          <div class="divider" id="b-point-divider" style="display:none;"></div>
        </div>
        <div id="b-point-panel"></div>
      </div>
    `;

    // 日期選擇事件
    document.getElementById('btn-calendar-b').addEventListener('click', () => {
      const p = document.getElementById('calendar-panel-b');
      p.style.display = p.style.display !== 'none' ? 'none' : 'block';
    });
    document.getElementById('btn-bi-confirm').addEventListener('click', () => {
      const dv = document.getElementById('bi-date').value;
      if (!dv) return;
      _customDate = new Date(`${dv}T12:00:00`);
      renderModeB();
    });
    document.getElementById('btn-bi-cancel').addEventListener('click', () => {
      document.getElementById('calendar-panel-b').style.display = 'none';
    });
    document.getElementById('btn-reset-b')?.addEventListener('click', () => {
      _customDate = null; renderModeB();
    });

    // 穴位選擇
    document.querySelectorAll('#lingui-point-btns .lingui-point-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        _selectedPoint = btn.dataset.point;
        document.querySelectorAll('.lingui-point-chip')
          .forEach(b => b.classList.toggle('active', b.dataset.point === _selectedPoint));
        _renderShichenList(baseDate);
      });
    });

    // 若已有選穴，直接顯示
    if (_selectedPoint) _renderShichenList(baseDate);
  }

  /* ── 依穴取時：計算當日所有符合時辰 ── */
  function _renderShichenList(baseDate) {
    const point    = _selectedPoint;
    const listEl   = document.getElementById('b-shichen-list');
    const pairSec  = document.getElementById('b-pairing-section');
    const divider  = document.getElementById('b-divider');

    if (!listEl) return;
    divider.style.display = '';

    // 找出此穴位對應的所有餘數（含餘數=5的雙性別特例）
    const matchedRems = [];
    for (const entry of BAFA_POINTS) {
      if (entry.genderDependent) {
        if (entry.male.main === point || entry.male.paired === point) {
          matchedRems.push({ ...entry, gender:'male',
            main: entry.male.main, paired: entry.male.paired, vessel: entry.male.vessel });
        }
        if (entry.female.main === point || entry.female.paired === point) {
          // 避免重複（照海在餘數2和5男都是主穴）
          const dup = matchedRems.find(r => r.rem===entry.rem && r.gender==='female');
          if (!dup) matchedRems.push({ ...entry, gender:'female',
            main: entry.female.main, paired: entry.female.paired, vessel: entry.female.vessel });
        }
      } else {
        if (entry.main === point || entry.paired === point) {
          matchedRems.push({ ...entry, gender: null });
        }
      }
    }

    // 窮舉今日 12 個時辰，找出符合的時辰
    const results = [];
    for (let i = 0; i < 12; i++) {
      const sc   = SHICHEN[i];
      const hour = sc.hourStart;

      // 建立該時辰的 Date（子時23點屬於次日計算）
      let d = new Date(baseDate);
      d.setHours(hour, 0, 0, 0);

      let calc;
      try { calc = GanZhi.calculate(d); } catch { continue; }

      for (const mr of matchedRems) {
        if (calc.remainder === mr.rem) {
          const isMain   = mr.main   === point;
          const isPaired = mr.paired === point;
          results.push({
            shichen:  sc,
            calc,
            entry:    mr,
            role:     isMain ? '主穴' : '配穴',
            partner:  isMain ? mr.paired : mr.main,
            gender:   mr.gender,
          });
        }
      }
    }

    // 渲染時辰列表
    if (!results.length) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:var(--sp-lg) 0;color:var(--clr-muted);">
          <p style="font-size:var(--fs-lg);">今日無此開穴時辰</p>
          <p style="font-size:var(--fs-sm);margin-top:var(--sp-xs);">
            ${point} 在今日（${_fmtDateOnly(baseDate)}）不屬於任何時辰的開穴。
          </p>
        </div>`;
      pairSec.style.display = 'none';
      return;
    }

    // 找出第一個結果的穴位配伍（用於下方顯示）
    const firstEntry = results[0].entry;

    listEl.innerHTML = `
      <p class="section-title" style="padding:0 var(--sp-md);">
        ${_fmtDateOnly(baseDate)}　${point} 開穴時辰（共 ${results.length} 個）
      </p>
      <div class="shichen-list">
        ${results.map(r => {
          const now      = new Date();
          const isNow    = !_customDate && now.getHours() >= r.shichen.hourStart
                           && now.getHours() < r.shichen.hourStart + 2;
          const genderNote = r.gender === 'male' ? '（男）' :
                             r.gender === 'female' ? '（女）' : '';
          return `
          <div class="shichen-row ${isNow?'shichen-now':''}">
            <div class="shichen-time">
              <span class="shichen-zhi">${r.shichen.label}</span>
              <span class="shichen-range">${r.shichen.range}</span>
            </div>
            <div class="shichen-info">
              <span class="shichen-ganzhi">${r.calc.dayGan}${r.calc.dayZhi}日
                ${r.calc.hourGan}${r.calc.hourZhi}時</span>
              <span class="shichen-gua">${r.entry.gua}卦${genderNote}</span>
            </div>
            <div class="shichen-role">
              <span class="role-badge role-${r.role==='主穴'?'main':'paired'}">${r.role}</span>
              <span class="shichen-partner">配 ${r.partner}</span>
            </div>
            ${isNow ? '<div class="shichen-now-badge">當前</div>' : ''}
          </div>`;
        }).join('')}
      </div>`;

    // 穴位配伍按鈕區（使用第一個結果的配伍）
    pairSec.style.display = '';
    const bBtns = document.getElementById('b-point-btns');
    bBtns.innerHTML = `
      <button class="btn-point btn-point--main" data-point="${firstEntry.main}" data-label="主穴">
        <span class="point-label">主穴</span>${firstEntry.main}
      </button>
      <button class="btn-point btn-point--paired" data-point="${firstEntry.paired}" data-label="配穴">
        <span class="point-label">配穴</span>${firstEntry.paired}
      </button>`;

    bBtns.querySelectorAll('.btn-point').forEach(btn =>
      btn.addEventListener('click', async () => {
        bBtns.querySelectorAll('.btn-point').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('b-point-divider').style.display = '';
        const panel = document.getElementById('b-point-panel');
        let meta = btn.dataset.label;
        try {
          const d = await Cache.loadPointData(btn.dataset.point);
          meta = { meridian: d['所屬經脈']||'', intlCode: d['國際代碼']||'',
                   attributes: d['經穴屬性']||[] };
        } catch {}
        UI.renderPointPanel(panel, btn.dataset.point, meta);
        setTimeout(() => panel.scrollIntoView({behavior:'smooth',block:'nearest'}), 120);
      })
    );

    // 若之前已選穴位，恢復顯示
    if (_currentText.name) {
      const match = bBtns.querySelector(`[data-point="${_currentText.name}"]`);
      if (match) match.click();
    }
  }

  /* ── 依時取穴：穴位點擊 ── */
  async function _onPointClick(btn) {
    document.querySelectorAll('#lingui-btns .btn-point')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const name = btn.dataset.point, label = btn.dataset.label;
    _currentText = { name, label };
    document.getElementById('lingui-divider').style.display = '';
    const panel = document.getElementById('lingui-panel');
    // 載入完整穴位資料以顯示國際代碼與經穴屬性細節
    let meta = label;
    try {
      const d = await Cache.loadPointData(name);
      meta = {
        meridian:   d['所屬經脈']   || '',
        intlCode:   d['國際代碼']   || '',
        attributes: d['經穴屬性']   || [],
      };
    } catch {}
    UI.renderPointPanel(panel, name, meta);
    setTimeout(() => panel.scrollIntoView({behavior:'smooth',block:'nearest'}), 120);
  }

  /* ── 即時時鐘 ── */
  function _startClock() {
    clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      const el = document.getElementById('lingui-clock');
      if (!el) { clearInterval(_clockTimer); return; }
      const now = new Date();
      el.textContent = `${GanZhi.calculate(now).solarStr}　${_timeStr(now)}`;
    }, 1000);
  }

  /* ── 格式化 ── */
  const _p = n => String(n).padStart(2,'0');
  const _timeStr    = d => `${_p(d.getHours())}:${_p(d.getMinutes())}:${_p(d.getSeconds())}`;
  const _fmtDisplay = d => `${d.getFullYear()}/${_p(d.getMonth()+1)}/${_p(d.getDate())} ${_p(d.getHours())}:${_p(d.getMinutes())}`;
  const _fmtCustom  = d => `${d.getFullYear()}/${_p(d.getMonth()+1)}/${_p(d.getDate())} ${_p(d.getHours())}:${_p(d.getMinutes())}`;
  const _fmtDateOnly= d => `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const _isoDate    = d => `${d.getFullYear()}-${_p(d.getMonth()+1)}-${_p(d.getDate())}`;
  const _isoTime    = d => `${_p(d.getHours())}:${_p(d.getMinutes())}`;

  function _renderError(msg) {
    document.getElementById('lingui-mode-content').innerHTML =
      `<div class="page-content" style="text-align:center;padding-top:var(--sp-xl);color:var(--clr-muted)">
         <p style="font-size:var(--fs-lg);">⚠ 計算錯誤</p>
         <p style="font-size:var(--fs-sm);margin-top:var(--sp-sm);">${msg}</p>
       </div>`;
  }

  return { init };
})();
