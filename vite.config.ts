import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { galleryPlugin } from './scripts/vite-gallery'

export default defineConfig({ plugins: [react(), galleryPlugin()] })
