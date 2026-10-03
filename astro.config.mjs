// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// Deploy target. GitHub Pages serves the site from https://stupid.hackathon.in.th/x/, so the workflow
// (.github/workflows/deploy.yml) builds with BASE_PATH=/x. Local dev and a custom domain serve from the root.
// Everything that links into public/ goes through src/lib/asset.ts so both work.
const base = process.env.BASE_PATH || '/';
const site = process.env.SITE_URL || 'https://stupid.hackathon.in.th';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Allow the dev server to be reached through the ngrok tunnel and over Tailscale (MagicDNS names; IPs are always allowed)
      allowedHosts: ['desmotropic-unsmirkingly-nguyet.ngrok-free.dev', '.ngrok-free.dev', '.ts.net'],
    },
  },
});
