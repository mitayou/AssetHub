# 13_WebWorker后台多线程自适应并发与倒计时改造 PRD

## 一、需求背景与目标

在企业级静态资源工作台批量导入大量切图时：
1. **主线程 UI 冻结问题**：PNG Wasm（imagequant 调色板量化 + oxipng Deflate 编码）原本在主线程运行，单核 CPU 100% 独占，导致浏览器事件循环阻塞，页面假死无法点击和滚动；
2. **极速全并发需求**：用户要求采用**极速全并发模式**，自适应探测用户电脑物理核心数（4~8 核），构建多 Worker 线程池，同时并发执行 4~8 张切图压缩，压榨多核算力将批量耗时压缩至极限；
3. **视觉直观性需求**：在队列表格各图片行中直观展示 **30s 倒计时**（如 `测算中 28s`），让用户对测算进度和超时熔断有明确预期，未排上并发槽位的切图显示清晰的 `排队中` 状态。

---

## 二、核心架构与功能设计

### 1. Web Worker 线程池（Worker Pool）架构
- **并发能力自适应**：
  - 基于 `navigator.hardwareConcurrency` 动态探测物理 CPU 核心数；
  - 并发槽位范围限制在 `4 ~ 8` 之间：`Math.max(4, Math.min(navigator.hardwareConcurrency || 4, 8))`；
  - 维护 4~8 个常驻独立 Web Worker 实例，组成多线程运算池。
- **后台零卡顿计算**：
  - Wasm 模块（`imagequant` 与 `squoosh_oxipng`）的初始化与调色板量化完全在 Worker 线程后台进行；
  - 在 Worker 线程中利用 `OffscreenCanvas` 与 `createImageBitmap` 提取 RGBA 像素矩阵与编码 PNG，主线程 CPU 占用归零，UI 始终保持 60 FPS 丝滑顺畅；
- **优雅兼容降级**：
  - 若运行环境不支持 Worker 或 OffscreenCanvas，自动降级至现有主线程方案，保障切图交付安全。

### 2. 多任务并发队列调度器（CompressScheduler）
- **动态调度**：
  - 并发阈值内（同时最多 4~8 项）的切图条目进入 `COMPRESSING`（测算中），分发至空闲 Worker；
  - 超出并发阈值的切图条目保持 `WAITING`（排队中）；
  - 任意 Worker 完成（或 30 秒熔断）后，立即自动拾取队首排队任务补位执行；
- **独立秒级倒计时**：
  - 处于 `COMPRESSING` 的切图各自拥有独立的 30 秒倒计时（从 30s 逐秒递减至 0s）；
  - 倒计时为 0 时强制中断任务并标记 `isFallback: true` 保底原图直传；
- **交互闭环**：支持单个移除、全量清空与一键“重试”的动态插拔。

### 3. 界面表格 30s 倒计时与排队视觉
- **状态徽标分级**：
  - **排队中**（`WAITING`）：浅紫色微晶胶囊，文案 `排队中`；
  - **测算中**（`COMPRESSING`）：浅蓝色高质感微晶胶囊，带微型旋转 Loader，文案实时呈现 `测算中 28s`（各自独立跳动）；
  - **已保底**（`FAIL`）：琥珀色微晶胶囊 `已保底`，附带“重试”按钮；
  - **压缩成功**（`SUCCESS`）：展示原始体积与缩减百分比（如 `450KB → 120KB -73%`）。

---

## 三、涉及改动清单

1. `src/types/asset.ts`：更新 `IQueueItem`，增加 `WAITING` 状态和 `compressCountdown` 字段；
2. `src/workers/pngCompressor.worker.ts`：新建独立 Web Worker，在后台完成 Wasm 量化与编码；
3. `src/utils/workerPool.ts`：新建多 Worker 线程池，维护自适应 4~8 个 Worker 实例；
4. `src/utils/compressScheduler.ts`：新建并发队列调度器与多任务 30s 独立倒计时管理；
5. `src/utils/compressor.ts`：对接 WorkerPool 异步通道与主线程平滑降级；
6. `src/components/QueueTable.vue`：优化体积与测算状态列，渲染排队态与多任务 30s 动态倒计时微晶胶囊；
7. `src/App.vue`：对接 `compressScheduler` 并发调度与重试、清空逻辑；
8. `contexts/context.md`：更新 PRD 13 索引与架构全景。
