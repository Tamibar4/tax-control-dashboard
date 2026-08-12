/* ============================================================
   calc.js - מנוע החישוב
   כל החישובים כאן הם תחזית לצורכי תזרים בלבד.
   ============================================================ */

window.Calc = (function () {

  /* ---------- עזר ---------- */

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /* ממיר את סכום השורה לשקלים.
     הסכום המקורי נשמר במטבע שבו הכסף התקבל, והשער נשמר לצדו -
     כך שאפשר תמיד לחזור למספר שמופיע בדף הבנק. */
  function toIls(line) {
    var a = num(line.amount);
    if (line.currency && line.currency !== 'ILS') {
      var r = num(line.rate);
      return r > 0 ? a * r : 0;
    }
    return a;
  }

  /* מפרק שורה בודדת לסכום ללא מע"מ ולסכום המע"מ שבתוכה.
     vatType: '18' חייב במע"מ, '0' בשיעור אפס, 'exempt' פטור או לבדיקה.
     basis: 'gross' הסכום כולל מע"מ, 'net' הסכום לפני מע"מ. */
  function splitVat(amount, basis, vatType, vatRate) {
    var a = num(amount);
    if (vatType !== '18') {
      return { net: a, vat: 0 };
    }
    if (basis === 'gross') {
      var net = a / (1 + vatRate);
      return { net: net, vat: a - net };
    }
    return { net: a, vat: a * vatRate };
  }

  /* האם השורה נספרת, לפי שיטת הדיווח שנבחרה */
  function counts(line, method) {
    if (method === 'cash') return line.status === 'paid';
    return true;
  }

  /* ---------- סיכום חודש בודד ---------- */

  function monthTotals(month, settings) {
    var rate = num(settings.vatRate);
    var method = settings.reportingMethod;

    var t = {
      incomeNet: 0,        /* מחזור ללא מע"מ */
      incomeGross: 0,      /* כסף שנכנס מהלקוח, כולל מע"מ */
      vatCollected: 0,
      expenseGross: 0,     /* כל מה שיצא מהחשבון, כולל לא מוכר */
      expenseRecognized: 0,/* הוצאה מוכרת למס הכנסה, ללא מע"מ */
      vatInput: 0,         /* מע"מ תשומות לקיזוז */
      zeroRatedNet: 0,     /* מחזור בשיעור אפס או פטור - לצורך אזהרה */
      unpaidIncome: 0
    };

    (month.incomes || []).forEach(function (l) {
      var s = splitVat(toIls(l), l.basis, l.vatType, rate);
      if (l.status !== 'paid') t.unpaidIncome += s.net + s.vat;
      if (!counts(l, method)) return;
      t.incomeNet += s.net;
      t.incomeGross += s.net + s.vat;
      t.vatCollected += s.vat;
      if (l.vatType !== '18') t.zeroRatedNet += s.net;
    });

    /* במצב פשוט ההוצאות אינן נספרות כלל - הערכה גסה על ההכנסות בלבד.
       השורות עצמן נשמרות ולא נמחקות, רק לא נכנסות לחישוב. */
    (settings.simpleMode ? [] : (month.expenses || [])).forEach(function (l) {
      if (!counts(l, method)) return;
      var s = splitVat(toIls(l), l.basis, l.vatType, rate);
      t.expenseGross += s.net + s.vat;
      t.expenseRecognized += s.net * (num(l.recognizedPct) / 100);
      t.vatInput += s.vat * (num(l.vatDeductiblePct) / 100);
    });

    t.vatPayable = t.vatCollected - t.vatInput;
    t.profit = t.incomeNet - t.expenseRecognized;
    t.salaryIncome = num(month.salaryIncome);
    t.salaryTaxWithheld = num(month.salaryTaxWithheld);
    t.incomeTaxAdvance = num(month.incomeTaxAdvance);
    t.blAdvance = num(month.blAdvance);

    /* חודש נספר כחודש פעילות רק אם יש בו משהו שנכנס לחישוב.
       במצב פשוט הוצאות אינן נספרות, כדי שלא ידללו את הממוצע החודשי. */
    t.hasData = (month.incomes || []).length > 0 ||
                (!settings.simpleMode && (month.expenses || []).length > 0) ||
                t.salaryIncome > 0;

    return t;
  }

  /* ---------- צבירה על פני כמה חודשים ---------- */

  function aggregate(months, settings) {
    var sum = {
      incomeNet: 0, incomeGross: 0, vatCollected: 0,
      expenseGross: 0, expenseRecognized: 0, vatInput: 0,
      zeroRatedNet: 0, unpaidIncome: 0,
      profit: 0, salaryIncome: 0, salaryTaxWithheld: 0,
      incomeTaxAdvance: 0, blAdvance: 0,
      monthsActive: 0,
      perMonth: []
    };

    months.forEach(function (m) {
      var t = monthTotals(m, settings);
      t.year = m.year;
      t.month = m.month;
      sum.perMonth.push(t);
      if (!t.hasData) return;
      sum.monthsActive += 1;
      ['incomeNet', 'incomeGross', 'vatCollected', 'expenseGross',
       'expenseRecognized', 'vatInput', 'zeroRatedNet', 'unpaidIncome',
       'profit', 'salaryIncome', 'salaryTaxWithheld',
       'incomeTaxAdvance', 'blAdvance'].forEach(function (k) {
        sum[k] += t[k];
      });
    });

    sum.vatPayable = sum.vatCollected - sum.vatInput;
    return sum;
  }

  /* ---------- מס הכנסה ---------- */

  function bracketTax(income, brackets) {
    var tax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var top = (brackets[i].upTo === null || brackets[i].upTo === undefined)
        ? Infinity : num(brackets[i].upTo);
      if (income <= prev) break;
      var slice = Math.min(income, top) - prev;
      tax += slice * num(brackets[i].rate);
      prev = top;
      if (top === Infinity) break;
    }
    return tax;
  }

  function annualTaxFor(taxableIncome, settings) {
    var tax = bracketTax(taxableIncome, settings.brackets);
    if (settings.surtax && settings.surtax.enabled &&
        taxableIncome > num(settings.surtax.threshold)) {
      tax += (taxableIncome - num(settings.surtax.threshold)) * num(settings.surtax.rate);
    }
    var credits = num(settings.creditPoints) * num(settings.creditPointValue);
    return Math.max(0, tax - credits);
  }

  function incomeTax(agg, settings) {
    var m = agg.monthsActive;
    /* בסיס המס כולל גם הכנסה כשכירה, כי המדרגות חלות על סך ההכנסה */
    var taxableSoFar = agg.profit + agg.salaryIncome;
    var projectedAnnual = m > 0 ? (taxableSoFar / m) * 12 : 0;

    var annual = annualTaxFor(projectedAnnual, settings);
    var accrued = m > 0 ? annual * (m / 12) : 0;
    var paid = agg.incomeTaxAdvance + agg.salaryTaxWithheld;
    var balance = accrued - paid;

    var monthlyDue = annual / 12;
    var monthlyPaidAvg = m > 0 ? paid / m : 0;

    return {
      projectedAnnualProfit: projectedAnnual,
      annualTax: annual,
      accruedTax: accrued,
      advancesPaid: paid,
      balance: balance,
      monthlyDue: monthlyDue,
      recommendedThisMonth: Math.max(0, monthlyDue - monthlyPaidAvg),
      effectiveRate: projectedAnnual > 0 ? annual / projectedAnnual : 0
    };
  }

  /* ---------- ביטוח לאומי וביטוח בריאות ---------- */

  function bituahMonthly(avgMonthlyProfit, settings) {
    var p = Math.max(0, avgMonthlyProfit);
    var low = num(settings.blLowCeiling);
    var high = num(settings.blHighCeiling);
    var due = Math.min(p, low) * num(settings.blLowRate);
    if (p > low) {
      due += (Math.min(p, high) - low) * num(settings.blHighRate);
    }
    return due;
  }

  function bituahLeumi(agg, settings) {
    var m = agg.monthsActive;
    /* מחושב על הרווח מהעסק בלבד. הכנסה כשכירה מבוטחת דרך המעסיק. */
    var avg = m > 0 ? agg.profit / m : 0;
    var monthly = bituahMonthly(avg, settings);
    var accrued = monthly * m;
    var paid = agg.blAdvance;

    return {
      avgMonthlyProfit: avg,
      monthlyLiability: monthly,
      actualMonthlyAdvance: num(settings.blMonthlyAdvance),
      accrued: accrued,
      paid: paid,
      gap: accrued - paid,
      recommendedThisMonth: Math.max(0, monthly - num(settings.blMonthlyAdvance))
    };
  }

  /* ---------- התמונה המלאה ---------- */

  function fullPicture(months, settings) {
    var agg = aggregate(months, settings);
    var tax = incomeTax(agg, settings);
    var bl = bituahLeumi(agg, settings);

    /* כסף פנוי: מה שנכנס בפועל, פחות מה שיצא, פחות שלוש הקופות */
    var setAsideTax = Math.max(0, tax.balance);
    var setAsideBl = Math.max(0, bl.gap);
    var setAsideVat = Math.max(0, agg.vatPayable);

    var freeMoney = agg.incomeGross - agg.expenseGross
                    - setAsideVat - setAsideTax - setAsideBl;

    return {
      agg: agg,
      tax: tax,
      bl: bl,
      setAside: {
        vat: setAsideVat,
        incomeTax: setAsideTax,
        bituahLeumi: setAsideBl,
        total: setAsideVat + setAsideTax + setAsideBl
      },
      freeMoney: freeMoney
    };
  }

  return {
    toIls: toIls,
    splitVat: splitVat,
    monthTotals: monthTotals,
    aggregate: aggregate,
    bracketTax: bracketTax,
    annualTaxFor: annualTaxFor,
    incomeTax: incomeTax,
    bituahMonthly: bituahMonthly,
    bituahLeumi: bituahLeumi,
    fullPicture: fullPicture
  };
})();
