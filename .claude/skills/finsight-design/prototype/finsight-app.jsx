const { Button, BadgePill, TextInput } = window.FinsightDesignSystem_43073c;
const FS = window.FS;
const { useState, useMemo, useEffect } = React;

const NAV = ['개요', '거래', '기간별 추이', '구독 · 이상거래', '업로드'];

function Num({ children, style }) { return <span className="num" style={style}>{children}</span>; }

function Delta({ value }) {
  const up = value > 0;
  return <Num style={{ color: up ? 'var(--color-semantic-down)' : 'var(--color-semantic-up)', fontSize: 14 }}>
    {up ? '+' : '−'}{FS.won(Math.abs(value)).slice(1)}
  </Num>;
}

function Card({ children, style, ...rest }) { return <section className="card" style={style} {...rest}>{children}</section>; }

function SectionHead({ title, note, right }) {
  return <div className="sec-head">
    <div>
      <h2 className="h-sec">{title}</h2>
      {note ? <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{note}</p> : null}
    </div>
    {right}
  </div>;
}

function Locked({ title, body, onUpgrade }) {
  return <Card style={{ textAlign: 'left', maxWidth: 640 }}>
    <BadgePill>PRO</BadgePill>
    <h3 style={{ fontSize: 'var(--type-title-lg-size)', letterSpacing: 'var(--type-title-lg-ls)', marginTop: 'var(--space-base)' }}>{title}</h3>
    <p style={{ marginTop: 'var(--space-sm)', maxWidth: 460 }}>{body}</p>
    <p className="muted" style={{ marginTop: 'var(--space-sm)', fontSize: 14 }}>
      여러 달치 데이터가 쌓여야 의미가 생기는 기능입니다. Free에서도 업로드는 계속 쌓입니다.
    </p>
    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginTop: 'var(--space-lg)' }}>
      <Button onClick={onUpgrade}>Pro 시작하기</Button>
      <span className="muted" style={{ fontSize: 14 }}>월 <Num>₩9,900</Num> · 언제든 해지</span>
    </div>
  </Card>;
}

/* ── 개요 ───────────────────────────────────────────── */
function Overview({ txs, plan, go, upgrade, uploadsUsed }) {
  const total = FS.spendOf(txs);
  const prev = FS.TREND[4].total;
  const cats = FS.byCategory(txs);
  const max = cats[0][1];
  const avg = FS.TREND.slice(0, 5).reduce((s, m) => s + m.total, 0) / 5;
  const subTotal = FS.SUBSCRIPTIONS.reduce((s, x) => s + x.amount, 0);
  const fill = t => t.replace('{TOTAL}', total.toLocaleString('en-US'))
    .replace('{DELTA}', Math.abs(total - prev).toLocaleString('en-US'))
    .replace('{DIR}', total >= prev ? '늘' : '줄')
    .replace('{AVGDELTA}', Math.abs(Math.round(total - avg)).toLocaleString('en-US'))
    .replace('{AVGDIR}', total >= avg ? '높' : '낮');
  const lines = plan === 'pro' ? FS.SUMMARY_FREE.concat(FS.SUMMARY_PRO_EXTRA) : FS.SUMMARY_FREE;

  return <div className="stack">
    <SectionHead title="2026년 8월" note="청구월 기준 · 신한카드 (5·12), 국민은행 (입출금)"
      right={<span className="muted" style={{ fontSize: 14 }}>
        {plan === 'free' ? <>이번 달 업로드 <Num>{uploadsUsed}/1</Num></> : <>업로드 무제한</>}
      </span>} />

    <div className="grid-3">
      <Card>
        <p className="lbl">총지출 (지출 − 환불)</p>
        <p className="figure"><Num>{FS.won(total)}</Num></p>
        <p style={{ marginTop: 'var(--space-xs)', fontSize: 14 }}>전월 대비 <Delta value={total - prev} /></p>
      </Card>
      <Card>
        <p className="lbl">거래 건수</p>
        <p className="figure"><Num>{txs.length}</Num></p>
        <p className="muted" style={{ marginTop: 'var(--space-xs)', fontSize: 14 }}>
          수입·이체 <Num>{txs.filter(t => t.type === 'income' || t.type === 'transfer').length}</Num>건은 총지출에서 제외
        </p>
      </Card>
      <Card>
        <p className="lbl">정기결제 합계</p>
        <p className="figure">{plan === 'pro' ? <Num>{FS.won(subTotal)}</Num> : <span className="muted" style={{ fontFamily: 'var(--font-display)' }}>—</span>}</p>
        <p className="muted" style={{ marginTop: 'var(--space-xs)', fontSize: 14 }}>
          {plan === 'pro' ? <>월 <Num>{FS.SUBSCRIPTIONS.length}</Num>건 · 인상 <Num>1</Num>건 감지</> : 'Pro에서 탐지'}
        </p>
      </Card>
    </div>

    <div className="grid-2">
      <Card>
        <p className="lbl">카테고리별 지출</p>
        <div className="bars">
          {cats.map(([c, v]) => <div key={c} className="bar-row">
            <span className="bar-name">{c}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: (v / max * 100) + '%' }} /></span>
            <Num style={{ fontSize: 14 }}>{FS.won(v)}</Num>
          </div>)}
        </div>
        <p className="muted" style={{ marginTop: 'var(--space-base)', fontSize: 13 }}>
          고정 12개 카테고리 · 거래별 수정은 <a href="#" onClick={e => { e.preventDefault(); go('거래'); }}>거래</a>에서
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <p className="lbl" style={{ margin: 0 }}>AI 월간 요약</p>
          <BadgePill>{plan === 'pro' ? 'CLAUDE-OPUS-5' : 'CLAUDE-SONNET-5'}</BadgePill>
        </div>
        <ul className="summary">
          {lines.map((l, i) => <li key={i}>
            <p>{fill(l.text)}</p>
            {l.ev.length ? <button className="ev" onClick={() => go('거래', l.ev)}>근거 거래 {l.ev.length}건 보기</button> : null}
          </li>)}
        </ul>
        <p className="muted" style={{ marginTop: 'var(--space-base)', fontSize: 13 }}>
          숫자는 모두 코드로 계산한 값이며, 요약 문장은 그 값을 근거로 작성됩니다.
          {plan === 'free' ? <> Pro는 추이·구독·이상거래까지 입력에 더해 절약 제안을 받습니다. <a href="#" onClick={e => { e.preventDefault(); upgrade(); }}>Pro 보기</a></> : null}
        </p>
      </Card>
    </div>
  </div>;
}

/* ── 거래 ───────────────────────────────────────────── */
const BY_LABEL = { rule: '내 규칙', dict: '가맹점 사전', claude: 'Claude' };

function Transactions({ txs, setCategory, highlight, toast }) {
  const [filter, setFilter] = useState('전체');
  const filters = ['전체', '지출', '수입', '환불', '이체'];
  const rows = txs.filter(t => filter === '전체' || FS.TYPE_LABEL[t.type] === filter);
  return <div className="stack">
    <SectionHead title="거래" note="카테고리를 고치면 가맹점 규칙으로 저장되어 다음 업로드부터 자동 적용됩니다."
      right={<div className="seg">{filters.map(f => <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>} />
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <table className="tx">
        <thead><tr><th>날짜</th><th>가맹점</th><th>출처</th><th>유형</th><th>분류 경로</th><th style={{ textAlign: 'right' }}>금액</th><th>카테고리</th></tr></thead>
        <tbody>
          {rows.map(t => <tr key={t.id} className={highlight.includes(t.id) ? 'hi' : ''}>
            <td><Num style={{ fontSize: 13 }}>{t.date}</Num></td>
            <td className="ink">{t.merchant}</td>
            <td className="muted" style={{ fontSize: 13 }}>{t.source}</td>
            <td><span className={'type t-' + t.type}>{FS.TYPE_LABEL[t.type]}</span></td>
            <td className="muted" style={{ fontSize: 13 }}>{BY_LABEL[t.by]}</td>
            <td style={{ textAlign: 'right' }}><Num style={{ color: t.type === 'expense' ? 'var(--color-ink)' : 'var(--color-muted)' }}>{FS.won(t.amount)}</Num></td>
            <td>
              <select value={t.category} onChange={e => setCategory(t, e.target.value)} disabled={t.type !== 'expense' && t.type !== 'refund'}>
                {FS.CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </td>
          </tr>)}
        </tbody>
      </table>
    </Card>
    {toast}
  </div>;
}

/* ── 기간별 추이 ─────────────────────────────────────── */
function Trend({ plan, upgrade }) {
  if (plan === 'free') return <div className="stack">
    <SectionHead title="기간별 추이" />
    <Locked title="월별 · 카테고리별 지출 변화" body="6개월 이상의 명세서를 한 화면에서 비교하고, 어떤 카테고리가 언제부터 늘었는지 짚어냅니다." onUpgrade={upgrade} />
  </div>;
  const max = Math.max(...FS.TREND.map(m => m.total));
  const catTrend = [
    ['쇼핑', [186000, 142000, 298000, 121000, 164000, 304000]],
    ['식비', [412000, 388000, 441000, 402000, 425000, 283300]],
    ['구독·서비스', [64090, 64090, 64090, 72090, 72090, 72090]],
    ['교통', [131000, 118000, 142000, 126000, 139000, 139700]],
    ['문화·여가', [58000, 41000, 96000, 55000, 71000, 97800]]
  ];
  return <div className="stack">
    <SectionHead title="기간별 추이" note="2026년 3월 – 8월 · 총지출 기준" />
    <Card>
      <div className="chart">
        {FS.TREND.map(m => <div key={m.month} className="chart-col">
          <Num style={{ fontSize: 13 }}>{Math.round(m.total / 10000).toLocaleString('en-US')}만</Num>
          <span className={'chart-bar' + (m.month === '2026-08' ? ' now' : '')} style={{ height: (m.total / max * 180) + 'px' }} />
          <Num style={{ fontSize: 12, color: 'var(--color-muted)' }}>{m.month.slice(5)}월</Num>
        </div>)}
      </div>
    </Card>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <table className="tx">
        <thead><tr><th>카테고리</th>{FS.TREND.map(m => <th key={m.month} style={{ textAlign: 'right' }}>{m.month.slice(5)}월</th>)}<th style={{ textAlign: 'right' }}>전월 대비</th></tr></thead>
        <tbody>
          {catTrend.map(([c, vals]) => <tr key={c}>
            <td className="ink">{c}</td>
            {vals.map((v, i) => <td key={i} style={{ textAlign: 'right' }}><Num style={{ fontSize: 13, color: i === 5 ? 'var(--color-ink)' : 'var(--color-body)' }}>{Math.round(v / 1000).toLocaleString('en-US')}천</Num></td>)}
            <td style={{ textAlign: 'right' }}><Delta value={vals[5] - vals[4]} /></td>
          </tr>)}
        </tbody>
      </table>
    </Card>
  </div>;
}

/* ── 구독 · 이상거래 ─────────────────────────────────── */
function Leaks({ plan, upgrade, go }) {
  if (plan === 'free') return <div className="stack">
    <SectionHead title="구독 · 이상거래" />
    <Locked title="구독 누수와 이상거래 탐지" body="정기결제로 판정된 항목과 월 합계, 금액 인상, 그리고 카테고리 중앙값에서 벗어난 거래를 찾습니다. 판정은 전부 코드로 계산합니다." onUpgrade={upgrade} />
  </div>;
  const subTotal = FS.SUBSCRIPTIONS.reduce((s, x) => s + x.amount, 0);
  return <div className="stack">
    <SectionHead title="구독 · 이상거래" note="정기결제 판정과 이상치 판정은 모델이 아니라 코드로 계산한 결과입니다." />
    <div className="grid-2">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p className="lbl" style={{ margin: 0 }}>정기결제 {FS.SUBSCRIPTIONS.length}건</p>
          <Num style={{ fontSize: 'var(--type-number-display-size)' }}>{FS.won(subTotal)}/월</Num>
        </div>
        <ul className="list">
          {FS.SUBSCRIPTIONS.map(s => <li key={s.merchant}>
            <div>
              <p className="ink">{s.merchant}</p>
              <p className="muted" style={{ fontSize: 13 }}>{s.since} 시작 · <Num style={{ fontSize: 13 }}>{s.months}</Num>개월 연속</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Num>{FS.won(s.amount)}</Num>
              {s.raise ? <p style={{ fontSize: 13, marginTop: 2 }}>
                <Num style={{ fontSize: 13, color: 'var(--color-semantic-down)' }}>+{(s.amount - s.raise.from).toLocaleString('en-US')}</Num>
                <span className="muted" style={{ fontSize: 13 }}> · {s.raise.at} 인상</span>
              </p> : null}
            </div>
          </li>)}
        </ul>
      </Card>
      <Card>
        <p className="lbl">이상거래 {FS.ANOMALIES.length}건</p>
        <ul className="list">
          {FS.ANOMALIES.map(a => <li key={a.id}>
            <div>
              <p className="ink">{a.merchant}</p>
              <p className="muted" style={{ fontSize: 13 }}>
                {a.note ? a.note : <>{a.category} 중앙값 <Num style={{ fontSize: 13 }}>{FS.won(a.median)}</Num>의 <Num style={{ fontSize: 13 }}>{a.ratio}</Num>배</>}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Num>{FS.won(a.amount)}</Num>
              <p style={{ fontSize: 13, marginTop: 2 }}><button className="ev" onClick={() => go('거래', [a.id])}>거래 보기</button></p>
            </div>
          </li>)}
        </ul>
      </Card>
    </div>
  </div>;
}

/* ── 업로드 ─────────────────────────────────────────── */
const MAPPING = [
  ['거래일자', '날짜', 'YYYY.MM.DD', true],
  ['가맹점명', '가맹점', '문자열', true],
  ['이용금액', '금액', '숫자 · 쉼표 구분', true],
  ['승인구분', '거래 유형', '승인 / 취소', true],
  ['할부개월', '(사용 안 함)', '숫자', false],
  ['카드번호', '(제거됨)', '마스킹', false]
];

function Upload({ plan, uploadsUsed, onSaved }) {
  const [step, setStep] = useState(1);
  const [alias, setAlias] = useState('신한카드 (5·12)');
  const [dupes, setDupes] = useState({ d1: null, d2: null });
  const blocked = plan === 'free' && uploadsUsed >= 1;

  const steps = ['파일 선택', '매핑 확인', '저장'];
  return <div className="stack">
    <SectionHead title="업로드" note="인코딩(EUC-KR / UTF-8)을 감지하고, 첫 20행의 컬럼 의미·형식만으로 매핑을 추론합니다. 원본 값은 추론에 사용하지 않습니다."
      right={<div className="steps">{steps.map((s, i) => <span key={s} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}><Num style={{ fontSize: 12 }}>{i + 1}</Num> {s}</span>)}</div>} />

    {step === 1 && <Card style={{ maxWidth: 720 }}>
      <label className="lbl" htmlFor="alias">카드 · 계좌 별칭</label>
      <select id="alias" value={alias} onChange={e => setAlias(e.target.value)} style={{ marginTop: 'var(--space-xs)', width: '100%', height: 44 }}>
        <option>신한카드 (5·12)</option><option>국민은행 (입출금)</option><option>+ 새 별칭 추가</option>
      </select>
      <div className="drop">
        <p className="ink">CSV 파일을 여기에 놓기</p>
        <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>파일당 <Num style={{ fontSize: 14 }}>4MB</Num> · <Num style={{ fontSize: 14 }}>10,000</Num>행까지</p>
        <div style={{ marginTop: 'var(--space-base)' }}><Button variant="secondary-light" onClick={() => !blocked && setStep(2)}>샘플 CSV 선택</Button></div>
      </div>
      {blocked
        ? <p style={{ fontSize: 14, marginTop: 'var(--space-base)' }}>
          이번 달(KST) 업로드 <Num style={{ fontSize: 14 }}>1/1</Num>회를 모두 사용했습니다. 기존 데이터 열람·수정·재분류는 계속 가능합니다.
          여러 달치를 한 파일로 합쳐 올리면 <Num style={{ fontSize: 14 }}>1</Num>회로 계산됩니다.
        </p>
        : <p className="muted" style={{ fontSize: 14, marginTop: 'var(--space-base)' }}>
          {plan === 'free' ? <>Free는 KST 캘린더 월 기준 <Num style={{ fontSize: 14 }}>1</Num>회입니다. 매핑 추론이 실패한 업로드와 동일 파일 재업로드는 횟수를 소비하지 않습니다.</> : '원본은 Storage에 보관되며 언제든 다시 파싱할 수 있습니다.'}
        </p>}
    </Card>}

    {step === 2 && <div className="grid-2">
      <Card>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <BadgePill>EUC-KR 감지</BadgePill><BadgePill>34행</BadgePill><BadgePill>청구월 2026-08</BadgePill>
        </div>
        <p className="lbl" style={{ marginTop: 'var(--space-lg)' }}>컬럼 매핑</p>
        <ul className="list">
          {MAPPING.map(([src, dst, fmt, used]) => <li key={src}>
            <div>
              <p className={used ? 'ink' : 'muted'}>{src}</p>
              <p className="muted" style={{ fontSize: 13 }}>{fmt}</p>
            </div>
            <select defaultValue={dst} style={{ minWidth: 160 }}>
              <option>{dst}</option>
              {['날짜', '가맹점', '금액', '거래 유형', '(사용 안 함)'].filter(o => o !== dst).map(o => <option key={o}>{o}</option>)}
            </select>
          </li>)}
        </ul>
      </Card>
      <Card>
        <p className="lbl">확인이 필요한 항목</p>
        <ul className="list">
          <li>
            <div>
              <p className="ink">쿠팡 · <Num>₩38,400</Num> · 08-03</p>
              <p className="muted" style={{ fontSize: 13 }}>기존 거래와 날짜·금액이 같습니다. 중복인가요?</p>
            </div>
            <div className="seg">
              <button className={dupes.d1 === 'skip' ? 'on' : ''} onClick={() => setDupes({ ...dupes, d1: 'skip' })}>중복</button>
              <button className={dupes.d1 === 'add' ? 'on' : ''} onClick={() => setDupes({ ...dupes, d1: 'add' })}>추가</button>
            </div>
          </li>
          <li>
            <div>
              <p className="ink">신한카드 대금 납부 · <Num>₩1,873,400</Num></p>
              <p className="muted" style={{ fontSize: 13 }}>이체로 판정했습니다. 총지출에서 제외됩니다.</p>
            </div>
            <div className="seg">
              <button className={dupes.d2 !== 'expense' ? 'on' : ''} onClick={() => setDupes({ ...dupes, d2: 'transfer' })}>이체</button>
              <button className={dupes.d2 === 'expense' ? 'on' : ''} onClick={() => setDupes({ ...dupes, d2: 'expense' })}>지출</button>
            </div>
          </li>
        </ul>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
          <Button onClick={() => { setStep(3); onSaved(); }}>확인하고 저장</Button>
          <Button variant="secondary-light" onClick={() => setStep(1)}>뒤로</Button>
        </div>
      </Card>
    </div>}

    {step === 3 && <Card style={{ maxWidth: 640 }}>
      <BadgePill>저장 완료</BadgePill>
      <h3 style={{ fontSize: 'var(--type-title-lg-size)', letterSpacing: 'var(--type-title-lg-ls)', marginTop: 'var(--space-base)' }}>34건이 저장되었습니다</h3>
      <ul className="plain">
        <li>사용자 규칙 <Num>7</Num>건 · 내장 가맹점 사전 <Num>22</Num>건 · Claude <Num>5</Num>건으로 분류</li>
        <li>원본 CSV는 Storage에 보관됩니다</li>
        <li>AI 월간 요약은 2026-08 기준으로 캐싱됩니다</li>
      </ul>
      <div style={{ marginTop: 'var(--space-lg)' }}><Button onClick={() => setStep(1)}>다른 파일 올리기</Button></div>
    </Card>}
  </div>;
}

/* ── 셸 ─────────────────────────────────────────────── */
function App() {
  const [route, setRoute] = useState('landing');
  const [tab, setTab] = useState('개요');
  const [plan, setPlan] = useState('free');
  const [theme, setTheme] = useState(() => localStorage.getItem('fs-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [txs, setTxs] = useState(FS.T);
  const [highlight, setHighlight] = useState([]);
  const [toast, setToast] = useState(null);
  const [uploadsUsed, setUploadsUsed] = useState(0);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('fs-theme', theme); }, [theme]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id); }, [toast]);

  const go = (t, ev) => { setTab(t); setHighlight(ev || []); window.scrollTo(0, 0); };
  const nav = (r, t) => { setRoute(r); if (t) setTab(t); window.scrollTo(0, 0); };
  const upgrade = () => nav('checkout');

  if (route === 'landing') return <Landing go={nav} theme={theme} setTheme={setTheme} />;
  if (route === 'signup') return <SignUp go={nav} />;
  if (route === 'checkout') return <Checkout back={() => nav('app')} onDone={() => { setPlan('pro'); nav('app', '기간별 추이'); }} />;
  const setCategory = (t, c) => {
    setTxs(prev => prev.map(x => x.id === t.id ? { ...x, category: c, by: 'rule' } : x));
    setToast(`가맹점 규칙 저장 — ${t.merchant} → ${c}. 다음 업로드부터 자동 적용됩니다.`);
  };

  return <>
    <header className="app-nav">
      <div className="nav-inner">
        <button className="brand" onClick={() => nav('landing')} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>finsight</button>
        <nav>{NAV.map(n => <button key={n} className={n === tab ? 'on' : ''} onClick={() => go(n)}>{n}</button>)}</nav>
        <div className="nav-right">
          <div className="seg">
            <button className={plan === 'free' ? 'on' : ''} onClick={() => setPlan('free')}>Free</button>
            <button className={plan === 'pro' ? 'on' : ''} onClick={() => setPlan('pro')}>Pro</button>
          </div>
          <button className="theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="테마 전환">{theme === 'dark' ? '라이트' : '다크'}</button>
        </div>
      </div>
    </header>
    <main>
      {tab === '개요' && <Overview txs={txs} plan={plan} go={go} upgrade={upgrade} uploadsUsed={uploadsUsed} />}
      {tab === '거래' && <Transactions txs={txs} setCategory={setCategory} highlight={highlight} toast={toast ? <div className="toast">{toast}</div> : null} />}
      {tab === '기간별 추이' && <Trend plan={plan} upgrade={upgrade} />}
      {tab === '구독 · 이상거래' && <Leaks plan={plan} upgrade={upgrade} go={go} />}
      {tab === '업로드' && <Upload plan={plan} uploadsUsed={uploadsUsed} onSaved={() => setUploadsUsed(u => u + 1)} />}
    </main>
    {toast && tab !== '거래' ? <div className="toast">{toast}</div> : null}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
