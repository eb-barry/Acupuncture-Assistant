/**
 * ui.js
 * Shared UI utilities: page navigation, toast, acupoint info panel,
 * image lazy-load with spinner and slow-notice.
 */

const UI = (() => {

  /* ── Page Navigation ── */
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
    }
  }

  /* ── Toast ── */
  let _toastTimer = null;
  function toast(msg, duration = 2500) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ── Acupoint Info Panel ── */
  /**
   * Render an acupoint info panel (image + description text).
   * @param {HTMLElement} container  - where to render
   * @param {string}      pointName  - e.g. "尺澤"
   * @param {string}      badgeLabel - e.g. "主穴" / "合穴"
   */
  async function renderPointPanel(container, pointName, badgeLabel = '') {
    container.innerHTML = `
      <div class="info-panel">
        <div class="info-image-wrap">
          <div class="img-placeholder" id="img-placeholder-${pointName}">
            <div class="spinner"></div>
            <span>載入穴位圖…</span>
          </div>
          <img id="point-img-${pointName}" src="" alt="${pointName}穴位圖"
               style="display:none;" loading="lazy" />
        </div>
        <p class="slow-notice" id="slow-notice-${pointName}">圖片載入中，請稍候…</p>
        <div class="info-text">
          <h4>
            ${pointName}
            ${badgeLabel ? `<span class="badge">${badgeLabel}</span>` : ''}
          </h4>
          <div id="point-desc-${pointName}">
            <div class="img-placeholder" style="position:relative;height:60px;">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>`;

    // ── Load image ──
    const imgEl  = document.getElementById(`point-img-${pointName}`);
    const phEl   = document.getElementById(`img-placeholder-${pointName}`);
    const slowEl = document.getElementById(`slow-notice-${pointName}`);

    const slowTimer = setTimeout(() => slowEl && slowEl.classList.add('visible'), 5000);

    imgEl.onload = () => {
      clearTimeout(slowTimer);
      if (phEl) phEl.style.display = 'none';
      imgEl.style.display = 'block';
      slowEl && slowEl.classList.remove('visible');
    };
    imgEl.onerror = () => {
      clearTimeout(slowTimer);
      if (phEl) phEl.innerHTML = '<span style="color:var(--clr-muted)">穴位圖暫未提供</span>';
      slowEl && slowEl.classList.remove('visible');
    };
    imgEl.src = Cache.pointImageUrl(pointName);

    // ── Load text ──
    const descEl = document.getElementById(`point-desc-${pointName}`);
    try {
      const text = await Cache.loadPointText(pointName);
      if (descEl) descEl.innerHTML = `<p>${text.trim()}</p>`;
    } catch {
      if (descEl) descEl.innerHTML = `<p style="color:var(--clr-muted)">說明文字暫未提供。</p>`;
    }
  }

  /* ── Back button helper ── */
  function backTo(pageId) {
    return () => showPage(pageId);
  }

  /* ── SVG icon shortcuts ── */
  const icons = {
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="15 18 9 12 15 6"/>
           </svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <circle cx="12" cy="12" r="3"/>
                 <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
               </svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>`,
    play:  `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    stop:  `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  };

  return { showPage, toast, renderPointPanel, backTo, icons };
})();
