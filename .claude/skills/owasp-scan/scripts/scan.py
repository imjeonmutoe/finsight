#!/usr/bin/env python3
"""FinSight OWASP Top 10:2025 자동 검사.

텍스트만 보고 후보를 확정할 수 있는 것만 본다. 판단이 필요한 것은 SKILL.md의 수동 검토가
맡는다. 여기서 낸 지적도 **후보**다 — 전부 review-verify의 반박 검증을 거친다.

사용법:
    python3 scan.py <repo> --json <out.json> [--no-npm-audit]

stdlib만 쓴다(Python 3.10+).

출력에 비밀값이 섞이면 리포트가 곧 유출 경로가 된다. 근거 줄(evidence)은 SECRET_RE로
가리고, .env 파일은 내용을 읽지 않는다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

CATEGORIES = {
    "A01": "접근 통제 실패",
    "A02": "보안 설정 오류",
    "A03": "소프트웨어 공급망 실패",
    "A04": "암호화 실패",
    "A05": "인젝션",
    "A06": "안전하지 않은 설계",
    "A07": "인증 실패",
    "A08": "소프트웨어·데이터 무결성 실패",
    "A09": "보안 로깅·알림 실패",
    "A10": "예외 상황 처리 미흡",
}

CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
# 하네스·스킬·문서는 규칙 문자열을 인용할 수밖에 없다. 앱 코드 규칙은 여기에 걸지 않는다.
# (비밀값 검사만은 예외 — 문서에 붙여 넣은 키도 똑같이 샌다.)
CODE_EXCLUDE = re.compile(r"(\.test\.|\.spec\.|__tests__/|^scripts/|^docs/|^\.claude/|^\.codex/|^phases/)")
COMMENT_RE = re.compile(r"^\s*(//|\*|/\*|--)")

SECRET_RE = re.compile(
    r"(sk-ant-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]{16,}"
    r"|(polar_(?:oat|pat|whs|at)_[A-Za-z0-9]{2})[A-Za-z0-9]{12,}"
    r"|(sb_secret_[A-Za-z0-9]{2})[A-Za-z0-9_-]{12,}"
    r"|(eyJhbGciOi)[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?"
)


def redact(text: str) -> str:
    return SECRET_RE.sub(lambda m: (next(g for g in m.groups() if g)) + "…(가림)", text)


def evidence(line: str) -> str:
    s = redact(line.strip())
    return s if len(s) <= 200 else s[:200] + "…"


# ── 줄 단위 규칙 ────────────────────────────────────────────────────────────
# path: 경로 정규식(없으면 모든 코드 파일) · pat: 내용 정규식 · pat2: 같은 줄에 함께 있어야 할 것
LINE_RULES = [
    dict(check="next-public-secret", category="A02", severity="critical", critical_rule=True,
         pat=r"NEXT_PUBLIC_[A-Z0-9_]*(API_KEY|SERVICE_ROLE|ACCESS_TOKEN|WEBHOOK_SECRET|SECRET)",
         title="서버 전용 키에 NEXT_PUBLIC_ 접두사",
         scenario="빌드 시 값이 클라이언트 번들에 인라인된다. 누구나 개발자 도구로 키를 꺼내 대신 과금·데이터 접근을 한다.",
         fix="접두사를 떼고 서버 코드(src/services/)에서만 process.env로 읽는다."),
    dict(check="dangerous-html", category="A05", severity="major", critical_rule=True,
         pat=r"dangerouslySetInnerHTML",
         title="dangerouslySetInnerHTML 사용",
         scenario="CSV 가맹점명에 <img onerror=…>를 넣으면 LLM 출력을 거쳐 그대로 DOM에 들어가 세션 탈취 스크립트가 실행된다.",
         fix="문자열을 JSX 자식으로 렌더해 React 기본 이스케이프에 맡긴다."),
    dict(check="eval", category="A05", severity="major", critical_rule=False,
         pat=r"\beval\s*\(|new\s+Function\s*\(",
         title="eval / new Function 사용",
         scenario="외부 문자열이 흘러들면 서버에서 임의 코드가 실행된다.",
         fix="JSON.parse·zod 스키마 파싱으로 바꾼다."),
    dict(check="postgrest-filter-interp", category="A05", severity="major", critical_rule=False,
         pat=r"\.(or|filter|textSearch)\(\s*`[^`]*\$\{",
         title="PostgREST 필터 문자열에 값을 직접 보간",
         scenario="입력에 `,user_id.neq.x` 같은 조각을 넣으면 필터 식이 바뀌어 의도하지 않은 행이 조회된다.",
         fix=".eq()/.in() 같은 인자형 필터를 쓰거나 값을 화이트리스트로 검증한다."),
    dict(check="polar-production", category="A02", severity="major", critical_rule=False,
         pat=r"https://api\.polar\.sh",
         title="Polar 프로덕션 엔드포인트",
         scenario="샌드박스 대신 실제 결제가 일어나고, 프로덕션 토큰이 개발 환경에 놓인다.",
         fix="sandbox-api.polar.sh를 쓴다."),
    dict(check="weak-hash", category="A04", severity="minor", critical_rule=False,
         pat=r"createHash\(\s*['\"](md5|sha1)['\"]",
         title="MD5/SHA-1 해시",
         scenario="충돌 공격으로 같은 해시를 가진 다른 입력을 만들어 무결성·중복 판정을 속인다.",
         fix="sha256 이상을 쓴다."),
    dict(check="weak-random", category="A04", severity="minor", critical_rule=False,
         pat=r"(token|secret|nonce|key|state)\w*\s*[:=][^;]*Math\.random",
         title="보안 값에 Math.random",
         scenario="예측 가능한 PRNG로 만든 토큰을 추측해 다른 사용자 자원에 접근한다.",
         fix="crypto.randomUUID() 또는 crypto.getRandomValues()를 쓴다."),
    dict(check="cleartext-http", category="A04", severity="minor", critical_rule=False,
         path=r"^src/",
         pat=r"[\"'`]http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)",
         title="평문 HTTP URL",
         scenario="중간자가 전송 중 데이터를 읽거나 바꾼다.",
         fix="https://로 바꾼다."),
    dict(check="get-session", category="A07", severity="major", critical_rule=False,
         path=r"^src/",
         pat=r"auth\.getSession\(\)",
         title="서버에서 getSession()으로 인증 판단",
         scenario="getSession()은 쿠키의 JWT를 서명 검증 없이 읽는다. 위조 쿠키로 다른 user_id를 사칭한다.",
         fix="서버에서는 auth.getUser()(또는 getClaims())로 검증된 사용자를 쓴다."),
    dict(check="log-financial", category="A09", severity="major", critical_rule=True,
         pat=r"console\.(log|info|warn|error|debug)\(",
         pat2=r"(?i)(amount|merchant|description|memo|balance|transaction|csv|\brow\b(?!\s*(number|index|no))|\brows\b|header)",
         title="금융 데이터를 로그에 남김",
         scenario="Vercel 함수 로그에 가맹점명·금액이 남아 로그 열람 권한만 있는 사람에게 거래내역이 샌다.",
         fix="행 내용 대신 행 번호만 남긴다: console.error('parse failed', { rowNumber })"),
    dict(check="error-leak", category="A10", severity="minor", critical_rule=False,
         pat=r"(NextResponse\.json|Response\.json|new Response)\(.*\b(err|error|e)\.(message|stack)",
         title="내부 에러 메시지를 응답에 노출",
         scenario="DB·SDK 에러 문자열(테이블명·제약조건·키 일부)이 클라이언트에 그대로 간다.",
         fix="고정된 한국어 메시지를 돌려주고 원인은 서버 로그에 행 번호 수준으로만 남긴다."),
    dict(check="empty-catch", category="A10", severity="minor", critical_rule=False,
         pat=r"catch\s*(\([^)]*\))?\s*\{\s*\}",
         title="빈 catch 블록",
         scenario="실패가 조용히 삼켜져 부분 성공 상태(fail-open)로 진행된다.",
         fix="실패를 호출자에게 알리거나 명시적으로 닫힌 쪽(거부)으로 처리한다."),
]

for _r in LINE_RULES:
    _r["_pat"] = re.compile(_r["pat"])
    _r["_pat2"] = re.compile(_r["pat2"]) if _r.get("pat2") else None
    _r["_path"] = re.compile(_r["path"]) if _r.get("path") else None


def finding(check, category, severity, title, file, line, scenario, fix,
            critical_rule=False, ev=""):
    return dict(check=check, category=category, severity=severity, critical_rule=critical_rule,
                title=title, file=file, line=line, evidence=ev,
                failure_scenario=scenario, fix=fix, source="auto")


def rule_finding(rule, file, line, text):
    return finding(rule["check"], rule["category"], rule["severity"], rule["title"], file, line,
                   rule["scenario"], rule["fix"], rule["critical_rule"], evidence(text))


# ── 파일 목록 ───────────────────────────────────────────────────────────────

def list_files(root: Path) -> list[str]:
    """추적 중 + 아직 add 안 했지만 gitignore되지 않은 파일. 커밋될 수 있는 것 전부."""
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=root, capture_output=True, text=True, check=True,
    ).stdout
    return sorted({p for p in out.splitlines() if p and (root / p).is_file()})


def tracked_files(root: Path) -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p]


def read(root: Path, rel: str) -> str | None:
    p = root / rel
    try:
        if p.stat().st_size > 1_000_000:
            return None
        return p.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def is_code(rel: str) -> bool:
    return Path(rel).suffix in CODE_EXT and not CODE_EXCLUDE.search(rel) and not rel.startswith("node_modules/")


# ── 검사 ────────────────────────────────────────────────────────────────────

def check_lines(root, files):
    out = []
    for rel in files:
        if not is_code(rel):
            continue
        text = read(root, rel)
        if text is None:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if COMMENT_RE.match(line):
                continue
            for r in LINE_RULES:
                if r["_path"] and not r["_path"].search(rel):
                    continue
                if r["_pat"].search(line) and (not r["_pat2"] or r["_pat2"].search(line)):
                    out.append(rule_finding(r, rel, i, line))
    return out


def check_secrets(root, files):
    out = []
    for rel in files:
        if Path(rel).name.startswith(".env"):
            continue  # env-tracked가 따로 본다. 내용은 읽지 않는다.
        text = read(root, rel)
        if text is None:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if SECRET_RE.search(line):
                out.append(finding(
                    "hardcoded-secret", "A07", "critical", "하드코딩된 자격증명", rel, i,
                    "공개 리포의 커밋 이력에 키가 남아, 지워도 누구나 과거 커밋에서 꺼내 쓴다.",
                    "키를 즉시 폐기·재발급하고 환경변수로 옮긴다. 이력에서도 제거한다.",
                    True, evidence(line)))
    return out


ENV_RE = re.compile(r"(^|/)\.env(\.[^/]*)?$")
ENV_OK = re.compile(r"\.(example|sample|template)$")


def check_env_tracked(root):
    return [
        finding("env-tracked", "A02", "critical", ".env 파일이 git에 추적됨", rel, 1,
                "공개 리포에 환경변수 파일이 올라가 비밀키가 누구에게나 노출된다.",
                "git rm --cached로 추적을 끊고, 들어 있던 키를 모두 재발급한다.", True,
                "(내용은 읽지 않았다)")
        for rel in tracked_files(root) if ENV_RE.search(rel) and not ENV_OK.search(rel)
    ]


SQL_COMMENT = re.compile(r"--[^\n]*")


def sql_statements(text: str):
    """(시작 줄, 문장) — 주석을 지우고 ;로 자른다. 줄 번호는 보존한다."""
    clean = SQL_COMMENT.sub(lambda m: " " * len(m.group()), text)
    pos, line = 0, 1
    for part in clean.split(";"):
        lead = len(part) - len(part.lstrip())
        start = line + part[:lead].count("\n")
        if part.strip():
            yield start, part.strip()
        line += part.count("\n")
        pos += len(part) + 1


CREATE_RE = re.compile(r"(?is)^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?(\w+)")
RLS_RE = re.compile(r"(?is)^alter\s+table\s+(?:only\s+)?(?:public\.)?\"?(\w+)\"?\s+enable\s+row\s+level\s+security")
PROFILES_GRANT_RE = re.compile(
    r"(?is)^grant\s+.*\b(all|insert|update|delete)\b.*\bon\s+(?:table\s+)?(?:public\.)?profiles\b.*\bto\b.*\b(anon|authenticated|public)\b")
BUCKET_RE = re.compile(r"(?is)^insert\s+into\s+storage\.buckets\b.*\bvalues\b.*\btrue\b")


def check_migrations(root, files):
    out, created, rls = [], {}, set()
    for rel in files:
        if not (rel.startswith("supabase/") and rel.endswith(".sql")):
            continue
        text = read(root, rel) or ""
        for line, stmt in sql_statements(text):
            if m := CREATE_RE.match(stmt):
                created.setdefault(m.group(1).lower(), (rel, line))
            if m := RLS_RE.match(stmt):
                rls.add(m.group(1).lower())
            if PROFILES_GRANT_RE.match(stmt):
                out.append(finding(
                    "profiles-write-grant", "A01", "major", "profiles에 클라이언트 쓰기 권한", rel, line,
                    "로그인한 사용자가 브라우저에서 자기 profiles.plan을 'pro'로 UPDATE해 결제 없이 Pro가 된다.",
                    "authenticated에는 select만 남기고 쓰기는 service role 경로로만 한다.", True,
                    evidence(stmt.splitlines()[0])))
            if BUCKET_RE.match(stmt):
                out.append(finding(
                    "public-bucket", "A01", "major", "공개 Storage 버킷", rel, line,
                    "업로드된 카드 명세서 CSV가 URL만 알면 로그인 없이 내려받힌다.",
                    "public을 false로 두고 storage.objects에 소유자 정책을 건다.", True,
                    evidence(stmt.splitlines()[0])))
    for table, (rel, line) in created.items():
        if table not in rls:
            out.append(finding(
                "rls-missing", "A01", "major", f"RLS 없는 테이블: {table}", rel, line,
                "anon 키(클라이언트 번들에 있다)로 PostgREST를 직접 호출해 다른 사용자의 행을 읽는다.",
                f"alter table public.{table} enable row level security; 와 소유자 정책을 추가한다.", True))
    return out


FROM_RE = re.compile(r"\.from\(")
VERIFY_RE = re.compile(r"validateEvent|verifyWebhook|webhook-signature|WEBHOOK_SECRET|createHmac|timingSafeEqual")
IMPORT_SERVICE_RE = re.compile(r"from\s+['\"]@/services/([\w-]+)['\"]")
USE_CLIENT_RE = re.compile(r"^\s*['\"]use client['\"]")
SERVER_ONLY_RE = re.compile(r"SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|POLAR_ACCESS_TOKEN|POLAR_WEBHOOK_SECRET|from\s+['\"]@/services/")


def check_routes(root, files):
    out = []
    for rel in files:
        if not (rel.startswith("src/app/api/") and rel.endswith("/route.ts")):
            continue
        text = read(root, rel) or ""
        lines = text.splitlines()
        if FROM_RE.search(text) and "user_id" not in text:
            line = next(i for i, l in enumerate(lines, 1) if FROM_RE.search(l))
            out.append(finding(
                "route-user-id", "A01", "major", "라우트 쿼리에 user_id 조건 없음", rel, line,
                "RLS 정책이 나중에 잘못 고쳐지면(예: using (true)) 이 라우트가 다른 사용자의 행까지 돌려준다.",
                ".eq('user_id', user.id)를 쿼리마다 명시한다.", True, evidence(lines[line - 1])))
        if "/webhook/" in rel:
            texts = [text] + [read(root, f"src/services/{m}.ts") or "" for m in IMPORT_SERVICE_RE.findall(text)]
            if not any(VERIFY_RE.search(t) for t in texts):
                out.append(finding(
                    "webhook-unverified", "A08", "critical", "웹훅 서명 검증 없음", rel, 1,
                    "누구나 이 엔드포인트에 subscription.active 이벤트를 POST해 결제 없이 Pro로 승격한다.",
                    "POLAR_WEBHOOK_SECRET으로 서명을 검증(validateEvent)한 뒤에만 본문을 믿는다."))
    return out


def check_client_boundary(root, files):
    out = []
    for rel in files:
        if not (rel.startswith("src/") and rel.endswith((".tsx", ".ts")) and is_code(rel)):
            continue
        text = read(root, rel) or ""
        lines = text.splitlines()
        if not lines or not USE_CLIENT_RE.match(lines[0]):
            continue
        for i, l in enumerate(lines, 1):
            if SERVER_ONLY_RE.search(l) and not COMMENT_RE.match(l):
                out.append(finding(
                    "client-server-boundary", "A02", "critical", "클라이언트 컴포넌트가 서버 전용 모듈·키를 참조", rel, i,
                    "'use client' 파일이 끌어온 모듈과 env가 브라우저 번들로 가서 서버 키가 노출되거나 외부 API를 클라이언트에서 직접 부른다.",
                    "src/app/api/ 라우트나 Server Action을 거쳐 호출한다.", True, evidence(l)))
    return out


def check_config(root, files):
    out = []
    cfg = next((f for f in files if re.fullmatch(r"next\.config\.(ts|js|mjs)", f)), None)
    cfg_text = read(root, cfg) if cfg else ""
    mw_text = "".join(read(root, f) or "" for f in files if re.fullmatch(r"src/(middleware|proxy)\.ts", f))
    if "Content-Security-Policy" not in (cfg_text or "") + mw_text:
        out.append(finding(
            "security-headers", "A02", "minor", "보안 헤더(CSP 등) 미설정", cfg or "next.config.ts", 1,
            "XSS가 하나라도 생기면 막아 줄 두 번째 방어선(CSP·frame-ancestors)이 없어 임의 스크립트·클릭재킹이 그대로 통한다.",
            "next.config의 headers()에 Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame-ancestors를 추가한다."))
    if cfg_text and re.search(r"productionBrowserSourceMaps\s*:\s*true", cfg_text):
        out.append(finding(
            "source-maps", "A02", "minor", "프로덕션 브라우저 소스맵 공개", cfg, 1,
            "배포본에서 원본 소스와 주석이 그대로 내려받힌다.", "productionBrowserSourceMaps를 끈다."))
    if (root / "src/app").is_dir():
        for f in ("middleware.ts", "proxy.ts"):
            if f in files:
                out.append(finding(
                    "middleware-location", "A02", "major", f"루트의 {f}는 Next가 무시한다", f, 1,
                    "src/app을 쓰는 리포는 src/에서만 미들웨어를 찾는다. 세션 갱신·보호 경로 리디렉트가 통째로 사라져도 빌드는 통과한다.",
                    f"src/{f}로 옮긴다."))
    return out


SHA_RE = re.compile(r"@[0-9a-f]{40}\b")
USES_RE = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)")


def check_supply_chain(root, files):
    out = []
    pkg_text = read(root, "package.json") if "package.json" in files else None
    if pkg_text:
        pkg = json.loads(pkg_text)
        lines = pkg_text.splitlines()
        for sect in ("dependencies", "devDependencies"):
            for name, ver in (pkg.get(sect) or {}).items():
                if re.match(r"^[\^~><*]|^latest$|^x$", str(ver)):
                    line = next((i for i, l in enumerate(lines, 1) if f'"{name}"' in l), 1)
                    out.append(finding(
                        "unpinned-dependency", "A03", "minor", f"버전 범위 의존성: {name}@{ver}", "package.json", line,
                        "lockfile 없이 설치하거나 갱신할 때 악성 패치 버전(예: Shai-Hulud 웜)이 자동으로 들어온다.",
                        "정확한 버전으로 고정한다(ADR-010).", ev=evidence(lines[line - 1])))
        if not any(f in files for f in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock")):
            out.append(finding(
                "lockfile-missing", "A03", "major", "lockfile 없음", "package.json", 1,
                "전이 의존성이 설치할 때마다 달라져, 오염된 하위 패키지가 검토 없이 배포된다.",
                "package-lock.json을 커밋하고 CI에서 npm ci를 쓴다."))
    for rel in files:
        if not (rel.startswith(".github/workflows/") and rel.endswith((".yml", ".yaml"))):
            continue
        for i, l in enumerate((read(root, rel) or "").splitlines(), 1):
            if (m := USES_RE.match(l)) and not m.group(1).startswith("./") and not SHA_RE.search(m.group(1)):
                out.append(finding(
                    "action-unpinned", "A03", "minor", f"액션을 태그로 참조: {m.group(1)}", rel, i,
                    "태그는 옮길 수 있다. 액션 저장소가 탈취되면 같은 태그로 악성 코드가 시크릿을 가진 잡에서 돈다.",
                    "커밋 SHA로 고정하고 태그는 주석으로 남긴다.", ev=evidence(l)))
    return out


AUDIT_SEV = {"critical": "critical", "high": "major", "moderate": "minor", "low": "nit", "info": "nit"}


def audit_findings(audit: dict) -> list[dict]:
    out = []
    for name, v in sorted((audit.get("vulnerabilities") or {}).items()):
        titles = list(dict.fromkeys(x.get("title", "") for x in v.get("via", []) if isinstance(x, dict)))
        via = ", ".join(t for t in titles if t) or "전이 의존성: " + ", ".join(x for x in v.get("via", []) if isinstance(x, str))
        out.append(finding(
            "npm-audit", "A03", AUDIT_SEV.get(v.get("severity"), "minor"), f"알려진 취약 의존성: {name}",
            name, 0, f"{via} — 공개된 CVE라 공격 코드가 이미 돌아다닌다.",
            "npm audit fix" if v.get("fixAvailable") else "수정 버전이 없다. 대체 패키지를 검토한다.",
            ev=f"npm audit severity={v.get('severity')}"))
    return out


def run_npm_audit(root) -> tuple[list[dict], str]:
    try:
        p = subprocess.run(["npm", "audit", "--json"], cwd=root, capture_output=True, text=True, timeout=120)
        return audit_findings(json.loads(p.stdout)), "실행됨"
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        return [], f"실패: {type(e).__name__}"


# ── 진입점 ──────────────────────────────────────────────────────────────────

def git(root, *args) -> str:
    p = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    return p.stdout.strip()


def scan(root: Path, npm_audit: bool = True) -> dict:
    root = Path(root).resolve()
    files = list_files(root)
    findings = (
        check_lines(root, files) + check_secrets(root, files) + check_env_tracked(root)
        + check_migrations(root, files) + check_routes(root, files) + check_client_boundary(root, files)
        + check_config(root, files) + check_supply_chain(root, files)
    )
    audit_status = "건너뜀"
    if npm_audit:
        extra, audit_status = run_npm_audit(root)
        findings += extra
    seen: dict[str, int] = {}
    for f in findings:
        base = f"{f['check']}:{f['file']}:{f['line']}"
        seen[base] = seen.get(base, 0) + 1
        f["id"] = base if seen[base] == 1 else f"{base}#{seen[base]}"
    return {
        "meta": {
            "repo": root.name,
            "branch": git(root, "rev-parse", "--abbrev-ref", "HEAD"),
            "commit": git(root, "rev-parse", "--short", "HEAD"),
            "scanned_at": dt.date.today().isoformat(),
            "files_scanned": len(files),
            "npm_audit": audit_status,
        },
        "categories": CATEGORIES,
        "findings": findings,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("repo")
    ap.add_argument("--json", required=True)
    ap.add_argument("--no-npm-audit", action="store_true")
    a = ap.parse_args()
    result = scan(Path(a.repo), npm_audit=not a.no_npm_audit)
    out = Path(a.json)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    counts: dict[str, int] = {}
    for f in result["findings"]:
        counts[f["category"]] = counts.get(f["category"], 0) + 1
    print(f"자동 검사 후보 {len(result['findings'])}건 · npm audit {result['meta']['npm_audit']} → {out}")
    for cat, name in CATEGORIES.items():
        print(f"  {cat} {name}: {counts.get(cat, 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
