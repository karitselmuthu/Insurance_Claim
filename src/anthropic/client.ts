import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import pLimit from "p-limit";

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONCURRENCY = parseInt(process.env.CONCURRENCY || "6", 10);
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

// Global concurrency limiter
const limiter = pLimit(CONCURRENCY);

// ============================================================================
// TYPES
// ============================================================================

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;
}

interface CallResult<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
}

// ============================================================================
// ANTHROPIC CLIENT WRAPPER
// ============================================================================

class AnthropicClientWrapper {
  private client: Anthropic;
  private callCount = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCacheCreationTokens = 0;
  private totalCacheReadTokens = 0;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Make a JSON-returning API call with retry logic, prompt caching, and concurrency limiting
   */
  async callJSON<T>(
    systemPrompt: string,
    userMessage: string,
    schema: z.ZodSchema<T>,
    options: CallOptions = {}
  ): Promise<CallResult<T>> {
    return limiter(async () => {
      return this.executeWithRetries(systemPrompt, userMessage, schema, options);
    });
  }

  /**
   * Internal implementation with retry logic
   */
  private async executeWithRetries<T>(
    systemPrompt: string,
    userMessage: string,
    schema: z.ZodSchema<T>,
    options: CallOptions
  ): Promise<CallResult<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.executeCall(systemPrompt, userMessage, schema, options);
        return result;
      } catch (error) {
        lastError = error as Error;
        const statusCode = (error as any).status;

        // Retry on rate limits and server errors
        if (statusCode !== 429 && statusCode !== 529 && statusCode < 500) {
          throw error;
        }

        if (attempt < MAX_RETRIES - 1) {
          const delayMs = this.calculateBackoff(attempt);
          console.warn(
            `Retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms for status ${statusCode}`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`
    );
  }

  /**
   * Execute a single API call
   */
  private async executeCall<T>(
    systemPrompt: string,
    userMessage: string,
    schema: z.ZodSchema<T>,
    options: CallOptions
  ): Promise<CallResult<T>> {
    const systemBlock = options.useCache
      ? [
          {
            type: "text" as const,
            text: systemPrompt,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : [
          {
            type: "text" as const,
            text: systemPrompt,
          },
        ];

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0,
      system: systemBlock as any,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in response");
    }

    let jsonText = textContent.text;

    // Try to extract JSON if wrapped in markdown
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Parse and validate JSON
    let parsedData;
    try {
      parsedData = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${jsonText}`);
    }

    // Validate against schema
    const validatedData = schema.parse(parsedData);

    // Track metrics
    this.callCount++;
    this.totalInputTokens += response.usage.input_tokens;
    this.totalOutputTokens += response.usage.output_tokens;
    
    const cacheCreationTokens = (response.usage as any).cache_creation_input_tokens || 0;
    const cacheReadTokens = (response.usage as any).cache_read_input_tokens || 0;
    
    if (cacheCreationTokens > 0) {
      this.totalCacheCreationTokens += cacheCreationTokens;
    }
    if (cacheReadTokens > 0) {
      this.totalCacheReadTokens += cacheReadTokens;
    }

    return {
      data: validatedData,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: cacheCreationTokens > 0 ? cacheCreationTokens : undefined,
        cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
      },
    };
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number): number {
    const exponential = Math.pow(2, attempt) * BASE_BACKOFF_MS;
    const jitter = Math.random() * 1000;
    return exponential + jitter;
  }

  /**
   * Call Claude for text-only tasks (no JSON return)
   */
  async callText(
    systemPrompt: string,
    userMessage: string,
    options: CallOptions = {}
  ): Promise<string> {
    return limiter(async () => {
      const response = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text content in response");
      }

      this.callCount++;
      this.totalInputTokens += response.usage.input_tokens;
      this.totalOutputTokens += response.usage.output_tokens;

      return textContent.text;
    });
  }

  /**
   * Call Claude with vision (multimodal)
   */
  async callVision<T>(
    systemPrompt: string,
    userMessage: string,
    imageBlocks: any[],
    schema: z.ZodSchema<T>,
    options: CallOptions = {}
  ): Promise<CallResult<T>> {
    return limiter(async () => {
      const response = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userMessage,
              },
              ...imageBlocks,
            ] as any,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text content in response");
      }

      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      let parsedData;
      try {
        parsedData = JSON.parse(jsonText);
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${jsonText}`);
      }

      const validatedData = schema.parse(parsedData);

      this.callCount++;
      this.totalInputTokens += response.usage.input_tokens;
      this.totalOutputTokens += response.usage.output_tokens;

      return {
        data: validatedData,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    });
  }

  /**
   * Get statistics about API usage
   */
  getStats() {
    return {
      callCount: this.callCount,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCacheCreationTokens: this.totalCacheCreationTokens,
      totalCacheReadTokens: this.totalCacheReadTokens,
      totalTokens:
        this.totalInputTokens +
        this.totalOutputTokens +
        this.totalCacheCreationTokens +
        this.totalCacheReadTokens,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.callCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCacheCreationTokens = 0;
    this.totalCacheReadTokens = 0;
  }
}

export const anthropicClient = new AnthropicClientWrapper();
