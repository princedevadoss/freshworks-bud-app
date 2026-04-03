import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// GitHub Pages project URL: https://<user>.github.io/<repo>/
// Production build must set base to /<repo>/ (see workflow VITE_BASE_PATH).
// Local preview: npm run dev (base "/"). Test Pages build: VITE_BASE_PATH=/your-repo/ npm run build && npx vite preview --base /your-repo/
let base = process.env.VITE_BASE_PATH ?? '/'
if (!base.endsWith('/')) base += '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
