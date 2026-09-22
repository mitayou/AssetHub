# 12_PNG熔断保底原图与30秒超时改造 PRD

## 一、需求背景与目标

在切图治理流程中，用户反馈：
1. **画质安全底线**：当大分辨率 PNG 切图在 Wasm 量化超时或异常时，前期逻辑会降级流入 Canvas 压缩，而 Canvas 无法对 PNG 无损压缩 quality，强制转为 JPEG 会导致透明背景发黑、格式被篡改；
2. **运算窗口放宽**：移动端长截屏或 2K/4K 高清设计稿（如 `Home Screen (1).png`）单线程像素调色板量化计算量庞大，10 秒无法完成计算，需放宽至 30 秒；
3. **架构演进诉求**：当前 Wasm 量化在浏览器 UI 主线程中同步密集计算，会完全占用主线程导致页面卡顿无响应，未来需评估向 Web Worker 异步多线程架构升级。

---

## 二、功能与交互设计

### 1. PNG 熔断保底原图透传（绝不流向 Canvas）
- 当 PNG 切图 Wasm 计算超时或异常熔断时，与 GIF 动图策略一致，**坚决不调用 Canvas 降级**；
- 直接返回原图 Blob，并标记 `isFallback: true, savedPercent: 0`；
- 界面表格展示琥珀色“已保底”徽标与一键“重试”按钮，确保切图透明通道、抗锯齿及原始格式绝对不受破坏。

### 2. 超时时间统一放宽至 30 秒
- [wasmCompressor.ts](../src/utils/wasmCompressor.ts) 中内层单图 Wasm 超时时间调整为 30000ms（30秒）；
- [compressor.ts](../src/utils/compressor.ts) 中外层全局兜底超时时间协同调整为 30000ms（30秒）；
- 超时后通过 `finally` 中的 `clearTimeout` 彻底消除定时器泄漏。

---

## 三、涉及改动文件清单

1. `src/utils/compressor.ts`：PNG 异常或未产出 Wasm 结果时直接返回原图保底，严禁流入 Canvas；
2. `src/utils/wasmCompressor.ts`：单图 Wasm 熔断时间由 10 秒调整为 30 秒；
3. `contexts/context.md`：同步更新 PRD 索引与架构策略。
