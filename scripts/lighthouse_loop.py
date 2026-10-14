#!/usr/bin/env python3
"""Lighthouse 성능 점수를 목표로 하는 autoresearch 루프의 고정 평가기.

karpathy/autoresearch의 prepare.py에 해당한다. 실험하는 에이전트는 이 파일을 고치지 않는다 —
평가기를 고칠 수 있으면 점수가 아니라 자를 바꾸게 된다. 루프 지침은 docs/LIGHTHOUSE_LOOP.md.

  python3 scripts/lighthouse_loop.py trial baseline     # 변경 없는 상태로 A/A 측정 (노이즈 확인)
  python3 scripts/lighthouse_loop.py trial "<설명>"      # 가드 → A/B 측정 → keep(커밋)/discard(되돌림)/crash
  python3 scripts/lighthouse_loop.py status             # 최근 행
  python3 scripts/lighthouse_loop.py report             # results.tsv → .autoresearch/lighthouse/report.html

판정은 전부 여기서 코드로 한다. 에이전트가 점수를 옮겨 적거나 커밋 여부를 고르지 않는다.

절대 점수가 아니라 **같은 시간대에 번갈아 잰 기준(HEAD)과 후보의 차이**로 판정한다. 개발 머신에서는
같은 코드의 평균이 측정 시각에 따라 83~89점을 오갔다(IDE·브라우저 부하). 중앙값으로는 이 흐름이
지워지지 않지만, 번갈아 재면 양쪽에 같이 걸려 상쇄된다. 기준은 리포 밖 worktree에서 빌드한다 —
리포 안에 두면 eslint·vitest·tsc가 그 사본까지 훑는다.
"""

import html
import json
import os
import shutil
import signal
import socket
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / ".autoresearch" / "lighthouse"  # .gitignore 대상 — git clean으로 지워지지 않는다
RESULTS = OUT_DIR / "results.tsv"
LOG = OUT_DIR / "run.log"
REPORT = OUT_DIR / "report.html"
REF_DIR = Path.home() / ".cache" / "finsight-lighthouse" / "ref"
REF_MARK = ".lighthouse-built"

# 로그인 없이 열리는 화면만 잰다. 대시보드는 세션이 필요해 같은 조건으로 반복 측정할 수 없다.
ROUTES = ["/", "/login", "/demo", "/privacy"]
RUNS = 3  # 경로마다 기준·후보를 번갈아 이만큼씩 재고 각각 중앙값을 쓴다
PORT_CAND, PORT_REF = 3220, 3221
LIGHTHOUSE = "lighthouse@13.5.0"  # 버전이 바뀌면 점수 산식도 바뀐다. 루프 도중 올리지 않는다
# 후보가 기준보다 이만큼 이상 높아야 개선이다. 같은 코드끼리 번갈아 잰 A/A에서도 차이가 -1.8까지
# 났다 — `/`는 동적 렌더링이라 Supabase 왕복 시간이 FCP에 그대로 실려 2.4~3.8초를 오간다.
# 마진만으로는 부족해 keep 후보는 한 번 더 재서 두 번 모두 통과해야 채택한다(confirm).
MARGIN = 2.0
GUARD_TOLERANCE = 1.0  # 접근성·권장사항·SEO가 기준보다 이보다 더 떨어지면 성능이 올라도 버린다
GUARDS = ["accessibility", "best_practices", "seo"]
COLUMNS = ["commit", "score", "ref_score", "delta", *GUARDS, "status", "routes", "description"]


def median(values):
    return statistics.median(values)


def read_rows(path):
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    return [dict(zip(COLUMNS, line.split("\t"))) for line in lines[1:] if line.strip()]


def append_row(path, row):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("\t".join(COLUMNS) + "\n", encoding="utf-8")
    cells = [str(row[c]).replace("\t", " ").replace("\n", " ") for c in COLUMNS]
    with path.open("a", encoding="utf-8") as f:
        f.write("\t".join(cells) + "\n")


def has_baseline(rows):
    return any(r["status"] == "keep" for r in rows)


def decide(ref, cand):
    """(status, 사유). 둘 다 같은 시간대에 번갈아 잰 aggregate()의 반환값."""
    for g in GUARDS:
        if cand[g] < ref[g] - GUARD_TOLERANCE:
            return "discard", f"{g} {ref[g]:.1f} → {cand[g]:.1f}"
    delta = cand["score"] - ref["score"]
    if delta >= MARGIN:
        return "keep", f"기준 {ref['score']:.1f} → 후보 {cand['score']:.1f} (+{delta:.1f})"
    return "discard", f"기준 {ref['score']:.1f} → 후보 {cand['score']:.1f} ({delta:+.1f} < +{MARGIN})"


def confirm(first, second):
    """첫 판정이 keep이면 확인 측정(second)도 keep이어야 keep이다. discard는 확인 없이 그대로."""
    if first[0] != "keep":
        return first
    if second[0] != "keep":
        return "discard", f"확인 측정에서 탈락: {second[1]} (첫 측정 {first[1]})"
    return "keep", f"{first[1]} / 확인 {second[1]}"


def run(cmd, log, cwd=ROOT):
    log.write(f"\n$ {' '.join(cmd)}  ({cwd})\n")
    log.flush()
    return subprocess.run(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT).returncode == 0


def git(*args, cwd=ROOT):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def lighthouse_once(url, log):
    out_json = OUT_DIR / "last.json"  # 에이전트가 다음 실험 거리를 찾으려고 읽는다
    if not run(["npx", "-y", LIGHTHOUSE, url, "--quiet", "--output=json", f"--output-path={out_json}",
                "--chrome-flags=--headless=new"], log):
        raise RuntimeError(f"lighthouse 실패: {url}")
    cats = json.loads(out_json.read_text(encoding="utf-8"))["categories"]
    keys = {"performance": "performance", "accessibility": "accessibility",
            "best-practices": "best_practices", "seo": "seo"}
    scores = {ours: cats[theirs]["score"] for theirs, ours in keys.items()}
    if any(v is None for v in scores.values()):
        raise RuntimeError(f"lighthouse 점수 없음: {url}")
    return {k: v * 100 for k, v in scores.items()}


def aggregate(per_route):
    mean = lambda k: round(statistics.mean(v[k] for v in per_route.values()), 1)  # noqa: E731
    return {"score": mean("performance"), **{g: mean(g) for g in GUARDS},
            "routes": {r: round(v["performance"]) for r, v in per_route.items()}}


def sync_ref(commit, log):
    """REF_DIR을 commit으로 맞추고 빌드한다. 같은 커밋을 이미 빌드했으면 건너뛴다."""
    if not (REF_DIR / ".git").exists():
        REF_DIR.parent.mkdir(parents=True, exist_ok=True)
        git("worktree", "prune")
        git("worktree", "add", "--detach", str(REF_DIR), commit)
        # APFS 클론 복사라 디스크를 거의 안 먹는다. 의존성 변경은 루프에서 금지라 한 번만 복사한다
        if not run(["cp", "-cR", str(ROOT / "node_modules"), str(REF_DIR / "node_modules")], log):
            raise RuntimeError("기준 worktree에 node_modules 복사 실패")
    mark = REF_DIR / REF_MARK
    if mark.exists() and mark.read_text().strip() == commit:
        return
    git("checkout", "--detach", commit, cwd=REF_DIR)
    for env in ROOT.glob(".env*"):
        shutil.copy2(env, REF_DIR / env.name)
    if not run(["npm", "run", "build"], log, cwd=REF_DIR):
        raise RuntimeError("기준 build 실패")
    mark.write_text(commit)


def port_in_use(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def start(cwd, port, log):
    # 남아 있던 옛 next-server를 재면 지워진 빌드의 CSS가 404로 떨어져 99점이 나온다(실제로 겪었다).
    # wait_ready는 그 서버에도 200을 받으므로 띄우기 전에 막는다.
    if port_in_use(port):
        raise RuntimeError(f"포트 {port}를 이미 다른 서버가 쓰고 있다. lsof -nP -iTCP:{port} -sTCP:LISTEN 으로 찾아 꺼라")
    return subprocess.Popen(["npm", "run", "start", "--", "--port", str(port)], cwd=cwd,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def wait_ready(port):
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://localhost:{port}/", timeout=2) as res:
                if res.status == 200:
                    return
        except OSError:
            pass
        time.sleep(1)
    raise RuntimeError(f"서버가 뜨지 않았습니다 (포트 {port})")


def build_pair(log):
    if not run(["npm", "run", "build"], log):
        raise RuntimeError("build 실패")
    sync_ref(git("rev-parse", "HEAD"), log)


def measure_pair(log):
    """(기준, 후보). build_pair() 뒤에 부른다. 경로마다 순서를 바꿔 가며 번갈아 잰다."""
    servers = [start(REF_DIR, PORT_REF, log), start(ROOT, PORT_CAND, log)]
    try:
        wait_ready(PORT_REF)
        wait_ready(PORT_CAND)
        ref, cand = {}, {}
        for route in ROUTES:
            runs = {PORT_REF: [], PORT_CAND: []}
            for i in range(RUNS):
                order = (PORT_REF, PORT_CAND) if i % 2 == 0 else (PORT_CAND, PORT_REF)
                for port in order:
                    runs[port].append(lighthouse_once(f"http://localhost:{port}{route}", log))
            ref[route] = {k: median([r[k] for r in runs[PORT_REF]]) for k in runs[PORT_REF][0]}
            cand[route] = {k: median([r[k] for r in runs[PORT_CAND]]) for k in runs[PORT_CAND][0]}
    finally:
        for s in servers:
            os.killpg(s.pid, signal.SIGTERM)
            s.wait()
    return aggregate(ref), aggregate(cand)


def discard_changes():
    # git reset --hard는 이 리포의 Bash 훅이 막는다. 추적 파일은 restore로, 새로 만든 파일은 clean으로
    # 되돌린다. .autoresearch/는 .gitignore 대상이라 clean -fd에 지워지지 않는다.
    git("restore", "--staged", "--worktree", "--", ".")
    git("clean", "-fd", "--", ".")


def trial(description):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    baseline = not has_baseline(read_rows(RESULTS))
    dirty = bool(git("status", "--porcelain"))
    if baseline and dirty:
        return {"status": "error", "reason": "기준선은 변경 없는 상태에서 잰다. 작업트리를 비워라"}
    if not baseline and not dirty:
        return {"status": "error", "reason": "변경이 없다. 실험할 코드를 먼저 고쳐라"}

    ref = cand = None
    with LOG.open("w", encoding="utf-8") as log:
        try:
            for cmd in (["npm", "run", "lint"], ["npm", "run", "test"]):
                if not run(cmd, log):
                    raise RuntimeError(f"{cmd[-1]} 실패")
            build_pair(log)
            ref, cand = measure_pair(log)
            if baseline:
                # 같은 코드끼리의 A/A 측정이다. 차이가 MARGIN에 가까우면 마진이 노이즈를 못 거른다
                status, reason = "keep", f"A/A 차이 {cand['score'] - ref['score']:+.1f} (마진 {MARGIN})"
            else:
                first = decide(ref, cand)
                status, reason = confirm(first, decide(*measure_pair(log)) if first[0] == "keep" else None)
        except RuntimeError as e:
            status, reason = "crash", str(e)

    if status == "keep" and not baseline:
        git("add", "-A")
        try:
            git("commit", "-m", f"perf(lighthouse): {description}\n\n{reason}")
        except subprocess.CalledProcessError as e:
            # pre-commit 훅(CRITICAL 규칙 검사)에 걸린 변경은 점수와 무관하게 채택하지 않는다
            status, reason = "crash", f"커밋 거부: {e.stdout.strip() or e.stderr.strip()}"[:300]
            discard_changes()
    elif not baseline:
        discard_changes()

    zero = {"score": 0.0, **{g: 0.0 for g in GUARDS}, "routes": {}}
    c, r = cand or zero, ref or zero
    append_row(RESULTS, {
        "commit": git("rev-parse", "--short=7", "HEAD"), "score": f"{c['score']:.1f}",
        "ref_score": f"{r['score']:.1f}", "delta": f"{c['score'] - r['score']:+.1f}",
        **{g: f"{c[g]:.1f}" for g in GUARDS}, "status": status,
        "routes": " ".join(f"{k}:{v}" for k, v in c["routes"].items()), "description": description,
    })
    return {"status": status, "reason": reason, "score": c["score"], "ref_score": r["score"],
            "delta": round(c["score"] - r["score"], 1), "routes": c["routes"], "log": str(LOG.relative_to(ROOT))}


STATUS_LABEL = {"keep": "채택", "discard": "기각", "crash": "실패"}


def delta_chart(rows):
    """실험별 HEAD 대비 차이 막대. 기준선 행은 A/A라 뺀다."""
    w, h, left, top, bottom = 720, 220, 40, 16, 28
    vals = [float(r["delta"]) for r in rows]
    lo, hi = min([-5.0, *vals]), max([10.0, MARGIN, *vals])
    lo, hi = 5 * (lo // 5), 5 * -(-hi // 5)
    y = lambda v: top + (hi - v) / (hi - lo) * (h - top - bottom)  # noqa: E731
    step = (w - left - 8) / max(len(rows), 1)
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="실험별 HEAD 대비 성능 점수 차이">']
    v = lo
    while v <= hi:
        out.append(f'<line x1="{left}" x2="{w - 8}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid"/>'
                   f'<text x="{left - 6}" y="{y(v) + 4:.1f}" class="tick" text-anchor="end">{v:+.0f}</text>')
        v += 5
    out.append(f'<line x1="{left}" x2="{w - 8}" y1="{y(MARGIN):.1f}" y2="{y(MARGIN):.1f}" class="margin"/>'
               f'<text x="{w - 10}" y="{y(MARGIN) - 5:.1f}" class="tick" text-anchor="end">채택 마진 +{MARGIN:g}</text>')
    for i, (r, d) in enumerate(zip(rows, vals)):
        x = left + i * step + step * 0.2
        y0, y1 = sorted((y(0), y(d)))
        out.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{step * 0.6:.1f}" height="{max(y1 - y0, 1):.1f}" '
                   f'class="bar {r["status"]}"><title>#{i + 1} {d:+.1f} {html.escape(r["description"])}</title></rect>'
                   f'<text x="{x + step * 0.3:.1f}" y="{h - 10}" class="tick" text-anchor="middle">#{i + 1}</text>')
    out.append("</svg>")
    return "".join(out)


def render_report(rows, reverted):
    """results.tsv 행 → Artifact로 게시할 수 있는 HTML 조각(<title>부터, 문서 뼈대 없음).

    reverted: 나중에 git revert된 keep 실험의 설명들. 채택됐어도 지금 브랜치에는 없다.
    """
    e = html.escape
    base = next((r for r in rows if r["description"] == "baseline"), rows[0] if rows else None)
    trials = [r for r in rows if r is not base]
    live = [r for r in trials if r["status"] == "keep" and r["description"] not in reverted]
    body = []
    for i, r in enumerate(trials, 1):
        gone = r["status"] == "keep" and r["description"] in reverted
        pill = "되돌림" if gone else STATUS_LABEL.get(r["status"], r["status"])
        body.append(
            f'<tr class="{"reverted" if gone else ""}"><td class="num">#{i}</td>'
            f'<td><span class="pill {"reverted" if gone else e(r["status"])}">{e(pill)}</span></td>'
            f'<td class="num">{e(r["ref_score"])} → {e(r["score"])}</td><td class="num delta">{e(r["delta"])}</td>'
            f'<td class="desc">{e(r["description"])}<div class="routes">{e(r["routes"])}</div></td>'
            f'<td class="num commit">{e(r["commit"])}</td></tr>')
    summary = (f'<div class="stat"><span>기준선</span><b>{e(base["score"])}</b><small>A/A 차이 {e(base["delta"])} · {e(base["commit"])}</small></div>'
               if base else "")
    summary += (f'<div class="stat"><span>채택</span><b>{len(live)}<i>/{len(trials)}</i></b>'
                f'<small>되돌린 채택 {sum(1 for r in trials if r["status"] == "keep") - len(live)}건 제외</small></div>')
    if live:
        summary += f'<div class="stat"><span>마지막 채택 후보</span><b>{e(live[-1]["score"])}</b><small>{e(live[-1]["routes"])}</small></div>'
    return f"""<meta charset="utf-8">
<title>FinSight Lighthouse 기록</title>
<style>
/* 레이아웃: 요약 숫자 한 줄 → 차이 막대 → 실험 표. 색은 FinSight globals.css 토큰을 그대로 쓴다 */
:root {{ --bg:#ffffff; --surface:#f7f7f5; --border:#e3e3df; --text:#1a1a19; --body:#3d3d3a; --muted:#6b6b66;
  --good:#2f6b46; --bad:#b3261e; --accent:#2563a8; --line:#8a8a84;
  --sans:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#0f0f0e; --surface:#191918; --border:#2c2c29;
  --text:#f5f5f3; --body:#d4d4d0; --muted:#8a8a84; --good:#6fbd8e; --bad:#f2837b; --accent:#7fb0e0; --line:#6e6e69; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#0f0f0e; --surface:#191918; --border:#2c2c29; --text:#f5f5f3; --body:#d4d4d0; --muted:#8a8a84;
  --good:#6fbd8e; --bad:#f2837b; --accent:#7fb0e0; --line:#6e6e69; color-scheme:dark; }}
body {{ background:var(--bg); color:var(--body); font:15px/1.6 var(--sans); word-break:keep-all; overflow-wrap:break-word; }}
main {{ max-width:960px; margin:0 auto; padding-inline:16px; padding-block:32px 48px; display:grid; gap:28px; }}
h1 {{ margin:0; color:var(--text); font-size:1.5rem; font-weight:600; text-wrap:balance; }}
header p {{ margin:4px 0 0; color:var(--muted); font-size:.875rem; }}
.stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }}
.stat {{ background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:16px; display:grid; gap:2px; min-width:0; }}
.stat span {{ color:var(--muted); font-size:.75rem; }}
.stat b {{ color:var(--text); font:600 1.75rem/1.2 var(--mono); font-variant-numeric:tabular-nums; }}
.stat i {{ color:var(--muted); font-style:normal; font-size:1rem; }}
.stat small {{ color:var(--muted); font-size:.75rem; font-family:var(--mono); }}
figure {{ margin:0; display:grid; gap:8px; }}
figcaption {{ color:var(--muted); font-size:.8125rem; }}
svg {{ width:100%; height:auto; max-width:100%; }}
.grid {{ stroke:var(--border); }} .margin {{ stroke:var(--accent); stroke-dasharray:4 4; }}
.tick {{ fill:var(--muted); font:11px var(--mono); }}
.bar.keep {{ fill:var(--good); }} .bar.discard {{ fill:var(--line); }} .bar.crash {{ fill:var(--bad); }}
.scroll {{ overflow-x:auto; }}
table {{ width:100%; border-collapse:collapse; font-size:.875rem; min-width:640px; }}
th {{ text-align:left; color:var(--muted); font-weight:500; font-size:.75rem; padding:8px; border-bottom:1px solid var(--border); }}
td {{ padding:10px 8px; border-bottom:1px solid var(--border); vertical-align:top; }}
.num {{ font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--text); }}
.commit {{ color:var(--muted); }}
.desc {{ color:var(--text); min-width:0; }} .routes {{ color:var(--muted); font:12px var(--mono); margin-top:2px; }}
tr.reverted .desc, tr.reverted .delta {{ text-decoration:line-through; color:var(--muted); }}
.pill {{ display:inline-block; padding:1px 8px; border-radius:999px; font-size:.75rem; border:1px solid currentColor; white-space:nowrap; }}
.pill.keep {{ color:var(--good); }} .pill.discard {{ color:var(--muted); }} .pill.crash {{ color:var(--bad); }} .pill.reverted {{ color:var(--bad); }}
</style>
<main>
  <header><h1>FinSight Lighthouse 기록</h1>
    <p>공개 4개 화면(/, /login, /demo, /privacy)의 모바일 성능 점수 평균. 판정은 같은 시간대에 번갈아 잰 HEAD 대비 차이로 한다 — 절대 점수는 머신 부하에 따라 몇 점씩 흐른다.</p></header>
  <section class="stats">{summary}</section>
  <figure>{delta_chart(trials)}
    <figcaption>실험별 HEAD 대비 차이. 초록은 채택, 회색은 기각, 빨강은 실패. 점선을 넘고 확인 측정도 통과해야 채택된다.</figcaption></figure>
  <div class="scroll"><table>
    <thead><tr><th>실험</th><th>판정</th><th>HEAD → 후보</th><th>차이</th><th>무엇을 바꿨나 · 화면별 후보 점수</th><th>커밋</th></tr></thead>
    <tbody>{"".join(body)}</tbody></table></div>
</main>
"""


def reverted_descriptions():
    subjects = git("log", "--format=%s").splitlines()
    prefix = 'Revert "perf(lighthouse): '
    return {s[len(prefix):-1] for s in subjects if s.startswith(prefix)}


def main(argv):
    if len(argv) >= 3 and argv[1] == "trial":
        out = trial(" ".join(argv[2:]))
        print(json.dumps(out, ensure_ascii=False))
        return 1 if out["status"] == "error" else 0
    if len(argv) == 2 and argv[1] == "status":
        rows = read_rows(RESULTS)
        print(json.dumps({"trials": len(rows), "recent": rows[-10:]}, ensure_ascii=False, indent=2))
        return 0
    if len(argv) == 2 and argv[1] == "report":
        REPORT.write_text(render_report(read_rows(RESULTS), reverted_descriptions()), encoding="utf-8")
        print(REPORT)
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
