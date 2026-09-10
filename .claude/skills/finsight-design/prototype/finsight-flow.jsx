const { Button: FButton, BadgePill: FBadge, TextInput: FInput, HeroBand, ProductUiCard, FeatureCard, PricingTier, CtaBand, SiteFooter } = window.FinsightDesignSystem_43073c;
const FSD = window.FS;
const won = FSD.won;

function MarketingNav({ go, theme, setTheme, tone }) {
  const dark = tone === 'dark';
  return <header className="mkt-nav" style={{ background: dark ? 'var(--color-surface-dark)' : 'var(--color-canvas)' }}>
    <div className="nav-inner">
      <span className="brand">finsight</span>
      <nav>
        <a href="#features" style={{ color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)' }}>기능</a>
        <a href="#pricing" style={{ color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)' }}>요금제</a>
        <a href="#privacy" style={{ color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)' }}>데이터 처리</a>
      </nav>
      <div className="nav-right">
        <button className="theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)', borderColor: dark ? 'rgba(255,255,255,.2)' : 'var(--color-hairline)' }}>{theme === 'dark' ? '라이트' : '다크'}</button>
        <a href="#" className="signin" onClick={e => { e.preventDefault(); go('app'); }} style={{ color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)' }}>로그인</a>
        <FButton style={{ height: 40, padding: '10px 18px' }} onClick={() => go('signup')}>시작하기</FButton>
      </div>
    </div>
  </header>;
}

function HeroMock() {
  const cats = [['쇼핑', 304000], ['식비', 283300], ['교통', 139700], ['문화·여가', 97800]];
  const max = 304000;
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
    <ProductUiCard title="2026년 8월" meta={won(FSD.TREND[5].total)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cats.map(([c, v]) => <div key={c} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--color-on-dark-soft)' }}>{c}</span>
          <span style={{ height: 8, borderRadius: 100, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: (v / max * 100) + '%', background: 'var(--color-on-dark)', borderRadius: 100 }} />
          </span>
          <span className="num" style={{ fontSize: 13, color: 'var(--color-on-dark)' }}>{won(v)}</span>
        </div>)}
      </div>
    </ProductUiCard>
    <ProductUiCard rotate={-2} width={280} title="구독 누수" meta="₩127,090/월"
      style={{ marginTop: -16, marginLeft: 'auto', marginRight: 8, padding: 'var(--space-md)', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['넷플릭스', 17000, true], ['클로드 프로', 29000, false], ['쿠팡 와우', 7890, false]].map(([m, v, up]) => <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--color-on-dark-soft)' }}>{m}</span>
          <span className="num" style={{ fontSize: 13, color: up ? 'var(--color-semantic-down)' : 'var(--color-on-dark)' }}>{won(v)}</span>
        </div>)}
      </div>
    </ProductUiCard>
  </div>;
}

function Landing({ go, theme, setTheme }) {
  return <div className="landing">
    <div style={{ background: 'var(--color-surface-dark)' }}>
      <MarketingNav go={go} theme={theme} setTheme={setTheme} tone="dark" />
      <HeroBand
        eyebrow={<FBadge tone="dark">CSV 기반 지출 분석</FBadge>}
        headline="지출이 어디로 새는지"
        subhead="카드사·은행에서 내려받은 CSV를 올리면 5분 안에 카테고리별 지출과 정기결제 누수를 정리해 보여줍니다."
        actions={<>
          <FButton size="lg" onClick={() => go('signup')}>무료로 시작</FButton>
          <FButton size="lg" variant="outline-on-dark" onClick={() => go('app')}>샘플 데이터로 보기</FButton>
        </>}
        media={<HeroMock />} />
    </div>

    <section id="features" className="band">
      <div className="band-inner">
        <h2 className="band-h">가계부에 손으로 입력하지 않습니다</h2>
        <div className="grid-3" style={{ marginTop: 'var(--space-xl)' }}>
          <FeatureCard title="CSV 업로드와 자동 매핑" body="EUC-KR·UTF-8 인코딩을 감지하고 컬럼 의미로 매핑을 추론합니다. 저장 전에 사용자가 확인합니다." />
          <FeatureCard title="세 단계 카테고리 분류" body="내 규칙 → 내장 가맹점 사전 → 남은 것만 Claude. 한 번 고치면 규칙으로 남아 다음부터 자동 적용됩니다." />
          <FeatureCard title="코드로 계산한 탐지" body="정기결제 판정, 금액 인상, 카테고리 중앙값 대비 이상치는 모두 코드로 계산합니다. 모델은 요약만 씁니다." />
        </div>
      </div>
    </section>

    <section id="pricing" className="band soft">
      <div className="band-inner">
        <h2 className="band-h">요금제</h2>
        <p style={{ marginTop: 'var(--space-sm)' }}>여러 달치 데이터가 쌓여야 의미가 생기는 기능은 Pro입니다. Free에서도 업로드는 계속 쌓입니다.</p>
        <div className="grid-2" style={{ marginTop: 'var(--space-xl)' }}>
          <PricingTier name="Free" price="₩0" cadence="/월"
            features={['업로드 · 원본 보관 월 1회', '카테고리 자동 분류', '해당 월 카테고리별 지출 요약', '거래별 카테고리 수정', 'AI 월간 요약 (Sonnet)']}
            action={<FButton variant="secondary-light" fullWidth onClick={() => go('signup')}>무료로 시작</FButton>} />
          <PricingTier featured name="Pro" price="₩9,900" cadence="/월"
            features={['업로드 · 원본 보관 무제한', '기간별 추이', '구독 누수 탐지', '이상거래 탐지', 'AI 월간 요약 (Opus)', '절약 인사이트 · 이상거래 해석']}
            action={<FButton fullWidth onClick={() => go('checkout')}>Pro 시작하기</FButton>} />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-base)' }}>월간 단일 플랜 · 결제는 Polar 샌드박스 · 연간 플랜은 MVP 제외</p>
      </div>
    </section>

    <section id="privacy" className="band">
      <div className="band-inner narrow">
        <h2 className="band-h">데이터 처리</h2>
        <ul className="plain" style={{ marginTop: 'var(--space-base)' }}>
          <li>원본 CSV는 Storage에 보관되며, 사용자가 지울 때까지 유지됩니다.</li>
          <li>금융 데이터는 로그에 남기지 않습니다.</li>
          <li>모델 입력에는 컬럼 의미·형식과 계산된 숫자만 들어가고, 프롬프트 인젝션 방어가 적용됩니다.</li>
          <li>계정당 1인 사용. 계정 삭제는 문의 경로로 접수합니다.</li>
        </ul>
        <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-base)' }}>포트폴리오 데모입니다. 실제 명세서를 모집하지 않고 평가용 샘플 CSV를 제공합니다.</p>
      </div>
    </section>

    <CtaBand headline="8월 명세서 한 장으로 시작" subhead="파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다."
      actions={<>
        <FButton size="lg" onClick={() => go('signup')}>무료로 시작</FButton>
        <FButton size="lg" variant="outline-on-dark" onClick={() => go('app')}>샘플 데이터로 보기</FButton>
      </>} />
    <SiteFooter columns={[
      { title: '제품', links: ['업로드', '카테고리 분류', '기간별 추이', '구독 누수'] },
      { title: '요금제', links: ['Free', 'Pro', '결제 문의'] },
      { title: '데이터', links: ['데이터 처리', '보관과 삭제', '로그 정책'] },
      { title: '문의', links: ['도움말', '계정 삭제 요청', '버그 신고'] },
      { title: '회사', links: ['소개', '변경 이력'] },
      { title: '법적 고지', links: ['이용약관', '개인정보처리방침'] }
    ]} legal="© 2026 FinSight — 포트폴리오 데모" />
  </div>;
}

function SignUp({ go }) {
  const [email, setEmail] = React.useState('');
  const ok = /@/.test(email);
  return <div className="auth">
    <div className="auth-card">
      <span className="brand" style={{ fontSize: 20 }}>finsight</span>
      <h1 className="auth-h">계정 만들기</h1>
      <p className="muted" style={{ fontSize: 14 }}>이메일로 가입하면 바로 샘플 CSV를 올릴 수 있습니다.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)', marginTop: 'var(--space-lg)' }}>
        <FInput label="이메일" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <FInput label="비밀번호" type="password" placeholder="8자 이상" />
        <FButton fullWidth disabled={!ok} onClick={() => ok && go('app', '업로드')}>가입하고 업로드하기</FButton>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-base)' }}>가입 시 이용약관과 개인정보처리방침에 동의합니다. 데모 계정은 평가용 샘플 데이터만 다룹니다.</p>
      <p style={{ fontSize: 14, marginTop: 'var(--space-lg)' }}>
        이미 계정이 있나요? <a href="#" onClick={e => { e.preventDefault(); go('app'); }}>로그인</a>
      </p>
    </div>
  </div>;
}

function Checkout({ onDone, back }) {
  const [state, setState] = React.useState('form');
  return <div className="auth">
    <div className="auth-card">
      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}><FBadge>POLAR 샌드박스</FBadge></div>
      {state === 'form' ? <>
        <h1 className="auth-h">Pro 구독</h1>
        <div className="line"><span>FinSight Pro · 월간</span><span className="num">₩9,900</span></div>
        <div className="line"><span className="muted">부가세 포함</span><span className="num muted" style={{ fontSize: 14 }}>₩900</span></div>
        <div className="line total"><span className="ink">지금 결제</span><span className="num" style={{ fontSize: 20 }}>₩9,900</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)', marginTop: 'var(--space-lg)' }}>
          <FInput label="카드 번호" placeholder="4242 4242 4242 4242" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-base)' }}>
            <FInput label="유효기간" placeholder="12 / 29" />
            <FInput label="CVC" placeholder="123" />
          </div>
          <FButton fullWidth onClick={() => { setState('paid'); }}>₩9,900 결제하기</FButton>
          <FButton variant="tertiary-text" onClick={back}>나중에 하기</FButton>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-base)' }}>샌드박스 결제입니다. 실제 청구는 발생하지 않습니다. 웹훅 서명 검증 후 구독 상태를 동기화합니다.</p>
      </> : <>
        <h1 className="auth-h">Pro가 활성화되었습니다</h1>
        <ul className="plain">
          <li>웹훅 <span className="num" style={{ fontSize: 14 }}>subscription.created</span> 서명 검증 완료</li>
          <li>다음 결제일 <span className="num" style={{ fontSize: 14 }}>2026-10-10</span></li>
          <li>기간별 추이 · 구독 누수 · 이상거래가 열렸습니다</li>
        </ul>
        <div style={{ marginTop: 'var(--space-lg)' }}><FButton fullWidth onClick={onDone}>대시보드로</FButton></div>
      </>}
    </div>
  </div>;
}

Object.assign(window, { Landing, SignUp, Checkout, MarketingNav });
