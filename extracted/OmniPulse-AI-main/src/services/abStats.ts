/** Two-proportion z-test used to decide whether an A/B result is statistically meaningful. */
const MIN_IMPRESSIONS = 100;

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export interface ABOutcome {
  ready: boolean;
  rateA: number;
  rateB: number;
  lift: number;
  confidence: number;
  winner?: 'A' | 'B';
  message: string;
}

export function evaluateAB(a: { impressions?: number; engagements?: number }, b: { impressions?: number; engagements?: number }): ABOutcome {
  const nA = a.impressions || 0, nB = b.impressions || 0;
  const xA = Math.min(a.engagements || 0, nA), xB = Math.min(b.engagements || 0, nB);
  const rateA = nA ? xA / nA : 0, rateB = nB ? xB / nB : 0;
  if (nA < MIN_IMPRESSIONS || nB < MIN_IMPRESSIONS) {
    return { ready: false, rateA, rateB, lift: 0, confidence: 0, message: `Collecting data. Each variant needs at least ${MIN_IMPRESSIONS} impressions to compare.` };
  }
  const pooled = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const z = se === 0 ? 0 : (rateA - rateB) / se;
  const confidence = Math.max(0, Math.min(0.9999, 1 - 2 * (1 - normalCdf(Math.abs(z)))));
  const better = rateA >= rateB ? 'A' : 'B';
  const lowRate = Math.min(rateA, rateB);
  const lift = lowRate > 0 ? (Math.max(rateA, rateB) - lowRate) / lowRate : 0;
  if (confidence < 0.9) {
    return { ready: true, rateA, rateB, lift, confidence, message: `No clear winner yet (${(confidence * 100).toFixed(0)}% confidence). Keep collecting data.` };
  }
  return { ready: true, rateA, rateB, lift, confidence, winner: better, message: `Variant ${better} wins with ${(confidence * 100).toFixed(0)}% confidence (${(lift * 100).toFixed(0)}% higher engagement rate).` };
}
