import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { z } from "zod";
import { readUserHistoryCSV, readEvidenceRequirementsCSV } from "./io/csv.js";
import { processClaim } from "./pipeline.js";
import { CLAIM_OBJECTS, UserHistory, EvidenceRequirement } from "./io/schema.js";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetDir = path.resolve(__dirname, "..", "dataset");

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const ClaimRequestSchema = z.object({
  user_id: z.string().min(1, "user_id is required"),
  claim_object: z.enum(CLAIM_OBJECTS, {
    errorMap: () => ({ message: `claim_object must be one of: ${CLAIM_OBJECTS.join(", ")}` }),
  }),
  user_claim: z.string().min(1, "user_claim is required"),
});

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();
app.use(express.json());

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error(`File "${file.originalname}" is not an image`));
    }
  },
});

// ============================================================================
// ROUTES
// ============================================================================

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/claims/review", upload.array("images", 10), async (req, res) => {
  const startTime = Date.now();
  const tempPaths: string[] = [];

  try {
    // Validate text fields
    const parsed = ClaimRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { user_id, claim_object, user_claim } = parsed.data;

    // Validate files
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "At least one image file is required (field name: images)" });
      return;
    }

    // Give each uploaded file a proper extension so sharp can read it
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const dest = file.path + ext;
      await fs.rename(file.path, dest);
      tempPaths.push(dest);
    }

    const userHistory = userHistories.get(user_id) ?? null;

    const result = await processClaim(
      {
        user_id,
        image_paths: tempPaths.join(";"),
        user_claim,
        claim_object,
      },
      userHistory,
      evidenceRequirements
    );

    const o = result.output;

    res.json({
      user_id,
      claim_status: o.claim_status,
      claim_status_justification: o.claim_status_justification,
      severity: o.severity,
      evidence_standard_met: o.evidence_standard_met === "true",
      evidence_standard_met_reason: o.evidence_standard_met_reason,
      risk_flags: o.risk_flags === "none" ? [] : o.risk_flags.split(";"),
      issue_type: o.issue_type,
      object_part: o.object_part,
      supporting_image_ids:
        o.supporting_image_ids === "none" ? [] : o.supporting_image_ids.split(";"),
      valid_image: o.valid_image === "true",
      processing_time_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error processing claim:", error);
    res.status(500).json({
      error: "Failed to process claim",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    // Clean up temp files regardless of success or failure
    for (const p of tempPaths) {
      await fs.unlink(p).catch(() => {});
    }
  }
});

// ============================================================================
// STARTUP
// ============================================================================

let userHistories: Map<string, UserHistory>;
let evidenceRequirements: EvidenceRequirement[];

async function start() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ Missing ANTHROPIC_API_KEY — add it to your .env file");
    process.exit(1);
  }

  console.log("📂 Loading reference data...");
  userHistories = await readUserHistoryCSV(path.join(datasetDir, "user_history.csv"));
  evidenceRequirements = await readEvidenceRequirementsCSV(
    path.join(datasetDir, "evidence_requirements.csv")
  );
  console.log(`✓ ${userHistories.size} user histories`);
  console.log(`✓ ${evidenceRequirements.length} evidence requirements`);

  app.listen(PORT, () => {
    console.log(`\n🚀 Insurance Claim API  →  http://localhost:${PORT}`);
    console.log(`   POST /claims/review   submit a claim with images`);
    console.log(`   GET  /health          health check\n`);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
