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

  function _exitApp() {
    const overlay = document.getElementById('consent-overlay');
    if (overlay) overlay.hidden = true;

    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="consent-exit-screen">
          <p class="consent-exit-title">已離開應用程式</p>
          <p class="consent-exit-text">您選擇不同意重要事項與條款，因此無法使用針灸助理。<br>若改變主意，請重新開啟本應用程式並閱讀條款後同意。</p>
        </div>`;
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
      try { window.close(); } catch {}
      setTimeout(_exitApp, 120);
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
