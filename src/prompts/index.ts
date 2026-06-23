/**
 * Triage stage prompt
 * Input: User conversation and historical data
 * Output: ClaimIntent with reported issue family and relevant parts
 * Model: claude-3-haiku
 */
export function triageSystemPrompt(): string {
  return `You are a triage agent for insurance damage claims. Your job is to extract and understand what the user is claiming was damaged.

Read the user's claim conversation carefully and extract:
1. What issue family they're claiming (dent/scratch, glass damage, broken parts, water damage, stains, etc.)
2. Which parts of the object they mention or imply are damaged
3. Whether they actually claim there is damage or are asking about it

Return ONLY valid JSON with no markdown or extra text.`;
}

/**
 * Template for triage user message
 */
export function triageUserMessage(
  claimObject: string,
  userClaim: string
): string {
  return `Object type: ${claimObject}

User claim transcript:
${userClaim}

Extract the claim intent. Return only this JSON structure (no markdown):
{
  "reported_issue_family": "string - the issue family from the claim",
  "relevant_object_parts": ["array of parts mentioned"],
  "damage_described": boolean,
  "urgency_context": "string or null"
}`;
}

// ============================================================================

/**
 * Vision extraction stage prompt
 * Input: Claim intent and images
 * Output: Array of ImageObservation objects
 * Model: claude-3-sonnet with vision
 */
export function visionSystemPrompt(): string {
  return `You are a computer vision agent for insurance claim review. Your job is to analyze submitted images and extract damage observations.

For each image, carefully observe:
1. What damage is actually visible (dent, scratch, crack, broken part, water damage, stain, etc.)
2. Which parts of the object are visible and affected
3. Image quality issues (blurry, cropped, low light, wrong angle, etc.)
4. How well the image matches the user's claim

Be precise and only report what you can see. If you cannot determine something, say "unknown".

Return ONLY valid JSON with no markdown or extra text.`;
}

/**
 * Template for vision user message
 */
export function visionUserMessage(
  claimObject: string,
  reportedIssueFamilyStr: string,
  imagesToAnalyze: number
): string {
  return `Object type: ${claimObject}
User claimed issue family: ${reportedIssueFamilyStr}

Analyze each image submitted and extract observations.
Return only this JSON structure (no markdown):
[
  {
    "image_id": "string - must match the image filename without extension",
    "visible_issue_type": "string - the issue type visible: dent, scratch, crack, glass_shatter, broken_part, missing_part, torn_packaging, crushed_packaging, water_damage, stain, none, or unknown",
    "affected_parts": ["array of visible affected parts"],
    "severity_estimate": "none, low, medium, high, or unknown",
    "image_quality_issues": ["array of issues: blurry_image, cropped_or_obstructed, low_light_or_glare, wrong_angle, etc."],
    "matches_claim": "clearly_matches, unclear_match, contradicts, or not_relevant",
    "explanation": "concise description of what you see"
  }
  ...
]`;
}

// ============================================================================

/**
 * Judge stage prompt
 * Input: Claim, observations, validation results, risk flags
 * Output: Verdict with final decision and justification
 * Model: claude-3-sonnet (text-only)
 */
export function judgeSystemPrompt(): string {
  return `You are the final judge for insurance damage claims. Your job is to make a decision based on all evidence: the user's claim, the images, validation checks, and risk factors.

Rules:
1. Images are the PRIMARY source of truth. What you can see overrides other factors.
2. If images clearly show the damage matches the claim, the claim is SUPPORTED.
3. If images show the opposite of what was claimed, the claim is CONTRADICTED.
4. If images are insufficient or unclear, the claim status is NOT_ENOUGH_INFORMATION.
5. Risk flags may warrant manual review, but should not override clear visual evidence.

Always justify your decision with specific reference to what is visible in the images.

Return ONLY valid JSON with no markdown or extra text.`;
}

/**
 * Template for judge user message
 */
export function judgeUserMessage(
  claimObject: string,
  userClaim: string,
  reportedIssueFamilyStr: string,
  visibleIssueStr: string,
  visiblePartsStr: string,
  severityStr: string,
  standardMetStr: string,
  riskFlagsStr: string,
  supportingImageIdsStr: string
): string {
  return `Object type: ${claimObject}

User claim: ${userClaim}
User claimed issue family: ${reportedIssueFamilyStr}

Image analysis results:
- Visible issue type: ${visibleIssueStr}
- Affected parts: ${visiblePartsStr}
- Severity: ${severityStr}
- Evidence standard met: ${standardMetStr}

Risk flags: ${riskFlagsStr}
Supporting images: ${supportingImageIdsStr}

Make a final decision. Return only this JSON structure (no markdown):
{
  "claim_status": "supported, contradicted, or not_enough_information",
  "status_justification": "concise explanation grounded in image evidence",
  "final_severity": "none, low, medium, high, or unknown"
}`;
}
