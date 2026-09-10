/* @ds-bundle: {"format":4,"namespace":"FinsightDesignSystem_43073c","components":[{"name":"BadgePill","sourcePath":"components/core/BadgePill.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"SearchInput","sourcePath":"components/forms/SearchInput.jsx"},{"name":"TextInput","sourcePath":"components/forms/TextInput.jsx"},{"name":"CtaBand","sourcePath":"components/marketing/CtaBand.jsx"},{"name":"FeatureCard","sourcePath":"components/marketing/FeatureCard.jsx"},{"name":"HeroBand","sourcePath":"components/marketing/HeroBand.jsx"},{"name":"PricingTier","sourcePath":"components/marketing/PricingTier.jsx"},{"name":"ProductUiCard","sourcePath":"components/marketing/ProductUiCard.jsx"},{"name":"SiteFooter","sourcePath":"components/navigation/SiteFooter.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"},{"name":"AssetIcon","sourcePath":"components/trading/AssetIcon.jsx"},{"name":"AssetRow","sourcePath":"components/trading/AssetRow.jsx"},{"name":"PriceCell","sourcePath":"components/trading/PriceCell.jsx"}],"sourceHashes":{"components/core/BadgePill.jsx":"b2c1c0c7f74c","components/core/Button.jsx":"3fbf8978ff8f","components/forms/SearchInput.jsx":"fad6e9a4c465","components/forms/TextInput.jsx":"12326bc95bc0","components/marketing/CtaBand.jsx":"1c78b1570ed2","components/marketing/FeatureCard.jsx":"9fd98030ae81","components/marketing/HeroBand.jsx":"1ae6740d82ed","components/marketing/PricingTier.jsx":"7050c498f996","components/marketing/ProductUiCard.jsx":"a365a0531bbd","components/navigation/SiteFooter.jsx":"45ef2948416c","components/navigation/TopNav.jsx":"d57a44d41115","components/trading/AssetIcon.jsx":"3b78ea01db66","components/trading/AssetRow.jsx":"13e06fcddd19","components/trading/PriceCell.jsx":"b77417f277b8","ui_kits/marketing-site/DeveloperScreen.jsx":"995a6351ffe9","ui_kits/marketing-site/ExploreScreen.jsx":"97697299d628","ui_kits/marketing-site/HomeScreen.jsx":"c0e04fa64323","ui_kits/marketing-site/SignUpScreen.jsx":"f1b52e0a65c1"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FinsightDesignSystem_43073c = window.FinsightDesignSystem_43073c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/BadgePill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function BadgePill({
  children,
  tone = 'default',
  style,
  ...rest
}) {
  const tones = {
    default: {
      background: 'var(--color-surface-strong)',
      color: 'var(--color-ink)'
    },
    dark: {
      background: 'var(--color-surface-dark-elevated)',
      color: 'var(--color-on-dark)'
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-caption-strong-size)',
      lineHeight: 'var(--type-caption-strong-lh)',
      fontWeight: 'var(--font-weight-semibold)',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      ...tones[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { BadgePill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/BadgePill.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const variants = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: '1px solid transparent'
  },
  'primary-active': {
    background: 'var(--color-primary-active)',
    color: 'var(--color-on-primary)',
    border: '1px solid transparent'
  },
  'secondary-light': {
    background: 'var(--color-surface-strong)',
    color: 'var(--color-ink)',
    border: '1px solid transparent'
  },
  'secondary-dark': {
    background: 'var(--color-surface-dark-elevated)',
    color: 'var(--color-on-dark)',
    border: '1px solid transparent'
  },
  'outline-on-dark': {
    background: 'transparent',
    color: 'var(--color-on-dark)',
    border: '1px solid var(--color-on-dark)'
  },
  'tertiary-text': {
    background: 'transparent',
    color: 'var(--color-primary)',
    border: '1px solid transparent',
    padding: 0
  }
};
const sizes = {
  md: {
    height: 44,
    padding: '12px 20px'
  },
  lg: {
    height: 56,
    padding: '16px 32px'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  href,
  children,
  style,
  ...rest
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-button-size)',
    lineHeight: 'var(--type-button-lh)',
    fontWeight: 'var(--font-weight-semibold)',
    borderRadius: 'var(--radius-pill)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : undefined,
    ...sizes[size],
    ...variants[variant],
    ...style
  };
  if (disabled && variant === 'primary') {
    base.background = 'var(--color-primary-disabled)';
  }
  if (disabled && variant !== 'primary') {
    base.color = 'var(--color-muted-soft)';
  }
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    style: base,
    disabled: Tag === 'button' ? disabled : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchInput({
  placeholder = 'Search',
  tone = 'light',
  style,
  ...rest
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      height: 44,
      padding: '12px 20px',
      background: dark ? 'var(--color-surface-dark-elevated)' : 'var(--color-surface-strong)',
      borderRadius: 'var(--radius-pill)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: dark ? 'var(--color-on-dark-soft)' : 'var(--color-muted)',
    strokeWidth: "2",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m20 20-3.6-3.6"
  })), /*#__PURE__*/React.createElement("input", _extends({
    placeholder: placeholder,
    style: {
      border: 'none',
      background: 'transparent',
      outline: 'none',
      width: '100%',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-sm-size)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TextInput({
  label,
  id,
  error,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const inputId = id || (label ? 'ti-' + label.replace(/\s+/g, '-').toLowerCase() : undefined);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-sm-size)',
      fontWeight: 'var(--font-weight-semibold)',
      color: 'var(--color-ink)'
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      height: 48,
      padding: '14px 16px',
      width: '100%',
      background: 'var(--color-canvas)',
      color: 'var(--color-ink)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-md-size)',
      borderRadius: 'var(--radius-md)',
      border: focused ? '2px solid var(--color-primary)' : '1px solid ' + (error ? 'var(--color-semantic-down)' : 'var(--color-hairline)'),
      outline: 'none',
      ...style
    }
  }, rest)), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-caption-size)',
      color: 'var(--color-semantic-down)'
    }
  }, error));
}
Object.assign(__ds_scope, { TextInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextInput.jsx", error: String((e && e.message) || e) }); }

// components/marketing/CtaBand.jsx
try { (() => {
function CtaBand({
  tone = 'dark',
  headline,
  subhead,
  actions,
  style
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: dark ? 'var(--color-surface-dark)' : 'var(--color-surface-soft)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)',
      padding: 'var(--space-section) var(--space-lg)',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--font-weight-regular)',
      fontSize: 'var(--type-display-md-size)',
      lineHeight: 'var(--type-display-md-lh)',
      letterSpacing: 'var(--type-display-md-ls)',
      color: 'inherit'
    }
  }, headline), subhead && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-md-size)',
      lineHeight: 'var(--type-body-md-lh)',
      color: dark ? 'var(--color-on-dark-soft)' : 'var(--color-body)'
    }
  }, subhead), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      flexWrap: 'wrap',
      justifyContent: 'center'
    }
  }, actions)));
}
Object.assign(__ds_scope, { CtaBand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/CtaBand.jsx", error: String((e && e.message) || e) }); }

// components/marketing/FeatureCard.jsx
try { (() => {
function FeatureCard({
  glyph,
  title,
  body,
  action,
  tone = 'light',
  style
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: dark ? 'var(--color-surface-dark-elevated)' : 'var(--color-canvas)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)',
      border: dark ? '1px solid rgba(255,255,255,0.06)' : 'var(--border-hairline)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      alignItems: 'flex-start',
      ...style
    }
  }, glyph && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--space-xs)'
    }
  }, glyph), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-md-size)',
      lineHeight: 'var(--type-title-md-lh)',
      fontWeight: 'var(--font-weight-semibold)',
      color: 'inherit'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-md-size)',
      lineHeight: 'var(--type-body-md-lh)',
      color: dark ? 'var(--color-on-dark-soft)' : 'var(--color-body)'
    }
  }, body), action);
}
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/marketing/HeroBand.jsx
try { (() => {
function HeroBand({
  tone = 'dark',
  eyebrow,
  headline,
  subhead,
  actions,
  media,
  style
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: dark ? 'var(--color-surface-dark)' : 'var(--color-canvas)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)',
      padding: 'var(--space-section) var(--space-lg)',
      width: '100%',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: media ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)',
      gap: 'var(--space-xxl)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 'var(--space-lg)'
    }
  }, eyebrow, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--font-weight-regular)',
      fontSize: 'var(--type-display-mega-size)',
      lineHeight: 'var(--type-display-mega-lh)',
      letterSpacing: 'var(--type-display-mega-ls)',
      color: 'inherit',
      margin: 0
    }
  }, headline), subhead && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-md-size)',
      lineHeight: 'var(--type-body-md-lh)',
      color: dark ? 'var(--color-on-dark-soft)' : 'var(--color-body)',
      maxWidth: 460
    }
  }, subhead), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      flexWrap: 'wrap'
    }
  }, actions)), media && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: 320
    }
  }, media)));
}
Object.assign(__ds_scope, { HeroBand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/HeroBand.jsx", error: String((e && e.message) || e) }); }

// components/marketing/PricingTier.jsx
try { (() => {
function PricingTier({
  name,
  price,
  cadence = '/month',
  features = [],
  action,
  featured = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: featured ? 'var(--color-surface-dark)' : 'var(--color-canvas)',
      color: featured ? 'var(--color-on-dark)' : 'var(--color-ink)',
      border: featured ? '1px solid transparent' : 'var(--border-hairline)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-md-size)',
      fontWeight: 'var(--font-weight-semibold)'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--font-weight-regular)',
      fontSize: 'var(--type-display-sm-size)',
      lineHeight: 'var(--type-display-sm-lh)',
      letterSpacing: 'var(--type-display-sm-ls)'
    }
  }, price), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-sm-size)',
      color: featured ? 'var(--color-on-dark-soft)' : 'var(--color-muted)'
    }
  }, cadence))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, features.map(ft => /*#__PURE__*/React.createElement("div", {
    key: ft,
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: featured ? 'var(--color-on-dark)' : 'var(--color-primary)',
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      marginTop: 4,
      flexShrink: 0
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-sm-size)',
      lineHeight: 'var(--type-body-sm-lh)',
      color: featured ? 'var(--color-on-dark-soft)' : 'var(--color-body)'
    }
  }, ft)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto'
    }
  }, action));
}
Object.assign(__ds_scope, { PricingTier });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/PricingTier.jsx", error: String((e && e.message) || e) }); }

// components/marketing/ProductUiCard.jsx
try { (() => {
function ProductUiCard({
  tone = 'dark',
  title,
  meta,
  children,
  rotate = 0,
  width,
  style
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: dark ? 'var(--color-surface-dark-elevated)' : 'var(--color-canvas)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)',
      border: dark ? '1px solid rgba(255,255,255,0.06)' : 'var(--border-hairline)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)',
      width,
      transform: rotate ? 'rotate(' + rotate + 'deg)' : undefined,
      boxShadow: 'var(--shadow-soft)',
      ...style
    }
  }, (title || meta) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 'var(--space-base)',
      marginBottom: 'var(--space-lg)'
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-md-size)',
      lineHeight: 'var(--type-title-md-lh)',
      fontWeight: 'var(--font-weight-semibold)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--type-number-display-size)',
      fontWeight: 'var(--font-weight-medium)',
      color: dark ? 'var(--color-on-dark-soft)' : 'var(--color-body)'
    }
  }, meta)), children);
}
Object.assign(__ds_scope, { ProductUiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/ProductUiCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SiteFooter.jsx
try { (() => {
const defaultColumns = [{
  title: 'Company',
  links: ['About', 'Careers', 'Newsroom', 'Investors']
}, {
  title: 'Individuals',
  links: ['Buy & sell', 'Wealth', 'Card', 'Earn']
}, {
  title: 'Businesses',
  links: ['Payments', 'Custody', 'Prime', 'Treasury']
}, {
  title: 'Developers',
  links: ['Docs', 'APIs', 'Status', 'SDKs']
}, {
  title: 'Learn',
  links: ['Guides', 'Glossary', 'Market updates', 'Research']
}, {
  title: 'Support',
  links: ['Help centre', 'Contact', 'Security', 'Legal']
}];
function SiteFooter({
  brand = 'finsight',
  columns = defaultColumns,
  legal = '© 2026 Finsight Financial Ltd. All rights reserved.',
  style
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--color-canvas)',
      padding: 'var(--space-section) var(--space-lg) var(--space-xxl)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, minmax(0,1fr))',
      gap: 'var(--space-xl)'
    }
  }, columns.map(col => /*#__PURE__*/React.createElement("div", {
    key: col.title,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-sm-size)',
      fontWeight: 'var(--font-weight-semibold)',
      color: 'var(--color-ink)'
    }
  }, col.title), col.links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-sm-size)',
      lineHeight: 'var(--type-body-sm-lh)',
      color: 'var(--color-body)',
      textDecoration: 'none'
    }
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-section)',
      paddingTop: 'var(--space-lg)',
      borderTop: 'var(--border-hairline)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 20,
      fontWeight: 'var(--font-weight-semibold)',
      letterSpacing: '-0.4px',
      color: 'var(--color-primary)'
    }
  }, brand), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-caption-size)',
      color: 'var(--color-muted)'
    }
  }, legal))));
}
Object.assign(__ds_scope, { SiteFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
function TopNav({
  brand = 'finsight',
  links = ['Cryptocurrencies', 'Individuals', 'Businesses', 'Institutions', 'Developers', 'Company'],
  tone = 'light',
  activeLink,
  onLinkClick,
  style
}) {
  const dark = tone === 'on-dark';
  const ink = dark ? 'var(--color-on-dark)' : 'var(--color-ink)';
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 'var(--nav-height)',
      background: dark ? 'var(--color-surface-dark)' : 'var(--color-canvas)',
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      ...style
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      maxWidth: 'var(--container-max)',
      width: '100%',
      margin: '0 auto',
      padding: '0 var(--space-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 'var(--font-weight-semibold)',
      letterSpacing: '-0.5px',
      color: 'var(--color-primary)'
    }
  }, brand), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onLinkClick && onLinkClick(l);
    },
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-nav-link-size)',
      lineHeight: 'var(--type-nav-link-lh)',
      fontWeight: 'var(--font-weight-medium)',
      textDecoration: 'none',
      color: activeLink === l ? 'var(--color-primary)' : ink
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-base)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-nav-link-size)',
      fontWeight: 'var(--font-weight-medium)',
      color: ink,
      textDecoration: 'none'
    }
  }, "Sign in"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    size: "md",
    style: {
      height: 40,
      padding: '10px 18px'
    }
  }, "Sign up"))));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// components/trading/AssetIcon.jsx
try { (() => {
function AssetIcon({
  symbol,
  color,
  size = 32,
  tone = 'light',
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-full)',
      flexShrink: 0,
      background: color || (tone === 'dark' ? 'var(--color-surface-dark-elevated)' : 'var(--color-surface-strong)'),
      color: color ? 'var(--color-on-primary)' : tone === 'dark' ? 'var(--color-on-dark)' : 'var(--color-ink)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontSize: Math.round(size * 0.4),
      fontWeight: 'var(--font-weight-semibold)',
      ...style
    }
  }, symbol);
}
Object.assign(__ds_scope, { AssetIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trading/AssetIcon.jsx", error: String((e && e.message) || e) }); }

// components/trading/PriceCell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PriceCell({
  value,
  direction,
  style,
  ...rest
}) {
  const dir = direction || (typeof value === 'number' ? value >= 0 ? 'up' : 'down' : 'up');
  const text = typeof value === 'number' ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%' : value;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--type-number-display-size)',
      lineHeight: 'var(--type-number-display-lh)',
      fontWeight: 'var(--font-weight-medium)',
      fontVariantNumeric: 'tabular-nums',
      color: dir === 'up' ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)',
      background: 'transparent',
      ...style
    }
  }, rest), text);
}
Object.assign(__ds_scope, { PriceCell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trading/PriceCell.jsx", error: String((e && e.message) || e) }); }

// components/trading/AssetRow.jsx
try { (() => {
function AssetRow({
  name,
  ticker,
  price,
  change,
  glyph,
  glyphColor,
  tone = 'light',
  divider = true,
  onClick,
  style
}) {
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) auto auto',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      padding: 'var(--space-xs) 0',
      minHeight: 48,
      borderBottom: divider ? dark ? '1px solid rgba(255,255,255,0.08)' : 'var(--border-hairline)' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      background: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.AssetIcon, {
    symbol: glyph || (name || '?').slice(0, 1),
    color: glyphColor,
    tone: tone
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-title-md-size)',
      lineHeight: 'var(--type-title-md-lh)',
      fontWeight: 'var(--font-weight-semibold)',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-body-sm-size)',
      color: dark ? 'var(--color-on-dark-soft)' : 'var(--color-muted)'
    }
  }, ticker))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--type-number-display-size)',
      fontWeight: 'var(--font-weight-medium)',
      fontVariantNumeric: 'tabular-nums',
      color: dark ? 'var(--color-on-dark)' : 'var(--color-ink)'
    }
  }, price), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 76,
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PriceCell, {
    value: change
  })));
}
Object.assign(__ds_scope, { AssetRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trading/AssetRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-site/DeveloperScreen.jsx
try { (() => {
const {
  HeroBand,
  Button,
  BadgePill,
  PricingTier,
  FeatureCard,
  CtaBand
} = window.FinsightDesignSystem_43073c;
const {
  Section
} = window;
function DeveloperScreen() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(HeroBand, {
    tone: "dark",
    eyebrow: /*#__PURE__*/React.createElement(BadgePill, {
      tone: "dark"
    }, "Developer platform"),
    headline: "APIs for regulated finance",
    subhead: "Market data, custody and settlement behind one set of keys.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      size: "lg"
    }, "Read the docs"), /*#__PURE__*/React.createElement(Button, {
      size: "lg",
      variant: "secondary-dark"
    }, "Get API keys")),
    media: /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--color-surface-dark-elevated)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-xl)',
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        lineHeight: 1.7,
        color: 'var(--color-on-dark-soft)'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--color-primary)'
      }
    }, "GET"), " /v1/prices/BTC-USD"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12,
        color: 'var(--color-on-dark)'
      }
    }, '{'), /*#__PURE__*/React.createElement("div", null, "\xA0\xA0\"price\": ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--color-semantic-up)'
      }
    }, "\"64120.00\""), ","), /*#__PURE__*/React.createElement("div", null, "\xA0\xA0\"change_24h\": ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--color-semantic-up)'
      }
    }, "\"2.14\"")), /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--color-on-dark)'
      }
    }, '}'))
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(PricingTier, {
    name: "Build",
    price: "$0",
    features: ['10,000 requests / month', 'Sandbox keys', 'Community support'],
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary-light",
      fullWidth: true
    }, "Start free")
  }), /*#__PURE__*/React.createElement(PricingTier, {
    name: "Grow",
    price: "$149",
    features: ['1M requests / month', 'Webhooks', 'Email support'],
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary-light",
      fullWidth: true
    }, "Choose Grow")
  }), /*#__PURE__*/React.createElement(PricingTier, {
    featured: true,
    name: "Scale",
    price: "$499",
    features: ['5M requests / month', '99.99% uptime SLA', 'Named solutions engineer', 'Custody API access'],
    action: /*#__PURE__*/React.createElement(Button, {
      fullWidth: true
    }, "Contact sales")
  }))), /*#__PURE__*/React.createElement(Section, {
    tone: "soft"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Market data",
    body: "Sub-second quotes across every listed pair, REST and WebSocket."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Custody",
    body: "Programmatic access to segregated wallets with policy-based approvals."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Settlement",
    body: "Fiat rails in seven currencies with same-day settlement windows."
  }))), /*#__PURE__*/React.createElement(CtaBand, {
    tone: "dark",
    headline: "Start building today",
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "lg"
    }, "Get API keys")
  }));
}
Object.assign(window, {
  DeveloperScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/DeveloperScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-site/ExploreScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  HeroBand,
  Button,
  BadgePill,
  AssetRow,
  SearchInput,
  ProductUiCard
} = window.FinsightDesignSystem_43073c;
const {
  Section
} = window;
const assets = [{
  name: 'Bitcoin',
  ticker: 'BTC',
  glyph: 'B',
  glyphColor: 'var(--color-accent-yellow)',
  price: '$64,120.00',
  change: 2.14
}, {
  name: 'Ethereum',
  ticker: 'ETH',
  glyph: 'E',
  price: '$3,180.42',
  change: -0.87
}, {
  name: 'Solana',
  ticker: 'SOL',
  glyph: 'S',
  price: '$142.09',
  change: 5.03
}, {
  name: 'Cardano',
  ticker: 'ADA',
  glyph: 'A',
  price: '$0.61',
  change: 1.42
}, {
  name: 'Chainlink',
  ticker: 'LINK',
  glyph: 'L',
  price: '$17.88',
  change: -2.31
}, {
  name: 'Polygon',
  ticker: 'POL',
  glyph: 'P',
  price: '$0.48',
  change: 0.94
}];
function ExploreScreen() {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(assets[0]);
  const shown = assets.filter(a => (a.name + a.ticker).toLowerCase().includes(query.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(HeroBand, {
    tone: "light",
    eyebrow: /*#__PURE__*/React.createElement(BadgePill, null, "Markets"),
    headline: "Explore assets",
    subhead: "Live prices across every market we support.",
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "lg"
    }, "Get started")
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
      gap: 'var(--space-xxl)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(SearchInput, {
    placeholder: "Search assets",
    value: query,
    onChange: e => setQuery(e.target.value)
  }), /*#__PURE__*/React.createElement("div", null, shown.map((a, i) => /*#__PURE__*/React.createElement(AssetRow, _extends({
    key: a.ticker
  }, a, {
    divider: i < shown.length - 1,
    onClick: () => setSelected(a)
  }))), shown.length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      padding: 'var(--space-lg) 0',
      color: 'var(--color-muted)'
    }
  }, "No assets match \"", query, "\"."))), /*#__PURE__*/React.createElement(ProductUiCard, {
    tone: "light",
    title: selected.name,
    meta: selected.price
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 6,
      height: 120,
      marginBottom: 'var(--space-lg)'
    }
  }, [42, 66, 51, 88, 70, 104, 92, 118].map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: h,
      borderRadius: 'var(--radius-xs)',
      background: i === 7 ? 'var(--color-primary)' : 'var(--color-surface-strong)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      paddingTop: 'var(--space-sm)',
      borderTop: 'var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--type-body-sm-size)',
      color: 'var(--color-muted)'
    }
  }, "24h change"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--type-number-display-size)',
      fontWeight: 500,
      color: selected.change >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)'
    }
  }, (selected.change >= 0 ? '+' : '') + selected.change.toFixed(2), "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-lg)',
      display: 'flex',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    fullWidth: true
  }, "Buy ", selected.ticker), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary-light",
    fullWidth: true
  }, "Sell"))))));
}
Object.assign(window, {
  ExploreScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/ExploreScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-site/HomeScreen.jsx
try { (() => {
const {
  HeroBand,
  ProductUiCard,
  FeatureCard,
  CtaBand,
  Button,
  BadgePill,
  AssetRow
} = window.FinsightDesignSystem_43073c;
function MockStack() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(ProductUiCard, {
    tone: "dark",
    title: "Portfolio",
    meta: "$48,204.11"
  }, /*#__PURE__*/React.createElement(AssetRow, {
    tone: "dark",
    name: "Bitcoin",
    ticker: "BTC",
    glyph: "B",
    glyphColor: "var(--color-accent-yellow)",
    price: "$64,120.00",
    change: 2.14
  }), /*#__PURE__*/React.createElement(AssetRow, {
    tone: "dark",
    name: "Ethereum",
    ticker: "ETH",
    glyph: "E",
    price: "$3,180.42",
    change: -0.87
  }), /*#__PURE__*/React.createElement(AssetRow, {
    tone: "dark",
    name: "Solana",
    ticker: "SOL",
    glyph: "S",
    price: "$142.09",
    change: 5.03,
    divider: false
  })), /*#__PURE__*/React.createElement(ProductUiCard, {
    tone: "dark",
    rotate: -5,
    width: 240,
    title: "24h change",
    meta: "+1.9%",
    style: {
      position: 'absolute',
      bottom: -56,
      left: -56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      height: 48
    }
  }, [38, 22, 46, 30, 54, 41, 62].map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: h,
      borderRadius: 'var(--radius-xs)',
      background: i === 6 ? 'var(--color-primary)' : 'rgba(255,255,255,0.14)'
    }
  })))));
}
function Section({
  tone = 'canvas',
  children
}) {
  const bg = tone === 'soft' ? 'var(--color-surface-soft)' : 'var(--color-canvas)';
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: bg,
      padding: 'var(--space-section) var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, children));
}
function HomeScreen({
  onExplore
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(HeroBand, {
    tone: "dark",
    eyebrow: /*#__PURE__*/React.createElement(BadgePill, {
      tone: "dark"
    }, "Regulated"),
    headline: "Take control of your money",
    subhead: "Buy, sell and hold digital assets on an exchange built to institutional standards.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      size: "lg"
    }, "Get started"), /*#__PURE__*/React.createElement(Button, {
      size: "lg",
      variant: "outline-on-dark",
      onClick: onExplore
    }, "Explore assets")),
    media: /*#__PURE__*/React.createElement(MockStack, null)
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      gap: 'var(--space-xxl)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 400,
      fontSize: 'var(--type-display-lg-size)',
      lineHeight: 'var(--type-display-lg-lh)',
      letterSpacing: 'var(--type-display-lg-ls)'
    }
  }, "A single account for every market"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 'var(--type-body-md-size)',
      lineHeight: 1.5,
      color: 'var(--color-body)',
      maxWidth: 460
    }
  }, "Trade over 240 assets, move funds in your own currency, and settle in minutes. One balance, one statement, one set of controls."), /*#__PURE__*/React.createElement(Button, {
    variant: "tertiary-text",
    onClick: onExplore
  }, "See all assets")), /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--border-hairline)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement(AssetRow, {
    name: "Bitcoin",
    ticker: "BTC",
    glyph: "B",
    glyphColor: "var(--color-accent-yellow)",
    price: "$64,120.00",
    change: 2.14
  }), /*#__PURE__*/React.createElement(AssetRow, {
    name: "Ethereum",
    ticker: "ETH",
    glyph: "E",
    price: "$3,180.42",
    change: -0.87
  }), /*#__PURE__*/React.createElement(AssetRow, {
    name: "Cardano",
    ticker: "ADA",
    glyph: "A",
    price: "$0.61",
    change: 1.42,
    divider: false
  })))), /*#__PURE__*/React.createElement(Section, {
    tone: "soft"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 400,
      fontSize: 'var(--type-display-lg-size)',
      lineHeight: 1,
      letterSpacing: 'var(--type-display-lg-ls)',
      maxWidth: 620
    }
  }, "Built for the people who audit us"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Institutional custody",
    body: "Segregated cold storage with independently audited controls and proof of reserves.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "tertiary-text"
    }, "Learn more")
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Transparent pricing",
    body: "One published fee schedule. No spread markup, no payment for order flow.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "tertiary-text"
    }, "See fees")
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    title: "Regulated in seven markets",
    body: "Licensed as a payment institution and virtual asset service provider.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "tertiary-text"
    }, "Read our licences")
  })))), /*#__PURE__*/React.createElement(CtaBand, {
    headline: "Take control of your money",
    subhead: "Open an account in minutes.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      size: "lg"
    }, "Get started"), /*#__PURE__*/React.createElement(Button, {
      size: "lg",
      variant: "outline-on-dark"
    }, "Talk to sales"))
  }));
}
Object.assign(window, {
  HomeScreen,
  MockStack,
  Section
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing-site/SignUpScreen.jsx
try { (() => {
const {
  Button,
  TextInput,
  BadgePill,
  ProductUiCard,
  AssetRow
} = window.FinsightDesignSystem_43073c;
function SignUpScreen({
  onDone
}) {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const valid = /.+@.+\..+/.test(email);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      minHeight: 620
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-section) var(--space-xxl)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 'var(--space-lg)',
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement(BadgePill, null, "Create account"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 400,
      fontSize: 'var(--type-display-lg-size)',
      lineHeight: 1,
      letterSpacing: 'var(--type-display-lg-ls)'
    }
  }, "Open an account"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--color-body)'
    }
  }, "Verification takes about three minutes. You will need a government ID."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-base)'
    }
  }, /*#__PURE__*/React.createElement(TextInput, {
    label: "Email",
    placeholder: "you@company.com",
    value: email,
    onChange: e => {
      setEmail(e.target.value);
      setSubmitted(false);
    },
    error: submitted && !valid ? 'Enter a valid email address' : undefined
  }), /*#__PURE__*/React.createElement(TextInput, {
    label: "Password",
    type: "password",
    placeholder: "At least 12 characters"
  }), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    onClick: () => {
      setSubmitted(true);
      if (valid && onDone) onDone();
    }
  }, "Create account"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--type-caption-size)',
      color: 'var(--color-muted)'
    }
  }, "By continuing you agree to the User Agreement and Privacy Policy."))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-surface-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement(ProductUiCard, {
    tone: "dark",
    title: "Your portfolio",
    meta: "$0.00",
    width: 360
  }, /*#__PURE__*/React.createElement(AssetRow, {
    tone: "dark",
    name: "Bitcoin",
    ticker: "BTC",
    glyph: "B",
    glyphColor: "var(--color-accent-yellow)",
    price: "$64,120.00",
    change: 2.14
  }), /*#__PURE__*/React.createElement(AssetRow, {
    tone: "dark",
    name: "Ethereum",
    ticker: "ETH",
    glyph: "E",
    price: "$3,180.42",
    change: -0.87,
    divider: false
  }))));
}
Object.assign(window, {
  SignUpScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing-site/SignUpScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BadgePill = __ds_scope.BadgePill;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.CtaBand = __ds_scope.CtaBand;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.HeroBand = __ds_scope.HeroBand;

__ds_ns.PricingTier = __ds_scope.PricingTier;

__ds_ns.ProductUiCard = __ds_scope.ProductUiCard;

__ds_ns.SiteFooter = __ds_scope.SiteFooter;

__ds_ns.TopNav = __ds_scope.TopNav;

__ds_ns.AssetIcon = __ds_scope.AssetIcon;

__ds_ns.AssetRow = __ds_scope.AssetRow;

__ds_ns.PriceCell = __ds_scope.PriceCell;

})();

