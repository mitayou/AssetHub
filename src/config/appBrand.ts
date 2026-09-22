import { computed } from 'vue'

/**
 * 品牌与头部展示配置契约
 */
export interface IBrandConfig {
  /** 品牌 Logo（支持单字或图片 URL） */
  logo?: string
  /** 顶部主标题 */
  title?: string
  /** 顶部副标题描述 */
  subtitle?: string
}

// 提取浏览器端运行时外置配置 (来自 public/app-config.js)
const runtimeConfig = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__) ? window.__ASSET_HUB_CONFIG__ : {}

/** 默认主标题 */
export const DEFAULT_BRAND_TITLE = 'AssetHub'

/** 默认副标题 */
export const DEFAULT_BRAND_SUBTITLE = '小程序团队·静态资源效能工作台'

/** 默认 Logo 字符 */
export const DEFAULT_BRAND_LOGO = 'A'

/**
 * 顶部品牌主标题 (优先读取 brand.title，默认 AssetHub)
 */
export const brandTitle = computed(() => {
  return runtimeConfig.brand?.title?.trim() || DEFAULT_BRAND_TITLE
})

/**
 * 顶部副标题描述 (优先读取 brand.subtitle，兼顾扁平 subtitle)
 */
export const brandSubtitle = computed(() => {
  return runtimeConfig.brand?.subtitle?.trim() || runtimeConfig.subtitle?.trim() || DEFAULT_BRAND_SUBTITLE
})

/**
 * 顶部品牌 Logo 配置值 (支持图片 URL 或字母/短文本)
 */
export const brandLogo = computed(() => {
  return runtimeConfig.brand?.logo?.trim() || runtimeConfig.logo?.trim() || DEFAULT_BRAND_LOGO
})

/**
 * 判断指定的 Logo 字符串是否为图片资源路径
 * @param {string} val - Logo 配置字符串
 * @returns {boolean} 是否判断为图片 URL
 */
export function isImageLogo(val?: string): boolean {
  if (!val || typeof val !== 'string') return false
  const trimmed = val.trim()
  // 检测 http/https、根绝对路径、相对路径或 Base64 DataURI
  if (/^(https?:|\/|\.\/|data:image\/)/i.test(trimmed)) {
    return true
  }
  // 检测常见图片文件后缀
  if (/\.(png|jpe?g|svg|gif|webp|ico)(\?.*)?$/i.test(trimmed)) {
    return true
  }
  return false
}
