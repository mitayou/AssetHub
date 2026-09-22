/**
 * 全局 API 与接口服务配置常量
 * @description 统一收拢 COS 授权接口、BFF 服务地址及存储桶配置。
 *              支持通过 Vite 环境变量 (如 VITE_BFF_BASE_URL、VITE_COS_AUTH_URL 等) 动态覆盖，
 *              未提供环境变量时使用内置生产/测试默认地址，满足本地调试与不同环境灵活打包。
 */

import { currentCosTarget } from './cosTargets'

// 安全提取浏览器端运行时外置配置 (最高优先级 L1)
const runtimeConfig = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__) ? window.__ASSET_HUB_CONFIG__ : {}

// 提取运行时配置中默认首选的目标预设
const defaultPreset = runtimeConfig.targets?.[0]

/**
 * 获取当前激活预设对应的 BFF 基准接口地址 (无末尾斜杠)
 * @returns {string} 规范化后的 BFF 基础 URL
 */
export function getActiveBffBaseUrl(): string {
  // 优先取当前激活环境配置的 bffBaseUrl，无则回退外部配置首选
  const baseUrl = currentCosTarget.value?.bffBaseUrl || defaultPreset?.bffBaseUrl || ''
  return baseUrl.replace(/\/+$/, '')
}

/**
 * 统一获取指定业务的完整 BFF 请求地址
 * @param {'precheck' | 'record' | 'timeline' | 'syncUser'} endpoint - 端点名称
 * @returns {string} 完整的请求接口 URL
 */
export function getBffApiUrl(endpoint: 'precheck' | 'record' | 'timeline' | 'syncUser' | 'rename'): string {
  const base = getActiveBffBaseUrl()
  // 如果基础路径为空则返回空字符串
  if (!base) {
    return ''
  }
  return `${base}/${endpoint}`
}

export const API_CONFIG = {
  /** COS 临时授权接口 */
  get COS_AUTH_URL() {
    return currentCosTarget.value?.authUrl || defaultPreset?.authUrl || ''
  },

  /** BFF 基础路由前缀 */
  get BFF_BASE_URL() {
    return getActiveBffBaseUrl()
  },

  /** 切图查重预检接口 */
  get BFF_PRECHECK_URL() {
    return getBffApiUrl('precheck')
  },

  /** 资产批量入库接口 */
  get BFF_RECORD_URL() {
    return getBffApiUrl('record')
  },

  /** 时间轴看板数据接口 */
  get BFF_TIMELINE_URL() {
    return getBffApiUrl('timeline')
  },

  /** 用户花名册与企微头像静默同步接口 */
  get BFF_SYNC_USER_URL() {
    return getBffApiUrl('syncUser')
  },

  /** 切图资产重命名 (改库索引) 接口 */
  get BFF_RENAME_URL() {
    return getBffApiUrl('rename')
  },

  /** 默认 COS 存储桶标识 */
  get DEFAULT_COS_KEY() {
    return currentCosTarget.value?.cosKey || defaultPreset?.cosKey || ''
  },

  /** 默认 COS 存储桶 Bucket 名称 */
  get DEFAULT_COS_BUCKET() {
    return currentCosTarget.value?.bucket || defaultPreset?.bucket || ''
  },

  /** 默认 COS 存储桶所属地域 Region */
  get DEFAULT_COS_REGION() {
    return currentCosTarget.value?.region || defaultPreset?.region || ''
  },

  /** 默认 CDN 线上访问域名前缀 */
  get DEFAULT_CDN_PREFIX() {
    return currentCosTarget.value?.cdnPrefix || defaultPreset?.cdnPrefix || ''
  },

  /** 默认目标上传路径前缀 */
  get DEFAULT_DIRECTORY() {
    return currentCosTarget.value?.defaultDir || defaultPreset?.defaultDir || ''
  },
}
