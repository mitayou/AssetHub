# 09_支持GIF动图WebAssembly量化压缩与10秒熔断重试机制PRD

## 一、需求背景

在当前前端切图交付场景中，UI/动效设计师经常会导出并上传包含多帧的 GIF 动图（例如加载动画、操作指引、动态表情和动态切图组件）。

在以往的图片处理实现中，系统对非 PNG 图片默认走浏览器 HTML5 Canvas API 压缩。但 **Canvas 仅能绘制并捕获 GIF 动图的第一帧静态画面**，并会将其导出为静态 JPEG 或 PNG：
1. **致命损坏**：导致用户上传的动态 GIF 丢失全部后续帧序列，直接退化为单张死图；
2. **画质与透明通道损伤**：GIF 的透明像素容易在 Canvas 导出 JPEG 时被强制填充黑色底色或产生严重杂色毛边；
3. **体积与性能痛点**：动图通常体积较大（数百 KB 到数 MB），如果不做压缩，不仅会极大浪费网络带宽，还会导致首屏加载缓慢。
4. **熔断与重试机制**：先前的熔断时间较短（2.5s~3s），对于部分高分辨率切图或大体积多帧动图极易触发误熔断；同时，发生熔断或异常后缺少用户重试交互入口。

因此，亟需引入专业的 **WebAssembly Gifsicle** 引擎，为客户端提供真正的多帧动图量化与优化能力，统一将所有压缩功能的**单图熔断机制放宽至 10 秒**，并构建**失败/超时支持用户主动重试**的完整闭环。

---

## 二、产品目标与核心边界

### 2.1 核心目标
1. **100% 保留动图帧序列与动画播放**：
   - 绝不允许使用 Canvas API 接触或处理 GIF 动图；
   - 压缩后必须保留所有原始动画帧数、帧延时（Frame Delay）和无限循环属性（NETSCAPE2.0）。
2. **显著的体积瘦身效果**：
   - 基于 Gifsicle 引擎的调色板误差扩散量化（Lossy）与帧间差分合并（-O2 优化）；
   - 在肉眼无明显杂色噪点的前提下，平均缩减 **30% ~ 50%** 的动图体积。
3. **主线程零阻塞体验**：
   - Wasm Gifsicle 引擎运行在独立 Web Worker 中执行，后台密集运算，界面交互与 CSS 动画全程丝滑无卡顿。
4. **统一 10 秒单图超时熔断机制**：
   - 所有格式的压缩测算（PNG Wasm、GIF Wasm、Canvas 硬件编码、全局防护）单图超时时间统一调整为 **10 秒**，避免复杂高清图被过早掐断。
5. **支持用户主动重试测算**：
   - 当某张切图因极端情况超时熔断或解析异常时，在“体积与预估”列展示“已保底”及“重试”按钮；
   - 用户可随时一键点击重试，重新唤醒该图的压缩引擎进行重算。
6. **极致的安全兜底策略**：
   - 针对超大动图（>15MB）或异常文件，**必须安全回退为原动图 Blob 直传**，绝对禁止退化为静态 Canvas 压缩。

---

## 三、系统技术架构与实现方案

### 3.1 核心模块拓扑

```
用户拖入 / 粘贴切图 (.gif / .png / .jpg)
           │
           ▼
  [compressor.ts] 格式分流层 (统一 10s 熔断保护)
     ├─ isPng ───────► compressPngWithWasm (imagequant + oxipng, 10s 超时)
     ├─ isGif ───────► compressGifWithWasm (gifsicle.wasm 独立 Worker, 10s 超时)
     │                    │
     │                    ├── 成功: 输出优化后多帧动态 Blob + 节省百分比
     │                    └── 异常/超时: 标记 FAIL 并安全兜底原动图 Blob (绝不走 Canvas)
     │
     └─ isJpeg/Webp ──► compressImageWithCanvas (硬件加速单帧编码, 10s 超时)
```

### 3.2 引擎选型与部署

- **选型**：`gifsicle-wasm-browser` (基于 Gifsicle 1.92 编译，纯净无外部依赖)。
- **物理架构**：
  - 放置于 `src/lib/wasm/gifsicle.js`；
  - 内部自包含 Base64 编码的 `gifsicle.wasm` 字节码，并通过 `new Blob()` 动态创建 Web Worker；
  - 无需额外维护相对路径或处理同源跨域 fetch 问题。

### 3.3 压缩参数与工程调优

- **优化命令**：`-O2 --lossy=40 input.gif -o /out/out.gif`
  - `-O2`：重采样并差分存储帧间微小变动矩形，压缩收益极高且耗时远低于 `-O3`；
  - `--lossy=40`：调色板聚类优化，大幅延长 LZW 编码行程，达成 30%~50% 压缩率，肉眼无失真。
- **大图限制**：若文件体积超过 15MB，跳过重度运算，直接透传原图，避免移动端或低内存设备 Worker 崩溃。

### 3.4 交互重试状态机

- 队列数据结构增加 `compressStatus?: 'IDLE' | 'COMPRESSING' | 'SUCCESS' | 'FAIL'`；
- 当 `compressStatus === 'FAIL'` 时：
  - 列表展示“已保底”徽标与重试按钮；
  - 点击“重试”将状态重置为 `'COMPRESSING'`，重新触发 `compressImageInBrowser`。

---

## 四、改动清单与接口定义

1. **`src/types/asset.ts`**：
   - `IQueueItem` 增加 `compressStatus?: 'IDLE' | 'COMPRESSING' | 'SUCCESS' | 'FAIL'` 与 `compressError?: string`。
2. **`src/lib/wasm/gifsicle.js`**：引入自包含 WebAssembly Gifsicle 胶水与 Worker 核心代码；
3. **`src/lib/wasm/wasm.d.ts`**：增加 `gifsicle` 模块与参数类型声明；
4. **`src/utils/gifCompressor.ts`**：
   - 实现 `compressGifWithWasm(file: File): Promise<CompressResult | null>`；
   - 增加独立单例调度、大图跳过、10 秒单图熔断保护与原图安全兜底；
5. **`src/utils/wasmCompressor.ts`**：将单图超时熔断由 2500ms 调整为 10000ms (10秒)；
6. **`src/utils/compressor.ts`**：
   - 拦截 `isGif` 分流，禁止调用 `compressImageWithCanvas`；
   - 将全局单图超时熔断由 3000ms 调整为 10000ms (10秒)；
   - Canvas 图片加载超时调整为 10000ms；
7. **`src/components/QueueTable.vue`**：
   - 体积与预估列支持 `compressStatus === 'FAIL'` 状态渲染；
   - 新增“重试”微按钮并 emit `'retry-compress'`；
8. **`src/App.vue`**：
   - 实现 `handleRetryCompress(item)`，重置状态并发起重试测算。

---

## 五、验收与测试标准

1. **动图有效性**：拖入 `.gif` 动图后，缩略图能持续循环播放，比对器中两侧均能流畅播放动画；
2. **压缩成效**：通常可在 500ms~2000ms 内完成测算，体积缩减 20%~50%，列表清晰展示优化前后字节数与 `-XX%` 徽标；
3. **10秒熔断放宽**：大尺寸切图拥有充足的 10 秒计算窗口，杜绝提前截断；
4. **重试机制闭环**：若测算失败或超时，展示重试按钮，点击能成功重新测算并更新产物；
5. **交付产物校验**：下载或上传至 COS 的文件确认为动态 GIF，绝无单帧静止或黑底失真问题。
