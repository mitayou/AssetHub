import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

/**
 * 排除 public 目录下的 example 配置文件被打包到最终产物目录中
 */
function excludeExampleConfigPlugin() {
  return {
    name: 'exclude-example-config',
    closeBundle() {
      const exampleFilePath = path.resolve(import.meta.dirname, './dist/app-config.example.js')
      // 如果构建产物中存在 example 文件，则安全静默移除
      if (fs.existsSync(exampleFilePath)) {
        try {
          fs.unlinkSync(exampleFilePath)
        } catch (e) {
          // 忽略移除异常
        }
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  // 使用相对路径基准，自适应各级子目录与微前端 iframe 代理网关部署
  base: './',
  plugins: [vue(), excludeExampleConfigPlugin()],
  // 仅以根目录 index.html 作为依赖预构建扫描入口，避免扫描 history 等归档目录
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    // 兼容老版本 Safari / Chrome 与现代标准，确保同时保留 -webkit-backdrop-filter 与标准 backdrop-filter
    target: 'es2015',
    cssTarget: ['chrome75', 'safari13'],
    rollupOptions: {
      output: {
        /**
         * Vite 8 / Rolldown 要求 manualChunks 必须为函数形式
         * 将 node_modules 第三方依赖独立拆分，实现浏览器长效缓存与按需加载
         * @param {string} id - 模块绝对路径
         * @returns {string | void} 目标产物 Chunk 名称
         */
        manualChunks(id: string) {
          // 检查模块是否来自第三方依赖库目录
          if (id.includes('node_modules')) {
            // 针对体积庞大的专有 SDK 单独切分
            if (id.includes('cos-js-sdk-v5')) {
              return 'vendor-cos'
            }
            if (id.includes('jszip')) {
              return 'vendor-zip'
            }
            // 其余通用基础库（如 vue、spark-md5 等）聚合到通用基础 vendor
            return 'vendor'
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        // 在 Worker 产物最顶层注入 window 指向 self，彻底解决 UPNG.js 等老旧库抛出 window is not defined 的问题
        banner: 'if (typeof self !== "undefined" && typeof window === "undefined") { self.window = self; };',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // open: true,
    cors: true,
  },
})
