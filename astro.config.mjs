// astro.config.mjs
// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // D-02:, D-03:: production URL is https://jintekllc.github.io/real-world-cryptography/
  site: 'https://jintekllc.github.io',
  base: '/real-world-cryptography',
  trailingSlash: 'always',
  output: 'static',

  // Phase 1 has zero islands shipped, but Svelte must be wired now so Phase 4
  // does not re-touch astro.config.mjs.
  integrations: [
    svelte(),
  ],

  vite: {
    plugins: [
      tailwindcss(), // Tailwind v4 Vite plugin (D-15:); legacy Astro integration is forbidden — Pitfall P1.5.
    ],
    resolve: {
      // D-22:: path alias ~/* -> src/*
      alias: {
        '~': new URL('./src', import.meta.url).pathname,
      },
    },
  },

  // D-15:: Astro 6 first-party Fonts API + Fontsource provider.
  // provider is invoked as a FUNCTION CALL — the bare-string form from
  // older guides is incorrect; verified against
  // https://docs.astro.build/en/guides/fonts/.
  // D-10:: JetBrains Mono is the single mono font for the site.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      // JetBrains Mono Variable — full weight range. UI-SPEC uses 400 + 600.
      // The variable file ships every weight in one payload, so this is one woff2.
      weights: ['100 800'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
