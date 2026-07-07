/**
 * consent.js
 * 首次啟動條款同意視窗：須捲動至文末才可勾選同意。
 */

const Consent = (() => {

  const SCROLL_THRESHOLD = 24;
  let _scrollHandler = null;

  function _mountTerms(container) {
    const tpl = document.getElementById('legal-terms-template');
    if (!tpl || !container) return;
    container.innerHTML = '';
    container.appendChild(tpl.content.cloneNode(true));
  }

  function _isScrolledToBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
  }

  function _updateFooterState(scrollEl, footerEl) {
    if (_isScrolledToBottom(scrollEl)) {
      footerEl.classList.add('visible');
    }
  }

  function _tryClosePage() {
    let closed = false;

    try {
      window.open('', '_self');
      window.close();
      closed = window.closed;
    } catch {}

    if (!closed) {
      try {
        window.location.replace('about:blank');
      } catch {
        try { window.location.href = 'about:blank'; } catch {}
      }
    }

    setTimeout(() => {
      const hint = document.getElementById('consent-exit-hint');
      if (hint && !window.closed) hint.hidden = false;
    }, 400);
  }

  function _exitApp() {
    const overlay = document.getElementById('consent-overlay');
    if (overlay) overlay.hidden = true;

    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="consent-exit-screen">
          <p class="consent-exit-title">已離開應用程式</p>
          <p class="consent-exit-text">您選擇不同意重要事項與條款，因此無法使用針灸助理。<br>若改變主意，請重新開啟本應用程式並閱讀條款後同意。</p>
          <button type="button" class="btn btn-primary consent-exit-close-btn" id="consent-exit-close-btn">關閉此頁面</button>
          <p class="consent-exit-hint" id="consent-exit-hint" hidden>若無法自動關閉，請使用瀏覽器關閉分頁，或從主畫面切換離開此 App。</p>
        </div>`;

      document.getElementById('consent-exit-close-btn')
        ?.addEventListener('click', _tryClosePage);
    }
    document.body.classList.remove('consent-locked');
  }

  function _bindModal() {
    const overlay  = document.getElementById('consent-overlay');
    const scrollEl = document.getElementById('consent-scroll');
    const footerEl = document.getElementById('consent-footer');
    const checkbox = document.getElementById('consent-checkbox');
    const btnAgree = document.getElementById('consent-agree-btn');
    const btnDismiss = document.getElementById('consent-dismiss-btn');

    if (!overlay || !scrollEl || !footerEl) return;

    _mountTerms(scrollEl);

    footerEl.classList.remove('visible');
    checkbox.checked = false;
    btnAgree.disabled = true;

    if (_scrollHandler) scrollEl.removeEventListener('scroll', _scrollHandler);
    _scrollHandler = () => _updateFooterState(scrollEl, footerEl);
    scrollEl.addEventListener('scroll', _scrollHandler);

    requestAnimationFrame(() => _updateFooterState(scrollEl, footerEl));

    checkbox.onchange = () => {
      btnAgree.disabled = !checkbox.checked;
    };

    btnAgree.onclick = () => {
      if (!checkbox.checked) return;
      Settings.setTermsConsent(new Date().toISOString());
      overlay.hidden = true;
      document.body.classList.remove('consent-locked');
      updateSettingsDisplay();
    };

    btnDismiss.onclick = () => {
      _exitApp();
      _tryClosePage();
    };
  }

  function init() {
    if (Settings.hasTermsConsent()) return;

    const overlay = document.getElementById('consent-overlay');
    if (!overlay) return;

    _bindModal();
    overlay.hidden = false;
    document.body.classList.add('consent-locked');
  }

  function mountSettingsTerms() {
    const mount = document.getElementById('settings-terms-mount');
    if (!mount || mount.dataset.mounted === '1') return;
    _mountTerms(mount);
    mount.dataset.mounted = '1';
  }

  function updateSettingsDisplay() {
    const el = document.getElementById('terms-consent-datetime');
    if (el) el.textContent = Settings.formatTermsAcceptedAt(Settings.getTermsAcceptedAt());
  }

  return { init, mountSettingsTerms, updateSettingsDisplay };
})();
