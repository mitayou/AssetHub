# 08_升级WebAssembly高性能本地图片压缩引擎 PRD

## 一、需求背景与目标

在前端切图治理与直传流程中，UI 切图通常包含大量的透明背景、半透明阴影与精细矢量边缘。
前期使用的浏览器原生 Canvas API 存在以下瓶颈：
1. 原生 Canvas 导出 PNG 无法设置 quality（只能无损导出，压缩率极低）；
2. 原生 Canvas 导出 WebP 虽然体积减小，但在细线条与复杂图标边缘容易出现脏边或轻微模糊，无法满足设计团队像素级严苛交付标准；
3. 项目早期（`history/src/lib`）已经积累了 Google Squoosh 团队开源的成熟 Wasm 资产（`imagequant.wasm` 与 `squoosh_oxipng_bg.wasm`），但未迁移整合至当前 Vite + Vue 3 体系。

**本次升级目标**：
将项目历史沉淀的专业级 WebAssembly 图像量化压缩引擎（`imagequant` 8-bit 自适应调色板量化 + `oxipng` 深度无损压榨）正式移植并升级到现代 Vite 前端工作台中，实现：
1. **TinyPNG 级别高保真压缩**：透明通道完美保留，无杂色、无毛刺，真实压缩率达 60% ~ 75%；
2. **纯本地离线执行**：零网络依赖、零外网数据泄露风险，完全免费且无张数限制；
3. **驱动像素级卷帘对比**：1:1 卷帘弹窗右侧真实呈现 8-bit 量化效果，所见即所得。

---

## 二、技术架构设计

### 2.1 Wasm 资产布局
将 `history/src/lib/` 下的成熟 Wasm 文件整合至当前前端工程：
- 静态资源存放于 `public/wasm/`：
  - `imagequant.wasm` (~66 KB)
  - `squoosh_oxipng_bg.wasm` (~269 KB)
- Vite 服务下，任何位于 `public/` 的静态文件均可通过 `/wasm/xxx.wasm` 进行标准 `fetch` / `WebAssembly.instantiate` 加载。

### 2.2 驱动适配层 (`src/lib/wasm/`)
- `imagequant.js`：适配现代 Web 环境，重定向 `locateFile` 到 `/wasm/imagequant.wasm`，去除旧版对 `chrome.runtime` 的硬编码依赖；
- `squoosh_oxipng.js`：适配 ESModule 标准加载模式，支持直接传入 `/wasm/squoosh_oxipng_bg.wasm` 路径。

### 2.3 压缩编排服务 (`src/utils/wasmCompressor.ts`)
1. **初始化**：单例惰性加载 Wasm 模块（`initWasmEngine()`）；
2. **PNG 压缩链路**：
   - 原始文件解码为 `ImageData` 像素阵列；
   - 执行 `imagequant.quantize`（256 色/128 色智能调色板量化，带 dithering 抖动保护平滑渐变）；
   - 导出为 PNG 二进制 ArrayBuffer；
   - 经由 `oxipng.optimise` 进行深度字节级无损剔除与 Deflate 优化；
   - 输出最终的极致高画质 PNG `Blob`；
3. **JPG / WebP 降级链路**：保持高效高质量 Canvas 压榨；
4. **容灾降级**：若浏览器不支持 Wasm 或执行异常，自动平滑 fallback 至 Canvas。

---

## 三、涉及改动文件清单

| 文件路径 | 变更类型 | 说明 |
| --- | --- | --- |
| `public/wasm/imagequant.wasm` | 新增 | Wasm 量化核心二进制 |
| `public/wasm/squoosh_oxipng_bg.wasm` | 新增 | Wasm 深度优化核心二进制 |
| `src/lib/wasm/imagequant.js` | 新增 | 现代 Web 适配胶水代码 |
| `src/lib/wasm/squoosh_oxipng.js` | 新增 | 现代 Web 适配胶水代码 |
| `src/utils/wasmCompressor.ts` | 新增 | WebAssembly 压缩核心调度器 |
| `src/utils/compressor.ts` | 修改 | 统一入口接入 Wasm 压缩引擎 |
| `PRD/08_升级WebAssembly高性能本地图片压缩引擎PRD.md` | 新增 | 本需求文档 |

---

## 四、验证标准

1. 拖入 PNG 切图，控制台或后台由 Wasm 引擎接管处理；
2. 切图能够产生真实的 60% ~ 75% 显著体积缩减；
3. 打开全屏卷帘对比器（CurtainModal），切图透明通道边缘完全透明平滑，无发黑或失真。
