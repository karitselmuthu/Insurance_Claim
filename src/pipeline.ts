import {
  ClaimInputRow,
  OutputRow,
  UserHistory,
  EvidenceRequirement,
  parseImagePaths,
  joinWithSemicolons,
  extractImageId,
  getAllowedParts,
} from "./io/schema.js";
import { triageAgent } from "./agents/triage.js";
import { visionAgent } from "./agents/vision.js";
import { judgeAgent } from "./agents/judge.js";
import { validateEvidence, aggregateRisk, normalizeRiskFlags } from "./rules/validator.js";
import { imageExists } from "./anthropic/images.js";

/**
 * Process a single claim through the entire pipeline
 */
export async function processClaim(
  row: ClaimInputRow,
  userHistory: UserHistory | null,
  evidenceRequirements: EvidenceRequirement[]
): Promise<{
  output: OutputRow;
  stats: {
    triageTokens: number;
    visionTokens: number;
    judgeTokens: number;
    imagesProcessed: number;
  };
}> {
  // Step 1: TRIAGE - Extract claim intent from user conversation
  console.log(`[${row.user_id}] Triaging claim...`);
  const triage = await triageAgent(row.claim_object, row.user_claim);

  // Step 2: IMAGE PREPROCESSING - Resolve and verify image paths
  const imagePaths = parseImagePaths(row.image_paths);
  const validImagePaths: string[] = [];

  for (const path of imagePaths) {
    const exists = await imageExists(path);
    if (exists) {
      validImagePaths.push(path);
    } else {
      console.warn(`Image not found: ${path}`);
    }
  }

  const hasValidImages = validImagePaths.length > 0;

  // Step 3: VISION - Analyze images (only if we have valid images)
  let visionTokens = 0;
  let imagesProcessed = 0;
  let observations: any[] = [];

  if (hasValidImages) {
    console.log(`[${row.user_id}] Extracting image observations...`);
    const vision = await visionAgent(
      row.claim_object,
      triage.intent.reported_issue_family,
      validImagePaths
    );
    observations = vision.observations;
    visionTokens = vision.inputTokens + vision.outputTokens;
    imagesProcessed = vision.imagesProcessed;
  }

  // Step 4: VALIDATION - Check evidence requirements
  console.log(`[${row.user_id}] Validating evidence...`);
  const imageIdsList = observations.map((o) => o.image_id);
  const validation = validateEvidence(
    observations,
    triage.intent.reported_issue_family,
    row.claim_object,
    triage.intent.relevant_object_parts,
    evidenceRequirements,
    imageIdsList
  );

  // Step 5: RISK AGGREGATION - Identify risk flags
  console.log(`[${row.user_id}] Aggregating risks...`);
  const riskAggregation = aggregateRisk(
    observations,
    validation.standard_met,
    userHistory,
    row.claim_object
  );

  // Step 6: JUDGE - Make final decision
  console.log(`[${row.user_id}] Making final judgment...`);
  const visibleIssue =
    observations.length > 0
      ? observations[0].visible_issue_type
      : "unknown";
  const visibleParts =
    observations.length > 0
      ? observations[0].affected_parts.join(", ")
      : "unknown";
  const severity =
    observations.length > 0
      ? observations[0].severity_estimate
      : "unknown";

  const judge = await judgeAgent(
    row.claim_object,
    row.user_claim,
    triage.intent.reported_issue_family,
    visibleIssue,
    visibleParts,
    severity,
    validation.standard_met,
    joinWithSemicolons(riskAggregation.risk_flags),
    joinWithSemicolons(validation.supporting_image_ids || [])
  );

  // Step 7: BUILD OUTPUT ROW
  const normalizedRiskFlags = normalizeRiskFlags(riskAggregation.risk_flags);

  const outputRow: OutputRow = {
    user_id: row.user_id,
    image_paths: row.image_paths,
    user_claim: row.user_claim,
    claim_object: row.claim_object,
    evidence_standard_met: validation.standard_met ? "true" : "false",
    evidence_standard_met_reason: validation.standard_reason,
    risk_flags: joinWithSemicolons(normalizedRiskFlags),
    issue_type: visibleIssue,
    object_part: visibleParts === "unknown" ? "unknown" : visibleParts.split(", ")[0],
    claim_status: judge.verdict.claim_status,
    claim_status_justification: judge.verdict.status_justification,
    supporting_image_ids: joinWithSemicolons(validation.supporting_image_ids || []),
    valid_image: hasValidImages ? "true" : "false",
    severity: judge.verdict.final_severity,
  };

  return {
    output: outputRow,
    stats: {
      triageTokens: triage.inputTokens + triage.outputTokens,
      visionTokens,
      judgeTokens: judge.inputTokens + judge.outputTokens,
      imagesProcessed,
    },
  };
}
