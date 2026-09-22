/**
 * 本地静态资源离线下载辅助模块
 * @description 支持在不经过 COS 上传的前提下，直接将浏览器内存中已完成压缩的 Blob 文件下载保存到本地。
 */

import type { IQueueItem } from '../types/asset'

/**
 * 将指定的 Blob 对象触发浏览器文件下载
 * @param {Blob} blob - 目标二进制数据
 * @param {string} fileName - 保存到本地的文件名称
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  // 检查 Blob 是否有效
  if (!blob) {
    return
  }

  // 1. 创建内存临时 ObjectURL
  const objectUrl = URL.createObjectURL(blob)
  
  // 2. 动态创建隐藏 <a> 标签并模拟点击触发下载
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()

  // 3. 延迟撤销 ObjectURL 释放内存
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}

/**
 * 直接下载指定队列项中的切图文件（优先下载本地压缩后的成果，保底原图）
 * @param {IQueueItem} item - 切图队列项
 * @returns {boolean} 是否成功触发下载
 */
export function downloadQueueItem(item: IQueueItem): boolean {
  // 检查队列项是否存在
  if (!item) {
    return false
  }

  // 优先选取本地已经压缩测算完成的高清产物，若未完成或已保底则取原始文件
  const targetBlob: Blob = item.compressedFile || item.file
  // 检查目标文件是否有效
  if (!targetBlob) {
    return false
  }

  // 执行下载触发
  downloadBlob(targetBlob, item.fileName)
  return true
}

/**
 * 批量下载指定队列中的所有切图文件（逐项平滑延时触发，防止浏览器拦截批量弹出窗口）
 * @param {IQueueItem[]} items - 目标队列列表
 * @param {(count: number) => void} onFinish - 批量触发完成回调
 */
export function batchDownloadQueue(items: IQueueItem[], onFinish?: (count: number) => void): void {
  // 检查队列是否有内容
  if (!items || items.length === 0) {
    return
  }

  let downloadedCount = 0
  items.forEach((item, index) => {
    // 增加微小的时间间隔，防止某些浏览器并发弹出下载阻断拦截
    setTimeout(() => {
      const ok = downloadQueueItem(item)
      if (ok) {
        downloadedCount += 1
      }
      // 检查是否为最后一项
      if (index === items.length - 1 && onFinish) {
        onFinish(downloadedCount)
      }
    }, index * 200)
  })
}
