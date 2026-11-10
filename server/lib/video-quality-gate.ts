export type VisualReviewConfidence = 'high' | 'medium' | 'low';
export type VisualReviewSeverity = 'none' | 'minor' | 'major';

export interface VisualReviewAssessment {
  passed: boolean;
  severity: VisualReviewSeverity;
  confidence?: VisualReviewConfidence;
  identityDrift?: boolean;
  handAnatomyIssue?: boolean;
  propConsistencyIssue?: boolean;
  promptMismatch?: boolean;
  motionCoherenceIssue?: boolean;
  visualArtifactIssue?: boolean;
  framingIssue?: boolean;
  qualityScore?: number | null;
  promptMatchScore?: number | null;
  motionCoherenceScore?: number | null;
  issues?: string[];
  summary?: string;
}

export interface VisualReviewDecision {
  status: 'passed' | 'warning' | 'rejected' | 'unavailable';
  reject: boolean;
  reason: string;
}

export const VISUAL_QUALITY_THRESHOLDS = {
  overall: 58,
  promptMatch: 45,
  motionCoherence: 38,
} as const;

/**
 * Turn a vision review into a predictable production decision.
 * Scores only trigger automatic rejection when the reviewer reports high confidence;
 * an unmistakable major defect or explicit hard-defect flag always blocks the shot.
 */
export function evaluateVisualReview(review: VisualReviewAssessment | null | undefined): VisualReviewDecision {
  if (!review) {
    return {
      status: 'unavailable',
      reject: false,
      reason: 'Automated visual review was unavailable; this clip has not been quality-certified.',
    };
  }

  const hardIssues = [
    review.identityDrift && 'The lead character identity changed visibly.',
    review.handAnatomyIssue && 'A visible hand or limb has a severe anatomy defect.',
    review.propConsistencyIssue && 'A story-critical prop changed or disappeared.',
    review.promptMismatch && 'The generated shot does not follow the requested scene.',
    review.motionCoherenceIssue && 'The action or movement is visibly incoherent.',
    review.visualArtifactIssue && 'The shot contains a severe visual generation artifact.',
    review.framingIssue && 'The main subject or essential action is unusably framed.',
  ].filter(Boolean) as string[];

  if (review.severity === 'major' || hardIssues.length) {
    return {
      status: 'rejected',
      reject: true,
      reason: hardIssues[0] || review.summary || 'A major visual quality defect was detected.',
    };
  }

  const scoreFailures: string[] = [];
  if (review.confidence === 'high') {
    const quality = typeof review.qualityScore === 'number' ? review.qualityScore : null;
    const prompt = typeof review.promptMatchScore === 'number' ? review.promptMatchScore : null;
    const motion = typeof review.motionCoherenceScore === 'number' ? review.motionCoherenceScore : null;
    if (quality !== null && quality < VISUAL_QUALITY_THRESHOLDS.overall) scoreFailures.push(`Overall visual quality scored ${quality}/100.`);
    if (prompt !== null && prompt < VISUAL_QUALITY_THRESHOLDS.promptMatch) scoreFailures.push(`The shot matched only ${prompt}/100 of the requested scene.`);
    if (motion !== null && motion < VISUAL_QUALITY_THRESHOLDS.motionCoherence) scoreFailures.push(`Action continuity scored only ${motion}/100.`);
  }

  if (scoreFailures.length) {
    return { status: 'rejected', reject: true, reason: scoreFailures[0] };
  }

  if (review.passed) {
    return { status: 'passed', reject: false, reason: review.summary || 'Visual review passed.' };
  }

  return {
    status: 'warning',
    reject: false,
    reason: review.summary || review.issues?.[0] || 'The reviewer found a minor issue that did not justify rejecting the shot.',
  };
}
