# AssetHub 队列工具栏清空功能改造 PRD

## 一、需求背景与目标

在当前的 AssetHub 前端静态资源效能工作台体验中：
1. 顶部 [Dropzone.vue](../src/components/Dropzone.vue) 托盘区域已经原生支持拖拽、点击选择与剪贴板捕获，并已完备支持对 `.zip` 压缩包在客户端内存中的自动平铺解压；
2. 原 [QueueToolbar.vue](../src/components/QueueToolbar.vue) 中的“导入切图 ZIP”按钮绑定的是早期原型开发阶段的 Mock 函数 `mockImportZip`，点击仅推入写死的占位数据，功能重叠且存在虚假数据交互；
3. 用户在批量添加大量切图或误拖入非目标图片后，缺乏**一键快速清空当前队列**的能力（只能逐项手动点击删除）。

因此，本期将原“导入切图 ZIP”按钮替换为**“清空队列”**功能。

---

## 二、详细交互与功能设计

### 1. 按钮视觉与状态
- **文案**：由“导入切图 ZIP”变更为“清空队列”；
- **视觉风格**：延续现有的次级按钮样式（`apple-btn-secondary`，晶透冷白质感）；
- **禁用态交互**：
  - 当队列为空（`count === 0`）或当前处于上传中（`isUploading === true`）时，清空按钮置灰禁用（`disabled`）；
  - 增加禁用样式（`opacity: 0.45; cursor: not-allowed;`），禁用时消除 Hover 浮起与阴影微动。

### 2. 清空业务逻辑
- **上传中防误触**：若当前正在执行批量上传，提示“正在上传切图中，暂不可清空队列”并拦截清空；
- **内存回收**：清空前遍历释放当前队列项所创建的原图及压缩图预览 `blob:` ObjectURL，防止长生命周期单页内存泄漏；
- **操作反馈**：清空完成后通过全局 Toast 提示“已清空 X 项待处理切图”。

---

## 三、涉及改动文件清单

1. `src/components/QueueToolbar.vue`：
   - 按钮文案改为“清空队列”，绑定 `:disabled="count === 0 || isUploading"`；
   - Emits 替换为 `(e: 'clear-queue'): void`；
   - 补充 `.apple-btn-secondary:disabled` 样式。
2. `src/composables/useAssetQueue.ts`：
   - 移除 `mockImportZip`；
   - 新增 `clearQueue` 方法（含防误触校验与 ObjectURL 释放）；
   - 导出 `clearQueue`。
3. `src/App.vue`：
   - 替换 `mockImportZip` 为 `clearQueue`；
   - 监听 `QueueToolbar` 的 `@clear-queue="clearQueue"`。
