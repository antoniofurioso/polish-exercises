/**
 * The appearance choice from Settings. Plain constants, no React: app/layout.tsx
 * (a server component) builds its before-paint script from them, and
 * lib/storage.ts stores the choice under the same key.
 */
export const THEME_KEY = "polish.theme.v1";

export type Theme = "system" | "light" | "dark";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];
