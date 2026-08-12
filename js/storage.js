/* ============================================================
   storage.js - שמירה מקומית בדפדפן
   הנתונים נשמרים אצל המשתמשת בלבד ולא נשלחים לשום מקום.
   ============================================================ */

window.Store = (function () {

  var KEY = 'tax-dashboard-v1';

  /* מבנה ברירת המחדל של ההגדרות, נגזר מקובץ נתוני המס */
  function defaultSettings() {
    var c = window.TAX_CONFIG_DEFAULTS;
    return {
      taxYear: c.taxYear,
      lastUpdated: c.lastUpdated,
      vatRate: c.vat.rate,
      creditPointValue: c.incomeTax.creditPointValue,
      creditPoints: c.incomeTax.defaultCreditPoints,
      brackets: JSON.parse(JSON.stringify(c.incomeTax.brackets)),
      surtax: JSON.parse(JSON.stringify(c.incomeTax.surtax)),
      incomeTaxAdvanceRate: c.incomeTax.defaultAdvanceRate,
      blLowCeiling: c.bituahLeumi.lowCeiling,
      blLowRate: c.bituahLeumi.lowRate,
      blHighCeiling: c.bituahLeumi.highCeiling,
      blHighRate: c.bituahLeumi.highRate,
      blMonthlyAdvance: c.bituahLeumi.defaultMonthlyAdvance,
      /* invoice = לפי חשבונית או דרישת תשלום, cash = לפי כסף שהתקבל בפועל */
      reportingMethod: 'invoice',
      /* המטבע שבו נפתחת שורת הכנסה חדשה. הכסף מגיע בדולרים. */
      defaultIncomeCurrency: 'USD',
      /* מצב פשוט: הכנסות בלבד, בלי הוצאות. הערכה גסה כלפי מעלה.
         כשהוא כבוי נפתח גם חלק ההוצאות והחישוב מדויק יותר. */
      simpleMode: true
    };
  }

  function emptyState() {
    return {
      version: 1,
      settings: defaultSettings(),
      months: []
    };
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings || !Array.isArray(parsed.months)) return null;
      /* השלמת שדות שנוספו אחרי שהנתונים נשמרו */
      var base = defaultSettings();
      for (var k in base) {
        if (!(k in parsed.settings)) parsed.settings[k] = base[k];
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* אין מה לעשות */ }
  }

  function newId() {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    KEY: KEY,
    defaultSettings: defaultSettings,
    emptyState: emptyState,
    load: load,
    save: save,
    clear: clear,
    newId: newId
  };
})();
