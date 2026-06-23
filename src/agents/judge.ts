import { anthropicClient } from "../anthropic/client.js";
import { Verdict, VerdictSchema } from "../io/schema.js";
import { judgeSystemPrompt, judgeUserMessage } from "../prompts/index.js";

/**
 * Judge stage: Make final decision on claim
 * Uses claude-3-sonnet for text-only decision making
 */
export async function judgeAgent(
  claimObject: string,
  userClaim: string,
  reportedIssueFamily: string,
  visibleIssue: string,
  visibleParts: string,
  severity: string,
  standardMet: boolean,
  riskFlags: string,
  supportingImageIds: string
): Promise<{
  verdict: Verdict;
  inputTokens: number;
  outputTokens: number;
}> {
  const systemPrompt = judgeSystemPrompt();
  const userMessage = judgeUserMessage(
    claimObject,
    userClaim,
    reportedIssueFamily,
    visibleIssue,
    visibleParts,
    severity,
    standardMet ? "true" : "false",
    riskFlags,
    supportingImageIds
  );

  const result = await anthropicClient.callJSON(
    systemPrompt,
    userMessage,
    VerdictSchema,
    {
      temperature: 0,
      maxTokens: 500,
    }
  );

  return {
    verdict: result.data,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}
