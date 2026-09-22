import type { IQueueItem } from '../types/asset'
import { currentCosTarget, currentUploadDir } from '../config/cosTargets'

/**
 * 格式化文件字节大小为人类友好的容量单位 (KB / MB)
 * @param {number} bytes - 原始文件字节数
 * @returns {string} 格式化后的文件大小字符串，如 "42.1 KB"
 */
export function formatFileSize(bytes: number): string {
  // 如果字节数为 0 或非法值，返回 0 KB
  if (!bytes || bytes <= 0) {
    return '0 KB'
  }
  // 如果大于等于 1MB，转换为 MB 保留两位小数
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }
  // 否则转换为 KB 保留一位小数
  return (bytes / 1024).toFixed(1) + ' KB'
}

/**
 * 格式化字节尺寸别名 (与 formatFileSize 逻辑一致)
 * @param {number} bytes - 原始文件字节数
 * @returns {string} 格式化尺寸
 */
export const formatBytes = formatFileSize

/**
 * 格式化图片分辨率宽高为规范文本
 * @param {number} [width] - 图片像素宽度
 * @param {number} [height] - 图片像素高度
 * @returns {string} 格式化后的尺寸字符串，如 "240 × 240 px"
 */
export function formatDimensions(width?: number, height?: number): string {
  // 校验宽高是否存在
  if (!width || !height) {
    return '未知尺寸'
  }
  return `${width} × ${height} px`
}

/**
 * 根据切图项生成小程序端可直接使用的交付代码片段
 * @param {IQueueItem} item - 切图队列项
 * @param {'const' | 'wxml' | 'css' | 'url'} format - 代码目标语法格式
 * @returns {string} 生产就绪的代码片段
 */
export function generateCodeSnippet(
  item: IQueueItem,
  format: 'const' | 'wxml' | 'css' | 'url'
): string {
  // 提取干净的常量标识符，如 CART_EMPTY
  const cleanName = item.fileName
    .replace(/\.[^/.]+$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
  
  // 获取线上直传地址，若未生成则显示基于当前环境配置的动态占位提示
  const target = currentCosTarget.value
  let fallbackPlaceholder = 'https://.../...'
  // 如果配置了目标环境，则根据当前预设智能拼装域名与目录占位符
  if (target) {
    const prefix = target.cdnPrefix 
      ? target.cdnPrefix.replace(/\/+$/, '') 
      : `https://${target.bucket || 'bucket'}.cos.${target.region || 'ap-guangzhou'}.myqcloud.com`
    const dir = currentUploadDir.value || target.defaultDir || ''
    fallbackPlaceholder = dir ? `${prefix}/${dir}/...` : `${prefix}/...`
  }
  const url = item.onlineUrl || fallbackPlaceholder

  // 根据不同代码格式生成模版
  switch (format) {
    case 'const':
      return `// 小程序图片常量 (收拢在 cosConfig.js)\nexport const ${cleanName} = '${url}';`
    case 'wxml':
      return `<!-- 小程序 WXML 组件 -->\n<image class="${cleanName.toLowerCase()}" src="${url}" mode="aspectFit" />`
    case 'css':
      return `/* WXSS / CSS 背景 */\n.${cleanName.toLowerCase()} {\n  background-image: url('${url}');\n  background-size: contain;\n  background-repeat: no-repeat;\n}`
    case 'url':
    default:
      return url
  }
}
