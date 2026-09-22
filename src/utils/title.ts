/**
 * 网页标题管理与 iframe 宿主父页面标题同步工具
 * @description 支持获取当前工作台标题，并在 iframe 嵌套场景下安全向父页面同步 document.title
 */

/**
 * 跨文档标题同步消息载荷契约
 */
export interface ITitleSyncMessage {
  /** 消息事件类型 */
  type: string
  /** 具体动作 */
  action: string
  /** 目标网页标题 */
  title: string
  /** 来源标识 */
  source: string
}

/**
 * 获取当前应用配置或默认的网页标题
 * @returns {string} 网页标题字符串
 */
export function getAppTitle(): string {
  // 优先读取外部运行时配置 title
  const runtimeTitle = (typeof window !== 'undefined' && window.__ASSET_HUB_CONFIG__?.title)
    ? window.__ASSET_HUB_CONFIG__.title.trim()
    : ''

  // 如果外部配置存在则使用外部配置
  if (runtimeTitle) {
    return runtimeTitle
  }

  // 兼容从 brand 配置组装网页标题
  const brandConfig = typeof window !== 'undefined' ? window.__ASSET_HUB_CONFIG__?.brand : undefined
  if (brandConfig?.title && brandConfig.title.trim()) {
    const title = brandConfig.title.trim()
    const subtitle = brandConfig.subtitle?.trim()
    return subtitle ? `${title} - ${subtitle}` : title
  }

  // 检查当前文档是否已具有标题
  if (typeof document !== 'undefined' && document.title && document.title.trim()) {
    return document.title.trim()
  }

  // 兜底返回默认品牌标题
  return 'AssetHub - 静态资源效能工作台'
}

/**
 * 同步更新当前页面及父级宿主页面的网页标题
 * @description 兼容独立运行与 iframe 嵌套场景，覆盖同源直接赋值与跨域 postMessage 两种拓扑
 * @param {string} [customTitle] - 自定义指定的网页标题 (可选)
 * @returns {void}
 */
export function syncPageTitle(customTitle?: string): void {
  // 如果处于服务端渲染或非浏览器环境，直接中断
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  /** 最终生效的目标标题 */
  const targetTitle = customTitle?.trim() || getAppTitle()

  // 1. 设置当前文档标题
  document.title = targetTitle

  // 2. 检查是否处于 iframe 嵌套环境中
  const isNestedInIframe = window.self !== window.top || window.parent !== window
  // 如果不在 iframe 中，无需执行父页面同步
  if (!isNestedInIframe) {
    return
  }

  // 3. 针对同源场景：直接尝试穿透修改顶层和父级窗口的 document.title
  let syncDirectSuccess = false

  // 优先尝试直接修改顶层宿主 window.top
  try {
    if (window.top && window.top.document) {
      window.top.document.title = targetTitle
      syncDirectSuccess = true
    }
  } catch (err) {
    // 跨域拦截忽略，后续通过 postMessage 补偿
  }

  // 若顶层未成功，尝试直接修改直接父级 window.parent
  if (!syncDirectSuccess) {
    try {
      if (window.parent && window.parent.document) {
        window.parent.document.title = targetTitle
        syncDirectSuccess = true
      }
    } catch (err) {
      // 跨域拦截忽略
    }
  }

  // 4. 针对跨域场景（或父级监听机制）：向宿主环境广播多协议 postMessage 消息
  const dispatchPostMessages = () => {
    try {
      /** 标准规范载荷 */
      const standardPayload = {
        type: 'SET_PAGE_TITLE',
        action: 'UPDATE_TITLE',
        title: targetTitle,
        source: 'ASSET_HUB',
      }

      /** 兼容常见微前端/外壳格式的组合载荷 */
      const compatPayload = {
        type: 'setDocumentTitle',
        event: 'setTitle',
        action: 'setTitle',
        title: targetTitle,
        data: { title: targetTitle },
      }

      // 派发给直接父级
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(standardPayload, '*')
        window.parent.postMessage(compatPayload, '*')
      }

      // 派发给顶层窗口
      if (window.top && window.top !== window.parent && window.top !== window) {
        window.top.postMessage(standardPayload, '*')
        window.top.postMessage(compatPayload, '*')
      }
    } catch (messageError) {
      console.warn('[syncPageTitle] 派发 postMessage 标题同步消息失败:', messageError)
    }
  }

  // 立即派发一次
  dispatchPostMessages()

  // 延迟 300ms 与 1200ms 各补偿派发一次（防止父页面微前端容器晚于子页面挂载监听器导致漏听）
  setTimeout(dispatchPostMessages, 300)
  setTimeout(dispatchPostMessages, 1200)
}
