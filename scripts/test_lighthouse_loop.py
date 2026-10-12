"""scripts/lighthouse_loop.py의 판정 로직 테스트. 측정(빌드·Chrome)은 건드리지 않는다."""

import lighthouse_loop as ll

ROW = {
    "commit": "a1b2c3d", "score": "80.0", "ref_score": "80.0", "delta": "0.0", "accessibility": "99.0",
    "best_practices": "96.0", "seo": "100.0", "status": "keep", "routes": "/:69 /login:92", "description": "baseline",
}


def side(score, a11y=99.0, bp=96.0, seo=100.0):
    return {"score": score, "accessibility": a11y, "best_practices": bp, "seo": seo, "routes": {}}


def test_tsv_왕복(tmp_path):
    path = tmp_path / "results.tsv"
    ll.append_row(path, ROW)
    ll.append_row(path, {**ROW, "commit": "b2c3d4e", "status": "discard", "description": "탭\t섞인 설명"})
    rows = ll.read_rows(path)
    assert [r["commit"] for r in rows] == ["a1b2c3d", "b2c3d4e"]
    # 설명의 탭이 컬럼을 밀면 이후 행 전체가 깨진다
    assert rows[1]["description"] == "탭 섞인 설명"


def test_기준선_유무():
    assert ll.has_baseline([]) is False
    assert ll.has_baseline([{**ROW, "status": "crash"}]) is False
    assert ll.has_baseline([ROW]) is True


def test_마진_이상_오르면_keep():
    assert ll.decide(side(80.0), side(80.0 + ll.MARGIN))[0] == "keep"


def test_노이즈_범위면_discard():
    # 같은 코드끼리 번갈아 재도 차이가 0이 아니다. 노이즈를 개선으로 채택하지 않는다
    assert ll.decide(side(80.0), side(80.0 + ll.MARGIN - 0.1))[0] == "discard"


def test_판정은_절대점수가_아니라_같은_시간대의_차이로():
    # 머신이 바빠 둘 다 낮게 나와도 후보가 기준보다 확실히 높으면 개선이다
    assert ll.decide(side(60.0), side(65.0))[0] == "keep"
    assert ll.decide(side(95.0), side(94.0))[0] == "discard"


def test_다른_카테고리가_떨어지면_성능이_올라도_discard():
    status, reason = ll.decide(side(80.0), side(95.0, a11y=97.0))
    assert status == "discard"
    assert "accessibility" in reason


def test_가드_카테고리의_1점_이내_흔들림은_허용():
    assert ll.decide(side(80.0), side(90.0, bp=95.0))[0] == "keep"


def test_만점끼리는_개선이_아니다():
    assert ll.decide(side(100.0), side(100.0))[0] == "discard"


def test_median():
    assert ll.median([3, 1, 2]) == 2
    assert ll.median([4, 1, 3, 2]) == 2.5
