import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/fo76-legendary-perk-planner/',
  plugins: [svelte()],
})
