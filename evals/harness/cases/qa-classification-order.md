---
id: qa-classification-order
track: qa
must:
  - 사용자가 수정해 만든 merchant_rules를 가장 먼저 적용한다
  - 그다음 내장 가맹점 규칙 사전(src/lib/merchant-rules.ts)을 적용한다
  - 앞의 두 단계가 못 잡은 거래만 Claude 배치로 분류한다
must_not:
  - 모든 거래를 Claude로 분류해도 된다고 말한다
---
업로드한 거래의 카테고리는 어떤 순서로 정해지나요? 그냥 전부 Claude에 넘기면 안 되나요?
