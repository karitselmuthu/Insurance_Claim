import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readClaimsCSV, readUserHistoryCSV, readEvidenceRequirementsCSV, writeOutputCSV } from "./io/csv.js";
import { processClaim } from "./pipeline.js";
import { anthropicClient } from "./anthropic/client.js";

dotenv.config();

/**
 * Main entry point for the insurance claim review system
 */
async function main() {
  const startTime = Date.now();

  try {
    // Resolve dataset paths relative to project root in ESM
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, "..");
    const datasetDir = path.join(projectRoot, "dataset");

    const claimsPath = path.join(datasetDir, "claims.csv");
    const userHistoryPath = path.join(datasetDir, "user_history.csv");
    const evidenceRequirementsPath = path.join(datasetDir, "evidence_requirements.csv");
    const outputPath = path.join(projectRoot, "output.csv");

    console.log("🔍 Insurance Damage Claim Review System");
    console.log("=====================================\n");

    // Load input data
    console.log("📂 Loading datasets...");
    const claims = await readClaimsCSV(claimsPath);
    const userHistories = await readUserHistoryCSV(userHistoryPath);
    const evidenceRequirements = await readEvidenceRequirementsCSV(
      evidenceRequirementsPath
    );

    console.log(`✓ Loaded ${claims.length} claims`);
    console.log(`✓ Loaded ${userHistories.size} user histories`);
    console.log(`✓ Loaded ${evidenceRequirements.length} evidence requirements\n`);

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("❌ Missing ANTHROPIC_API_KEY in environment. Create a .env file or set the variable.");
      process.exit(1);
    }

    // Process all claims
    console.log("⚙️ Processing claims...");
    const outputs = [];
    let totalTriageTokens = 0;
    let totalVisionTokens = 0;
    let totalJudgeTokens = 0;
    let totalImagesProcessed = 0;

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const userHistory = userHistories.get(claim.user_id) || null;

      try {
        const result = await processClaim(
          claim,
          userHistory,
          evidenceRequirements
        );
        outputs.push(result.output);

        totalTriageTokens += result.stats.triageTokens;
        totalVisionTokens += result.stats.visionTokens;
        totalJudgeTokens += result.stats.judgeTokens;
        totalImagesProcessed += result.stats.imagesProcessed;

        const progress = ((i + 1) / claims.length * 100).toFixed(1);
        console.log(
          `[${i + 1}/${claims.length} (${progress}%)] ${claim.user_id}: ${result.output.claim_status}`
        );
      } catch (error) {
        console.error(`❌ Error processing ${claim.user_id}:`, error);
        // Continue with next claim
      }
    }

    // Write output CSV
    console.log(`\n📝 Writing output to ${outputPath}...`);
    await writeOutputCSV(outputPath, outputs);
    console.log("✓ Output written\n");

    // Print statistics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const apiStats = anthropicClient.getStats();

    console.log("📊 Operational Analysis");
    console.log("======================");
    console.log(`Claims processed: ${outputs.length}`);
    console.log(`Total runtime: ${duration.toFixed(2)}s`);
    console.log(`Average time per claim: ${(duration / outputs.length).toFixed(2)}s`);
    console.log();
    console.log("Token Usage:");
    console.log(`  Triage calls: ~${totalTriageTokens} tokens`);
    console.log(`  Vision calls: ~${totalVisionTokens} tokens (${totalImagesProcessed} images)`);
    console.log(`  Judge calls: ~${totalJudgeTokens} tokens`);
    console.log(`  Total API calls: ${apiStats.callCount}`);
    console.log(`  Total tokens: ${apiStats.totalTokens}`);
    console.log();
    console.log("Cost Estimate (using Sonnet pricing):");
    // Approximate Sonnet pricing: $3 / 1M input, $15 / 1M output
    const estimatedInputCost = (apiStats.totalInputTokens / 1_000_000) * 3;
    const estimatedOutputCost = (apiStats.totalOutputTokens / 1_000_000) * 15;
    const estimatedCacheCost = (apiStats.totalCacheCreationTokens / 1_000_000) * 0.375;
    const estimatedTotalCost =
      estimatedInputCost + estimatedOutputCost + estimatedCacheCost;

    console.log(`  Input tokens: ${apiStats.totalInputTokens} (~$${estimatedInputCost.toFixed(4)})`);
    console.log(`  Output tokens: ${apiStats.totalOutputTokens} (~$${estimatedOutputCost.toFixed(4)})`);
    console.log(`  Cache creation: ${apiStats.totalCacheCreationTokens} (~$${estimatedCacheCost.toFixed(4)})`);
    console.log(`  Estimated total: ~$${estimatedTotalCost.toFixed(4)}`);
    console.log();
    console.log(`✅ Complete! Results in ${outputPath}`);

  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run the pipeline
main().catch(console.error);
