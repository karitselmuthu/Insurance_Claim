import { createReadStream, createWriteStream } from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { promises as fs } from "fs";
import {
  ClaimInputRow,
  ClaimInputRowSchema,
  OutputRow,
  OutputRowSchema,
  UserHistory,
  UserHistorySchema,
  EvidenceRequirement,
  EvidenceRequirementSchema,
} from "./schema.js";

/**
 * Read claims CSV file
 */
export async function readClaimsCSV(filePath: string): Promise<ClaimInputRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ClaimInputRow[] = [];
    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      })
    );

    parser.on("data", (row: any) => {
      try {
        const validated = ClaimInputRowSchema.parse(row);
        rows.push(validated);
      } catch (error) {
        console.warn(`Skipping invalid row:`, error);
      }
    });

    parser.on("error", reject);
    parser.on("end", () => resolve(rows));
  });
}

/**
 * Read user history CSV file
 */
export async function readUserHistoryCSV(
  filePath: string
): Promise<Map<string, UserHistory>> {
  return new Promise((resolve, reject) => {
    const histories = new Map<string, UserHistory>();
    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      })
    );

    parser.on("data", (row: any) => {
      try {
        // Convert numeric fields
        const validated = UserHistorySchema.parse({
          ...row,
          past_claim_count: parseInt(row.past_claim_count) || 0,
          accept_claim: parseInt(row.accept_claim) || 0,
          manual_review_claim: parseInt(row.manual_review_claim) || 0,
          rejected_claim: parseInt(row.rejected_claim) || 0,
          last_90_days_claim_count: parseInt(row.last_90_days_claim_count) || 0,
        });
        histories.set(validated.user_id, validated);
      } catch (error) {
        console.warn(`Skipping invalid history row:`, error);
      }
    });

    parser.on("error", reject);
    parser.on("end", () => resolve(histories));
  });
}

/**
 * Read evidence requirements CSV file
 */
export async function readEvidenceRequirementsCSV(
  filePath: string
): Promise<EvidenceRequirement[]> {
  return new Promise((resolve, reject) => {
    const requirements: EvidenceRequirement[] = [];
    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
      })
    );

    parser.on("data", (row: any) => {
      try {
        const validated = EvidenceRequirementSchema.parse(row);
        requirements.push(validated);
      } catch (error) {
        console.warn(`Skipping invalid requirement row:`, error);
      }
    });

    parser.on("error", reject);
    parser.on("end", () => resolve(requirements));
  });
}

/**
 * Write output CSV file
 */
export async function writeOutputCSV(
  filePath: string,
  rows: OutputRow[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stringifier = stringify({
      header: true,
      columns: [
        "user_id",
        "image_paths",
        "user_claim",
        "claim_object",
        "evidence_standard_met",
        "evidence_standard_met_reason",
        "risk_flags",
        "issue_type",
        "object_part",
        "claim_status",
        "claim_status_justification",
        "supporting_image_ids",
        "valid_image",
        "severity",
      ],
    });

    const output = createWriteStream(filePath);

    stringifier.pipe(output);

    rows.forEach((row) => {
      stringifier.write(row);
    });

    stringifier.end();

    output.on("finish", resolve);
    output.on("error", reject);
  });
}

/**
 * Check if a CSV file exists
 */
export async function csvExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
