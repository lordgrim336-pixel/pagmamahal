// Pag-IBIG Fund Regular Housing Loan rules used by the calculator.
// Source: https://pagibigfund.gov.ph/Availmentofnewloan.html (read 2026-11-20).
// Update these numbers whenever Pag-IBIG publishes new rates.

export const LOAN_RULES = {
  sourceUrl: "https://pagibigfund.gov.ph/Availmentofnewloan.html",
  ratesValidUntil: "2026-12-31",

  maxLoan: 10_000_000, // "Borrow up to ₱10 million"
  maxTermYears: 30, // "maximum payment period ... thirty (30) years"
  maxAgeAtMaturity: 70, // "should not exceed the difference between age seventy (70) and the present age"
  maxAgeAtApplication: 65, // "not more than sixty-five (65) years at the date of application"
  minContributions: 24, // "At least twenty-four (24) monthly membership savings"

  // Regular rates by repricing period (years).
  regularRates: [
    { years: 5, rate: 6.5 },
    { years: 10, rate: 7.125 },
    { years: 15, rate: 7.75 },
    { years: 20, rate: 8.5 },
    { years: 25, rate: 9.125 },
    { years: 30, rate: 9.75 },
  ],

  // Promo rates, fixed for the first 3 years of the loan term.
  promo: {
    years: 3,
    tiers: [
      { upTo: 4_900_000, rate: 4.5 },
      { upTo: 10_000_000, rate: 5.75 },
    ],
  },

  // Not stated on the source page; editable in the calculator.
  assumptions: {
    incomeShareForPayment: 35, // % of gross monthly income allowed for amortization
    loanToValue: 90, // % of price/appraised value that can be borrowed
  },
};

export function promoRateFor(amount) {
  const tier = LOAN_RULES.promo.tiers.find((t) => amount <= t.upTo);
  return tier ? tier.rate : null;
}

// Monthly payment for principal P at annual rate (percent) over n months.
export function payment(P, annualRate, months) {
  if (P <= 0 || months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return P / months;
  return (P * r) / (1 - Math.pow(1 + r, -months));
}

// Largest principal whose payment fits in `monthly`.
export function principalFor(monthly, annualRate, months) {
  if (monthly <= 0 || months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return monthly * months;
  return (monthly * (1 - Math.pow(1 + r, -months))) / r;
}

export function balanceAfter(P, annualRate, months, paidMonths) {
  const r = annualRate / 100 / 12;
  const M = payment(P, annualRate, months);
  if (r === 0) return P - M * paidMonths;
  return P * Math.pow(1 + r, paidMonths) - (M * (Math.pow(1 + r, paidMonths) - 1)) / r;
}

/**
 * Full calculation.
 * input: { price, downPct, income, sharePct, ltvPct, age, termYears, plan, afterPromoRate }
 *   plan = "promo" or a repricing period in years (5, 10, ...)
 */
export function calculate(input) {
  const R = LOAN_RULES;
  const ageCap = Math.max(0, R.maxAgeAtMaturity - input.age);
  const termYears = Math.max(1, Math.min(input.termYears, R.maxTermYears, ageCap || 1));
  const months = termYears * 12;

  const wanted = Math.max(0, input.price * (1 - input.downPct / 100));
  const ltvLimit = input.price * (input.ltvPct / 100);
  const maxMonthly = input.income * (input.sharePct / 100);

  // Rate used for the first period (and for capacity-to-pay).
  const startingRate = (amount) => {
    if (input.plan === "promo") return promoRateFor(amount) ?? R.regularRates[0].rate;
    return R.regularRates.find((x) => x.years === Number(input.plan))?.rate ?? R.regularRates[0].rate;
  };

  // Capacity-based limit depends on rate, which (for promo) depends on amount.
  let capacityLimit = principalFor(maxMonthly, startingRate(wanted), months);
  if (input.plan === "promo") capacityLimit = principalFor(maxMonthly, startingRate(Math.min(wanted, capacityLimit)), months);

  const limits = [
    { key: "need", label: "Price minus your down payment", value: wanted },
    { key: "ltv", label: `Loan-to-value (${input.ltvPct}% of price)`, value: ltvLimit },
    { key: "capacity", label: `Capacity to pay (${input.sharePct}% of income)`, value: capacityLimit },
    { key: "max", label: "Pag-IBIG maximum", value: R.maxLoan },
  ];
  const binding = limits.reduce((a, b) => (b.value < a.value ? b : a));
  const loan = Math.max(0, Math.floor(binding.value / 1000) * 1000);
  const rate = startingRate(loan);
  const monthly = payment(loan, rate, months);

  let afterPromo = null;
  let totalPaid = monthly * months;
  if (input.plan === "promo" && months > R.promo.years * 12) {
    const paid = R.promo.years * 12;
    const bal = balanceAfter(loan, rate, months, paid);
    const later = payment(bal, input.afterPromoRate, months - paid);
    afterPromo = { balance: bal, rate: input.afterPromoRate, monthly: later };
    totalPaid = monthly * paid + later * (months - paid);
  }

  return {
    termYears,
    termCappedByAge: termYears < input.termYears,
    ageTooHigh: input.age > R.maxAgeAtApplication,
    loan,
    rate,
    monthly,
    afterPromo,
    totalPaid,
    totalInterest: totalPaid - loan,
    cashNeeded: Math.max(0, input.price - loan),
    reserve: monthly, // 1 month amortization set aside from loan proceeds
    limits,
    binding: binding.key,
    maxMonthly,
    incomeNeededForFullLoan: input.sharePct > 0 ? payment(Math.min(wanted, ltvLimit, R.maxLoan), startingRate(wanted), months) / (input.sharePct / 100) : 0,
  };
}
