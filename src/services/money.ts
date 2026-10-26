export const formatMoney = (amount: number, currency = 'USD') => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount); }
  catch { return `${currency} ${amount}`; }
};

/** Percentage saved by paying annually (0 when there is no saving). */
export const annualSavingPct = (monthly: number, annualPerMonth: number) =>
  monthly > 0 && annualPerMonth < monthly ? Math.round((1 - annualPerMonth / monthly) * 100) : 0;
