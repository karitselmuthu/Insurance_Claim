import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const ISSUE_TYPES = [
  "dent",
  "scratch",
  "crack",
  "glass_shatter",
  "broken_part",
  "missing_part",
  "torn_packaging",
  "crushed_packaging",
  "water_damage",
  "stain",
  "none",
  "unknown",
] as const;

export const STATUS_VALUES = [
  "supported",
  "contradicted",
  "not_enough_information",
] as const;

export const SEVERITY_VALUES = ["none", "low", "medium", "high", "unknown"] as const;

export const CAR_PARTS = [
  "front_bumper",
  "rear_bumper",
  "door",
  "hood",
  "windshield",
  "side_mirror",
  "headlight",
  "taillight",
  "fender",
  "quarter_panel",
  "body",
  "unknown",
] as const;

export const LAPTOP_PARTS = [
  "screen",
  "keyboard",
  "trackpad",
  "hinge",
  "lid",
  "corner",
  "port",
  "base",
  "body",
  "unknown",
] as const;

export const PACKAGE_PARTS = [
  "box",
  "package_corner",
  "package_side",
  "seal",
  "label",
  "contents",
  "item",
  "unknown",
] as const;

export const CLAIM_OBJECTS = ["car", "laptop", "package"] as const;

export const RISK_FLAGS = [
  "none",
  "blurry_image",
  "cropped_or_obstructed",
  "low_light_or_glare",
  "wrong_angle",
  "wrong_object",
  "wrong_object_part",
  "damage_not_visible",
  "claim_mismatch",
  "possible_manipulation",
  "non_original_image",
  "text_instruction_present",
  "user_history_risk",
  "manual_review_required",
] as const;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const ClaimInputRowSchema = z.object({
  user_id: z.string(),
  image_paths: z.string(), // Semicolon-separated paths
  user_claim: z.string(),
  claim_object: z.enum(CLAIM_OBJECTS),
});

export type ClaimInputRow = z.infer<typeof ClaimInputRowSchema>;

export const UserHistorySchema = z.object({
  user_id: z.string(),
  past_claim_count: z.number().int(),
  accept_claim: z.number().int(),
  manual_review_claim: z.number().int(),
  rejected_claim: z.number().int(),
  last_90_days_claim_count: z.number().int(),
  history_flags: z.string(),
  history_summary: z.string(),
});

export type UserHistory = z.infer<typeof UserHistorySchema>;

export const EvidenceRequirementSchema = z.object({
  requirement_id: z.string(),
  claim_object: z.enum([...CLAIM_OBJECTS, "all"]),
  applies_to: z.string(), // Issue family e.g., "dent or scratch"
  minimum_image_evidence: z.string(),
});

export type EvidenceRequirement = z.infer<typeof EvidenceRequirementSchema>;

// ============================================================================
// PIPELINE STAGE SCHEMAS
// ============================================================================

/**
 * Triage stage output: Extract the claim intent from user conversation
 */
export const ClaimIntentSchema = z.object({
  reported_issue_family: z.string().describe("The issue family from the user's claim"),
  relevant_object_parts: z.array(z.string()).describe("Parts mentioned by user"),
  damage_described: z.boolean().describe("Does user claim there is damage?"),
  urgency_context: z.string().optional().describe("Any urgency indicators"),
});

export type ClaimIntent = z.infer<typeof ClaimIntentSchema>;

/**
 * Vision stage output: Extract observations from submitted images
 */
export const ImageObservationSchema = z.object({
  image_id: z.string().describe("Filename without extension"),
  visible_issue_type: z.enum(ISSUE_TYPES).describe("Issue type visible in image"),
  affected_parts: z.array(z.string()).describe("Visible parts in the image"),
  severity_estimate: z.enum(SEVERITY_VALUES).describe("Severity of visible damage"),
  image_quality_issues: z.array(z.string()).describe("Quality problems: blurry, cropped, etc."),
  matches_claim: z
    .enum(["clearly_matches", "unclear_match", "contradicts", "not_relevant"])
    .describe("How image relates to claim"),
  explanation: z.string().describe("Concise image analysis"),
});

export type ImageObservation = z.infer<typeof ImageObservationSchema>;

/**
 * Validation stage output: Evidence requirements check
 */
export const ValidationResultSchema = z.object({
  standard_met: z.boolean().describe("Evidence minimum standard met"),
  standard_reason: z.string().describe("Why standard was/wasn't met"),
  supporting_image_ids: z.array(z.string()).describe("Images supporting the claim"),
  evidence_gaps: z.array(z.string()).optional().describe("Missing evidence"),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Risk aggregation output
 */
export const RiskAggregationSchema = z.object({
  risk_flags: z.array(z.enum(RISK_FLAGS)).describe("Identified risk flags"),
  risk_summary: z.string().describe("Summary of all risks"),
});

export type RiskAggregation = z.infer<typeof RiskAggregationSchema>;

/**
 * Judge stage output: Final verdict
 */
export const VerdictSchema = z.object({
  claim_status: z.enum(STATUS_VALUES).describe("Final decision"),
  status_justification: z.string().describe("Concise image-grounded explanation"),
  final_severity: z.enum(SEVERITY_VALUES).describe("Final severity estimate"),
});

export type Verdict = z.infer<typeof VerdictSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const OutputRowSchema = z.object({
  user_id: z.string(),
  image_paths: z.string(),
  user_claim: z.string(),
  claim_object: z.enum(CLAIM_OBJECTS),
  evidence_standard_met: z.string(), // "true" or "false"
  evidence_standard_met_reason: z.string(),
  risk_flags: z.string(), // Semicolon-separated or "none"
  issue_type: z.enum(ISSUE_TYPES),
  object_part: z.string(),
  claim_status: z.enum(STATUS_VALUES),
  claim_status_justification: z.string(),
  supporting_image_ids: z.string(), // Semicolon-separated or "none"
  valid_image: z.string(), // "true" or "false"
  severity: z.enum(SEVERITY_VALUES),
});

export type OutputRow = z.infer<typeof OutputRowSchema>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get allowed parts for a given claim object type
 */
export function getAllowedParts(claimObject: string): readonly string[] {
  switch (claimObject) {
    case "car":
      return CAR_PARTS;
    case "laptop":
      return LAPTOP_PARTS;
    case "package":
      return PACKAGE_PARTS;
    default:
      return [];
  }
}

/**
 * Parse semicolon-separated image paths into array
 */
export function parseImagePaths(imagePaths: string): string[] {
  return imagePaths.split(";").map((p) => p.trim());
}

/**
 * Extract image ID from full path (filename without extension)
 */
export function extractImageId(imagePath: string): string {
  const filename = imagePath.split("/").pop() || "";
  return filename.split(".")[0];
}

/**
 * Join array into semicolon-separated string
 */
export function joinWithSemicolons(items: string[]): string {
  return items.length > 0 ? items.join(";") : "none";
}

/**
 * Parse risk flags from semicolon-separated string
 */
export function parseRiskFlags(flags: string): string[] {
  if (!flags || flags === "none") return [];
  return flags.split(";").map((f) => f.trim());
}
