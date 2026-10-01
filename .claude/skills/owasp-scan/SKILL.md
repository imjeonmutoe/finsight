---
name: owasp-scan
description: FinSight 리포 전체를 OWASP Top 10:2025(A01~A10) 기준으로 보안 스캔하고, 카테고리별 점수·심각도 분포·지적을 시각화한 단일 HTML 리포트를 만든다. 결정론적 자동 검사(scan.py) + 카테고리별 수동 감사(owasp-auditor) + 반박 검증(review-verify)을 거친 지적만 점수에 넣는다. "OWASP 스캔", "보안 스캔", "보안 점검", "취약점 점검", "owasp-scan", "Top 10 기준으로 봐줘"에 쓴다. 브랜치 diff만 보는 /review-code·review-security와 달리 이미 들어와 있는 코드 전체를 본다.
---

# OWASP Top 10:2025 보안 스캔

리포 **전체**를 본다. 변경분 리뷰는 `/review-code`가 한다 — 범위가 겹치지 않게 일부러 나눴다.
이 스킬은 코드를 고치지 않는다. 리포트만 만든다.

## 결과물

`.owasp/` (gitignore됨) 아래에 세 개:

| 파일 | 내용 |
|---|---|
| `auto.json` | `scan.py`의 자동 검사 후보 |
| `review.json` | 수동 감사 지적 + 반박 검증 판정 (이 세션이 쓴다) |
| `owasp-score.json` · `owasp-report.html` | `report.py`가 계산한 점수와 리포트 |

**리포트를 커밋하지 마라.** 이 리포는 공개(PUBLIC)다. 고치지 않은 취약점 목록을 `docs/`에 올리면
공격자용 지도를 배포하는 것이다. 그래서 출력은 `.owasp/`로 고정이고 `.gitignore`에 들어 있다.

## 순서

각 단계의 **검증**을 통과한 뒤 다음으로 간다.

### 1. 자동 검사

```bash
S=.claude/skills/owasp-scan/scripts
python3 $S/scan.py . --json .owasp/auto.json
```

`npm audit`은 네트워크가 필요하다. 실패하면 `meta.npm_audit`에 `실패: …`가 남고 A03 자동 후보가 비게 된다.
오프라인이면 `--no-npm-audit`를 붙이고, 사용자에게 A03 결과가 불완전하다고 알린다.

**검증**: 카테고리별 건수가 출력된다. 자동 검사가 무엇을 보는지는 `scan.py`의 `LINE_RULES`와
`check_*` 함수, 그리고 `references/checklist.md`의 각 절 **자동** 줄에 있다.

### 2. 수동 감사 — `owasp-auditor` 3개를 **한 메시지에서 병렬로**

자동 검사는 텍스트 패턴만 본다. IDOR·fail-open·대량 할당·프롬프트 인젝션은 읽어야 보인다.
카테고리를 셋으로 묶어 `subagent_type: "owasp-auditor"`로 띄운다. 프롬프트에는 맡은 카테고리와
`.owasp/auto.json` 경로만 준다(나머지 지시는 에이전트 정의에 있다).

| 감사자 | 카테고리 | 묶은 이유 |
|---|---|---|
| 1 | A01 · A07 | 인가와 인증은 같은 파일(라우트·미들웨어·RLS 정책)을 본다 |
| 2 | A04 · A05 · A08 | 데이터가 들어오는 경로(CSV·LLM·웹훅)를 따라간다 |
| 3 | A02 · A03 · A06 · A09 · A10 | 설정·CI·설계·로깅·실패 처리 — 횡단 관심사 |

**완료 알림 전에 턴을 끝내지 마라.** 세 개가 모두 돌아와야 다음 단계다.

**검증**: 세 응답이 모두 JSON으로 파싱된다. 파싱이 안 되면 그 감사자에게 SendMessage로 JSON만 다시 달라고 한다.
`assessed`에 빠진 카테고리가 있으면 사용자에게 알린다 — 리포트에서 '미검토'로 나가고 등급은 '판정 불가'가 된다.

### 3. 반박 검증 — `review-verify`

감사자의 수동 지적들을 **도착한 순서대로** 한 배열로 이어 붙이고 `M-1`, `M-2`, …로 번호를 매긴다.
`report.py`가 같은 순서로 같은 id를 다시 매기므로 **순서를 바꾸지 마라.** 바꾸면 판정이 엉뚱한 지적에 붙는다.

자동 후보(`auto.json`의 `id`)와 수동 지적(`M-n`)을 모두 `review-verify`에 넘긴다. 20건이 넘으면
카테고리 묶음별로 나눠 병렬로 띄운다. 프롬프트에 넣을 것:

- "차원: OWASP Top 10:2025 보안. 대상은 diff가 아니라 리포 현재 워크스페이스 파일이다."
- 각 지적의 `id`·`file:line`·`title`·`failure_scenario`·`critical_rule`(true면 `[CRITICAL 규칙]` 표시)
- 반환 형식: `[{"id", "refuted", "phantom", "reason", "severity_correction"}]` — **모든 id에 판정을 달 것**

**검증**: 넘긴 id 수와 돌아온 판정 수가 같다. 빠진 id는 '미검증'으로 리포트에 남는다(통과가 아니다).

### 4. 리포트

`.owasp/review.json`을 쓴다:

```json
{
  "assessed": ["A01", "A07", "..."],
  "notes": {"A01": "감사자가 준 한 줄"},
  "findings": [ "감사자 지적을 3단계의 순서 그대로" ],
  "verdicts": [ "review-verify 판정 전부" ]
}
```

```bash
python3 $S/report.py --auto .owasp/auto.json --review .owasp/review.json --out .owasp
```

점수는 **이 스크립트만** 계산한다. 직접 점수를 매기거나 JSON의 숫자를 고치지 마라(CLAUDE.md: 집계는 코드로).

- 카테고리마다 10점. 남은 지적 1건당 critical −10 · major −4 · minor −1 · nit 0, 0점 아래로는 안 내려간다.
- 기각된 지적은 빠지고, 판정이 없는 지적은 '미검증'으로 **남아서 감점된다.**
- `critical_rule` 지적은 검증이 심각도를 깎아도 major 아래로 내려가지 않는다.
- 등급: 90+ 양호 · 75+ 보통 · 50+ 취약 · 그 아래 위험. **critical이 1건이라도 남으면 점수와 관계없이 위험.**
  미검토 카테고리가 있으면 '판정 불가'.

### 5. 화면 확인

HTML은 `assets/template.html`을 `report.py`가 채운 것이다. **템플릿을 손으로 고쳐 쓰지 마라.**
그래도 렌더 결과는 직접 본다 — 데이터 모양이 템플릿 기대와 다르면 빈 칸이 조용히 생긴다.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1440,3200 --screenshot=.owasp/report.png "file://$PWD/.owasp/owasp-report.html"
```

PNG를 열어 점수·카테고리 10행·분포 행렬·지적 목록이 다 그려졌는지 본다. Chrome이 없으면 건너뛰지 말고
사용자에게 `open .owasp/owasp-report.html`로 직접 확인을 요청한다.

### 6. 보고

한 문단으로:
1. 총점·등급 (`72/100 · 취약`)
2. critical·major 지적을 `file:line`과 함께 (있으면 전부, 없으면 "없음")
3. 기각·미검증·미검토 건수 — 0이 아니면 무엇이 빠졌는지
4. 리포트 경로

고칠지는 사용자가 정한다. 고치기로 하면 TDD로(테스트 먼저) 브랜치에서 고친다.

## 하지 말 것

- **리포트·JSON을 커밋하거나 `docs/`로 옮기기** — 공개 리포다.
- **ADR과 충돌하는 `fix`** — 특히 ADR-012가 금지한 LLM 쿼터·lease·429 경로, ADR-010이 고정한 툴체인
  메이저 업그레이드. 목록은 `references/checklist.md`의 각 절 "권고 금지".
- **비밀값을 evidence에 넣기** — `scan.py`는 가린다. 수동 지적도 같은 규칙을 지킨다.
- **자동 후보를 검증 없이 확정으로 취급** — 패턴 검사는 오탐이 있다(예: `new Request("http://upload.local/")`는
  네트워크로 나가지 않는 합성 URL이다). 전부 3단계를 거친다.

## 파일

- `scripts/scan.py` — 자동 검사 (stdlib, Python 3.10+)
- `scripts/report.py` — 채점 + HTML 렌더
- `scripts/notify.py` — 정기 실행(`.github/workflows/owasp-scan.yml`, 격주 금 18:00 KST)의 공개 요약·Slack 페이로드. 공개 요약에는 점수만 넣는다
- `scripts/test_*.py` — `uv run --with pytest python -m pytest .claude/skills/owasp-scan/scripts -q`
- `assets/template.html` — 고정 디자인 (Inter + JetBrains Mono, 인라인 SVG, 차트 라이브러리 없음)
- `references/checklist.md` — 카테고리별 자동·수동 기준, 권고 금지, 심각도 기준
- `.claude/agents/owasp-auditor.md` — 2단계 감사자 정의 (읽기 전용)
