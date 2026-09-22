import { ref, computed } from 'vue'
import type { IBrandConfig } from './appBrand'

/**
 * 全局运行时外置配置契约声明
 */
declare global {
  interface Window {
    __ASSET_HUB_CONFIG__?: {
      /** 网页标题与工作台品牌名称 */
      title?: string
      /** 品牌头部展示配置 */
      brand?: IBrandConfig
      /** 扁平兼容 logo 属性 */
      logo?: string
      /** 扁平兼容 subtitle 属性 */
      subtitle?: string
      /** 常用业务文件夹列表 */
      prodDirPresets?: string[]
      /** 动态存储桶与环境目标预设集 */
      targets?: ICosTargetPreset[]
    }
  }
}

/**
 * COS 目标预设配置契约
 */
export interface ICosTargetPreset {
  /** 预设唯一标识符 (支持动态任意扩展，如 prod-wxapp, test-dskhd, staging 等) */
  id: string
  /** 用户界面展示标签 */
  label: string
  /** 环境标识：测试或生产 */
  env: 'test' | 'prod'
  /** 对应环境获取 STS 凭据的接口地址 */
  authUrl: string
  /** 对应的 BFF 基础接口路径 */
  bffBaseUrl: string
  /** 服务端鉴权所用的 COS_KEY */
  cosKey: string
  /** 目标存储桶全名 (包含 AppId) */
  bucket: string
  /** 存储桶所在园区地域 (默认 ap-guangzhou) */
  region: string
  /** 默认上传目标目录 */
  defaultDir: string
  /** 线上专有 CDN 访问域名前缀 (若未配置则自动使用腾讯云 COS 原生源站域名) */
  cdnPrefix?: string
  /** 界面操作安全提示说明 */
  description: string
}

// 安全提取浏览器端运行时外置配置 (单一可信源：public/app-config.js 或 dist/app-config.js)
const runtimeConfig = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__) ? window.__ASSET_HUB_CONFIG__ : {}

/** 默认存储环境目标的本地缓存键名 */
const STORAGE_TARGET_KEY = 'ASSET_HUB_ACTIVE_COS_TARGET'
/** 默认存储生产环境选择目录的本地缓存键名 */
const STORAGE_PROD_DIR_KEY = 'ASSET_HUB_PROD_UPLOAD_DIR'

/**
 * 生产环境团队常用文件夹选项集合
 * 直接从外部 window.__ASSET_HUB_CONFIG__.prodDirPresets 读取，代码中不设静态业务目录兜底
 */
export const PROD_DIR_PRESETS: string[] = (
  Array.isArray(runtimeConfig.prodDirPresets) && runtimeConfig.prodDirPresets.length > 0
)
  ? runtimeConfig.prodDirPresets
  : []

/**
 * 双轨制/多轨制环境与存储桶预设配置集
 * 直接从外部单一可信源 window.__ASSET_HUB_CONFIG__.targets 读取，彻底移除代码内置兜底
 */
export const COS_TARGET_PRESETS: ICosTargetPreset[] = (
  Array.isArray(runtimeConfig.targets) && runtimeConfig.targets.length > 0
)
  ? runtimeConfig.targets
  : []

/**
 * 是否已成功配置有效的存储桶目标预设 (响应式计算属性)
 */
export const isCosConfigured = computed<boolean>(() => COS_TARGET_PRESETS.length > 0)

/**
 * 从本地缓存或预设集获取初始激活的预设 ID
 * 逻辑：若缓存存在且合法则恢复缓存；否则默认优先激活第一个预设 (通常为生产环境)；若无配置则返回空字符串
 * @returns {string} 激活的预设 ID
 */
function getInitialPresetId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_TARGET_KEY)
    // 检查缓存的预设 ID 是否存在于当前生效的预设集合中
    if (saved && COS_TARGET_PRESETS.some((p) => p.id === saved)) {
      return saved
    }
  } catch (e) {
    console.warn('[CosTargets] 读取本地目标预设缓存失败:', e)
  }
  // 默认激活预设列表的首项，若列表为空则返回空字符
  return COS_TARGET_PRESETS[0]?.id || ''
}

/**
 * 从本地缓存获取生产环境记忆目录
 * @returns {string} 生产目录
 */
function getInitialProdDir(): string {
  try {
    const saved = localStorage.getItem(STORAGE_PROD_DIR_KEY)
    // 如果存在有效目录字符串则返回
    if (saved && typeof saved === 'string' && saved.trim()) {
      return saved.trim()
    }
  } catch (e) {
    console.warn('[CosTargets] 读取生产目录缓存失败:', e)
  }
  // 如果常用目录集合存在首项则取首项，否则为空
  return PROD_DIR_PRESETS[0] || ''
}

/** 当前激活的目标预设 ID (响应式) */
export const activeTargetId = ref<string>(getInitialPresetId())

/** 生产环境当前选择/填写的上传文件夹路径 */
export const prodUploadDir = ref<string>(getInitialProdDir())

/**
 * 设置生产环境上传目标文件夹并持久化
 * @param {string} dir - 目标文件夹路径 (如 dsxcx/images、dsxcx/evaluation、dsxcx/feedback)
 */
export function setProdUploadDir(dir: string) {
  // 去除前后斜杠并规范化
  const cleaned = dir.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  // 如果处理后目录为空，则尝试取预设目录或保持空
  prodUploadDir.value = cleaned || PROD_DIR_PRESETS[0] || ''
  try {
    localStorage.setItem(STORAGE_PROD_DIR_KEY, prodUploadDir.value)
  } catch (e) {
    console.warn('[CosTargets] 持久化生产目录失败:', e)
  }
}

/**
 * 当前激活的目标配置预设实体 (计算属性)
 * 当系统未配置外部目标预设时返回 null
 */
export const currentCosTarget = computed<ICosTargetPreset | null>(() => {
  // 如果未配置任何目标预设，直接返回 null
  if (COS_TARGET_PRESETS.length === 0) {
    return null
  }
  const match = COS_TARGET_PRESETS.find((p) => p.id === activeTargetId.value)
  // 如果未匹配到当前 ID，安全回退到预设列表的第一项
  return match || COS_TARGET_PRESETS[0] || null
})

/**
 * 当前实际生效的上传根目录 (计算属性)
 * - 未配置时返回空字符串；
 * - 测试沙箱模式下：死锁在 defaultDir 或 dsxcx/temp，杜绝误传到其他目录；
 * - 生产线上模式下：根据团队指定的 prodUploadDir 动态生效。
 */
export const currentUploadDir = computed<string>(() => {
  // 如果未配置目标预设，返回空字符串
  if (!currentCosTarget.value) {
    return ''
  }
  // 如果当前预设是测试沙箱环境，严格锁定在默认临时隔离目录
  if (currentCosTarget.value.env === 'test') {
    return currentCosTarget.value.defaultDir || 'dsxcx/temp'
  }
  // 生产环境优先使用团队自定义选择的目录，其次使用当前预设的默认目录
  return prodUploadDir.value || currentCosTarget.value.defaultDir || ''
})

/**
 * 切换当前激活的目标配置预设并持久化
 * @param {string} targetId - 目标预设唯一标识
 */
export function setCosTarget(targetId: string) {
  activeTargetId.value = targetId
  try {
    localStorage.setItem(STORAGE_TARGET_KEY, targetId)
  } catch (e) {
    console.warn('[CosTargets] 持久化目标预设失败:', e)
  }
}

/**
 * 智能解析在线图片可访问链接 (彻底根治未绑定 CDN 导致的 404 问题)
 * @param {ICosTargetPreset | null | undefined} preset - 目标预设实体
 * @param {string} fullKey - 包含目录的文件路径 (如 dsxcx/images/sample.png)
 * @returns {string} 完整的在线公网访问 URL
 */
export function resolveOnlineUrl(preset: ICosTargetPreset | null | undefined, fullKey: string): string {
  // 如果未传入有效预设实体，直接返回相对路径
  if (!preset) {
    return fullKey
  }

  // 如果配置了专有 CDN 前缀（如生产正式桶），则直接拼接 CDN
  if (preset.cdnPrefix) {
    const cleanPrefix = preset.cdnPrefix.replace(/\/+$/, '')
    return `${cleanPrefix}/${fullKey}`
  }

  // 如果具备存储桶名与地域，自动回退为腾讯云 COS 原生源站域名
  if (preset.bucket && preset.region) {
    return `https://${preset.bucket}.cos.${preset.region}.myqcloud.com/${fullKey}`
  }

  // 兜底返回相对路径
  return fullKey
}
