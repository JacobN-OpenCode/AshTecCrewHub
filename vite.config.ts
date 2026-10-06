import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const srcDir = path.resolve(__dirname, './src');
const pkgDir = path.resolve(__dirname, './packages/components');
const serverDir = path.resolve(__dirname, './server');

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const pkgDeps = Object.keys(pkg.dependencies)
  // Need to exclude @tiptap/pm from optimization, since it doesn't have a top level entry point
  .filter((dep) => dep !== '@tiptap/pm');

/**
 * Vite's main focus is on startup speed, so it doesn't check your package.json to see which dependencies you have at startup.
 * When it spots a file that imports a dependency, it optimizes that dependency on the fly and reloads the page. If I use something
 * that relies on another dependency, like lucide-react depending on react, it can't optimize lucide before optimizing
 * react because it hasn't seen lucide yet.
 *
 * This works fine in local development because it sends the websocket events quickly. But I noticed that when there's a decent gap
 * between the HMR update event and the HMR full-reload event (~500ms), it tries to use the new dependencies before the page reloads.
 * React throws an "invalid hook call" error in this case because the app is now rendering with two different versions of react in
 * play--the version that was just optimized and the version from the previous pass.
 *
 * So we force Vite to optimize all dependencies upfront at startup. Since we have so few dependencies, the impact on startup
 * speed is minimal.
 *
 * Belt-and-braces: we also explicitly include `react-dom` (bare) and `react-dom/server` so that subpath imports
 * pulled in by other deps (e.g. SSR-aware libraries, error boundaries) don't trigger a separate re-optimization
 * pass for react-dom, which would land them on a different `?v=` hash than react/react-dom and cause the "two versions
 * of React" race described above.
 */
const deps = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
  ...pkgDeps,
]);

/**
 * Where the Express API + scheduler listens. Defaults to the same 1502 the
 * production server uses, so `PORT` only has to be set when deliberately
 * running the API somewhere else. This file cannot read `.env` (Vite only
 * exposes VITE_-prefixed values, and `loadEnv` runs later), so both sides
 * share this default rather than each having their own idea of it.
 */
const API_PORT = Number(process.env.PORT ?? 1502);

export default defineConfig({
  build: { target: 'esnext', sourcemap: false, reportCompressedSize: false },
  server: {
    host: '::',
    port: 8080,
    proxy: {
      // The browser only ever talks to one origin, so the session cookie set by
      // the API is first-party and no CORS/SameSite=None handling is needed.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/healthz': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      // The subscribe-to-calendar feed is served by Express, not Vite, so it
      // needs forwarding in dev or Vite answers with the SPA shell.
      '/calendar.ics': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
    hmr: {
      overlay: false,
    },
  },
  optimizeDeps: {
    include: [...deps],
    // Crawl every source file at startup so Vite discovers all imported deps
    // upfront and includes them in the initial pre-bundle pass. By default Vite
    // only scans entries reachable from `index.html`; deps imported only in
    // lazily-loaded routes or via dynamic imports get optimized later, which
    // splits them onto different `?v=` hashes than react/react-dom and triggers
    // the "two versions of React" race described above.
    entries: ['index.html', 'src/**/*.{ts,tsx,js,jsx}'],
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    // Regex form so `@/` cannot accidentally capture `@project/components/`.
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^@project\/components\//, replacement: `${pkgDir}/` },
      { find: /^#db$/, replacement: `${serverDir}/db/index.ts` },
      { find: /^#backend$/, replacement: `${serverDir}/backend.ts` },
      { find: /^#email$/, replacement: `${serverDir}/email.ts` },
      { find: /^#server\//, replacement: `${serverDir}/` },
      { find: /^#api$/, replacement: `${srcDir}/lib/api.ts` },
      { find: /^#auth$/, replacement: `${srcDir}/lib/auth.tsx` },
    ],
  },
});