"""Pretendard Variable dynamic subset을 이 앱이 쓰는 굵기(400~700)로 좁혀 다시 만든다.

화면은 font-normal·font-medium·font-semibold(400·500·600)만 쓴다. 패키지 파일은 굵기 축 45~920을
통째로 담아 서브셋 하나가 약 25KB인데, 축을 400~700으로 자르면 약 30% 작아진다. 글자 모양은 그
범위 안에서 원본과 같다. 700까지 남긴 이유: <strong>·<b>의 bolder가 700이다.

이름을 FinSight Sans로 바꾸는 이유: Pretendard는 OFL의 예약 글꼴 이름(Reserved Font Name)이라
고친 파일(축을 자른 것도 고친 것이다)은 그 이름을 쓸 수 없다. 저작권·라이선스 표기는 그대로 남긴다.

마지막에 화면 문구 서체(FinSightSans.ui.woff2) 하나를 더 만든다. src/의 코드(주석 제외)에 적힌 글자와
ASCII만 담은 서브셋이다. 공개 화면 하나가 92개 청크 중 12개(약 230KB)를 받던 것을 이 파일(약 90KB)
하나로 줄인다. 겹치는 unicode-range는 나중에 선언한 face가 먼저 쓰이므로 CSS 맨 끝에 둔다. 여기 없는
글자(사용자 CSV의 가맹점명, 이후 추가한 문구)는 기존 청크가 그대로 맡는다 — 다시 안 돌려도 깨지지 않는다.

pretendard 패키지 버전을 바꾸거나 화면 문구를 많이 고쳤으면 다시 돌린다 (fonttools는 uv로 임시 설치):
    uv run --with fonttools --with brotli python scripts/gen_pretendard.py
"""
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/pretendard/dist/web/variable"
OUT = ROOT / "src/app/fonts"
WEIGHT = (400, 700)
FAMILY = "FinSight Sans"
# 패밀리·PostScript·인스턴스 이름만 바꾼다. 0·7·13(저작권·상표·라이선스)은 그대로 둔다
NAME_IDS = {1, 3, 4, 6, 16, 25} | set(range(256, 300))

css = (SRC / "pretendardvariable-dynamic-subset.css").read_text(encoding="utf-8")
(OUT / "pretendard").mkdir(parents=True, exist_ok=True)


def save(font, name):
    font = instancer.instantiateVariableFont(font, {"wght": WEIGHT})
    for record in font["name"].names:
        if record.nameID in NAME_IDS:
            text = record.toUnicode().replace("Pretendard Variable", FAMILY)
            record.string = text.replace("PretendardVariable", FAMILY.replace(" ", ""))
    font.flavor = "woff2"
    font.save(OUT / "pretendard" / name)


for name in re.findall(r"woff2-dynamic-subset/(PretendardVariable\.subset\.\d+\.woff2)", css):
    save(TTFont(SRC / "woff2-dynamic-subset" / name), name)

# 화면 문구 서체: 코드에 적힌 글자 + ASCII. 주석은 화면에 안 나오므로 뺀다.
codepoints = set(range(0x20, 0x7F))
for path in (ROOT / "src").rglob("*.ts*"):
    if ".test." not in path.name:
        code = re.sub(r"/\*.*?\*/", "", path.read_text(encoding="utf-8"), flags=re.S)
        codepoints |= {ord(c) for c in re.sub(r"(^|\s)//[^\n]*", "", code) if ord(c) >= 0x80}
full = TTFont(SRC / "woff2/PretendardVariable.woff2")
codepoints = sorted(codepoints & set(full.getBestCmap()))
options = subset.Options(layout_features=["*"], name_IDs=["*"], name_languages=["*"], name_legacy=True,
                         notdef_outline=True, glyph_names=True)
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(full)
save(full, "FinSightSans.ui.woff2")

ranges = []
for cp in codepoints:
    if ranges and ranges[-1][1] == cp - 1:
        ranges[-1][1] = cp
    else:
        ranges.append([cp, cp])
unicode_range = ", ".join(f"U+{a:x}" if a == b else f"U+{a:x}-{b:x}" for a, b in ranges)

css = css.replace("./woff2-dynamic-subset/", "./pretendard/")
css = css.replace("font-family: 'Pretendard Variable';", f"font-family: '{FAMILY}';")
css = css.replace("font-weight: 45 920;", f"font-weight: {WEIGHT[0]} {WEIGHT[1]};")
css += f"""
/* [ui] 화면 문구 — 맨 끝에 둔다 */
@font-face {{
\tfont-family: '{FAMILY}';
\tfont-style: normal;
\tfont-display: swap;
\tfont-weight: {WEIGHT[0]} {WEIGHT[1]};
\tsrc: url(./pretendard/FinSightSans.ui.woff2) format('woff2-variations');
\tunicode-range: {unicode_range};
}}
"""
header = "/* scripts/gen_pretendard.py가 생성한다. 손으로 고치지 마라. */\n"
(OUT / "pretendard.css").write_text(header + css, encoding="utf-8")
