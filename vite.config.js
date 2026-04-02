import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0', // 监听所有地址（相当于你在命令行加的 --host）
    
    // 解决报错的核心代码：
    allowedHosts: [
      '.trycloudflare.com' // 把报错里的域名填进来
    ],

    // 👇 新增 proxy 代理配置
    proxy: {
      '/api': {
        // 这里填你 Linux 本地后端的真实地址和端口
        target: 'http://localhost:3000', 
        changeOrigin: true,
      },
      '/covers': 'http://localhost:3000'
    }
  }
})
