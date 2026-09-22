# 34_时间轴触底加载下一页与uploadDate聚合收纳PRD

## 一、需求背景与目标

在原“团队资产库 & 时间轴看板”（`TimelineList.vue`）中存在以下两个体验与逻辑痛点：
1. **时间收纳单一且未与服务端标准日期打通**：
   - 界面上仅展示单一的写死标题（`今天 (YYYY-MM-DD)`），未按不同日期进行垂直时间轴分段收纳；
   - 服务端（`dskhd-serverless`）与切图入库实体早已规范定义并索引了 `uploadDate`（形如 `YYYY-MM-DD`），但前端原逻辑偏向或依赖 `createTime`，未以 `uploadDate` 为核心聚合键。
2. **缺少触底分页加载（Infinite Scroll）**：
   - 页面初始只拉取第 1 页资产（24 项），当资产库数据逐渐增多时，无法向下滚动拉取历史更多资产，导致大量切图无法被浏览与复用。

### 本次改造目标：
1. **时间收纳从 `createTime` 改为以 `uploadDate` 为主**：
   - 资产项优先提取 `uploadDate` 字段作为分组归档日期；
   - 若 `uploadDate` 缺失或为空，智能从 `createTime` 中解析提取本地日期作为兜底容错；
   - 视图层将打平列表聚合为多组时间轴（`groupedTimelineList`），自动按日由近及远展示，各组包含专属节点（`timeline-dot`）、人性化日期标题（今天/昨天/标准日期）及该日项数统计。
2. **实现触底无感加载下一页**：
   - 采用现代高性能的 `IntersectionObserver`（交叉观察器）监听底部哨兵元素，提前 200px 自动无感预加载；
   - 维护 `loadingMore` 与 `hasMore` 状态，对增量列表项执行基于 `rawMd5` 和 `url` 的双重去重注入；
   - 底部配备高奢质感加载中动效及“已加载全部 X 项切图资产”的终态收口提示；
   - 切换“我的上传 / 全员资产”时自动重置分页至第 1 页并刷新观察器。

---

## 二、详细改动设计

### 1. BFF 资产类型声明扩充 (`src/services/assetBff.ts`)
- 在 `ExistAssetItem` 接口中显式声明：
  ```ts
  /** 上传日期 (YYYY-MM-DD) */
  uploadDate?: string
  ```

### 2. 时间轴组件逻辑与视图演进 (`src/components/TimelineList.vue`)
- **多日期分组聚合模型**：
  - 定义 `TimelineGroup` 结构体：`{ dateKey: string, displayDate: string, items: ExistAssetItem[] }`；
  - `getItemDateKey(item)`：优先取 `item.uploadDate`，兜底正则提取或格式化 `item.createTime`；
  - `formatGroupDate(dateKey)`：对比本地当前与昨日日期，输出 `今天 (YYYY-MM-DD)`、`昨天 (YYYY-MM-DD)` 或纯日期；
  - `groupedTimelineList` 计算属性：按顺序流式聚合资产，维护各日期下的资产数组。
- **分页与触底监听机制**：
  - 维护 `timelineData.value.page`，默认每页 24 项；
  - `loadMore()`：受限触发下一页请求，追加并去重，更新总数与页码；
  - `IntersectionObserver`：在挂载阶段绑定 `sentinelRef`，组件卸载时调用 `disconnect()` 释放；
- **视觉排版与状态呈现**：
  - 垂直时间轴多组串联：为 `.timeline-group` 补充下内边距，使左侧竖线自然穿透各日期组；
  - 底部控制区：呈现微型动效指示器与已全部加载收口徽标。

---

## 三、涉及文件列表

1. `e:\source\plugin\cosUpload\PRD\34_时间轴触底加载下一页与uploadDate聚合收纳PRD.md`（新建需求文档）
2. `e:\source\plugin\cosUpload\src\services\assetBff.ts`（更新类型声明）
3. `e:\source\plugin\cosUpload\src\components\TimelineList.vue`（组件核心重构）
