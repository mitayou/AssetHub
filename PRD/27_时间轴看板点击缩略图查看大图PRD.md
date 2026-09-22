# 27_时间轴看板点击缩略图查看大图PRD

## 一、需求背景与目标

在“团队资产库 & 时间轴看板”（`TimelineList.vue`）中，切图缩略图尺寸固定为 48x48，用户无法查看切图的高清细节和物理尺寸。

### 本次改造目标：
1. **缩略图点击交互与悬浮反馈**：
   - 鼠标悬浮在时间轴切图缩略图（`.thumb-cell`）上时，显示小手光标（`cursor: pointer`）、微缩放微动效以及 `点击查看高清大图` 悬浮提示；
2. **复用专业级全画幅大图查看器**：
   - 点击缩略图触发 `@open-preview` 事件；
   - 在 `App.vue` 中无缝复用成熟的 `CurtainModal.vue`（大图纯净全画幅模式）；
   - 支持无级滚轮缩放（10%~800%）、按住平移漫游、双击自适应视口、1:1 物理像素对齐等全套专业看图能力；
   - 顶部状态徽标高亮显示 `💎 云端切图 (已正式入库)`，保持系统交互与视觉质感的一致性。

---

## 二、涉及文件列表

1. `e:\source\plugin\cosUpload\src\components\TimelineList.vue`：缩略图绑定点击事件、hover 样式增强与 emit 声明；
2. `e:\source\plugin\cosUpload\src\App.vue`：监听 `@open-preview`，将条目适配包装后激活 `CurtainModal`；
3. `e:\source\plugin\cosUpload\src\components\CurtainModal.vue`：为云端历史资产优化徽标显示文案。
