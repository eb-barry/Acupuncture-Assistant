/**
 * cache.js
 * On-demand loader for acupoint images (.webp) and text files (.txt).
 * Caches fetched content in memory for the session.
 * Also provides helpers to load JSON data files once.
 */

const Cache = (() => {
  const BASE = 'https://raw.githubusercontent.com/eb-barry/Acupuncture-Assistant/main/assets';
  const _mem = {};   // in-memory session cache

  async function fetchText(url) {
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _mem[url] = text;
    return text;
  }

  /** Load a JSON data file (cached in memory) */
  async function loadJSON(filename) {
    const url = `${BASE}/${filename}`;
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cannot load ${filename}: HTTP ${res.status}`);
    const data = await res.json();
    _mem[url] = data;
    return data;
  }

  /** Get acupoint description text */
  async function loadPointText(pointName) {
    const url = `${BASE}/points/${encodeURIComponent(pointName)}.txt`;
    return fetchText(url);
  }

  /** Resolve the image URL for an acupoint (does NOT fetch — just returns URL for <img src>) */
  function pointImageUrl(pointName) {
    return `${BASE}/points/${encodeURIComponent(pointName)}.webp`;
  }

  /** Get rhyme text content */
  async function loadRhymeText(filename) {
    const url = `${BASE}/rhymes/${encodeURIComponent(filename)}.txt`;
    return fetchText(url);
  }

  return { loadJSON, loadPointText, pointImageUrl, loadRhymeText };
})();
