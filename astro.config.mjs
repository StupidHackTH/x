// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Allow the dev server to be reached through the ngrok tunnel and over Tailscale (MagicDNS names; IPs are always allowed)
      allowedHosts: ['desmotropic-unsmirkingly-nguyet.ngrok-free.dev', '.ngrok-free.dev', '.ts.net'],
    },
  },
});
