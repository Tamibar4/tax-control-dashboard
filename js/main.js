/* ============================================================
   app.js - חיבור המסכים
   ============================================================ */

(function () {

  var state = null;
  var view = { mode: 'year', period: null };
  var currentMonthId = null;

  var MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                     'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  var VAT_TYPES = [
    { v: '18', t: 'מע"מ 18%' },
    { v: '0', t: 'שיעור אפס 0%' },
    { v: 'exempt', t: 'פטור או לבדיקה' }
  ];

  var INCOME_CATEGORIES = [
    'משיכה מחברת מסחר בחו"ל',
    'גיוס עובדים',
    'שירות ללקוח בחו"ל',
    'שירות ללקוח בישראל',
    'ייעוץ',
    'אחר'
  ];
  var EXPENSE_CATEGORIES = ['ספקים וקבלני משנה', 'תוכנה ומנויים', 'שיווק ופרסום', 'משרד וציוד',
                            'רכב ונסיעות', 'תקשורת', 'מקצועי (רו"ח, עו"ד)', 'אחר'];

  /* ---------- עזרי תצוגה ---------- */

  function fmt(n) {
    if (!isFinite(n)) n = 0;
    return new Intl.NumberFormat('he-IL', {
      style: 'currency', currency: 'ILS', maximumFractionDigits: 0
    }).format(Math.round(n));
  }

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function monthLabel(m) { return MONTH_NAMES[m.month - 1] + ' ' + m.year; }

  var toastTimer = null;
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function persist() { Store.save(state); }

  function sortMonths() {
    state.months.sort(function (a, b) {
      return (a.year - b.year) || (a.month - b.month);
    });
  }

  /* cls: pos / neg / warn / total. isTotal: שורת סיכום מודגשת. */
  function rowHtml(k, v, cls, isTotal) {
    var total = (isTotal === true || isTotal === 'total' || cls === 'total');
    var colour = (cls && cls !== 'total') ? cls : '';
    return '<div class="row' + (total ? ' total' : '') + '">' +
      '<span class="k">' + esc(k) + '</span>' +
      '<span class="v ' + colour + '">' + esc(v) + '</span></div>';
  }

  /* ---------- בחירת תקופה ---------- */

  function monthsInView() {
    var y = state.settings.taxYear;
    var inYear = state.months.filter(function (m) { return m.year === y; });
    if (view.mode === 'year') return inYear;
    if (view.mode === 'month') {
      return inYear.filter(function (m) { return String(m.month) === String(view.period); });
    }
    /* דו-חודשי: 1-2, 3-4, 5-6, 7-8, 9-10, 11-12 */
    var start = parseInt(view.period, 10);
    return inYear.filter(function (m) { return m.month === start || m.month === start + 1; });
  }

  function buildPeriodPicker() {
    var wrap = el('periodPickWrap');
    var sel = el('periodPick');
    if (view.mode === 'year') { wrap.hidden = true; return; }
    wrap.hidden = false;
    var opts = [];
    if (view.mode === 'month') {
      for (var i = 1; i <= 12; i++) opts.push({ v: i, t: MONTH_NAMES[i - 1] });
    } else {
      for (var s = 1; s <= 11; s += 2) {
        opts.push({ v: s, t: MONTH_NAMES[s - 1] + ' - ' + MONTH_NAMES[s] });
      }
    }
    if (view.period === null || !opts.some(function (o) { return String(o.v) === String(view.period); })) {
      view.period = opts[0].v;
    }
    sel.innerHTML = opts.map(function (o) {
      return '<option value="' + o.v + '"' +
        (String(o.v) === String(view.period) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
  }

  /* ---------- לוח הבקרה ---------- */

  function renderDashboard() {
    buildPeriodPicker();

    var months = monthsInView();
    var p = Calc.fullPicture(months, state.settings);
    var a = p.agg;

    el('topSub').textContent = 'עוסק מורשה · שנת מס ' + state.settings.taxYear +
      ' · ' + (state.settings.reportingMethod === 'cash'
        ? 'לפי כסף שהתקבל בפועל' : 'לפי חשבונית או דרישת תשלום');

    /* ארבעת הכרטיסים */
    var vatCard = el('cardVat').parentElement;
    el('cardVat').textContent = fmt(a.vatPayable);
    vatCard.className = 'card ' + (a.vatPayable < 0 ? 'free' : 'vault');
    vatCard.querySelector('.hint').textContent = a.vatPayable < 0
      ? 'עודף תשומות. צפוי החזר.' : 'קופה נפרדת. זה לא כסף שלך.';

    el('cardTax').textContent = fmt(p.tax.recommendedThisMonth);
    el('cardTaxHint').textContent = 'לחודש. יתרה שנצברה: ' + fmt(Math.max(0, p.tax.balance));

    el('cardBl').textContent = fmt(p.bl.recommendedThisMonth);
    el('cardBlHint').textContent = 'מעבר למקדמה של ' + fmt(p.bl.actualMonthlyAdvance);

    var freeCard = el('cardFree').parentElement;
    el('cardFree').textContent = fmt(p.freeMoney);
    freeCard.className = 'card ' + (p.freeMoney < 0 ? 'debt' : 'free');

    /* התמונה המצטברת */
    var simple = state.settings.simpleMode;
    el('rowsSummary').innerHTML =
      rowHtml('הכנסות מצטברות, ללא מע"מ', fmt(a.incomeNet)) +
      rowHtml('כסף שנכנס בפועל, כולל מע"מ', fmt(a.incomeGross)) +
      (simple ? '' :
        rowHtml('הוצאות מוכרות מצטברות', fmt(a.expenseRecognized)) +
        rowHtml('כל ההוצאות שיצאו מהחשבון', fmt(a.expenseGross))) +
      rowHtml(simple ? 'בסיס למס' : 'רווח מצטבר', fmt(a.profit), a.profit < 0 ? 'neg' : 'pos') +
      rowHtml('מקדמות שכבר שולמו', fmt(a.incomeTaxAdvance + a.salaryTaxWithheld + a.blAdvance)) +
      rowHtml('יתרה שצריך לשמור בצד', fmt(p.setAside.total), 'warn', true);

    var noteBits = [];
    if (simple) {
      noteBits.push('מצב פשוט: החישוב על ההכנסות בלבד, בלי הוצאות. הערכה גסה כלפי מעלה.');
    }
    noteBits.push('חודשי פעילות שנספרו: ' + a.monthsActive);
    if (a.unpaidIncome > 0) {
      noteBits.push('הכנסות שטרם שולמו: ' + fmt(a.unpaidIncome));
    }
    noteBits.push('התוצאה תלויה בשיטת הדיווח שנבחרה ובנסיבות העסק.');
    el('summaryNote').textContent = noteBits.join(' · ');

    /* מע"מ */
    el('rowsVat').innerHTML =
      rowHtml('מע"מ שנגבה מלקוחות', fmt(a.vatCollected)) +
      rowHtml('מע"מ תשומות לקיזוז', fmt(-a.vatInput)) +
      rowHtml('מע"מ לתשלום', fmt(a.vatPayable), 'total');

    el('vatWarn').innerHTML = a.zeroRatedNet > 0
      ? '<div class="warn-box">' + fmt(a.zeroRatedNet) +
        ' מהמחזור סווגו בשיעור אפס או כפטור. זה לא נקבע אוטומטית לפי מדינת הלקוח, ' +
        'ויש לוודא מול רו"ח שהתנאים מתקיימים.</div>'
      : '';

    /* מס הכנסה */
    var t = p.tax;
    el('rowsTax').innerHTML =
      rowHtml('תחזית רווח שנתי', fmt(t.projectedAnnualProfit)) +
      rowHtml('מס שנתי חזוי', fmt(t.annualTax)) +
      rowHtml('שיעור מס אפקטיבי', (t.effectiveRate * 100).toFixed(1) + '%') +
      rowHtml('מס שנצבר עד היום', fmt(t.accruedTax)) +
      rowHtml('מקדמות ששולמו', fmt(-t.advancesPaid)) +
      rowHtml('יתרה להפרשה', fmt(t.balance), t.balance > 0 ? 'warn' : 'pos') +
      rowHtml('הפרשה מומלצת החודש', fmt(t.recommendedThisMonth), 'total');

    /* ביטוח לאומי */
    var b = p.bl;
    el('rowsBl').innerHTML =
      rowHtml('רווח חודשי ממוצע', fmt(b.avgMonthlyProfit)) +
      rowHtml('מקדמה חודשית בפועל', fmt(b.actualMonthlyAdvance)) +
      rowHtml('חבות חודשית משוערת', fmt(b.monthlyLiability)) +
      rowHtml('שולם עד היום', fmt(b.paid)) +
      rowHtml('חבות שנצברה', fmt(b.accrued)) +
      rowHtml('פער מצטבר לשמור בצד', fmt(b.gap), b.gap > 0 ? 'warn' : 'pos', true);

    /* גרף חודשי */
    renderChart(a, p, simple);

    /* כמה נשאר מכל חודש */
    renderMonthlyNet(a, p, simple);
  }

  /* גרף עמודות חודשי, מצויר ישירות ב-SVG בלי שום ספרייה חיצונית.
     החודשים מסודרים מימין לשמאל, כמו הקריאה בעברית. */
  function renderChart(a, p, simple) {
    var wrap = el('chartWrap');
    var legend = el('chartLegend');

    var series = [
      { key: 'income', label: 'הכנסות ללא מע"מ', colour: 'var(--vault)' },
      { key: 'expense', label: 'הוצאות מוכרות', colour: '#7b8aa3' },
      { key: 'profit', label: 'רווח', colour: 'var(--free)' },
      { key: 'taxes', label: 'מסים', colour: 'var(--provision)' }
    ].filter(function (s) { return simple ? s.key !== 'expense' : true; });

    legend.innerHTML = series.map(function (s) {
      return '<span class="lg"><i style="background:' + s.colour + '"></i>' + esc(s.label) + '</span>';
    }).join('');

    if (!a.perMonth.length) {
      wrap.innerHTML = '<div class="empty">אין עדיין נתונים להצגה.</div>';
      return;
    }

    var totalBase = a.profit;
    var taxTotal = Math.max(0, p.tax.accruedTax);
    var blTotal = Math.max(0, p.bl.accrued);

    var data = a.perMonth.map(function (m) {
      var share = totalBase > 0 ? (m.profit / totalBase) : 0;
      return {
        name: MONTH_NAMES[m.month - 1],
        income: m.incomeNet,
        expense: m.expenseRecognized,
        profit: m.profit,
        taxes: Math.max(0, m.vatPayable) + taxTotal * share + blTotal * share
      };
    });

    var max = 0;
    data.forEach(function (d) {
      series.forEach(function (s) { if (d[s.key] > max) max = d[s.key]; });
    });
    if (max <= 0) max = 1;
    /* מעגלים כלפי מעלה כדי שהקו העליון יהיה מספר עגול */
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    var top = Math.ceil(max / step) * step;

    var padR = 12, padL = 58, padT = 14, padB = 30;
    var groupW = Math.max(58, series.length * 20 + 22);
    var plotW = groupW * data.length;
    var W = plotW + padL + padR;
    var H = 250;
    var plotH = H - padT - padB;

    function y(v) { return padT + plotH - (Math.max(0, v) / top) * plotH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
              '" role="img" aria-label="גרף חודשי של הכנסות, הוצאות, רווח ומסים">';

    /* קווי סרגל וערכים. הסרגל בצד ימין, כי הקריאה בעברית מתחילה משם. */
    for (var g = 0; g <= 4; g++) {
      var val = top * g / 4;
      var yy = y(val);
      svg += '<line x1="' + padR + '" x2="' + (W - padL) + '" y1="' + yy + '" y2="' + yy +
             '" stroke="#e3e8f0" stroke-width="1"/>';
      svg += '<text x="' + (W - padL + 8) + '" y="' + (yy + 4) +
             '" font-size="11" fill="#5b6b85" text-anchor="start" direction="ltr">' +
             Math.round(val).toLocaleString('he-IL') + '</text>';
    }

    data.forEach(function (d, i) {
      /* i=0 הוא החודש הראשון והוא מצויר בצד ימין */
      var gx = W - padL - (i + 1) * groupW;
      var barW = 14, gap = 5;
      var totalBarsW = series.length * barW + (series.length - 1) * gap;
      var startX = gx + (groupW - totalBarsW) / 2;

      series.forEach(function (s, si) {
        var v = d[s.key];
        var bx = startX + si * (barW + gap);
        var by = y(v);
        var bh = Math.max(v > 0 ? 2 : 0, padT + plotH - by);
        svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh +
               '" fill="' + s.colour + '" rx="3"><title>' + esc(d.name + ' · ' + s.label + ': ') +
               esc(fmt(v)) + '</title></rect>';
      });

      svg += '<text x="' + (gx + groupW / 2) + '" y="' + (H - 10) +
             '" font-size="12" fill="#10203a" text-anchor="middle">' + esc(d.name) + '</text>';
    });

    svg += '</svg>';
    wrap.innerHTML = svg;
  }

  /* טבלת ההכנסות: מה נכנס בכל חודש, מה יורד ממנו, ומה נשאר.
     המס והביטוח הלאומי מחולקים בין החודשים לפי חלקו של כל חודש בבסיס המס. */
  function renderMonthlyNet(a, p, simple) {
    var box = el('rowsMonths');
    if (!a.perMonth.length) {
      box.innerHTML = '<div class="empty">אין עדיין נתונים לתקופה הזו. ' +
        'עוברים למסך הזנת נתונים ומוסיפים חודש.</div>';
      return;
    }

    var totalBase = a.profit;
    var taxTotal = Math.max(0, p.tax.accruedTax);
    var blTotal = Math.max(0, p.bl.accrued);

    var head = '<div class="tbl"><div class="tbl-row tbl-head">' +
      '<span>חודש</span><span>נכנס</span><span>מע"מ</span>' +
      (simple ? '' : '<span>הוצאות</span>') +
      '<span>מס הכנסה</span><span>ביט"ל</span><span>נשאר</span></div>';

    var body = a.perMonth.map(function (m) {
      var share = totalBase > 0 ? (m.profit / totalBase) : 0;
      var mTax = taxTotal * share;
      var mBl = blTotal * share;
      var left = m.incomeGross - (simple ? 0 : m.expenseGross)
                 - Math.max(0, m.vatPayable) - mTax - mBl;
      return '<div class="tbl-row">' +
        '<span>' + esc(MONTH_NAMES[m.month - 1]) + '</span>' +
        '<span>' + fmt(m.incomeGross) + '</span>' +
        '<span class="warn">' + fmt(m.vatPayable) + '</span>' +
        (simple ? '' : '<span>' + fmt(m.expenseGross) + '</span>') +
        '<span class="warn">' + fmt(mTax) + '</span>' +
        '<span class="warn">' + fmt(mBl) + '</span>' +
        '<span class="' + (left < 0 ? 'neg' : 'pos') + '"><strong>' + fmt(left) + '</strong></span>' +
        '</div>';
    }).join('');

    var totalLeft = a.incomeGross - (simple ? 0 : a.expenseGross)
                    - p.setAside.vat - taxTotal - blTotal;
    var foot = '<div class="tbl-row tbl-total">' +
      '<span>סה"כ</span>' +
      '<span>' + fmt(a.incomeGross) + '</span>' +
      '<span class="warn">' + fmt(a.vatPayable) + '</span>' +
      (simple ? '' : '<span>' + fmt(a.expenseGross) + '</span>') +
      '<span class="warn">' + fmt(taxTotal) + '</span>' +
      '<span class="warn">' + fmt(blTotal) + '</span>' +
      '<span class="' + (totalLeft < 0 ? 'neg' : 'pos') + '"><strong>' + fmt(totalLeft) + '</strong></span>' +
      '</div></div>';

    box.innerHTML = head + body + foot;
    box.style.setProperty('--tbl-cols', simple ? 6 : 7);
  }

  /* ---------- הזנת נתונים ---------- */

  function findMonth(id) {
    for (var i = 0; i < state.months.length; i++) {
      if (state.months[i].id === id) return state.months[i];
    }
    return null;
  }

  function buildMonthPicker() {
    var sel = el('monthPick');
    if (!state.months.length) {
      sel.innerHTML = '<option value="">אין חודשים עדיין</option>';
      currentMonthId = null;
      return;
    }
    if (!findMonth(currentMonthId)) currentMonthId = state.months[state.months.length - 1].id;
    sel.innerHTML = state.months.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === currentMonthId ? ' selected' : '') + '>' +
        esc(monthLabel(m)) + '</option>';
    }).join('');
  }

  function selectHtml(field, kind, id, options, value) {
    return '<select data-kind="' + kind + '" data-id="' + id + '" data-field="' + field + '">' +
      options.map(function (o) {
        var v = (typeof o === 'string') ? o : o.v;
        var t = (typeof o === 'string') ? o : o.t;
        return '<option value="' + esc(v) + '"' +
          (String(v) === String(value) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>';
  }

  function inputHtml(field, kind, id, type, value, extra) {
    return '<input type="' + type + '" data-kind="' + kind + '" data-id="' + id +
      '" data-field="' + field + '" value="' + esc(value) + '"' + (extra || '') + '>';
  }

  /* שדות המטבע. הסכום נשאר במטבע שבו הכסף התקבל, והשער נשמר לצדו. */
  function currencyFieldsHtml(kind, l) {
    var usd = (l.currency === 'USD');
    return '<div><label>מטבע</label>' +
        selectHtml('currency', kind, l.id,
          [{ v: 'USD', t: 'דולר' }, { v: 'ILS', t: 'שקל' }], l.currency || 'ILS') + '</div>' +
      (usd
        ? '<div><label>שער לפי תאריך העסקה</label>' +
            inputHtml('rate', kind, l.id, 'number', l.rate, ' step="0.0001" min="0"') +
            '<button class="btn ghost small" data-rate="' + l.id + '" data-kind="' + kind +
            '" type="button" style="margin-top:6px">שער בנק ישראל</button></div>'
        : '');
  }

  function incomeLineHtml(l) {
    var warn = (l.vatType !== '18');
    return '<div class="line" data-line="' + l.id + '">' +
      '<div class="line-head">' +
        '<span class="title">הכנסה</span>' +
        '<span>' +
          '<span class="pill ' + (l.status === 'paid' ? 'paid' : 'unpaid') + '">' +
            (l.status === 'paid' ? 'שולם' : 'טרם שולם') + '</span> ' +
          '<button class="btn danger small" data-del="income" data-id="' + l.id + '" type="button">מחיקה</button>' +
        '</span>' +
      '</div>' +
      '<div class="field-grid wide">' +
        '<div><label>תאריך</label>' + inputHtml('date', 'income', l.id, 'date', l.date) + '</div>' +
        '<div><label>תיאור</label>' + inputHtml('description', 'income', l.id, 'text', l.description) + '</div>' +
        '<div><label>סכום</label>' + inputHtml('amount', 'income', l.id, 'number', l.amount, ' step="0.01" min="0"') + '</div>' +
        currencyFieldsHtml('income', l) +
        '<div><label>הסכום שהוזן</label>' +
          selectHtml('basis', 'income', l.id,
            [{ v: 'gross', t: 'כולל מע"מ' }, { v: 'net', t: 'לפני מע"מ' }], l.basis) + '</div>' +
        '<div><label>סוג מע"מ</label>' + selectHtml('vatType', 'income', l.id, VAT_TYPES, l.vatType) + '</div>' +
        '<div><label>קטגוריה</label>' + selectHtml('category', 'income', l.id, INCOME_CATEGORIES, l.category) + '</div>' +
        '<div><label>סטטוס</label>' +
          selectHtml('status', 'income', l.id,
            [{ v: 'paid', t: 'שולם' }, { v: 'unpaid', t: 'טרם שולם' }], l.status) + '</div>' +
        '<div><label>הערה</label>' + inputHtml('note', 'income', l.id, 'text', l.note) + '</div>' +
      '</div>' +
      '<div class="line-sum" data-sum="' + l.id + '"></div>' +
      (warn ? '<div class="warn-box">סווג בשיעור אפס או כפטור. המערכת לא קובעת את זה לבד לפי מדינת הלקוח - ' +
              'יש לוודא מול רו"ח שהתנאים מתקיימים ושיש את האסמכתאות.</div>' : '') +
      '</div>';
  }

  function expenseLineHtml(l) {
    return '<div class="line" data-line="' + l.id + '">' +
      '<div class="line-head">' +
        '<span class="title">הוצאה</span>' +
        '<span>' +
          '<span class="pill ' + (l.status === 'paid' ? 'paid' : 'unpaid') + '">' +
            (l.status === 'paid' ? 'שולם' : 'טרם שולם') + '</span> ' +
          '<button class="btn danger small" data-del="expense" data-id="' + l.id + '" type="button">מחיקה</button>' +
        '</span>' +
      '</div>' +
      '<div class="field-grid wide">' +
        '<div><label>תאריך</label>' + inputHtml('date', 'expense', l.id, 'date', l.date) + '</div>' +
        '<div><label>תיאור</label>' + inputHtml('description', 'expense', l.id, 'text', l.description) + '</div>' +
        '<div><label>סכום</label>' + inputHtml('amount', 'expense', l.id, 'number', l.amount, ' step="0.01" min="0"') + '</div>' +
        currencyFieldsHtml('expense', l) +
        '<div><label>הסכום שהוזן</label>' +
          selectHtml('basis', 'expense', l.id,
            [{ v: 'gross', t: 'כולל מע"מ' }, { v: 'net', t: 'לפני מע"מ' }], l.basis) + '</div>' +
        '<div><label>סוג מע"מ</label>' + selectHtml('vatType', 'expense', l.id, VAT_TYPES, l.vatType) + '</div>' +
        '<div><label>מוכרת למס הכנסה</label>' +
          selectHtml('recognizedPct', 'expense', l.id,
            [{ v: 100, t: 'מוכרת במלואה' }, { v: 50, t: 'מוכרת חלקית 50%' },
             { v: 25, t: 'מוכרת חלקית 25%' }, { v: 0, t: 'פרטית, לא מוכרת' }], l.recognizedPct) + '</div>' +
        '<div><label>מע"מ תשומות לקיזוז</label>' +
          selectHtml('vatDeductiblePct', 'expense', l.id,
            [{ v: 100, t: 'קיזוז מלא' }, { v: 66, t: 'קיזוז שני שליש' },
             { v: 0, t: 'בלי קיזוז' }], l.vatDeductiblePct) + '</div>' +
        '<div><label>קטגוריה</label>' + selectHtml('category', 'expense', l.id, EXPENSE_CATEGORIES, l.category) + '</div>' +
        '<div><label>סטטוס</label>' +
          selectHtml('status', 'expense', l.id,
            [{ v: 'paid', t: 'שולם' }, { v: 'unpaid', t: 'טרם שולם' }], l.status) + '</div>' +
        '<div class="span2"><label>הערה</label>' + inputHtml('note', 'expense', l.id, 'text', l.note) + '</div>' +
      '</div>' +
      '<div class="line-sum" data-sum="' + l.id + '"></div>' +
      '</div>';
  }

  function findLine(kind, id) {
    var m = findMonth(currentMonthId);
    if (!m) return null;
    var list = (kind === 'income') ? m.incomes : m.expenses;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* מושך את השער היציג של בנק ישראל לתאריך השורה.
     נכשל בקול: אם אין אינטרנט או שהשער לא נמצא - נאמר במפורש ומקלידים ידנית. */
  function fetchRateFor(kind, id, btn) {
    var line = findLine(kind, id);
    if (!line) return;
    if (!line.date) { toast('צריך קודם תאריך לשורה'); return; }
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'מושך...'; btn.disabled = true; }
    return Rates.get(line.date).then(function (r) {
      line.rate = r.rate;
      line.rateDate = r.rateDate;
      persist();
      renderEntry();
      toast(r.rateDate === line.date
        ? 'שער ' + r.rate + ' לתאריך ' + r.rateDate
        : 'אין פרסום ב-' + line.date + ', נלקח שער ' + r.rate + ' מ-' + r.rateDate);
    }).catch(function (e) {
      if (btn) { btn.textContent = old; btn.disabled = false; }
      toast('לא הצלחתי למשוך שער: ' + e.message + '. אפשר להקליד ידנית.');
    });
  }

  function fetchAllRates(btn) {
    var m = findMonth(currentMonthId);
    if (!m) return;
    var need = m.incomes.concat(m.expenses).filter(function (l) {
      return l.currency === 'USD' && !(l.rate > 0) && l.date;
    });
    if (!need.length) { toast('לכל השורות הדולריות כבר יש שער'); return; }
    var old = btn.textContent;
    btn.textContent = 'מושך ' + need.length + ' שערים...'; btn.disabled = true;
    var done = 0, failed = 0;
    Promise.all(need.map(function (l) {
      return Rates.get(l.date).then(function (r) {
        l.rate = r.rate; l.rateDate = r.rateDate; done++;
      }).catch(function () { failed++; });
    })).then(function () {
      persist(); renderEntry();
      toast(failed ? (done + ' נמשכו, ' + failed + ' נכשלו. את אלה להקליד ידנית.')
                   : (done + ' שערים נמשכו מבנק ישראל'));
    });
  }

  function renderEntry() {
    buildMonthPicker();
    var body = el('entryBody');
    var m = findMonth(currentMonthId);

    if (!m) {
      body.innerHTML = '<div class="panel"><div class="empty">' +
        'אין עדיין חודשים. לוחצים על "הוספת חודש" כדי להתחיל.</div></div>';
      return;
    }

    var simple = state.settings.simpleMode;

    body.innerHTML =
      '<div class="panel"><h2>הכנסות</h2><div class="lines" id="incomeLines">' +
        (m.incomes.length ? m.incomes.map(incomeLineHtml).join('')
          : '<div class="empty">אין עדיין הכנסות בחודש הזה.</div>') +
      '</div><div class="actions">' +
        '<button class="btn" data-add="income" type="button">הוספת הכנסה</button>' +
        '<button class="btn ghost" id="btnFetchAllRates" type="button">משיכת שערים חסרים</button>' +
      '</div></div>' +

      (simple
        ? '<div class="panel"><h2>הוצאות</h2>' +
            '<div class="empty">מצב פשוט: החישוב נעשה על ההכנסות בלבד, בלי הוצאות. ' +
            'זו הערכה גסה כלפי מעלה, כלומר המס בפועל יהיה נמוך יותר.<br><br>' +
            '<button class="btn ghost" id="btnOpenExpenses" type="button">פתיחת חלק ההוצאות</button></div>' +
          '</div>'
        : '<div class="panel"><h2>הוצאות</h2><div class="lines" id="expenseLines">' +
            (m.expenses.length ? m.expenses.map(expenseLineHtml).join('')
              : '<div class="empty">אין עדיין הוצאות בחודש הזה.</div>') +
          '</div><div class="actions">' +
            '<button class="btn" data-add="expense" type="button">הוספת הוצאה</button>' +
            '<button class="btn ghost" id="btnCloseExpenses" type="button">חזרה למצב פשוט</button>' +
          '</div></div>') +

      '<div class="panel"><h2>מקדמות ששולמו</h2>' +
        '<div class="field-grid">' +
          '<div><label>מקדמות ביטוח לאומי ששולמו</label>' +
            inputHtml('blAdvance', 'month', m.id, 'number', m.blAdvance, ' step="1" min="0"') + '</div>' +
          '<div><label>מקדמות מס הכנסה ששולמו</label>' +
            inputHtml('incomeTaxAdvance', 'month', m.id, 'number', m.incomeTaxAdvance, ' step="1" min="0"') + '</div>' +
        '</div>' +
        '<p class="note">אם עדיין לא נקבעו לך מקדמות מס הכנסה, משאירים 0.</p>' +
      '</div>' +

      '<div class="panel"><h2>סיכום החודש</h2><div class="rows" id="monthSummary"></div>' +
        '<p class="note">תחזית לצורכי תזרים בלבד. יש לבדוק מול רו"ח או יועץ מס.</p></div>';

    refreshEntrySummaries();
  }

  function refreshEntrySummaries() {
    var m = findMonth(currentMonthId);
    if (!m) return;
    var rate = state.settings.vatRate;

    m.incomes.concat(m.expenses).forEach(function (l) {
      var node = document.querySelector('[data-sum="' + l.id + '"]');
      if (!node) return;
      var ils = Calc.toIls(l);
      var s = Calc.splitVat(ils, l.basis, l.vatType, rate);
      var txt = '';
      if (l.currency === 'USD') {
        txt += (l.rate > 0
          ? '$' + Number(l.amount).toLocaleString('he-IL') + ' לפי שער ' + l.rate + ' = ' + fmt(ils)
          : '⚠ חסר שער המרה, השורה נספרת כאפס') + ' · ';
      }
      txt += 'ללא מע"מ ' + fmt(s.net) + ' · מע"מ ' + fmt(s.vat) +
             ' · סה"כ ' + fmt(s.net + s.vat);
      if (l.recognizedPct !== undefined) {
        txt += ' · מוכר למס הכנסה ' + fmt(s.net * (l.recognizedPct / 100)) +
               ' · מע"מ לקיזוז ' + fmt(s.vat * (l.vatDeductiblePct / 100));
      }
      node.textContent = txt;
    });

    var t = Calc.monthTotals(m, state.settings);
    var box = el('monthSummary');
    if (box) {
      box.innerHTML =
        rowHtml('הכנסות ללא מע"מ', fmt(t.incomeNet)) +
        rowHtml('מע"מ שנגבה', fmt(t.vatCollected)) +
        (state.settings.simpleMode ? '' :
          rowHtml('הוצאות מוכרות', fmt(t.expenseRecognized)) +
          rowHtml('מע"מ תשומות לקיזוז', fmt(t.vatInput))) +
        rowHtml('מע"מ לתשלום', fmt(t.vatPayable), 'warn') +
        rowHtml(state.settings.simpleMode ? 'בסיס למס החודש' : 'רווח החודש',
                fmt(t.profit), t.profit < 0 ? 'neg' : 'pos', true);
    }
  }

  /* ---------- הגדרות ---------- */

  function setRow(label, field, value, extra, hint) {
    return '<div><label>' + esc(label) + '</label>' +
      '<input type="number" data-setting="' + field + '" value="' + esc(value) + '"' +
      (extra || '') + '>' +
      (hint ? '<p class="note">' + esc(hint) + '</p>' : '') + '</div>';
  }

  function renderSettings() {
    var s = state.settings;
    el('settingsUpdated').textContent =
      'ארבעה שדות למטה הם שלך אישית וכדאי לוודא אותם. כל השאר הם נתוני המדינה, ' +
      'כבר מלאים, ומשתנים פעם בשנה.';

    var bracketsHtml = s.brackets.map(function (b, i) {
      return '<div><label>מדרגה ' + (i + 1) +
        (b.upTo === null ? ' (מעל הכל)' : ' (עד ' + b.upTo.toLocaleString('he-IL') + ')') +
        '</label><input type="number" data-bracket="' + i + '" step="0.01" min="0" max="100" value="' +
        (b.rate * 100).toFixed(2) + '"></div>';
    }).join('');

    el('settingsBody').innerHTML =

      /* ---------- מה ששייך למשתמשת ---------- */
      '<h3>מה שכדאי לוודא שנכון לך</h3>' +
      '<div class="field-grid">' +

        '<div><label>נקודות זיכוי</label>' +
          '<input type="number" data-setting="creditPoints" step="0.25" min="0" value="' +
            esc(s.creditPoints) + '">' +
          '<p class="note"><strong>איפה מוצאים:</strong> בטופס 101 שמילאת, או אצל רואה החשבון. ' +
          'הבסיס הוא 2.25 לכל תושבת ישראל ועוד 0.5 לאישה, כלומר 2.75. ' +
          'ילדים, לימודים או עלייה מוסיפים עוד. כל נקודה מורידה ' +
          fmt(s.creditPointValue) + ' מהמס בשנה.</p></div>' +

        '<div><label>מקדמה חודשית לביטוח לאומי</label>' +
          '<input type="number" data-setting="blMonthlyAdvance" step="1" min="0" value="' +
            esc(s.blMonthlyAdvance) + '">' +
          '<p class="note"><strong>איפה מוצאים:</strong> בהוראת הקבע בבנק, או בחשבון שלך ' +
          'באתר הביטוח הלאומי. זה הסכום שיורד לך בפועל כל חודש.</p></div>' +

        '<div><label>שיעור מקדמות מס הכנסה, באחוזים</label>' +
          '<input type="number" data-setting="incomeTaxAdvanceRate" step="0.1" min="0" value="' +
            esc(s.incomeTaxAdvanceRate) + '">' +
          '<p class="note"><strong>איפה מוצאים:</strong> במכתב "קביעת מקדמות" ממס הכנסה. ' +
          'אם לא נקבע לך שיעור, משאירים 0 וזה בסדר גמור.</p></div>' +

        '<div><label>מה נכנס לחישוב</label><select data-setting="simpleMode">' +
          '<option value="1"' + (s.simpleMode ? ' selected' : '') + '>הכנסות בלבד, הערכה גסה</option>' +
          '<option value="0"' + (!s.simpleMode ? ' selected' : '') + '>הכנסות והוצאות, מדויק יותר</option>' +
        '</select><p class="note">בהכנסות בלבד המספר יוצא גבוה מהאמת, כי הוצאות מקטינות מס.</p></div>' +

        '<div><label>שיטת דיווח</label><select data-setting="reportingMethod">' +
          '<option value="invoice"' + (s.reportingMethod === 'invoice' ? ' selected' : '') + '>לפי חשבונית או דרישת תשלום</option>' +
          '<option value="cash"' + (s.reportingMethod === 'cash' ? ' selected' : '') + '>לפי כסף שהתקבל בפועל</option>' +
        '</select><p class="note"><strong>אם לא בטוחה:</strong> משאירים "לפי חשבונית", ' +
        'זו ברירת המחדל אצל רוב העוסקים. רואה החשבון יידע להגיד.</p></div>' +

      '</div>' +

      /* ---------- נתוני המדינה, מקופלים ---------- */
      '<details class="fold"><summary>נתוני המס של המדינה - לא צריך לגעת</summary>' +
        '<p class="note">מולאו מנתוני 2026 ועודכנו לאחרונה ב-' + esc(s.lastUpdated) +
        '. משנים אותם רק בתחילת שנת מס חדשה.</p>' +

        '<h3>כללי</h3><div class="field-grid wide">' +
          setRow('שנת מס', 'taxYear', s.taxYear, ' step="1"') +
          setRow('שיעור מע"מ באחוזים', 'vatRatePct', (s.vatRate * 100).toFixed(2), ' step="0.01"') +
          setRow('שווי נקודת זיכוי שנתית', 'creditPointValue', s.creditPointValue, ' step="1" min="0"') +
          '<div><label>מס יסף</label><select data-setting="surtaxEnabled">' +
            '<option value="1"' + (s.surtax.enabled ? ' selected' : '') + '>פעיל</option>' +
            '<option value="0"' + (!s.surtax.enabled ? ' selected' : '') + '>כבוי</option>' +
          '</select><p class="note">' + (s.surtax.rate * 100).toFixed(0) + '% על ההכנסה שמעל ' +
            s.surtax.threshold.toLocaleString('he-IL') + '</p></div>' +
        '</div>' +

        '<h3>מדרגות המס, באחוזים</h3><div class="field-grid wide">' + bracketsHtml + '</div>' +

        '<h3>ביטוח לאומי וביטוח בריאות</h3><div class="field-grid wide">' +
          setRow('תקרת המדרגה הנמוכה', 'blLowCeiling', s.blLowCeiling, ' step="1" min="0"') +
          setRow('שיעור נמוך באחוזים', 'blLowRatePct', (s.blLowRate * 100).toFixed(2), ' step="0.01"') +
          setRow('תקרה עליונה', 'blHighCeiling', s.blHighCeiling, ' step="1" min="0"') +
          setRow('שיעור גבוה באחוזים', 'blHighRatePct', (s.blHighRate * 100).toFixed(2), ' step="0.01"') +
        '</div>' +
      '</details>';
  }

  /* ---------- מה לשאול את רואה החשבון ---------- */

  /* כל שאלה: מה שואלים, ולמה זה נחוץ כאן. הסדר לפי מה שחוסם הכי הרבה. */
  var ASK_ACCOUNTANT = [
    { q: 'כמה נקודות זיכוי מגיעות לי השנה, במספר מדויק?',
      why: 'כל נקודה מורידה כ-2,904 ש"ח מהמס בשנה, ולכן טעות של נקודה אחת משנה את התחזית בהרבה.' },
    { q: 'האם נקבע לי שיעור מקדמות למס הכנסה, וכמה הוא?',
      why: 'אם לא נקבע לי שיעור, אני משאירה 0 וזה בסדר.' },
    { q: 'באיזו שיטה אני מדווחת - לפי חשבונית שהוצאתי, או לפי כסף שהתקבל בפועל?',
      why: 'זה משנה מתי הכנסה נספרת, ולכן משנה את כל המספרים.' },
    { q: 'כמה המקדמה החודשית שלי לביטוח לאומי, ומתי היא מתעדכנת?',
      why: 'זה הסכום שיורד בפועל, והכלי משווה מולו את החבות המשוערת.' },
    { q: 'המשיכות שאני מקבלת מחברת מסחר בחו"ל - האם הן בכלל הכנסה של העוסק המורשה שלי?',
      why: 'אם לא, הן לא אמורות להיכנס לכלי הזה בכלל.' },
    { q: 'ואם כן - באיזה שיעור מע"מ הן מדווחות: 18 אחוז, שיעור אפס, או פטור?',
      why: 'הכלי לא מחליט את זה לבד, וכל שורה מסומנת לבדיקה עד שאדע.' },
    { q: 'עמלות גיוס עובדים ממעסיק בחו"ל - באיזה שיעור מע"מ, ומה צריך לשמור כאסמכתא?',
      why: 'שיעור אפס דורש תנאים ואסמכתאות, וזה לא נקבע לפי מדינת הלקוח בלבד.' },
    { q: 'כשמתקבל כסף בדולרים - ממירים לפי השער היציג ביום העסקה, או לפי השער שהבנק נתן בפועל?',
      why: 'הכלי מושך היום את השער היציג של בנק ישראל, ואפשר לשנות ידנית בכל שורה.' }
  ];

  function renderAskList() {
    var box = el('askList');
    if (!box) return;
    box.innerHTML = ASK_ACCOUNTANT.map(function (a) {
      return '<li><strong>' + esc(a.q) + '</strong><span class="why">' + esc(a.why) + '</span></li>';
    }).join('');
  }

  function askListText() {
    return 'שאלות לקראת מילוי לוח בקרת המסים שלי:\r\n\r\n' +
      ASK_ACCOUNTANT.map(function (a, i) {
        return (i + 1) + '. ' + a.q;
      }).join('\r\n');
  }

  /* מסמן אלמנט שלם, כדי שיישאר רק Ctrl+C */
  function selectNode(node) {
    if (!node || !window.getSelection) return false;
    try {
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch (e) { return false; }
  }

  /* העתקה שעובדת גם כשהדף נפתח ישירות מהדיסק, שם ממשק הלוח המודרני חסום */
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.insetInlineStart = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  /* ---------- ייצוא, גיבוי ושחזור ---------- */

  /* מוריד קובץ מהדפדפן בלי שרת ובלי שום שירות חיצוני */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* אקסל לא מזהה עברית ב-CSV בלי סימן זיהוי בתחילת הקובץ */
  var BOM = '﻿';

  function csvCell(v) {
    var s = (v === undefined || v === null) ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvRows(rows) {
    return BOM + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  var VAT_LABEL = { '18': 'מע"מ 18%', '0': 'שיעור אפס', 'exempt': 'פטור או לבדיקה' };

  function exportLines() {
    var st = state.settings;
    var rows = [[
      'סוג', 'שנה', 'חודש', 'תאריך', 'תיאור', 'קטגוריה',
      'סכום מקורי', 'מטבע', 'שער', 'תאריך השער', 'סכום בשקלים',
      'כולל או לפני מע"מ', 'סוג מע"מ', 'סכום ללא מע"מ', 'מע"מ',
      'אחוז מוכר למס הכנסה', 'אחוז מע"מ לקיזוז', 'סטטוס', 'הערה'
    ]];

    state.months.forEach(function (m) {
      function push(l, kind) {
        var ils = Calc.toIls(l);
        var sp = Calc.splitVat(ils, l.basis, l.vatType, st.vatRate);
        rows.push([
          kind, m.year, m.month, l.date, l.description, l.category,
          l.amount, l.currency || 'ILS', l.rate || '', l.rateDate || '',
          Math.round(ils * 100) / 100,
          l.basis === 'gross' ? 'כולל מע"מ' : 'לפני מע"מ',
          VAT_LABEL[l.vatType] || l.vatType,
          Math.round(sp.net * 100) / 100, Math.round(sp.vat * 100) / 100,
          l.recognizedPct === undefined ? '' : l.recognizedPct,
          l.vatDeductiblePct === undefined ? '' : l.vatDeductiblePct,
          l.status === 'paid' ? 'שולם' : 'טרם שולם',
          l.note
        ]);
      }
      (m.incomes || []).forEach(function (l) { push(l, 'הכנסה'); });
      (m.expenses || []).forEach(function (l) { push(l, 'הוצאה'); });
    });

    if (rows.length === 1) { toast('אין עדיין שורות לייצוא'); return; }
    download('שורות-' + st.taxYear + '.csv', csvRows(rows), 'text/csv');
    toast((rows.length - 1) + ' שורות יוצאו');
  }

  function exportMonths() {
    var st = state.settings;
    var months = state.months.filter(function (m) { return m.year === st.taxYear; });
    if (!months.length) { toast('אין חודשים בשנת המס הזו'); return; }

    var p = Calc.fullPicture(months, st);
    var a = p.agg;
    var totalBase = a.profit;
    var taxTotal = Math.max(0, p.tax.accruedTax);
    var blTotal = Math.max(0, p.bl.accrued);

    var rows = [[
      'חודש', 'הכנסות ללא מע"מ', 'כסף שנכנס כולל מע"מ', 'מע"מ שנגבה',
      'הוצאות מוכרות', 'מע"מ תשומות', 'מע"מ לתשלום', 'בסיס למס',
      'חלק מס הכנסה', 'חלק ביטוח לאומי', 'נשאר'
    ]];

    function r2(n) { return Math.round(n * 100) / 100; }

    a.perMonth.forEach(function (m) {
      var share = totalBase > 0 ? (m.profit / totalBase) : 0;
      var mTax = taxTotal * share, mBl = blTotal * share;
      var left = m.incomeGross - (st.simpleMode ? 0 : m.expenseGross)
                 - Math.max(0, m.vatPayable) - mTax - mBl;
      rows.push([
        MONTH_NAMES[m.month - 1], r2(m.incomeNet), r2(m.incomeGross), r2(m.vatCollected),
        r2(m.expenseRecognized), r2(m.vatInput), r2(m.vatPayable), r2(m.profit),
        r2(mTax), r2(mBl), r2(left)
      ]);
    });

    rows.push([]);
    rows.push(['סיכום שנתי']);
    rows.push(['תחזית רווח שנתי', r2(p.tax.projectedAnnualProfit)]);
    rows.push(['מס שנתי חזוי', r2(p.tax.annualTax)]);
    rows.push(['מס שנצבר עד היום', r2(p.tax.accruedTax)]);
    rows.push(['מקדמות מס הכנסה ששולמו', r2(p.tax.advancesPaid)]);
    rows.push(['חבות ביטוח לאומי שנצברה', r2(p.bl.accrued)]);
    rows.push(['מקדמות ביטוח לאומי ששולמו', r2(p.bl.paid)]);
    rows.push(['מע"מ לתשלום', r2(a.vatPayable)]);
    rows.push(['יתרה שצריך לשמור בצד', r2(p.setAside.total)]);
    rows.push([]);
    rows.push([state.settings.simpleMode
      ? 'מצב פשוט: החישוב על ההכנסות בלבד, בלי הוצאות. הערכה גסה כלפי מעלה.'
      : 'מצב מלא: החישוב כולל הוצאות מוכרות.']);
    rows.push([window.TAX_CONFIG_DEFAULTS.disclaimer]);

    download('סיכום-חודשי-' + st.taxYear + '.csv', csvRows(rows), 'text/csv');
    toast('הסיכום החודשי יוצא');
  }

  function backup() {
    var payload = {
      app: 'tax-dashboard',
      version: 1,
      exportedAt: new Date().toISOString(),
      state: state
    };
    var stamp = new Date().toISOString().slice(0, 10);
    download('גיבוי-לוח-בקרת-מסים-' + stamp + '.json',
             JSON.stringify(payload, null, 2), 'application/json');
    toast('הגיבוי נשמר בתיקיית ההורדות');
  }

  /* מקבל את הטקסט של הגיבוי ומחיל אותו. משותף למסלול הקובץ ולמסלול ההדבקה,
     כדי ששניהם יתנהגו בדיוק אותו דבר. */
  function applyRestoreText(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { toast('מה שנטען אינו קובץ גיבוי תקין'); return false; }

    var incoming = (parsed && parsed.state) ? parsed.state : parsed;
    if (!incoming || !incoming.settings || !Array.isArray(incoming.months)) {
      toast('זה אינו קובץ גיבוי של לוח בקרת מסים');
      return false;
    }
    var lines = incoming.months.reduce(function (n, m) {
      return n + (m.incomes || []).length + (m.expenses || []).length;
    }, 0);
    if (!confirm('השחזור ידרוס את כל מה שקיים עכשיו.\n\nבגיבוי יש ' +
                 incoming.months.length + ' חודשים ו-' + lines + ' שורות. להמשיך?')) {
      return false;
    }

    /* השלמת שדות שנוספו אחרי שהגיבוי נשמר */
    var base = Store.defaultSettings();
    for (var k in base) {
      if (!(k in incoming.settings)) incoming.settings[k] = base[k];
    }
    state = incoming;
    sortMonths();
    currentMonthId = null;
    persist();
    /* עוברים ללוח הבקרה כדי שיהיה אפשר לראות מיד שזה נכנס */
    showScreen('dashboard');
    toast('שוחזרו ' + state.months.length + ' חודשים ו-' + lines + ' שורות');
    return true;
  }

  function restoreFrom(file) {
    var reader = new FileReader();
    reader.onload = function () { applyRestoreText(reader.result); };
    reader.onerror = function () { toast('לא הצלחתי לקרוא את הקובץ'); };
    reader.readAsText(file);
  }

  /* ---------- שינויים ---------- */

  function applyLineChange(target) {
    var kind = target.getAttribute('data-kind');
    var id = target.getAttribute('data-id');
    var field = target.getAttribute('data-field');
    if (!kind || !field) return false;

    var m = findMonth(currentMonthId);
    if (!m) return false;

    var numeric = ['amount', 'rate', 'recognizedPct', 'vatDeductiblePct',
                   'incomeTaxAdvance', 'blAdvance', 'salaryIncome', 'salaryTaxWithheld'];
    var val = target.value;
    if (numeric.indexOf(field) !== -1) {
      val = parseFloat(val);
      if (!isFinite(val)) val = 0;
    }

    if (kind === 'month') {
      m[field] = val;
    } else {
      var list = (kind === 'income') ? m.incomes : m.expenses;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list[i][field] = val; break; }
      }
    }
    persist();
    return true;
  }

  function applySettingChange(target) {
    var s = state.settings;
    var b = target.getAttribute('data-bracket');
    if (b !== null) {
      var r = parseFloat(target.value);
      s.brackets[parseInt(b, 10)].rate = isFinite(r) ? r / 100 : 0;
      persist();
      return true;
    }
    var f = target.getAttribute('data-setting');
    if (!f) return false;
    var v = target.value;
    var n = parseFloat(v);
    if (f === 'reportingMethod') s.reportingMethod = v;
    else if (f === 'simpleMode') s.simpleMode = (v === '1');
    else if (f === 'surtaxEnabled') s.surtax.enabled = (v === '1');
    else if (f === 'vatRatePct') s.vatRate = (isFinite(n) ? n : 0) / 100;
    else if (f === 'blLowRatePct') s.blLowRate = (isFinite(n) ? n : 0) / 100;
    else if (f === 'blHighRatePct') s.blHighRate = (isFinite(n) ? n : 0) / 100;
    else s[f] = isFinite(n) ? n : 0;
    persist();
    return true;
  }

  /* ---------- נתוני דמה ---------- */

  function demoMonth(year, month, rows) {
    return {
      id: Store.newId(), year: year, month: month,
      incomes: rows.incomes.map(function (r) {
        return {
          id: Store.newId(), date: r.d, description: r.t, amount: r.a,
          currency: r.cur || 'ILS', rate: r.rt || 0, rateDate: r.rt ? r.d : '',
          basis: r.b || 'gross', vatType: r.v || '18',
          category: r.c || 'שירות ללקוח בישראל', note: r.n || '', status: r.s || 'paid'
        };
      }),
      expenses: rows.expenses.map(function (r) {
        return {
          id: Store.newId(), date: r.d, description: r.t, amount: r.a,
          currency: r.cur || 'ILS', rate: r.rt || 0, rateDate: r.rt ? r.d : '',
          basis: r.b || 'gross', vatType: r.v || '18',
          recognizedPct: r.rp === undefined ? 100 : r.rp,
          vatDeductiblePct: r.vp === undefined ? 100 : r.vp,
          category: r.c || 'תוכנה ומנויים', note: r.n || '', status: r.s || 'paid'
        };
      }),
      incomeTaxAdvance: rows.ita || 0,
      blAdvance: rows.bl || 0,
      salaryIncome: 0,
      salaryTaxWithheld: 0
    };
  }

  function loadDemo() {
    var W = 'משיכה מחברת מסחר בחו"ל';
    var R = 'גיוס עובדים';
    state.months = [
      demoMonth(2026, 6, {
        incomes: [
          { d: '2026-06-08', t: 'משיכה, העברה בנקאית', a: 3000, cur: 'USD', rt: 3.0, b: 'net', v: 'exempt', c: W },
          { d: '2026-06-22', t: 'משיכה שנייה', a: 1500, cur: 'USD', rt: 3.0, b: 'net', v: 'exempt', c: W }
        ],
        expenses: [
          { d: '2026-06-03', t: 'מנוי כלי בינה מלאכותית', a: 590 },
          { d: '2026-06-28', t: 'ארוחה פרטית', a: 240, rp: 0, vp: 0, c: 'אחר' }
        ],
        ita: 0, bl: 270
      }),
      demoMonth(2026, 7, {
        incomes: [
          { d: '2026-07-05', t: 'משיכה, העברה בנקאית', a: 4500, cur: 'USD', rt: 3.0, b: 'net', v: 'exempt', c: W }
        ],
        expenses: [
          { d: '2026-07-02', t: 'מנוי כלי בינה מלאכותית', a: 590 },
          { d: '2026-07-11', t: 'שירותי רו"ח', a: 1180, c: 'מקצועי (רו"ח, עו"ד)' }
        ],
        ita: 0, bl: 270
      }),
      demoMonth(2026, 8, {
        incomes: [
          { d: '2026-08-04', t: 'משיכה, העברה בנקאית', a: 3666.67, cur: 'USD', rt: 3.0, b: 'net', v: 'exempt', c: W },
          { d: '2026-08-09', t: 'עמלת השמה, מעסיק בחו"ל', a: 2000, cur: 'USD', rt: 3.0, b: 'net', v: '0', c: R }
        ],
        expenses: [
          { d: '2026-08-01', t: 'מנוי כלי בינה מלאכותית', a: 590 },
          { d: '2026-08-06', t: 'פרסום ממומן', a: 1500, c: 'שיווק ופרסום' }
        ],
        ita: 0, bl: 270
      })
    ];
    sortMonths();
    currentMonthId = state.months[state.months.length - 1].id;
    persist();
  }

  /* ---------- ניווט ---------- */

  function showScreen(name) {
    ['dashboard', 'entry', 'settings'].forEach(function (s) {
      el('screen-' + s).hidden = (s !== name);
      el('tab-' + s).setAttribute('aria-selected', String(s === name));
    });
    if (name === 'dashboard') renderDashboard();
    if (name === 'entry') renderEntry();
    if (name === 'settings') renderSettings();
  }

  /* ---------- אתחול ---------- */

  function init() {
    state = Store.load();
    var firstRun = false;
    if (!state) {
      /* מתחילים ריק ולא בנתוני דמה. מי שרוצה דמה, יש כפתור בהגדרות. */
      state = Store.emptyState();
      persist();
      firstRun = true;
    }
    sortMonths();

    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { showScreen(b.getAttribute('data-screen')); });
    });

    el('viewMode').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      view.mode = b.getAttribute('data-mode');
      view.period = null;
      Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderDashboard();
    });

    el('periodPick').addEventListener('change', function () {
      view.period = this.value;
      renderDashboard();
    });

    el('monthPick').addEventListener('change', function () {
      currentMonthId = this.value;
      renderEntry();
    });

    el('btnAddMonth').addEventListener('click', function () {
      var last = state.months[state.months.length - 1];
      var y = state.settings.taxYear, mo = 1;
      if (last) {
        y = last.year; mo = last.month + 1;
        if (mo > 12) { mo = 1; y += 1; }
      } else {
        mo = new Date().getMonth() + 1;
      }
      var m = {
        id: Store.newId(), year: y, month: mo,
        incomes: [], expenses: [],
        incomeTaxAdvance: 0, blAdvance: 0, salaryIncome: 0, salaryTaxWithheld: 0
      };
      state.months.push(m);
      sortMonths();
      currentMonthId = m.id;
      persist();
      renderEntry();
      toast('נוסף ' + monthLabel(m));
    });

    el('btnDeleteMonth').addEventListener('click', function () {
      var m = findMonth(currentMonthId);
      if (!m) return;
      if (!confirm('למחוק את ' + monthLabel(m) + ' על כל השורות שבו? אי אפשר לבטל.')) return;
      state.months = state.months.filter(function (x) { return x.id !== m.id; });
      currentMonthId = null;
      persist();
      renderEntry();
      toast('החודש נמחק');
    });

    el('entryBody').addEventListener('click', function (e) {
      var rateBtn = e.target.closest('[data-rate]');
      if (rateBtn) {
        fetchRateFor(rateBtn.getAttribute('data-kind'), rateBtn.getAttribute('data-rate'), rateBtn);
        return;
      }
      if (e.target.closest('#btnFetchAllRates')) {
        fetchAllRates(e.target.closest('#btnFetchAllRates'));
        return;
      }

      if (e.target.closest('#btnOpenExpenses')) {
        state.settings.simpleMode = false; persist(); renderEntry();
        toast('חלק ההוצאות נפתח. החישוב יהיה מדויק יותר.');
        return;
      }
      if (e.target.closest('#btnCloseExpenses')) {
        state.settings.simpleMode = true; persist(); renderEntry();
        toast('חזרה למצב פשוט. ההוצאות נשמרו ורק לא נספרות.');
        return;
      }

      var add = e.target.closest('[data-add]');
      var del = e.target.closest('[data-del]');
      var m = findMonth(currentMonthId);
      if (!m) return;

      if (add) {
        var today = new Date().toISOString().slice(0, 10);
        if (add.getAttribute('data-add') === 'income') {
          m.incomes.push({
            id: Store.newId(), date: today, description: '', amount: 0,
            currency: state.settings.defaultIncomeCurrency || 'USD', rate: 0, rateDate: '',
            basis: 'gross', vatType: '18', category: INCOME_CATEGORIES[0],
            note: '', status: 'paid'
          });
        } else {
          m.expenses.push({
            id: Store.newId(), date: today, description: '', amount: 0,
            currency: 'ILS', rate: 0, rateDate: '',
            basis: 'gross', vatType: '18', recognizedPct: 100, vatDeductiblePct: 100,
            category: EXPENSE_CATEGORIES[0], note: '', status: 'paid'
          });
        }
        persist(); renderEntry();
      }

      if (del) {
        var kind = del.getAttribute('data-del');
        var id = del.getAttribute('data-id');
        var list = (kind === 'income') ? m.incomes : m.expenses;
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) idx = i;
        if (idx > -1) { list.splice(idx, 1); persist(); renderEntry(); }
      }
    });

    el('entryBody').addEventListener('input', function (e) {
      if (applyLineChange(e.target)) refreshEntrySummaries();
    });
    el('entryBody').addEventListener('change', function (e) {
      var f = e.target.getAttribute('data-field');
      if (!applyLineChange(e.target)) return;
      /* סוג מע"מ וסטטוס משנים תגית או אזהרה - מרעננים את המסך */
      if (f === 'vatType' || f === 'status' || f === 'currency') renderEntry();
      else refreshEntrySummaries();
    });

    el('settingsBody').addEventListener('input', function (e) { applySettingChange(e.target); });
    el('settingsBody').addEventListener('change', function (e) {
      if (applySettingChange(e.target)) {
        if (e.target.getAttribute('data-setting') === 'reportingMethod') renderSettings();
      }
    });

    renderAskList();
    el('btnCopyAsk').addEventListener('click', function () {
      copyText(askListText()).then(function (ok) {
        if (ok) {
          toast('שמונה השאלות הועתקו. אפשר להדביק בוואטסאפ או במייל.');
          return;
        }
        /* ההעתקה חסומה בחלק מהדפדפנים כשהדף נפתח ישירות מהדיסק.
           במקום להשאיר אותה בלי מוצא, הרשימה מסומנת ונשאר רק Ctrl+C. */
        selectNode(el('askList'));
        toast('הרשימה מסומנת. לוחצים Ctrl+C כדי להעתיק.');
      });
    });

    el('btnExportLines').addEventListener('click', exportLines);
    el('btnExportMonths').addEventListener('click', exportMonths);
    el('btnBackup').addEventListener('click', backup);
    /* הכפתור הוא תווית שמצביעה על שדה הקובץ, ולכן אין כאן קריאה ל-click.
       לחיצה מתוך קוד על שדה קובץ נחסמת בחלק מהדפדפנים. */
    el('restoreFile').addEventListener('change', function () {
      if (this.files && this.files[0]) restoreFrom(this.files[0]);
      this.value = '';
    });

    el('btnPasteToggle').addEventListener('click', function () {
      var w = el('pasteWrap');
      w.hidden = !w.hidden;
      if (!w.hidden) el('pasteBox').focus();
    });

    el('btnPasteLoad').addEventListener('click', function () {
      var txt = el('pasteBox').value.trim();
      if (!txt) { toast('אין מה לטעון, תיבת ההדבקה ריקה'); return; }
      if (applyRestoreText(txt)) el('pasteBox').value = '';
    });

    el('btnDemo').addEventListener('click', function () {
      if (!confirm('לטעון נתוני דמה במקום מה שקיים עכשיו?')) return;
      loadDemo(); renderSettings(); toast('נתוני הדמה נטענו');
    });

    el('btnWipe').addEventListener('click', function () {
      var n = state.months.length;
      if (!confirm('למחוק את כל הנתונים מהדפדפן? ' + n +
                   ' חודשים יימחקו ואי אפשר לבטל. כדאי לשמור גיבוי קודם.')) return;
      Store.clear();
      Rates.clear();
      state = Store.emptyState();
      currentMonthId = null;
      persist();
      renderSettings();
      showScreen('entry');
      toast('הכל נמחק. מתחילים מדף ריק.');
    });

    if (firstRun) {
      showScreen('entry');
      toast('מתחילים ריק. לוחצים "הוספת חודש" ומזינים את החודש הראשון.');
    } else {
      showScreen('dashboard');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
