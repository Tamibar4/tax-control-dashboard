/* ============================================================
   rates.js - שערי מטבע
   השער היציג נמשך מבנק ישראל לפי תאריך, ונשמר במטמון מקומי.
   אם אין אינטרנט או שהמשיכה נכשלת - מקלידים את השער ידנית.
   ============================================================ */

window.Rates = (function () {

  var CACHE_KEY = 'tax-dashboard-rates-v1';
  var BASE = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/' +
             'BOI.STATISTICS/EXR/1.0/RER_USD_ILS';

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* אין מה לעשות */ }
  }

  function daysBefore(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /* מפרק את טבלת ה-CSV של בנק ישראל לזוגות של תאריך ושער.
     נשען על שמות העמודות ולא על מיקומן, כי הסדר עלול להשתנות. */
  function parseCsv(text) {
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    var head = lines[0].split(',');
    var iDate = head.indexOf('TIME_PERIOD');
    var iVal = head.indexOf('OBS_VALUE');
    if (iDate === -1 || iVal === -1) return [];
    var out = [];
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].split(',');
      var v = parseFloat(c[iVal]);
      if (c[iDate] && isFinite(v)) out.push({ date: c[iDate], rate: v });
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }

  /* מחזיר את השער היציג לתאריך שנשלח.
     בשבת, בחג ובכל יום שאין בו פרסום - מוחזר השער האחרון שפורסם לפניו,
     והתאריך שלו מוחזר יחד איתו כדי שיהיה ברור מה נלקח. */
  function get(dateStr) {
    var cache = loadCache();
    if (cache[dateStr]) return Promise.resolve(cache[dateStr]);

    var from = daysBefore(dateStr, 10);
    var url = BASE + '?startperiod=' + from + '&endperiod=' + dateStr + '&format=csv';

    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('בנק ישראל החזיר ' + r.status);
      return r.text();
    }).then(function (text) {
      var rows = parseCsv(text);
      /* נלקחת השורה האחרונה שאינה מאוחרת מהתאריך המבוקש */
      var pick = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].date <= dateStr) pick = rows[i];
      }
      if (!pick) throw new Error('לא נמצא שער לתאריך הזה');
      var res = { rate: pick.rate, rateDate: pick.date, source: 'בנק ישראל' };
      cache[dateStr] = res;
      saveCache(cache);
      return res;
    });
  }

  function clear() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* אין מה לעשות */ }
  }

  return { get: get, clear: clear, parseCsv: parseCsv, CACHE_KEY: CACHE_KEY };
})();
