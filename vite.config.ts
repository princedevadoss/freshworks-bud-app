import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// GitHub Pages project site: https://<user>.github.io/<repo>/
// In GitHub Actions, GITHUB_REPOSITORY is set and base becomes /<repo>/.
// Override anytime: VITE_BASE_PATH=/my-repo/ npm run build
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const baseFromCi =
  process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/'
const base = process.env.VITE_BASE_PATH ?? baseFromCi

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
