/**
 * settings.js
 * Manages user preferences: font size, TTS voice gender.
 * Persists to localStorage; applies on every page load.
 */

const Settings = (() => {
  const STORAGE_KEY = 'acupuncture_settings';
  const FONT_SIZES  = { small: '14px', medium: '16px', large: '19px' };

  const defaults = { fontSize: 'medium', voiceGender: 'female' };

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

  function apply() {
    const prefs = load();
    applyFontSize(prefs.fontSize);
    return prefs;
  }

  function set(key, value) {
    const prefs = load();
    prefs[key] = value;
    save(prefs);
    if (key === 'fontSize') applyFontSize(value);
    return prefs;
  }

  function get(key) {
    return load()[key];
  }

  return { apply, set, get, load, FONT_SIZES };
})();
