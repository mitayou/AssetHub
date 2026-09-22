# 上传进度条与处理状态指示系统全面恢复 PRD

## 一、问题背景与业务痛点

在之前的资产工作台重构中，用户反馈在点击“开始上传”后，表格中的**上传进度条彻底丢失**。
经过深入排查发现：
1. **模板误精简导致 DOM 缺失**：`src/components/QueueTable.vue` 的 CSS 中虽然保留了完整的 `.progress-box`、`.progress-track`、`.progress-bar` 等样式类，但在 `<template>` 表格单元格中，不小心被误精简成了一行纯文本 `<span v-else-if="item.status === 'UPLOADING'">上传中 {{ item.progress }}%</span>`，使得进度条外框、底槽与动态进度指示条完全未被 DOM 渲染；
2. **状态指示体系不健全**：当某项切图上传失败（`item.status === 'FAIL'`）时，由于模板使用了 `v-else` 兜底，导致失败的切图错误地呈现为“就绪”，无法表达明确的错误反馈。

---

## 二、功能定义与改造设计

### 2.1 恢复并美化上传流光进度条
- **完整 DOM 结构重塑**：
  - 外层容器 `.progress-box`（固定宽度 130px）；
  - 进度底槽 `.progress-track`（高 6px，圆角 6px，柔和高透黑底）；
  - 动态进度条 `.progress-bar`（采用百果园极光绿 `linear-gradient(90deg, #00a34f, #10b981)` 渐变，带 `0.25s cubic-bezier` 平滑位移过渡与微光阴影）；
- **进度数据双重呈现**：
  - 进度条下方左侧展示提示文字 `上传中`；
  - 进度条下方右侧使用等宽代码字体展示实时百分比（如 `68%`），且颜色高亮为生机绿。

### 2.2 健全任务状态指示体系
对表格“处理状态”列的状态分流进行严格规范：

| 状态枚举值 | 视觉元素呈现 | 文字标签与配色 | 业务含义 |
| :--- | :--- | :--- | :--- |
| **`UPLOADING`** | 流光进度条 + 动态百分比 | `上传中 XX%` | 正在直传腾讯云 COS |
| **`SUCCESS`** | 生机绿微呼吸圆点 | `已就绪` (`#00a34f`) | 上传并持久化成功，可下载/复制链接 |
| **`FAIL`** | 玫瑰红微警示圆点 | `上传失败` (`#e11d48`) | 网络异常或直传失败，警示用户排查 |
| **`IDLE` (默认)** | 低饱和岩灰微圆点 | `待上传` (`#94a3b8`) | 队列就绪，等待用户触发批量上传 |

---

## 三、代码落地与受影响文件
- [src/components/QueueTable.vue](../src/components/QueueTable.vue)：
  - 模板中替换原有的单行纯文本为 `.progress-box` + `.progress-track` + `.progress-bar` 结构；
  - 补充 `.status-cell`、`.status-dot`（`success`/`fail`/`idle`）与 `.status-text-*` 样式，保证视觉层次分明。
