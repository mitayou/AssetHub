/**
 * 传统 DOM 选区复制降级方案 (textarea + execCommand)
 * @description 天然绕过 iframe 下 Permissions Policy 对 navigator.clipboard 的限制
 * @param {string} text - 目标复制文本
 * @returns {boolean} 是否成功
 */
function copyViaExecCommand(text: string): boolean {
  // 检查是否在浏览器环境中
  if (typeof document === 'undefined') {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = text

  // 严格设置不可见与固定定位，防止页面滚动抖动
  textArea.style.position = 'fixed'
  textArea.style.top = '0'
  textArea.style.left = '-9999px'
  textArea.style.width = '2em'
  textArea.style.height = '2em'
  textArea.style.padding = '0'
  textArea.style.border = 'none'
  textArea.style.outline = 'none'
  textArea.style.boxShadow = 'none'
  textArea.style.background = 'transparent'
  // 设置只读防止移动端调起虚拟键盘
  textArea.setAttribute('readonly', '')

  try {
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    // 兼容 iOS 选区
    if (typeof textArea.setSelectionRange === 'function') {
      textArea.setSelectionRange(0, text.length)
    }

    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return successful
  } catch (err) {
    console.warn('[copyViaExecCommand] 降级复制异常:', err)
    // 确保清理 DOM 节点
    if (textArea.parentNode) {
      document.body.removeChild(textArea)
    }
    return false
  }
}

/**
 * 安全复制指定文本至用户系统剪贴板 (具备 iframe 权限策略自愈降级能力)
 * @param {string} text - 目标文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text: string): Promise<boolean> {
  // 如果文本为空，直接返回 false
  if (!text) {
    return false
  }

  // 1. 优先尝试现代标准 Clipboard API (必须有独立 try-catch 防御 iframe Permissions Policy 拦截)
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (clipboardErr) {
      // 捕获到 NotAllowedError (权限策略阻止) 时静默放行，无缝由降级方案自愈
      console.warn('[copyText] 现代 Clipboard API 受环境策略拦截，自动切换至传统 DOM 选区降级方案:', clipboardErr)
    }
  }

  // 2. 降级方案：执行不受 Permissions Policy 限制的 execCommand 复制
  const fallbackResult = copyViaExecCommand(text)
  // 如果降级复制成功，直接返回 true
  if (fallbackResult) {
    return true
  }

  // 3. 兜底尝试：若处于 iframe 且存在父窗口，向宿主环境派发跨域复制通知消息
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'COPY_TEXT',
        action: 'EXEC_COPY',
        text,
        source: 'ASSET_HUB',
      }, '*')
    } catch (e) {
      // 忽略
    }
  }

  return false
}
