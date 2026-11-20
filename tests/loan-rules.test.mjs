import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, payment, promoRateFor, LOAN_RULES } from "../public/js/loan-rules.js";

const base = { price: 1_500_000, downPct: 10, income: 40_000, sharePct: 35, ltvPct: 90, age: 30, termYears: 30, plan: "promo", afterPromoRate: 6.5 };

test("monthly payment matches the standard amortization formula", () => {
  // ₱1,350,000 at 4.5% for 30 years = ₱6,840.25 (checked by hand)
  assert.equal(payment(1_350_000, 4.5, 360).toFixed(2), "6840.25");
});

test("promo rate depends on loan size", () => {
  assert.equal(promoRateFor(4_900_000), 4.5);
  assert.equal(promoRateFor(4_900_001), 5.75);
  assert.equal(promoRateFor(10_000_001), null);
});

test("payment never exceeds the chosen share of income", () => {
  const r = calculate({ ...base, income: 15_000 });
  assert.equal(r.binding, "capacity");
  assert.ok(r.monthly <= 15_000 * 0.35 + 0.01, `${r.monthly} > ${15_000 * 0.35}`);
});

test("term is shortened so the loan ends by age 70", () => {
  const r = calculate({ ...base, age: 55 });
  assert.equal(r.termYears, 15);
  assert.equal(r.termCappedByAge, true);
});

test("loan never exceeds Pag-IBIG's maximum", () => {
  const r = calculate({ ...base, price: 20_000_000, income: 500_000, downPct: 0, ltvPct: 100 });
  assert.equal(r.loan, LOAN_RULES.maxLoan);
  assert.equal(r.binding, "max");
});

test("fixed-rate plans use the published rate", () => {
  const r = calculate({ ...base, plan: "10" });
  assert.equal(r.rate, 7.125);
});
