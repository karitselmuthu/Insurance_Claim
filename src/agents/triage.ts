import { anthropicClient } from "../anthropic/client.js";
import { ClaimIntent, ClaimIntentSchema } from "../io/schema.js";
import { triageSystemPrompt, triageUserMessage } from "../prompts/index.js";

/**
 * Triage stage: Extract claim intent from user conversation
 * Uses claude-3-haiku for low-cost, fast processing
 */
export async function triageAgent(
  claimObject: string,
  userClaim: string
): Promise<{
  intent: ClaimIntent;
  inputTokens: number;
  outputTokens: number;
}> {
  const systemPrompt = triageSystemPrompt();
  const userMessage = triageUserMessage(claimObject, userClaim);

  const result = await anthropicClient.callJSON(
    systemPrompt,
    userMessage,
    ClaimIntentSchema,
    {
      temperature: 0,
      maxTokens: 300,
    }
  );

  return {
    intent: result.data,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}
