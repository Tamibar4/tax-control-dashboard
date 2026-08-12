/* ============================================================
   rates.js - שערי מטבע
   השער היציג של בנק ישראל, לפי תאריך העסקה.

   🔴 בנק ישראל אינו מאפשר משיכה ישירה מדפדפן באתר מתארח.
   הבקשה נחסמת בשקט ומחזירה "Failed to fetch" בלי שום קוד תשובה.
   לכן יש כאן שלושה מקורות, לפי הסדר:
     1. rates-usd.json שיושב לצד הדף עצמו. עובד תמיד, גם בלי אינטרנט.
     2. בנק ישראל ישירות. עובד רק כשהדף רץ מהמחשב ולא מאתר.
     3. הקלדה ידנית.
   ============================================================ */

window.Rates = (function () {

  var CACHE_KEY = 'tax-dashboard-rates-v1';
  var LOCAL_FILE = 'rates-usd.json';
  var BASE = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/' +
             'BOI.STATISTICS/EXR/1.0/RER_USD_ILS';

  var localTable = null;   /* נטען פעם אחת */
  var localPromise = null;

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

  /* מפרק את טבלת ה-CSV של בנק ישראל.
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

  /* בוחר את השער האחרון שאינו מאוחר מהתאריך המבוקש.
     בשבת, בחג ובכל יום שאין בו פרסום - זה השער של יום המסחר שלפניו. */
  function pickOnOrBefore(pairs, dateStr) {
    var pick = null;
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].date <= dateStr && (!pick || pairs[i].date > pick.date)) pick = pairs[i];
    }
    return pick;
  }

  function loadLocalTable() {
    if (localTable) return Promise.resolve(localTable);
    if (localPromise) return localPromise;
    localPromise = fetch(LOCAL_FILE)
      .then(function (r) {
        if (!r.ok) throw new Error('טבלת השערים שבאתר לא נמצאה');
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.rates) throw new Error('טבלת השערים שבאתר פגומה');
        localTable = {
          updated: j.updated || '',
          pairs: Object.keys(j.rates).map(function (d) {
            return { date: d, rate: j.rates[d] };
          })
        };
        return localTable;
      })
      /* 🔴 בלי זה, ניסיון ראשון שנכשל נשמר כהבטחה דחויה ומפיל כל ניסיון
         עתידי, גם כשהרשת חזרה. נמדד בפועל: הטבלה נמשכה ב-200 בבדיקה
         ישירה, ובאותו רגע Rates.get המשיך להיכשל. */
      .catch(function (e) {
        localPromise = null;
        throw e;
      });
    return localPromise;
  }

  function fromLocal(dateStr) {
    return loadLocalTable().then(function (t) {
      var pick = pickOnOrBefore(t.pairs, dateStr);
      if (!pick) throw new Error('אין שער לתאריך הזה בטבלה');
      return { rate: pick.rate, rateDate: pick.date, source: 'טבלת בנק ישראל שבאתר' };
    });
  }

  function fromBoi(dateStr) {
    var url = BASE + '?startperiod=' + daysBefore(dateStr, 10) +
              '&endperiod=' + dateStr + '&format=csv';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('בנק ישראל החזיר ' + r.status);
      return r.text();
    }).then(function (text) {
      var pick = pickOnOrBefore(parseCsv(text), dateStr);
      if (!pick) throw new Error('לא נמצא שער לתאריך הזה');
      return { rate: pick.rate, rateDate: pick.date, source: 'בנק ישראל' };
    });
  }

  /* מחזיר את השער לתאריך שנשלח. מנסה קודם את הטבלה שלצד הדף,
     ורק אם התאריך חדש ממנה - פונה לבנק ישראל. */
  function get(dateStr) {
    var cache = loadCache();
    if (cache[dateStr]) return Promise.resolve(cache[dateStr]);

    function remember(res) {
      cache[dateStr] = res;
      saveCache(cache);
      return res;
    }

    return fromLocal(dateStr).then(function (res) {
      /* התאריך המבוקש חדש מהטבלה - שווה לנסות משיכה חיה */
      if (localTable && localTable.updated && dateStr > localTable.updated) {
        return fromBoi(dateStr).then(remember).catch(function () { return remember(res); });
      }
      return remember(res);
    }).catch(function (localErr) {
      /* המסלול השני. אם גם הוא נופל, ההודעה למשתמשת מזכירה את שני המקורות
         ולא רק את האחרון שנכשל, אחרת נראה כאילו רק בנק ישראל אשם. */
      return fromBoi(dateStr).then(remember).catch(function (boiErr) {
        throw new Error('הטבלה שבאתר: ' + localErr.message +
                        '. בנק ישראל: ' + boiErr.message);
      });
    });
  }

  function clear() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* אין מה לעשות */ }
    localTable = null;
    localPromise = null;
  }

  return {
    get: get,
    clear: clear,
    parseCsv: parseCsv,
    pickOnOrBefore: pickOnOrBefore,
    CACHE_KEY: CACHE_KEY
  };
})();
