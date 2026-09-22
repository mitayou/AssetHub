import { ref, watch } from 'vue'
import COS from 'cos-js-sdk-v5'
import { currentCosTarget, activeTargetId, resolveOnlineUrl, currentUploadDir } from '../config/cosTargets'

/**
 * COS 授权凭证状态
 * - UNAUTHORIZED: 尚未获取凭据或获取失败
 * - READY: 已获取 STS 临时凭据且在有效期内
 * - EXPIRED: 临时凭据已超出有效期
 */
export type CosAuthStatus = 'UNAUTHORIZED' | 'READY' | 'EXPIRED'

/** 全局响应式 COS 凭据授权状态 */
export const cosAuthStatus = ref<CosAuthStatus>('UNAUTHORIZED')

/** 全局响应式 COS 凭据过期时间戳 (秒级) */
export const cosAuthExpiresAt = ref<number | null>(null)

export interface STSCredentials {
  tmpSecretId: string
  tmpSecretKey: string
  sessionToken: string
  startTime: number
  expiredTime: number
}

/**
 * COS 直传与资产运维服务封装
 * 具备双轨制（测试沙箱/生产线上）动态环境感知与清理删除能力
 */
export class CosUploaderService {
  private cosInstance: COS | null = null
  private cachedCredential: STSCredentials | null = null
  /** 凭证到期定时器句柄 */
  private expiryTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    // 监听激活的目标预设切换，自动无感清空旧凭证与实例
    watch(activeTargetId, () => {
      this.resetClient()
    })
  }

  /**
   * 重置当前凭据与客户端实例（切换目标预设时触发）
   */
  public resetClient() {
    this.cachedCredential = null
    this.cosInstance = null
    cosAuthStatus.value = 'UNAUTHORIZED'
    cosAuthExpiresAt.value = null
    // 销毁旧定时器
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
  }

  /**
   * 更新凭证状态并启动到期定时器
   * @param {STSCredentials} cred - 临时凭据对象
   */
  private updateAuthStatus(cred: STSCredentials) {
    const now = Math.floor(Date.now() / 1000)
    // 判断当前时间是否在凭证有效期内
    if (now < cred.expiredTime) {
      cosAuthStatus.value = 'READY'
      cosAuthExpiresAt.value = cred.expiredTime

      // 清理历史定时器
      if (this.expiryTimer) {
        clearTimeout(this.expiryTimer)
      }

      // 计算距离过期的毫秒数，到达过期时间后切换为 EXPIRED 状态
      const delayMs = Math.max(0, (cred.expiredTime - now) * 1000)
      this.expiryTimer = setTimeout(() => {
        cosAuthStatus.value = 'EXPIRED'
      }, delayMs)
    } else {
      cosAuthStatus.value = 'EXPIRED'
    }
  }

  /**
   * 从当前激活预设对应的接口获取临时 STS 凭证
   * @returns {Promise<STSCredentials>} STS 临时凭证
   */
  async fetchSTSCredential(): Promise<STSCredentials> {
    // 检查缓存 (提前 60 秒刷新)
    const now = Math.floor(Date.now() / 1000)
    if (this.cachedCredential && now < this.cachedCredential.expiredTime - 60) {
      this.updateAuthStatus(this.cachedCredential)
      return this.cachedCredential
    }

    try {
      const target = currentCosTarget.value
      // 如果未配置任何目标预设，直接置为未授权态并中断
      if (!target) {
        cosAuthStatus.value = 'UNAUTHORIZED'
        throw new Error('未配置 COS 目标存储桶，请在 app-config.js 中配置 targets')
      }

      const response = await fetch(target.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cosKey: target.cosKey,
        }),
      })

      // 检查 HTTP 响应状态
      if (!response.ok) {
        cosAuthStatus.value = 'UNAUTHORIZED'
        throw new Error(`获取 [${target.label}] COS 授权失败: HTTP ${response.status}`)
      }

      const resJson = await response.json()
      // 验证返回的凭证字段完整性
      if (!resJson?.data?.credentials) {
        cosAuthStatus.value = 'UNAUTHORIZED'
        throw new Error(resJson?.message || '返回的 STS 凭据结构不合法')
      }

      const cred = resJson.data
      this.cachedCredential = {
        tmpSecretId: cred.credentials.tmpSecretId,
        tmpSecretKey: cred.credentials.tmpSecretKey,
        sessionToken: cred.credentials.sessionToken,
        startTime: cred.startTime,
        expiredTime: cred.expiredTime,
      }

      // 同步刷新授权状态
      this.updateAuthStatus(this.cachedCredential)
      return this.cachedCredential
    } catch (err) {
      cosAuthStatus.value = 'UNAUTHORIZED'
      throw err
    }
  }

  /**
   * 主动探活并预检当前预设的 COS 授权状态
   * @returns {Promise<boolean>} 是否授权成功且处于有效期
   */
  async checkCosAuth(): Promise<boolean> {
    try {
      const cred = await this.fetchSTSCredential()
      // 判断凭证是否存在且状态就绪
      return cred !== null && cosAuthStatus.value === 'READY'
    } catch (err) {
      console.warn('[CosUploader] 预检 COS 授权失败:', err)
      return false
    }
  }

  /**
   * 初始化 COS SDK 实例 (强制加密 HTTPS 协议)
   * @returns {COS} COS SDK 客户端实体
   */
  getCOSClient(): COS {
    if (this.cosInstance) return this.cosInstance

    this.cosInstance = new COS({
      // 强制使用 HTTPS 协议，防止本地 http 调试被腾讯云安全拦截
      Protocol: 'https:',
      getAuthorization: async (_options, callback) => {
        try {
          const cred = await this.fetchSTSCredential()
          callback({
            TmpSecretId: cred.tmpSecretId,
            TmpSecretKey: cred.tmpSecretKey,
            SecurityToken: cred.sessionToken,
            StartTime: cred.startTime,
            ExpiredTime: cred.expiredTime,
          })
        } catch (error) {
          console.error('[CosUploader] 获取授权异常:', error)
        }
      },
    })

    return this.cosInstance
  }

  /**
   * 上传文件至当前激活的目标存储桶并汇报进度
   * @param {Object} params - 上传参数
   * @param {File | Blob} params.file - 待上传的文件或 Blob 实体
   * @param {string} params.key - 相对文件名 (如 439ec452...png)
   * @param {Function} [params.onProgress] - 进度百分比回调
   * @returns {Promise<{ url: string; key: string }>} 返回完整的存储全路径与自适应访问 URL
   */
  async uploadFile(params: {
    file: File | Blob
    key: string
    onProgress?: (progress: number) => void
  }): Promise<{ url: string; key: string }> {
    const cos = this.getCOSClient()
    const target = currentCosTarget.value

    return new Promise((resolve, reject) => {
      // 如果未配置目标存储桶，拦截上传并报错
      if (!target) {
        return reject(new Error('未配置 COS 目标存储桶，请在 app-config.js 中配置 targets'))
      }

      // 动态读取当前实际生效的上传目录 (测试固定dsxcx/temp，生产支持团队业务子目录)
      const uploadDir = currentUploadDir.value
      const fullKey = uploadDir ? `${uploadDir}/${params.key}` : params.key

      cos.putObject(
        {
          Bucket: target.bucket,
          Region: target.region,
          Key: fullKey,
          Body: params.file,
          onProgress: (progressData) => {
            // 回调通知上传进度
            if (params.onProgress) {
              const percent = Math.round(progressData.percent * 100)
              params.onProgress(percent)
            }
          },
        },
        // 上传完成或异常回调处理
        async (err) => {
          // 智能自适应解析在线 URL (生产走专有 CDN，测试走原生源站)
          const onlineUrl = resolveOnlineUrl(target, fullKey)

          // 检查上传是否产生错误返回
          if (err) {
            console.warn('[CosUploader] PUT 请求收到错误返回，启动 CORS 拦截智能补偿探活机制...', err)
            // 针对生产存储桶未配置 CORS 导致的浏览器跨域拦截假性失败进行验真探活
            const isAlive = await probeImageUrl(onlineUrl, 3, 800)
            // 检查探活结果：若切图已在云端落盘可读，纠正为上传成功
            if (isAlive) {
              console.info(`[CosUploader] 智能探活成功！切图已在云端就绪可读: ${onlineUrl}`)
              return resolve({
                key: fullKey,
                url: onlineUrl,
              })
            }
            // 探活确认失败，抛出真实上传异常
            return reject(err)
          }

          // 正常成功直接返回
          resolve({
            key: fullKey,
            url: onlineUrl,
          })
        }
      )
    })
  }
}

/**
 * 智能探活指定图片在线 URL 是否已真实写入云端并可正常访问
 * @description 绕过浏览器 PUT 请求的 CORS 响应头拦截限制，利用原生 Image 标签对资源进行多频验真
 * @param {string} url - 目标图片公网在线地址
 * @param {number} [maxAttempts=3] - 最大探活重试次数
 * @param {number} [intervalMs=800] - 单次探活超时与间隔时间 (毫秒)
 * @returns {Promise<boolean>} 是否探活成功可访问
 */
function probeImageUrl(url: string, maxAttempts: number = 3, intervalMs: number = 800): Promise<boolean> {
  return new Promise(async (resolve) => {
    // 循环进行多频重试探活
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isAlive = await new Promise<boolean>((singleResolve) => {
        const img = new Image()
        let isSettled = false

        // 设置单次探活超时熔断器
        const timer = setTimeout(() => {
          // 检查是否已完成
          if (!isSettled) {
            isSettled = true
            img.src = ''
            singleResolve(false)
          }
        }, intervalMs)

        // 图片成功载入回调
        img.onload = () => {
          // 检查是否已处理完毕
          if (!isSettled) {
            isSettled = true
            clearTimeout(timer)
            singleResolve(true)
          }
        }

        // 图片载入失败回调
        img.onerror = () => {
          // 检查是否已处理完毕
          if (!isSettled) {
            isSettled = true
            clearTimeout(timer)
            singleResolve(false)
          }
        }

        // 追加时间戳防止浏览器本地强缓存
        const separator = url.includes('?') ? '&' : '?'
        img.src = `${url}${separator}probe_t=${Date.now()}`
      })

      // 检查当前轮次探活是否成功
      if (isAlive) {
        return resolve(true)
      }

      // 若未达最大次数，稍作等待后继续下一轮探活
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    // 全部重试结束后仍无法访问则判定探活失败
    resolve(false)
  })
}

export const cosUploader = new CosUploaderService()
