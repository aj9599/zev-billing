import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  // Get backend port from environment or use default
  const backendPort = env.BACKEND_PORT || env.VITE_BACKEND_PORT || '8080'
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',  // Listen on all network interfaces
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        }
      }
    },
    preview: {
      host: '0.0.0.0',  // Also for production preview
      port: 4173
    }
  }
})