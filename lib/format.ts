/**
 * Rupee formatting with Indian (lakh) grouping, used everywhere an amount is
 * shown (IMPLEMENTATION_PLAN.md section 8): ₹2,40,000, never ₹240,000.
 */

/** Groups digits the Indian way: the last three, then pairs. "2500000" → "25,00,000". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${lastThree}`;
}

/** Whole rupees with lakh grouping: formatINR(240000) === "₹2,40,000". Rounds to the rupee. */
export function formatINR(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₹${groupIndian(String(Math.abs(rounded)))}`;
}

/**
 * Short lakh form for summaries: formatLakh(2500000) === "₹25L",
 * formatLakh(1962000) === "₹19.62L". Below one lakh it falls back to formatINR.
 */
export function formatLakh(amount: number): string {
  if (Math.abs(amount) < 100000) return formatINR(amount);
  const lakhs = Math.round((amount / 100000) * 100) / 100;
  const sign = lakhs < 0 ? "-" : "";
  return `${sign}₹${String(Math.abs(lakhs))}L`;
}
