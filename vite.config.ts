import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// Check if deploying to Vercel
const isVercel = process.env.VERCEL === '1'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: isVercel ? '/' : '/CoupleMap2/',
})
