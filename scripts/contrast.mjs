/**
 * `npm run contrast` — the measured half of A3.
 *
 * WHY THIS EXISTS. The A3 overlay says contrast below 4.5:1 is not a
 * technicality for this product: the user is on a cracked screen in direct
 * Highveld sunlight, and an unreadable balance is a person who cannot check
 * their money. A judgement that serious should not rest on anyone's eye, and
 * "looks fine on my monitor" is how a dark theme passes review and fails
 * outside.
 *
 * So this converts the real tokens — OKLCH, including the alpha-composited
 * `--border`, `--input` and `--ring` — through sRGB to WCAG relative luminance,
 * and prints the ratio against the threshold that applies. Alpha matters: a
 * token like `oklch(1 0 0 / 12%)` is meaningless until it is composited over
 * the surface behind it, and that composite is what the eye receives.
 *
 * It found two real failures at PHASE-3-A3 (`--input` at 1.39:1, `--ring` at
 * 2.98:1 on cards) that no amount of looking had found in four sessions.
 *
 * Colour maths: Björn Ottosson's oklab. Thresholds: WCAG 2.2 SC 1.4.3 (4.5:1
 * for normal text) and SC 1.4.11 (3:1 for the boundary of a control).
 *
 * KEEP THE VALUES BELOW IN STEP WITH `src/app/globals.css`. They are typed out
 * rather than parsed because the parse is the part that would silently go
 * wrong — and it did, once: the first version of this audit's comparison script
 * matched the LIGHT scale against the dark CSS block and confidently reported
 * 30 drifted tokens that had not drifted. See A2-01 for the real fix, which is
 * to generate the CSS from the tokens so neither copy can be read wrongly.
 */

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, c));
  };
  return [enc(r), enc(g), enc(bl)];
}

function luminance([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Alpha-composite fg over bg in sRGB (what the browser actually paints).
function over(fg, bg, alpha) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const T = {
  background: oklchToSrgb(0, 0, 0),
  foreground: oklchToSrgb(1, 0, 0),
  card: oklchToSrgb(0.08, 0, 0),
  secondary: oklchToSrgb(0.14, 0, 0),
  secondaryFg: oklchToSrgb(1, 0, 0),
  muted: oklchToSrgb(0.12, 0, 0),
  mutedFg: oklchToSrgb(0.72, 0, 0),
  brand: oklchToSrgb(0.862, 0.176, 90.5),
  brandFg: oklchToSrgb(0, 0, 0),
  brandAccent: oklchToSrgb(0.78, 0.183, 55.934),
  destructive: oklchToSrgb(0.704, 0.191, 22.216),
  success: oklchToSrgb(0.765, 0.177, 163.223),
  warning: oklchToSrgb(0.828, 0.189, 84.429),
};

// border/input/ring are white at low alpha, composited over the background.
const white = oklchToSrgb(1, 0, 0);
T.border = over(white, T.background, 0.12);
T.input = over(white, T.background, 0.15);
T.ring = over(white, T.background, 0.35);
T.borderOnCard = over(white, T.card, 0.12);

const TEXT = [
  ['foreground on background', 'foreground', 'background', 4.5],
  ['foreground on card', 'foreground', 'card', 4.5],
  ['muted-foreground on background', 'mutedFg', 'background', 4.5],
  ['muted-foreground on card', 'mutedFg', 'card', 4.5],
  ['muted-foreground on muted', 'mutedFg', 'muted', 4.5],
  ['muted-foreground on secondary', 'mutedFg', 'secondary', 4.5],
  ['secondary-foreground on secondary', 'secondaryFg', 'secondary', 4.5],
  ['brand on background (wordmark)', 'brand', 'background', 4.5],
  ['brand-foreground on brand (button)', 'brandFg', 'brand', 4.5],
  ['brand-accent on background', 'brandAccent', 'background', 4.5],
  ['destructive on background', 'destructive', 'background', 4.5],
  ['success on background', 'success', 'background', 4.5],
  ['warning on background', 'warning', 'background', 4.5],
];

const UI = [
  ['border on background', 'border', 'background', 3.0],
  ['border on card', 'borderOnCard', 'card', 3.0],
  ['input on background', 'input', 'background', 3.0],
  ['ring on background (focus)', 'ring', 'background', 3.0],
  ['ring on card (focus)', 'ring', 'card', 3.0],
];

const fmt = (n) => n.toFixed(2).padStart(6);
const row = (label, fg, bg, need) => {
  const r = ratio(T[fg], T[bg]);
  const ok = r >= need;
  return `${ok ? 'PASS' : 'FAIL'}  ${fmt(r)}:1  (needs ${need})  ${label}`;
};

console.log('--- WCAG 2.2 AA · normal text (>= 4.5:1) · DARK THEME (the only shipped theme) ---');
for (const [l, f, b, n] of TEXT) console.log(row(l, f, b, n));
console.log('\n--- Non-text contrast, SC 1.4.11 (>= 3:1) ---');
for (const [l, f, b, n] of UI) console.log(row(l, f, b, n));
