// FinSight 데모 데이터 — 평가용 샘플 CSV(신한카드/국민은행)에서 파싱된 결과를 가정
window.FS = (function () {
  const CATEGORIES = ['식비', '카페·간식', '교통', '주거·통신', '생활용품', '쇼핑', '의료·건강', '문화·여가', '교육', '구독·서비스', '금융·수수료', '기타'];

  // by: 'rule' 사용자 규칙 · 'dict' 내장 가맹점 사전 · 'claude' 모델 분류
  const T = [
    ['08-02', '스타벅스 역삼점', 5900, '카페·간식', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-02', '지하철 교통카드 충전', 50000, '교통', 'expense', 'rule', '신한카드 (5·12)'],
    ['08-03', '쿠팡', 38400, '생활용품', 'expense', 'rule', '신한카드 (5·12)'],
    ['08-04', '넷플릭스', 17000, '구독·서비스', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-05', '김밥천국 삼성점', 8500, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-05', '(주)세븐일레븐 1132', 4300, '생활용품', 'expense', 'claude', '신한카드 (5·12)'],
    ['08-06', '급여 (주)라이트하우스', 4120000, '기타', 'income', 'rule', '국민은행 (입출금)'],
    ['08-06', '카카오T 블루', 18700, '교통', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-07', '마켓컬리', 47200, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-08', '유튜브 프리미엄', 14900, '구독·서비스', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-09', '올리브영 강남', 32600, '생활용품', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-10', '본인 계좌 이체 (국민→토스)', 500000, '기타', 'transfer', 'rule', '국민은행 (입출금)'],
    ['08-11', 'CU 논현점', 6800, '생활용품', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-12', '무신사', 129000, '쇼핑', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-12', '무신사 부분 환불', 39000, '쇼핑', 'refund', 'rule', '신한카드 (5·12)'],
    ['08-13', '클로드 프로', 29000, '구독·서비스', 'expense', 'claude', '신한카드 (5·12)'],
    ['08-14', '더핏 필라테스 정기', 55000, '문화·여가', 'expense', 'rule', '신한카드 (5·12)'],
    ['08-15', 'SKT 통신요금', 68900, '주거·통신', 'expense', 'dict', '국민은행 (입출금)'],
    ['08-16', '배달의민족', 23400, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-17', '쿠팡 와우 멤버십', 7890, '구독·서비스', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-18', '아이클라우드+', 3300, '구독·서비스', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-19', '연세세브란스 외래', 42000, '의료·건강', 'expense', 'claude', '신한카드 (5·12)'],
    ['08-20', '교보문고 광화문', 27800, '문화·여가', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-21', '이케아 고양', 214000, '쇼핑', 'expense', 'claude', '신한카드 (5·12)'],
    ['08-22', '스타벅스 역삼점', 6300, '카페·간식', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-23', 'GS칼텍스 셀프', 71000, '교통', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-24', '메가커피 선릉', 2500, '카페·간식', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-25', '신한카드 대금 납부', 1873400, '금융·수수료', 'transfer', 'rule', '국민은행 (입출금)'],
    ['08-26', '한솔학원 수강료', 180000, '교육', 'expense', 'claude', '신한카드 (5·12)'],
    ['08-27', '롯데마트 잠실', 96400, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-28', '요기요', 19800, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-29', '아웃백 코엑스', 88000, '식비', 'expense', 'dict', '신한카드 (5·12)'],
    ['08-30', '해외 결제 수수료', 1240, '금융·수수료', 'expense', 'rule', '신한카드 (5·12)'],
    ['08-31', '메가박스 코엑스', 15000, '문화·여가', 'expense', 'dict', '신한카드 (5·12)']
  ].map((r, i) => ({ id: 'tx' + (i + 1), date: '2026-' + r[0], merchant: r[1], amount: r[2], category: r[3], type: r[4], by: r[5], source: r[6] }));

  const TYPE_LABEL = { expense: '지출', income: '수입', refund: '환불', transfer: '이체' };

  // 총지출 = 지출 − 환불. 수입·이체(급여, 본인 계좌 이체, 카드대금 납부)는 제외.
  function spendOf(list) {
    return list.reduce((s, t) => s + (t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
  }
  function byCategory(list) {
    const m = {};
    list.forEach(t => {
      if (t.type !== 'expense' && t.type !== 'refund') return;
      m[t.category] = (m[t.category] || 0) + (t.type === 'refund' ? -t.amount : t.amount);
    });
    return Object.entries(m).filter(e => e[1] !== 0).sort((a, b) => b[1] - a[1]);
  }

  const TREND = [
    { month: '2026-03', total: 1712300 },
    { month: '2026-04', total: 1583900 },
    { month: '2026-05', total: 1907400 },
    { month: '2026-06', total: 1644800 },
    { month: '2026-07', total: 1731200 },
    { month: '2026-08', total: spendOf(T) }
  ];

  const SUBSCRIPTIONS = [
    { merchant: '넷플릭스', amount: 17000, since: '2024-11', months: 22, raise: { from: 13500, at: '2026-06' } },
    { merchant: '클로드 프로', amount: 29000, since: '2025-08', months: 13, raise: null },
    { merchant: '유튜브 프리미엄', amount: 14900, since: '2024-02', months: 31, raise: null },
    { merchant: '더핏 필라테스 정기', amount: 55000, since: '2026-02', months: 7, raise: null },
    { merchant: '쿠팡 와우 멤버십', amount: 7890, since: '2023-09', months: 36, raise: { from: 4990, at: '2025-04' } },
    { merchant: '아이클라우드+', amount: 3300, since: '2022-05', months: 52, raise: null }
  ];

  const idOf = m => (T.find(t => t.merchant.indexOf(m) === 0) || {}).id;

  const ANOMALIES = [
    { id: idOf('이케아'), merchant: '이케아 고양', amount: 214000, category: '쇼핑', median: 41000, ratio: 5.2 },
    { id: idOf('한솔학원'), merchant: '교육 · 한솔학원 수강료', amount: 180000, category: '교육', median: 0, ratio: null, note: '이 카테고리 첫 거래' },
    { id: idOf('GS칼텍스'), merchant: 'GS칼텍스 셀프', amount: 71000, category: '교통', median: 18700, ratio: 3.8 }
  ];

  const SUB_IDS = ['넷플릭스', '유튜브 프리미엄', '클로드 프로', '쿠팡 와우', '아이클라우드+'].map(idOf);

  const SUMMARY_FREE = [
    { text: '8월 총지출은 ₩{TOTAL}으로 7월보다 ₩{DELTA} {DIR}었습니다.', ev: [idOf('이케아'), idOf('한솔학원')] },
    { text: '가장 큰 카테고리는 쇼핑이고, 이케아 고양 한 건이 그 절반을 넘습니다.', ev: [idOf('이케아')] },
    { text: '정기결제로 판정된 6건이 매달 같은 날 결제되고 있습니다.', ev: SUB_IDS.concat([idOf('더핏')]) }
  ];
  const SUMMARY_PRO_EXTRA = [
    { text: '정기결제 합계는 월 ₩127,090이고, 넷플릭스는 6월에 ₩13,500 → ₩17,000으로 올랐습니다.', ev: [idOf('넷플릭스')] },
    { text: '최근 6개월 중 지출이 가장 적은 달입니다. 3–7월 평균보다 ₩{AVGDELTA} {AVGDIR}습니다.', ev: [] },
    { text: '가장 확실한 절약 지점은 24개월 이상 유지된 소액 구독 3건(₩26,090/월)과, 카테고리 중앙값의 5.2배인 쇼핑 이상거래 1건입니다.', ev: [idOf('이케아'), idOf('유튜브 프리미엄'), idOf('쿠팡 와우'), idOf('아이클라우드+')] }
  ];

  const won = n => '₩' + Math.round(n).toLocaleString('en-US');

  return { CATEGORIES, T, TYPE_LABEL, TREND, SUBSCRIPTIONS, ANOMALIES, SUMMARY_FREE, SUMMARY_PRO_EXTRA, spendOf, byCategory, won };
})();
