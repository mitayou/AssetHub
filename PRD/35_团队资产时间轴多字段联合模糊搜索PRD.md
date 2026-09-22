# 35_团队资产时间轴多字段联合模糊搜索PRD

## 一、需求背景与目标

随着团队切图资产不断沉淀至资产库，单纯依赖时间轴瀑布流由近及远浏览难以应对快速找图的高频诉求：
1. **多维定位诉求强烈**：用户可能仅记得切图文件名（如 `logo_nav`）、曾用过的线上 URL（或 CDN Hash），或仅知道某位同事上传过特定素材；
2. **拒绝“纯前端搜索”局限**：由于时间轴看板已升级为分页无限触底加载，纯前端过滤只能触达当前已拉取的第 1 页（24 项），无法全量检索深层历史资产；
3. **全链路检索无缝融合**：需要将模糊搜索下沉至服务端 MongoDB 引擎，支持 `fileName`、`url`、`uploaderName` 三维联合模糊正则匹配，并与前端 300ms 智能防抖、触底加载下一页及身份范围无缝正交联动。

---

## 二、详细改动设计

### 1. 服务端多字段联合检索改造 (`dskhd-serverless/src/api/assetHub/v1/timeline.get.ts`)
- **多字段 `$or` 联合模糊匹配**：
  - 构造对 `fileName`、`url`、`uploaderName` 三个字段的忽略大小写正则（`$options: 'i'`）；
- **优雅串联与冲突隔离**：
  - 使用 `andConditions` 收集器统一处理 `keyword` 与上传人 ID（`uploaderId || uploader`）的 `$or` 条件；
  - 若存在条件则注入 `filter.$and`，规避 MongoDB 同级对象多个 `$or` 键相互覆盖的经典缺陷。

### 2. 前端组件搜索交互与防抖联动 (`cosUpload/src/components/TimelineList.vue`)
- **高奢毛玻璃搜索框**：
  - 放置于工具栏右侧，与“我的上传 / 全员资产”胶囊按钮同级并列；
  - 具备聚焦微伸展宽度交互动效与一键清除（`✕`）快捷按钮；
- **智能防抖与回车即搜**：
  - 监听 `input` 输入，触发 300ms 防抖请求；
  - 监听 `enter` 键盘事件，立即清除定时器并发起搜索；
- **触底分页连续性保障**：
  - 触发新关键词搜索时，重置分页为 `page = 1`；
  - 触底加载下一页（`loadMore`）时透传当前 `keyword`，支持多页搜索结果的无感流式呈现；
- **差异化空状态设计**：
  - 搜索无结果时呈现专属提示文案，并提供“清空搜索条件”快捷按钮一键还原全量看板。

---

## 三、涉及文件列表

1. `e:\source\plugin\cosUpload\PRD\35_团队资产时间轴多字段联合模糊搜索PRD.md`（新建 PRD 文档）
2. `e:\project\dskhd-serverless\src\api\assetHub\v1\timeline.get.ts`（后端联合模糊查询升级）
3. `e:\source\plugin\cosUpload\src\components\TimelineList.vue`（前端搜索交互与防抖联动）
