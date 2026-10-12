#!/usr/bin/env python3
"""Lighthouse 성능 점수를 목표로 하는 autoresearch 루프의 고정 평가기.

karpathy/autoresearch의 prepare.py에 해당한다. 실험하는 에이전트는 이 파일을 고치지 않는다 —
평가기를 고칠 수 있으면 점수가 아니라 자를 바꾸게 된다. 루프 지침은 docs/LIGHTHOUSE_LOOP.md.

  python3 scripts/lighthouse_loop.py trial baseline     # 변경 없는 상태로 A/A 측정 (노이즈 확인)
  python3 scripts/lighthouse_loop.py trial "<설명>"      # 가드 → A/B 측정 → keep(커밋)/discard(되돌림)/crash
  python3 scripts/lighthouse_loop.py status             # 최근 행

판정은 전부 여기서 코드로 한다. 에이전트가 점수를 옮겨 적거나 커밋 여부를 고르지 않는다.

절대 점수가 아니라 **같은 시간대에 번갈아 잰 기준(HEAD)과 후보의 차이**로 판정한다. 개발 머신에서는
같은 코드의 평균이 측정 시각에 따라 83~89점을 오갔다(IDE·브라우저 부하). 중앙값으로는 이 흐름이
지워지지 않지만, 번갈아 재면 양쪽에 같이 걸려 상쇄된다. 기준은 리포 밖 worktree에서 빌드한다 —
리포 안에 두면 eslint·vitest·tsc가 그 사본까지 훑는다.
"""

import json
import os
import shutil
import signal
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


def start(cwd, port, log):
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
        git("commit", "-m", f"perf(lighthouse): {description}\n\n{reason}")
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


def main(argv):
    if len(argv) >= 3 and argv[1] == "trial":
        out = trial(" ".join(argv[2:]))
        print(json.dumps(out, ensure_ascii=False))
        return 1 if out["status"] == "error" else 0
    if len(argv) == 2 and argv[1] == "status":
        rows = read_rows(RESULTS)
        print(json.dumps({"trials": len(rows), "recent": rows[-10:]}, ensure_ascii=False, indent=2))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
