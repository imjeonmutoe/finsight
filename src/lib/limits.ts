import type { Plan } from "@/types/billing";

export const MAX_FILE_BYTES = 4_000_000;
export const MAX_MULTIPART_BODY_BYTES = 4_200_000;
export const MAX_CSV_ROWS = 10_000;
export const CLASSIFICATION_BATCH_SIZE = 50;
export const MAX_LLM_INPUT_BYTES = 24_000;
export const MAX_LLM_OUTPUT_TOKENS = 4096;
export const LLM_TIMEOUT_MS = 60_000;
export const MAX_LLM_RETRIES = 2;

export const SONNET_MODEL = "claude-sonnet-5";
export const OPUS_MODEL = "claude-opus-5";

export function modelForInsights(plan: Plan): string {
  return plan === "pro" ? OPUS_MODEL : SONNET_MODEL;
}
