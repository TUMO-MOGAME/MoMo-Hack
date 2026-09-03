/**
 * Light and dark, with dark as the default.
 *
 * ── WHY THERE IS A SCRIPT AND NOT JUST A `useEffect` ─────────────────────────
 *
 * A theme read in an effect is a theme applied AFTER first paint. The browser
 * shows the default for one frame, then repaints — a white flash on the way
 * into a dark app, at full brightness, on a phone, at a taxi rank at night.
 * That is not a polish issue: it is the most physically unpleasant bug a dark
 * interface can have, and no amount of CSS fixes it, because the HTML has to
 * carry the answer before the first frame is drawn.
 *
 * So `THEME_BOOTSTRAP` runs synchronously in `<head>`, before anything renders,
 * and stamps the class on `<html>` itself.
 *
 * ── AND WHY IT IS A TEXT CHILD, NOT `dangerouslySetInnerHTML` ────────────────
 *
 * React 19 renders a single string child on `<script>` verbatim, so the prop
 * buys nothing here. It was used first, and CI rejected it: the money guard
 * bans `dangerouslySetInnerHTML` across ALL of `src`, while CLAUDE.md #12 only
 * names the artifact path. The guard is deliberately broader than the rule,
 * and that is worth keeping — an exception carved into a money guard to fix a
 * theme flash is an exception the next person widens. The prop was removed
 * rather than the guard narrowed.
 *
 * Because React does not escape a `<script>` text child — it must not, or the
 * code would break — this constant is itself the safety boundary. It is a
 * frozen literal with no interpolation and never sees user or model input.
 * `tests/unit/design/theme-bootstrap.test.ts` asserts both halves: that the
 * rendered element is not empty, and that nothing in here could close it early.
 *
 * ── THE DEFAULT IS DARK, AND FAILURE FALLS TO DARK ───────────────────────────
 *
 * Private windows, cleared site data and browsers that throw on `localStorage`
 * all end up in the `catch`, and the `catch` chooses dark — the same thing an
 * unconfigured visitor gets, so a storage failure is invisible rather than a
 * surprise flash of the other theme.
 */

export const THEME_STORAGE_KEY = 'momo-kasi-theme';

export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'dark';

/**
 * Runs before first paint. Keep it small, synchronous, and dependency-free —
 * everything in here blocks rendering by design.
 *
 * It reads an explicit choice first and only then falls back. `prefers-color-
 * scheme` is deliberately NOT consulted: this app defaults to dark for everyone
 * and lets a person say otherwise, rather than leaving which theme appears on a
 * projector to whatever the presenting laptop happens to be set to.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='${DEFAULT_THEME}';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}})();`;

/** The theme currently stamped on `<html>`. Safe to call before hydration. */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Apply a theme and remember it.
 *
 * `colorScheme` is set alongside the class so that form controls, scrollbars
 * and the browser's own UA styles follow — without it a dark page keeps white
 * scrollbars and a light-styled date picker, which reads as a half-finished
 * theme rather than a deliberate one.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A private window or blocked site data. The theme still applies for this
    // page view; it just will not be remembered. Failing to persist a
    // preference must never stop the preference taking effect.
  }
}
