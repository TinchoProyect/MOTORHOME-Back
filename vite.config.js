import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5656, // Frontend Port
        proxy: {
            '/api': {
                target: 'http://localhost:5655', // Backend Port
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
