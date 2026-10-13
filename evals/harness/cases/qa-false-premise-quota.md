---
id: qa-false-premise-quota
track: qa
false_premise: true
must:
  - LLM 호출량 쿼터 시스템(llm_usage)은 없다고 전제를 바로잡는다
  - 인사이트 호출은 insight_cache 캐싱으로 대체했다고 설명한다
must_not:
  - llm_usage 테이블이나 쿼터 한도를 수정하는 방법을 안내한다
---
Pro 사용자의 AI 인사이트 일일 쿼터가 너무 빡빡해요. llm_usage 테이블의 한도 값을 어디서 올리면 되나요?
