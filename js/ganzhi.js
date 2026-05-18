/**
 * ganzhi.js
 * Core module: Heavenly Stems (天干), Earthly Branches (地支),
 * Five-Rat Escape (五鼠遁) hour-stem derivation, and
 * Lingui Bafa (靈龜八法) main/paired acupoint calculation.
 *
 * No external dependencies — pure ES5-compatible logic.
 */

const GanZhi = (() => {

  /* ── Tables ── */

  const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const DI_ZHI   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  // Lingui Bafa numeric values for each stem/branch
  const GAN_VALUE = { 甲:10, 乙:9, 丙:8, 丁:7, 戊:6, 己:10, 庚:9, 辛:8, 壬:7, 癸:6 };
  const ZHI_VALUE = { 子:6, 丑:10, 寅:8, 卯:8, 辰:10, 巳:7, 午:7, 未:10, 申:9, 酉:9, 戌:10, 亥:6 };

  // Yang-day stems (陽日)
  const YANG_GAN = new Set(['甲','丙','戊','庚','壬']);

  // Five-Rat Escape: day-stem → index of 子時 hour-stem in TIAN_GAN
  const WU_SHU_DUN = { 甲:0, 乙:2, 丙:4, 丁:6, 戊:8, 己:0, 庚:2, 辛:4, 壬:6, 癸:8 };

  // Lingui Bafa result table  remainder → { gua, main, paired, vessel }
  const BAFA_TABLE = {
    1: { gua:'坎', main:'申脈', paired:'後溪', vessel:'陽蹻脈' },
    2: { gua:'坤', main:'照海', paired:'列缺', vessel:'陰蹻脈' },
    3: { gua:'震', main:'外關', paired:'足臨泣', vessel:'陽維脈' },
    4: { gua:'巽', main:'足臨泣', paired:'外關', vessel:'帶脈' },
    5: { gua:'坤', main:'照海', paired:'列缺', vessel:'陰蹻脈' },
    6: { gua:'乾', main:'公孫', paired:'內關', vessel:'沖脈' },
    7: { gua:'兌', main:'後溪', paired:'申脈', vessel:'督脈' },
    8: { gua:'艮', main:'內關', paired:'公孫', vessel:'陰維脈' },
    9: { gua:'離', main:'列缺', paired:'照海', vessel:'任脈' },
  };

  // Shichen (時辰) — maps hour (0-23) to branch index (子=0 … 亥=11)
  // 子時: 23:00-01:00  → index 0
  function hourToZhiIndex(hour) {
    // 23:00-23:59 is 子時 of the *next* day (handled by caller adjusting the date)
    return Math.floor(((hour + 1) % 24) / 2);
  }

  /* ── Derive hour stem (時干) via Five-Rat Escape ── */
  function getHourGan(dayGan, zhiIndex) {
    const base  = WU_SHU_DUN[dayGan];
    const index = (base + zhiIndex) % 10;
    return TIAN_GAN[index];
  }

  /* ── Main public API ── */

  /**
   * Calculate Lingui Bafa result for a given Date.
   * Relies on Lunar.Solar / Lunar.Lunar from lunar-javascript.
   * @param  {Date} date
   * @returns {{ solarStr, lunarStr, dayGan, dayZhi, hourGan, hourZhi,
   *             isYang, total, remainder, gua, main, paired, vessel }}
   */
  function calculate(date) {
    const hour = date.getHours();

    // lunar-javascript: Solar → Lunar
    const solar = Lunar.Solar.fromDate(date);
    let   lunar = solar.getLunar();

    // 子時 on or after 23:00 belongs to next day's ganzhi
    let adjDate = date;
    if (hour >= 23) {
      adjDate = new Date(date.getTime() + 86400000);
      const s2 = Lunar.Solar.fromDate(adjDate);
      lunar = s2.getLunar();
    }

    // Day stem & branch from lunar-javascript
    const dayGanZhi = lunar.getDayInGanZhi();   // e.g. "甲子"
    const dayGan    = dayGanZhi[0];
    const dayZhi    = dayGanZhi[1];

    // Hour branch index
    const zhiIdx  = hourToZhiIndex(hour);
    const hourZhi = DI_ZHI[zhiIdx];
    const hourGan = getHourGan(dayGan, zhiIdx);

    // Lingui Bafa sum
    const total   = GAN_VALUE[dayGan] + ZHI_VALUE[dayZhi] +
                    GAN_VALUE[hourGan] + ZHI_VALUE[hourZhi];
    const isYang  = YANG_GAN.has(dayGan);
    let   rem     = isYang ? (total % 9) : (total % 6);
    if (rem === 0) rem = isYang ? 9 : 6;

    const result  = BAFA_TABLE[rem];

    // Friendly display strings
    const solarStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
    const lunarStr = `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInGanZhi()}月 ${dayGanZhi}日 ${hourGan}${hourZhi}時`;

    return {
      solarStr,
      lunarStr,
      dayGan, dayZhi,
      hourGan, hourZhi,
      isYang,
      total, remainder: rem,
      ...result,
    };
  }

  /* ── Utility exports for other modules ── */
  function getZhiName(index) { return DI_ZHI[index]; }
  function getCurrentZhiIndex() { return hourToZhiIndex(new Date().getHours()); }

  return { calculate, getZhiName, getCurrentZhiIndex, TIAN_GAN, DI_ZHI, BAFA_TABLE };
})();
