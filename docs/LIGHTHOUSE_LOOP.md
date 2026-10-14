# Lighthouse 성능 autoresearch 루프

[karpathy/autoresearch](https://github.com/karpathy/autoresearch)의 구조를 웹 성능에 옮긴 것이다.
에이전트가 코드를 하나 고치고, 고정된 평가기로 점수를 재고, 오르면 커밋을 남기고 아니면 되돌린다.
이걸 더 오르지 않을 때까지 반복한다.

| autoresearch | 여기 |
|---|---|
| `prepare.py` (고정 평가, 수정 금지) | `scripts/lighthouse_loop.py` |
| `train.py` (에이전트가 고치는 파일) | `src/`·`next.config.ts`·`public/` |
| `val_bpb` (낮을수록 좋음) | 공개 4개 화면 Lighthouse 성능 점수 평균 — **HEAD 대비 차이**로 판정 |
| `program.md` | 이 문서 |
| `results.tsv` (커밋하지 않음) | `.autoresearch/lighthouse/results.tsv` (gitignore) |
| 무한 루프 | Workflow `lighthouse-loop` — 연속 N번 개선이 없으면 멈춘다 |

## 실행

```
/lighthouse-loop            # 기본값: 연속 5번 개선 없으면 정지, 최대 30회
/lighthouse-loop 8 50       # 인내 8회, 최대 50회
```

실험은 **한 번에 하나씩** 돈다. 병렬로 돌리지 않는 이유: Lighthouse는 CPU 시간을 재는 도구라
같은 머신에서 두 측정이 겹치면 서로의 점수를 깎는다. 서브에이전트는 실험마다 새로 띄워서
컨텍스트가 실험 횟수만큼 불어나지 않게 한다. 이전 시도는 `results.tsv`로 넘겨준다.

## 평가기 (고치지 마라)

`python3 scripts/lighthouse_loop.py trial "<설명>"` 하나가 판정까지 다 한다. 처음 한 번은
`trial baseline`으로 변경 없이 돌려 기준선과 A/A 노이즈를 기록한다.

1. `npm run lint` → `npm run test` → `npm run build`. 하나라도 실패하면 `crash`이고 변경을 되돌린다.
2. HEAD를 리포 밖 worktree(`~/.cache/finsight-lighthouse/ref`)에 체크아웃해 빌드한다(HEAD가 같으면 재사용).
3. 기준(HEAD)과 후보(작업트리)를 두 포트에 띄우고 `/`·`/login`·`/demo`·`/privacy`를 Lighthouse
   (모바일 기본 프리셋, `lighthouse@13.5.0`)로 **번갈아** 화면마다 3번씩 재서 각각 중앙값을 낸다.
4. 후보 성능 평균이 기준보다 **2점 이상** 높고 접근성·권장사항·SEO가 1점 넘게 떨어지지 않았으면,
   **한 번 더 A/B로 재서** 다시 통과할 때만 `keep` → `perf(lighthouse): <설명>` 커밋.
5. 아니면 `discard` → `git restore` + `git clean -fd`로 작업트리를 되돌린다.

절대 점수로 판정하지 않는 이유: 개발 머신에서는 같은 코드의 평균이 측정 시각에 따라 83~89점을
오갔다(IDE·브라우저 부하). 번갈아 재면 부하가 양쪽에 같이 걸려 상쇄된다. 그래도 A/A 차이가 -1.8까지
났다 — `/`는 동적 렌더링이라 FCP가 2.4~3.8초를 오간다. 그래서 마진 2점에 확인 측정까지 건다.
노이즈를 개선으로 채택하면 루프는 운에 커밋을 쌓는다. 평가기·마진·경로·측정 횟수를 루프 도중에 바꾸지 마라.

## 실험 에이전트가 지킬 것

**할 수 있는 것**
- 폰트 로딩(Pretendard 서브셋·`font-display`·preload), 이미지, 렌더링 방식(정적/동적), 번들 크기,
  서드파티 스크립트 로딩 시점, CSS, `next.config.ts`의 성능 옵션.
- 코드를 **지우는** 실험. 같은 점수에 코드가 줄면 그것도 이긴 것이다.

**하지 마라**
- `scripts/lighthouse_loop.py`·이 문서·`.autoresearch/`를 고치지 마라. 평가기를 고치는 것은 점수가 아니라 자를 바꾸는 것이다.
- 패키지를 추가하거나 버전을 올리지 마라 (ADR-010).
- **화면에 보이는 것을 바꿔서 점수를 사지 마라.** 콘텐츠·문구·레이아웃·색을 지우거나 숨기면 점수는 오르지만
  제품이 망가진다. 고친 화면은 `bash scripts/preview-shot.sh <경로>`로 찍어 `.autoresearch/lighthouse/baseline-*.png`와
  나란히 보고, 눈에 보이는 차이가 있으면 trial을 돌리지 말고 되돌려라.
- **첫 페인트에 필요한 리소스(폰트 선언·CSS)를 하이드레이션 뒤로 미루지 마라.** `useEffect`·동적 import로
  Pretendard CSS를 늦게 받는 실험이 +12.5점을 받았지만 되돌렸다(1012 루프). 모든 화면이 OS 기본 서체로 먼저
  그려졌다가 바뀌고, 서체가 바뀔 때 글자 폭이 달라져 실사용자에게 레이아웃이 밀리는데, Lighthouse는 그걸
  "빨리 그렸다"로 채점한다. 최종 스크린샷이 같아도 **로딩 중에 보이는 것**이 바뀌면 화면을 바꾼 것이다.
- Lighthouse 감지를 노린 분기(UA 스니핑 등)를 넣지 마라.
- CLAUDE.md의 CRITICAL 규칙은 그대로 적용된다. 특히 테스트 먼저(TDD), 한국어 UI, `dangerouslySetInnerHTML` 금지.

**단순성 기준** (autoresearch 그대로): 같은 조건이면 단순한 쪽이 낫다. 1점을 올리려고 꼼수 코드
20줄을 붙이는 것은 손해다. 마진을 겨우 넘기는 변경이 복잡하면 다른 실험을 고려하라.

**검토된 방향** (1012 루프 뒤 남은 병목. 순서는 기대 효과 순이 아니다)
- 렌더 차단 CSS: Pretendard dynamic subset은 `@font-face` 92개로 CSS의 대부분을 차지한다. 선언을 늦추지 말고
  **줄여라** — 예: 공개 화면에 실제로 쓰이는 굵기만 남기기, 선언을 그대로 두되 첫 화면 글자가 든 서브셋 woff2만
  `<link rel="preload">`해서 서체 교체 시점을 앞당기기.
- 서체 교체 시 레이아웃 밀림: fallback `@font-face`에 `size-adjust`·`ascent-override`를 줘 시스템 서체를 Pretendard
  치수에 맞추기(next/font가 JetBrains Mono에 자동으로 해 주는 것과 같은 방식).
- 안 쓰는 JS(약 60KB): 공개 화면 번들에 들어온 클라이언트 모듈 찾기 (`.next` 빌드 출력, Lighthouse `unused-javascript`).
- `/`의 TTFB: 로그인 여부를 확인하려고 매 요청 Supabase를 부른다. 동작(로그인 사용자 리다이렉트)은 그대로 둬야 한다.

**막혔을 때**: `.autoresearch/lighthouse/last.json`의 audit(`opportunities`·`diagnostics`)을 읽어라.
점수를 깎는 항목이 거기 적혀 있다. 아깝게 떨어진 실험 둘을 합쳐 보는 것도 방법이다.

## 결과 보기

```bash
python3 scripts/lighthouse_loop.py status     # 최근 10행
python3 scripts/lighthouse_loop.py report     # .autoresearch/lighthouse/report.html (되돌린 채택은 줄 그어 표시)
column -t -s $'\t' .autoresearch/lighthouse/results.tsv
git log --oneline --grep '^perf(lighthouse)'
```

루프는 `lighthouse/<태그>` 브랜치에서 돈다. 끝나면 사람이 브랜치를 보고 PR을 연다.
