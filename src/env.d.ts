/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface Window {
  theme: {
    themeValue: string;
    getTheme: () => string;
    setTheme: (val: string) => void;
    setPreference?: () => void;
    reflectPreference?: () => void;
  };
  msAdsQueue: Array<(fn: () => void) => void>;
}
