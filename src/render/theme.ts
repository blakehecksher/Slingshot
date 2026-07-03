// Slingshot UI theme tokens.
// Single source of truth for menu/HUD colors, typography, spacing, and shared
// surface treatments. Tweak values here to retune the whole game UI.
//
// CSS variables emitted on :root and consumed by all scene styles.

export const THEME_CSS = `
:root {
  /* ---- Color: surfaces ---------------------------------------------- */
  --c-bg-0: #07060a;             /* deepest backdrop (behind everything) */
  --c-bg-1: #0c0a07;             /* base panel background */
  --c-bg-2: #110e09;             /* raised panel / section background */
  --c-bg-3: #1a1410;             /* selected row / hover */
  --c-bg-4: #1e1508;             /* highlight stripe for "me" rows */
  --c-bg-overlay: rgba(7, 6, 10, 0.78);

  /* ---- Color: text -------------------------------------------------- */
  --c-text: #ede3cc;
  --c-text-strong: #fff8e8;
  --c-text-dim: #c8c3b7;
  --c-text-muted: #6e6250;
  --c-text-faint: #3e3428;

  /* ---- Color: accents ---------------------------------------------- */
  --c-accent: #d4921f;           /* amber primary */
  --c-accent-bright: #f0b33d;
  --c-accent-deep: #9b6614;
  --c-teal: #2a8c80;             /* league teal */
  --c-teal-bright: #79e1d6;
  --c-warn: #f28f45;
  --c-danger: #9b4232;
  --c-good: #5dff9a;

  /* ---- Borders ----------------------------------------------------- */
  --c-border: #272010;
  --c-border-soft: #1c170f;
  --c-border-strong: #3e3428;
  --c-border-accent: var(--c-accent);
  --c-border-teal: rgba(121, 225, 214, 0.34);

  /* ---- Typography -------------------------------------------------- */
  --font-display: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
  --font-numeric: Orbitron, "Arial Black", system-ui, sans-serif;

  --fs-micro: 10px;
  --fs-mini: 11px;
  --fs-small: 12px;
  --fs-body: 13px;
  --fs-md: 15px;
  --fs-lg: 18px;
  --fs-xl: 24px;
  --fs-display: clamp(28px, 4.2vw, 48px);
  --fs-hero: clamp(42px, 8vw, 84px);

  --ls-label: 0.18em;            /* uppercase eyebrow labels */
  --ls-button: 0.1em;
  --ls-tight: 0.04em;

  --fw-text: 400;
  --fw-bold: 700;
  --fw-heavy: 900;

  /* ---- Spacing ----------------------------------------------------- */
  --sp-1: 4px;
  --sp-2: 6px;
  --sp-3: 8px;
  --sp-4: 10px;
  --sp-5: 12px;
  --sp-6: 14px;
  --sp-7: 18px;
  --sp-8: 22px;
  --sp-9: 28px;

  --radius: 0px;                  /* hard-edge claim-board feel */
  --border-w: 1px;
  --border-w-strong: 2px;

  /* ---- Effects ---------------------------------------------------- */
  --shadow-panel: 0 24px 90px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(237, 227, 204, 0.04);
  --scanlines: repeating-linear-gradient(0deg,
    rgba(212, 146, 31, 0.02),
    rgba(212, 146, 31, 0.02) 1px,
    transparent 1px,
    transparent 5px);
}
`;
