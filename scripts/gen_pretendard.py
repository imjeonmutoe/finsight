"""Pretendard Variable dynamic subset을 이 앱이 쓰는 굵기(400~700)로 좁혀 다시 만든다.

화면은 font-normal·font-medium·font-semibold(400·500·600)만 쓴다. 패키지 파일은 굵기 축 45~920을
통째로 담아 서브셋 하나가 약 25KB인데, 축을 400~700으로 자르면 약 30% 작아진다. 글자 모양은 그
범위 안에서 원본과 같다. 700까지 남긴 이유: <strong>·<b>의 bolder가 700이다.

이름을 FinSight Sans로 바꾸는 이유: Pretendard는 OFL의 예약 글꼴 이름(Reserved Font Name)이라
고친 파일(축을 자른 것도 고친 것이다)은 그 이름을 쓸 수 없다. 저작권·라이선스 표기는 그대로 남긴다.

pretendard 패키지 버전을 바꾸면 다시 돌린다 (fonttools는 uv로 임시 설치):
    uv run --with fonttools --with brotli python scripts/gen_pretendard.py
"""
import re
from pathlib import Path

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
for name in re.findall(r"woff2-dynamic-subset/(PretendardVariable\.subset\.\d+\.woff2)", css):
    font = instancer.instantiateVariableFont(TTFont(SRC / "woff2-dynamic-subset" / name), {"wght": WEIGHT})
    for record in font["name"].names:
        if record.nameID in NAME_IDS:
            text = record.toUnicode().replace("Pretendard Variable", FAMILY)
            record.string = text.replace("PretendardVariable", FAMILY.replace(" ", ""))
    font.flavor = "woff2"
    font.save(OUT / "pretendard" / name)

css = css.replace("./woff2-dynamic-subset/", "./pretendard/")
css = css.replace("font-family: 'Pretendard Variable';", f"font-family: '{FAMILY}';")
css = css.replace("font-weight: 45 920;", f"font-weight: {WEIGHT[0]} {WEIGHT[1]};")
header = "/* scripts/gen_pretendard.py가 생성한다. 손으로 고치지 마라. */\n"
(OUT / "pretendard.css").write_text(header + css, encoding="utf-8")
