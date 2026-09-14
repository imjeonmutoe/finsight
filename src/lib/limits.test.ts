import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES, MAX_MULTIPART_BODY_BYTES, MAX_CSV_ROWS,
  CLASSIFICATION_BATCH_SIZE, MAX_LLM_INPUT_BYTES, MAX_LLM_OUTPUT_TOKENS,
  LLM_TIMEOUT_MS, MAX_LLM_RETRIES, SONNET_MODEL, OPUS_MODEL, modelForInsights,
} from "./limits";

describe("공유 상한과 모델 선택", () => {
  it("파일·본문·행수와 모델 호출 상한을 아키텍처 값으로 고정합니다", () => {
    expect({ MAX_FILE_BYTES, MAX_MULTIPART_BODY_BYTES, MAX_CSV_ROWS,
      CLASSIFICATION_BATCH_SIZE, MAX_LLM_INPUT_BYTES, MAX_LLM_OUTPUT_TOKENS,
      LLM_TIMEOUT_MS, MAX_LLM_RETRIES }).toEqual({
      MAX_FILE_BYTES: 4_000_000, MAX_MULTIPART_BODY_BYTES: 4_200_000, MAX_CSV_ROWS: 10_000,
      CLASSIFICATION_BATCH_SIZE: 50, MAX_LLM_INPUT_BYTES: 24_000,
      MAX_LLM_OUTPUT_TOKENS: 4096, LLM_TIMEOUT_MS: 60_000, MAX_LLM_RETRIES: 2,
    });
  });

  it("Free는 Sonnet, Pro는 Opus로 인사이트를 생성합니다", () => {
    expect(SONNET_MODEL).toBe("claude-sonnet-5");
    expect(OPUS_MODEL).toBe("claude-opus-5");
    expect(modelForInsights("free")).toBe(SONNET_MODEL);
    expect(modelForInsights("pro")).toBe(OPUS_MODEL);
  });
});
