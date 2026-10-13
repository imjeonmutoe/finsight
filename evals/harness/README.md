# 하네스 eval

FinSight의 비즈니스 로직이 아니라 **하네스 품질**을 잰다. 이 eval이 묻는 것은
"CLAUDE.md에 적은 규칙이 모델에게 실제로 전달되는가"다. 규칙 문장을 고쳤을 때 리뷰어가
위반을 놓치기 시작하거나, 응답자가 규약을 틀리게 말하기 시작하면 여기서 빨간불이 뜬다.

## 두 트랙

| 트랙 | subject (`claude-sonnet-5-5`) | 시스템 프롬프트 | 라벨 | 통과 조건 (Opus 채점) |
|---|---|---|---|---|
| `review` | 경량 리뷰어 | CLAUDE.md의 `- CRITICAL:` 규칙 요약 (`criticalRules()`가 '이유:' 이하를 떼고 뽑는다) | `expect: violation` + `rule` / `expect: pass` | violation: 그 `rule` 위반을 지적함. pass: 위반을 하나도 주장하지 않음 (오탐 방지) |
| `qa` | 응답자 | CLAUDE.md 전문 | `must` / `must_not` / `false_premise` | `must`를 전부 담고 `must_not`을 하나도 담지 않음. `false_premise`면 전제를 바로잡아야 함 |

채점자는 `claude-opus-5-5`다. subject와 다른 모델을 쓰는 이유는, 같은 모델이 자기 답을
채점하면 같은 맹점을 공유하기 때문이다.

## 실행

```bash
npm test          # 키 없음·무료. 파서·균형·프롬프트 조립·집계 + golden set 무결성
npm run eval      # 라이브. 케이스당 Sonnet 1회 + Opus 1회 호출, 비용이 든다
```

`npm run eval`은 SDK 기본 자격 증명(`ANTHROPIC_API_KEY` 등)을 쓴다. `.env.local`은 읽지
않으므로 셸에서 export한다. **하나라도 fail이나 error가 나면 exit 1**이다. API 오류도 실패로
본다 — 돌지 못한 케이스는 '통과'가 아니라 '모른다'다. 케이스가 0개여도 exit 1이다.

| 파일 | 역할 | 네트워크 |
|---|---|---|
| `lib.ts` | frontmatter 파싱·균형 검사·프롬프트 조립·집계 (순수 함수) | ✗ |
| `run.ts` | 케이스 로드 → subject → judge → 집계 → exit code. 모델 호출은 `Deps`로 주입 | ✓ (`main`만) |
| `cases/*.md` | golden set | — |

## 케이스 형식

파일명과 `id`가 같아야 한다. frontmatter가 라벨이고, 본문이 subject에게 그대로 가는 입력이다.

```markdown
---
id: review-log-financial
track: review
expect: violation
rule: 거래 내용·가맹점명·금액 같은 금융 데이터를 로그에 남긴다
---
(리뷰할 코드)
```

```markdown
---
id: qa-false-premise-quota
track: qa
false_premise: true
must:
  - LLM 호출량 쿼터 시스템(llm_usage)은 없다고 전제를 바로잡는다
must_not:
  - llm_usage 테이블이나 쿼터 한도를 수정하는 방법을 안내한다
---
(질문)
```

frontmatter는 YAML 전체가 아니라 `key: 값`과 `key:` 아래 `  - 항목` 두 모양만 읽는다.

## 원칙

**golden set은 작게 시작한다.** 지금은 review 5개(위반 4 + 정상 1)와 qa 4개(틀린 전제 1 포함)다.
케이스를 늘리는 것은 실패가 실제로 났거나 규칙이 새로 생겼을 때다. 많이 만들어 두면 라벨을
검토하지 않게 되고, 검토하지 않은 라벨로 도는 게이트는 아무것도 지키지 못한다.

**라벨은 사람이 박제한다.** `expect`·`rule`·`must`·`must_not`·`false_premise`는 사람이 읽고
정한 정답이다. 모델에게 라벨을 만들게 하거나, eval이 실패했다고 라벨을 고쳐 초록불을 만들지
않는다. 실패하면 먼저 하네스(CLAUDE.md 규칙 문장)를 의심하고, 라벨이 정말 틀렸을 때만 사람이
이유를 커밋 메시지에 남기고 고친다.

**균형은 `npm test`가 지킨다** (`checkBalance`). 다음 중 하나라도 깨지면 테스트가 실패하고,
`npm run eval`도 모델을 부르기 전에 멈춘다.

- review `expect: violation` 4개 이상, 각자 다른 `rule`
- review `expect: pass` 1개 이상 — 모든 코드에 위반을 외치는 리뷰어도 위반 케이스는 전부 통과한다
- qa `false_premise: true` 1개 이상 — 질문의 전제를 그대로 따라가는 응답자를 잡는다
- `id` 중복 없음

## temperature 0을 쓰지 않는 이유

`claude-sonnet-5-5`·`claude-opus-5-5`는 temperature 기본값이 아닌 값을 400으로 거절한다.
그래서 결정성을 temperature 대신 이렇게 확보한다.

- subject는 `effort: "low"`. 경량 리뷰어라는 역할에도 맞는다.
- 채점은 구조화 출력(`{pass, reason}` JSON 스키마)으로만 받는다.
- 응답이 `end_turn`이 아니면(refusal·max_tokens) 채점하지 않고 error로 남긴다.

그래도 샘플링 편차가 남는다. 경계에 걸린 케이스가 가끔 뒤집히면 라벨이나 규칙 문장이
모호하다는 신호로 읽는다. 재실행해서 초록불을 고르지 않는다.

refusal 대체 모델(`fallbacks`)도 켜지 않았다. 대체 모델이 답하면 지정한 모델을 잰 결과가 아니게 된다.
