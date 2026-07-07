/**
 * settings.js
 * 管理使用者偏好：全域字型大小、說明文字大小、TTS 聲音性別
 * 所有設定持久化到 localStorage
 */

const Settings = (() => {
  const STORAGE_KEY = 'acupuncture_settings';

  // 全域 UI 字型（影響按鈕、選單、標籤等）
  const FONT_SIZES = { small: '14px', medium: '16px', large: '19px' };

  // 穴位說明文字大小（獨立控制）
  const DESC_SIZES = { normal: '15px', large: '18px', xlarge: '22px' };

  const defaults = {
    fontSize:    'medium',
    descSize:    'normal',
    voiceGender: 'female',
    termsAcceptedAt: null,
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch { return { ...defaults }; }
  }

  function save(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  }

  function applyFontSize(size) {
    const px = FONT_SIZES[size] || FONT_SIZES.medium;
    document.documentElement.style.setProperty('--fs-base', px);
  }

  function applyDescSize(size) {
    const px = DESC_SIZES[size] || DESC_SIZES.normal;
    document.documentElement.style.setProperty('--fs-desc', px);
  }

  function apply() {
    const prefs = load();
    applyFontSize(prefs.fontSize);
    applyDescSize(prefs.descSize);
    return prefs;
  }

  function set(key, value) {
    const prefs = load();
    prefs[key] = value;
    save(prefs);
    if (key === 'fontSize') applyFontSize(value);
    if (key === 'descSize')  applyDescSize(value);
    return prefs;
  }

  function get(key) { return load()[key]; }

  function hasTermsConsent() {
    return !!load().termsAcceptedAt;
  }

  function getTermsAcceptedAt() {
    return load().termsAcceptedAt || null;
  }

  function setTermsConsent(isoString) {
    return set('termsAcceptedAt', isoString);
  }

  function formatTermsAcceptedAt(iso) {
    if (!iso) return '尚未同意';
    try {
      return new Date(iso).toLocaleString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }

  const FEMALE_VOICE_RE = /female|woman|girl|女|huihui|yaoyao|yating|ting-?ting|mei-?jia|hanhan/i;
  const MALE_VOICE_RE   = /male|man|boy|男|kangkang|yunxi|yunyang|yunfeng|yufeng|ming|liang|sin-?ji|bo|zhiwei|li-?mu/i;

  function _ttsVoicePool(voices) {
    const zh = voices.filter(v => v.lang && /^zh/i.test(v.lang));
    if (!zh.length) return [];
    const tw = zh.filter(v => /^zh-TW/i.test(v.lang));
    if (tw.length) return tw;
    const cn = zh.filter(v => /^zh-CN/i.test(v.lang));
    if (cn.length) return cn;
    return zh;
  }

  /** 依設定選擇 TTS 語音；男聲時排除已知女聲，避免誤回退為女聲 */
  function pickTTSVoice(gender) {
    if (!('speechSynthesis' in window)) return null;
    const pool = _ttsVoicePool(window.speechSynthesis.getVoices());
    if (!pool.length) return null;

    const isFemale = v => FEMALE_VOICE_RE.test(v.name);
    const isMale   = v => MALE_VOICE_RE.test(v.name);
    const wantMale = gender === 'male';

    if (wantMale) {
      return pool.find(isMale)
          || pool.find(v => !isFemale(v))
          || pool[pool.length - 1];
    }
    return pool.find(isFemale)
        || pool.find(v => !isMale(v))
        || pool[0];
  }

  return {
    apply, set, get, load,
    hasTermsConsent, getTermsAcceptedAt, setTermsConsent, formatTermsAcceptedAt,
    pickTTSVoice,
    FONT_SIZES, DESC_SIZES,
  };
})();
