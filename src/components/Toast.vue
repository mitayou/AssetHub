<template>
  <!-- iOS 风格悬浮轻提示 -->
  <div :class="['ios-toast', { active: visible }]">
    <span class="toast-dot"></span>
    <span>{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 是否显示 */
  visible: boolean
  /** 提示内容 */
  message: string
}>()
</script>

<style scoped>
.ios-toast {
  position: fixed;
  bottom: 34px;
  left: 50%;
  transform: translateX(-50%) translateY(40px);
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #ffffff;
  padding: 10px 22px;
  border-radius: 30px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: all 0.25s var(--ease-spring);
}

.ios-toast.active {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.toast-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--state-green);
}
</style>
