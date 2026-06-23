import { anthropicClient } from "../anthropic/client.js";
import { ImageObservation, ImageObservationSchema } from "../io/schema.js";
import { visionSystemPrompt, visionUserMessage } from "../prompts/index.js";
import { imagesToBlocks, extractImageId } from "../anthropic/images.js";
import { z } from "zod";

/**
 * Vision extraction stage: Analyze images and extract observations
 * Uses claude-3-sonnet for multimodal processing
 */
export async function visionAgent(
  claimObject: string,
  reportedIssueFamily: string,
  imagePaths: string[]
): Promise<{
  observations: ImageObservation[];
  inputTokens: number;
  outputTokens: number;
  imagesProcessed: number;
}> {
  // Convert image paths to base64 blocks with deduplication
  const imageBlocks = await imagesToBlocks(imagePaths);

  // Build image content blocks for API
  const visionBlocks = imageBlocks.map((block: { source: { type: "base64"; media_type: "image/jpeg"; data: string } }) => ({
    type: "image" as const,
    source: block.source,
  }));

  const systemPrompt = visionSystemPrompt();
  const userMessage = visionUserMessage(
    claimObject,
    reportedIssueFamily,
    imageBlocks.length
  );

  // Call vision model with images
  const result = await anthropicClient.callVision<ImageObservation[]>(
    systemPrompt,
    userMessage,
    visionBlocks,
    z.array(ImageObservationSchema),
    {
      temperature: 0,
      maxTokens: 2000,
    }
  );

  // Ensure image IDs are correct (extract from image file paths)
  const observations = result.data.map((obs, idx) => ({
    ...obs,
    image_id: imageBlocks[idx]?.imageId || obs.image_id,
  }));

  return {
    observations,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    imagesProcessed: imageBlocks.length,
  };
}
