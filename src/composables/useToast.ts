import { ref } from 'vue'

/** 轻提示可见性 */
const toastVisible = ref(false)

/** 轻提示文案 */
const toastMessage = ref('')

/** 定时器句柄 */
let toastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 悬浮轻提示状态管理 Composable
 */
export function useToast() {
  /**
   * 触发显示一条轻量提示
   * @param {string} msg - 提示文案
   * @param {number} [duration=2200] - 持续展示毫秒数
   */
  function showToast(msg: string, duration = 2200) {
    toastMessage.value = msg
    toastVisible.value = true

    // 清理之前的定时器
    if (toastTimer) {
      clearTimeout(toastTimer)
    }

    // 延迟关闭
    toastTimer = setTimeout(() => {
      toastVisible.value = false
    }, duration)
  }

  return {
    toastVisible,
    toastMessage,
    showToast,
  }
}
