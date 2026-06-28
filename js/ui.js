/**
 * ui.js
 * 共用 UI 工具：頁面切換、Toast、穴位資訊面板
 *
 * 圖片使用 WebP 格式，載入速度快（~100KB），
 * 移除所有 loading spinner、slow-notice 及 timeout 邏輯。
 */

const UI = (() => {

  /* ── 頁面切換 ── */
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      const scroll = target.querySelector('.scroll-area');
      if (scroll) scroll.scrollTop = 0;
    }
  }

  /* ── Toast ── */
  let _toastTimer = null;
  function toast(msg, duration = 2800) {
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

  /* ── 穴位資訊面板 ──
   * DOM 結構：
   *   container
   *     ├─ <div class="point-img-block">   ← 全寬圖片
   *     └─ <div class="point-text-block">  ← 文字說明
   *
   * meta: string（badge 標籤）或 { meridian, attributes[] }
   */
  async function renderPointPanel(container, pointName, meta) {
    const uid    = pointName.replace(/[^\w]/g, '_') + '_' + Date.now();
    const imgId  = `pi_${uid}`;
    const descId = `pd_${uid}`;

    // 組合標題 HTML
    let headerHTML = '';
    if (meta && typeof meta === 'object') {
      const attrTags = (meta.attributes || []).map(a =>
        `<span class="attr-tag">${a}</span>`
      ).join('');
      headerHTML = `
        <div class="point-header">
          <span class="point-title">${pointName}</span>
          ${meta.meridian ? `<span class="meridian-tag">${meta.meridian}</span>` : ''}
          ${meta.intlCode ? `<span class="intl-code-tag">${meta.intlCode}</span>` : ''}
        </div>
        ${attrTags ? `<div class="point-attr-row">${attrTags}</div>` : ''}`;
    } else {
      headerHTML = `
        <div class="point-header">
          <span class="point-title">${pointName}</span>
          ${meta ? `<span class="badge">${meta}</span>` : ''}
        </div>`;
    }

    container.innerHTML = `
      <div class="point-img-block">
        <img id="${imgId}" src="" alt="${pointName}穴位圖"
             style="width:100%;height:auto;display:block;"
             onerror="this.style.opacity='0';" />
      </div>
      <div class="point-text-block">
        ${headerHTML}
        <div id="${descId}" style="margin-top:var(--sp-sm);"></div>
      </div>`;

    // 載入圖片（多 CDN 備援，WebP 格式）
    const imgEl = document.getElementById(imgId);
    const urls  = Cache.pointImageUrls(pointName);
    let   idx   = 0;
    function tryNext() {
      if (idx >= urls.length) { imgEl.style.opacity = '0'; return; }
      const url = urls[idx++];
      imgEl.onerror = tryNext;
      imgEl.onload  = () => { imgEl.style.opacity = '1'; };
      imgEl.src = url;
    }
    tryNext();

    // 載入文字說明
    const descEl = document.getElementById(descId);
    try {
      const d = await Cache.loadPointData(pointName);
      if (descEl) descEl.innerHTML = _renderPointFields(d);
    } catch {
      if (descEl) descEl.innerHTML =
        `<p style="color:var(--clr-muted);font-size:var(--fs-sm);">取穴說明暫未提供。</p>`;
    }
  }

  /* ── 穴位說明欄位 ── */
  function _renderPointFields(d) {
    let html = '';

    // 國際代碼（始終顯示於最上方）
    if (d['國際代碼']) {
      html += `<div class="point-field-meta">
        <span class="intl-code-inline">${d['國際代碼']}</span>
        ${d['所屬經脈'] ? `<span class="meridian-inline">${d['所屬經脈']}</span>` : ''}
      </div>`;
    }

    // 精確屬性細節（交會穴說明等）
    if (d['精確屬性細節']) {
      html += `<div class="point-field">
        <div class="point-field-label" style="color:var(--clr-gold)">◆ 精確屬性資料</div>
        <div class="point-field-value">${d['精確屬性細節']}</div>
      </div>`;
    }

    const fields = [
      { key: '主治',         icon: '◉', color: 'var(--clr-teal-dark)' },
      { key: '現代醫學闡釋', icon: '◈', color: 'var(--clr-teal)'      },
      { key: '取穴要領',     icon: '◎', color: 'var(--clr-ink)'       },
      { key: '簡易取穴法',   icon: '◌', color: 'var(--clr-text)'      },
    ];
    for (const f of fields) {
      if (!d[f.key]) continue;
      html += `<div class="point-field">
        <div class="point-field-label" style="color:${f.color}">${f.icon} ${f.key}</div>
        <div class="point-field-value">${d[f.key]}</div>
      </div>`;
    }
    if (d['針灸禁忌']) {
      html += `<div class="point-field point-field--caution">
        <div class="point-field-label" style="color:var(--clr-danger)">⚠ 針灸禁忌</div>
        <div class="point-field-value">
          <strong>${d['針灸禁忌']}</strong>
          ${d['禁忌說明']
            ? `<br><span style="font-size:var(--fs-xs);color:var(--clr-muted)">${d['禁忌說明']}</span>`
            : ''}
        </div>
      </div>`;
    }
    return html || `<p style="color:var(--clr-muted);font-size:var(--fs-sm)">暫無資料</p>`;
  }

  
  return { showPage, toast, renderPointPanel };
})();
