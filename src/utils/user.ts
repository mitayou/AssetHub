/**
 * 用户鉴权与信息解析工具函数
 * @description 从当前 iframe URL 中提取 JWT Token 并还原用户信息，配合 BFF 实现静默镜像同步
 */
import { assetBff } from '../services/assetBff'
import type { IUserInfo } from '../types/asset'

export type { IUserInfo }

/** 用户信息缓存 Key */
const USER_STORAGE_KEY = 'ASSET_HUB_USER_INFO'


/**
 * 从当前 iframe URL 中解析 token 并还原用户信息
 * @returns {IUserInfo | null} 解析成功的用户基础信息对象，失败或无 token 则返回 null
 */
export function getUserInfoFromUrlToken(): IUserInfo | null {
  // 从当前地址栏获取查询参数
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('t')

  // 若无 token 则尝试从本地 sessionStorage 恢复
  if (!token) {
    try {
      const cached = sessionStorage.getItem(USER_STORAGE_KEY)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // 忽略存储异常
    }
    return null
  }

  try {
    // 截取 JWT Payload 载荷部分 (格式为 header.payload.signature)
    const payloadBase64 = token.split('.')[1]
    if (!payloadBase64) return null

    // 处理标准 Base64Url 编码字符转换
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    
    // 安全解码 Unicode 中文字符串
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    
    // 反序列化为 JSON 载荷对象
    const payload = JSON.parse(jsonStr)

    // 字段映射与父窗口 lae() 逻辑保持一致
    const userInfo: IUserInfo = {
      userId: String(payload.userId || payload.sub || payload.id || ''),
      username: payload.username || payload.name || '',
      name: payload.name || payload.nickname || payload.username || '',
      avatar: payload.avatar || '',
      email: payload.email || '',
      // 兼容历史工号别名
      workNo: String(payload.userId || payload.sub || payload.workNo || ''),
      rawPayload: payload,
    }

    // 缓存至 sessionStorage，防止刷新页面时丢失上下文
    try {
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userInfo))
    } catch {
      // 忽略存储超限异常
    }

    return userInfo
  } catch (err) {
    console.error('解析 Token 失败:', err)
    return null
  }
}

/**
 * 获取当前用户信息 (从 URL Token 或缓存中解析，若无 Token 则判定为未登录)
 * @returns {IUserInfo | null} 可用用户信息，未登录返回 null
 */
export function getCurrentUser(): IUserInfo | null {
  const user = getUserInfoFromUrlToken()
  // 判断是否存在有效工号
  if (user && user.userId) {
    return user
  }
  return null
}

/**
 * 初始化并静默同步当前用户至 BFF 镜像库
 * @returns {Promise<IUserInfo | null>} 初始化完成的用户信息，未登录返回 null
 */
export async function initAndSyncUser(): Promise<IUserInfo | null> {
  const user = getCurrentUser()
  // 判断若未登录则直接返回 null，不向服务端静默同步无意义数据
  if (!user || !user.userId) {
    return null
  }

  // 异步向 BFF 同步最新花名册镜像（不阻塞前端主界面渲染）
  assetBff.syncUser({
    userId: user.userId,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    email: user.email,
  }).catch((err) => {
    console.warn('[initAndSyncUser] 同步用户至花名册失败:', err)
  })

  return user
}
