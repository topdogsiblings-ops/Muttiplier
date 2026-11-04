// Kreate's look, as plain values with no framework attached, so other tools can match it.
// app.config.ts reads the colours from here. main.css holds the chart colours and surfaces as CSS
// (tests/tokens.test.ts keeps them in step).

/** Nuxt UI colour names. The primary's shades (tints like bg-primary/10) are the neutral greys. */
export const colors = {
  primary: 'stone',
  neutral: 'stone'
} as const

/**
 * The primary colour itself: white, on a dark page; black on a light one, where white wouldn't
 * show. Set as --ui-primary in main.css (Nuxt UI has no white scale for app.config).
 */
export const primary = {
  light: '#0c0a09',
  dark: '#ffffff'
} as const

/** page backgrounds */
export const surface = {
  light: '#ffffff',
  dark: '#1c1917'
} as const

/**
 * Categorical chart colours, in a fixed order (assigned by position, never by rank). Slots 1-3 are
 * validated for colour-blind separation against the surfaces; light slot 3 is under 3:1, so every
 * chart also shows its values as text.
 */
export const chart = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
} as const
