/// <reference types="vite/client" />

/**
 * Vite 客户端基础环境变量类型提示声明
 * 【说明】：所有业务存储桶与接口配置已全面迁移至 public/app-config.js 运行时单一可信源
 */
interface ImportMetaEnv {
  // 如有编译期纯工程变量可在此声明
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Vue 单文件组件模块类型声明
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
