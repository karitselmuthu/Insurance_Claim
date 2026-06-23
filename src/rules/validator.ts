import {
  ImageObservation,
  EvidenceRequirement,
  getAllowedParts,
  RISK_FLAGS,
  RiskAggregation,
  RiskAggregationSchema,
  UserHistory,
  ValidationResult,
} from "../io/schema.js";

/**
 * Check if evidence standard is met
 * Validates that images meet minimum requirements for the claim
 */
export function validateEvidence(
  observations: ImageObservation[],
  reportedIssueFamilyStr: string,
  claimObject: string,
  relevantObjectParts: string[],
  evidenceRequirements: EvidenceRequirement[],
  imageIdsList: string[]
): ValidationResult {
  // Find relevant requirements
  const relevantReqs = evidenceRequirements.filter(
    (req) =>
      (req.claim_object === claimObject || req.claim_object === "all") &&
      req.applies_to.toLowerCase().includes(reportedIssueFamilyStr.toLowerCase())
  );

  if (relevantReqs.length === 0) {
    // No specific requirements found
    return {
      standard_met: observations.length > 0,
      standard_reason:
        observations.length > 0
          ? "At least one image provided"
          : "No images provided",
      supporting_image_ids: imageIdsList,
    };
  }

  // Check if observations meet minimum evidence standard
  const supportingImages: string[] = [];
  let allRequirementsMet = true;

  for (const req of relevantReqs) {
    const minimumEvidence = req.minimum_image_evidence.toLowerCase();

    // Check if any observation fulfills this requirement
    const fulfills = observations.some((obs) => {
      const matchesIssue = !minimumEvidence.includes("specific issue")
        ? true
        : obs.visible_issue_type !== "none" && obs.visible_issue_type !== "unknown";

      const matchesParts = !minimumEvidence.includes("part")
        ? true
        : obs.affected_parts.some((part: string) =>
            relevantObjectParts.some(
              (p) => p.toLowerCase() === part.toLowerCase()
            )
          );

      const qualityOk =
        obs.image_quality_issues.length < 3 &&
        !obs.image_quality_issues.includes("blurry_image");

      return matchesIssue && matchesParts && qualityOk;
    });

    if (fulfills) {
      const supportingObs = observations.find(
        (obs) => obs.image_quality_issues.length < 3
      );
      if (supportingObs) {
        supportingImages.push(supportingObs.image_id);
      }
    } else {
      allRequirementsMet = false;
    }
  }

  const standardMet =
    allRequirementsMet && supportingImages.length > 0 && observations.length > 0;

  return {
    standard_met: standardMet,
    standard_reason: standardMet
      ? `Evidence requirements met with ${supportingImages.length} supporting image(s)`
      : "Evidence standard not met: insufficient image quality or coverage",
    supporting_image_ids: supportingImages,
  };
}

/**
 * Aggregate risk flags from multiple sources
 */
export function aggregateRisk(
  observations: ImageObservation[],
  standardMet: boolean,
  userHistory: UserHistory | null,
  claimObject: string
): RiskAggregation {
  const flags = new Set<string>();

  // Check image quality issues
  for (const obs of observations) {
    if (obs.image_quality_issues && obs.image_quality_issues.length > 0) {
      for (const issue of obs.image_quality_issues) {
        if (RISK_FLAGS.includes(issue as any)) {
          flags.add(issue);
        }
      }
    }

    // Check for claim mismatch
    if (obs.matches_claim === "contradicts") {
      flags.add("claim_mismatch");
    }

    // Check for manipulation risk
    if (obs.matches_claim === "not_relevant") {
      flags.add("wrong_object");
    }
  }

  // Check evidence standard
  if (!standardMet) {
    flags.add("manual_review_required");
  }

  // Check user history for risk
  if (userHistory) {
    const rejectionRate =
      userHistory.past_claim_count > 0
        ? userHistory.rejected_claim / userHistory.past_claim_count
        : 0;

    if (rejectionRate > 0.3) {
      flags.add("user_history_risk");
      flags.add("manual_review_required");
    }

    if (
      userHistory.history_flags &&
      userHistory.history_flags.toLowerCase().includes("fraud")
    ) {
      flags.add("user_history_risk");
      flags.add("manual_review_required");
    }
  }

  const riskSummary =
    flags.size > 0
      ? `Risk flags identified: ${Array.from(flags).join(", ")}`
      : "No significant risks identified";

  return {
    risk_flags: Array.from(flags) as any,
    risk_summary: riskSummary,
  };
}

/**
 * Check if manual review is required
 */
export function requiresManualReview(riskFlags: string[]): boolean {
  return riskFlags.includes("manual_review_required");
}

/**
 * Deduplicate and sort risk flags
 */
export function normalizeRiskFlags(flags: string[]): string[] {
  const unique = new Set(flags.filter((f) => f !== "none"));
  return unique.size > 0
    ? Array.from(unique).sort()
    : ["none"];
}
