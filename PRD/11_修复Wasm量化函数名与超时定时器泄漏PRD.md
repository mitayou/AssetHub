# 11_修复Wasm量化函数名与超时定时器泄漏 PRD

## 一、问题根因定位

用户反馈在将 [wasmCompressor.ts](../src/utils/wasmCompressor.ts) 中的熔断时间调整为 30 秒后，依然频繁触发 30 秒超时熔断，且切图几乎没有压缩成功。

经逆向分析与代码静态排查，确认存在两大核心缺陷：

### 1. Wasm 调色板量化函数名不匹配（导致 100% 报错降级）
- 在 `src/utils/wasmCompressor.ts` 中调用了 `imagequantModule.quantize(...)`；
- 但经深入反编译 `public/wasm/imagequant.wasm` 的 Embind 符号表，该模块真实导出的函数名为 **`zx_quantize`**，并不存在名为 `quantize` 的导出；
- 运行时直接抛出 `TypeError: imagequantModule.quantize is not a function`，进入 catch 并直接降级返回 `null`，导致所有 PNG 压缩任务均在毫秒级瞬间失败。

### 2. Promise.race 中僵尸定时器（Zombie Timer）泄漏（导致无论成功失败均报超时警告）
- 在 `wasmCompressor.ts` 与 `compressor.ts` 中采用 `Promise.race([task, new Promise(setTimeout)])`；
- 该 `setTimeout` 在主任务结算后**未执行 `clearTimeout` 清除**；
- 导致即便主任务在 10 毫秒内就报错返回，30 秒后后台定时器依然准时被唤醒，在控制台打印 `达到 30 秒超时上限，强制熔断`，严重误导开发者。

---

## 二、修复方案设计

### 1. Wasm 函数探测与自适应签名调用
- 在 `src/lib/wasm/imagequant.js` 中增加 `zx_quantize` 到 `quantize` 的别名映射；
- 在 `src/utils/wasmCompressor.ts` 中进行自适应探测：
  ```ts
  const quantizeFn = imagequantModule.quantize || imagequantModule.zx_quantize;
  ```
- 针对 4 参数 `(data, width, height, dithering)` 与 5 参数 `(data, width, height, maxColors, dithering)` 自动兼容匹配；
- 增加详细的耗时与体积缩减控制台日志（如 `[WasmCompressor] "test.png" 量化完成，耗时 86ms`）。

### 2. 封装安全的带清理机制的超时控制器 (`withTimeout`)
- 使用 `finally` 钩子保证无论任务成功、失败或超时，必须立即调用 `clearTimeout(timerId)`；
- 彻底消灭在后台常驻的僵尸定时器；
- 同步重构 `src/utils/wasmCompressor.ts` 与 `src/utils/compressor.ts` 的熔断机制，统一合理超时窗口（单图 10 秒充足安全期）。

---

## 三、改动文件清单

1. `src/lib/wasm/imagequant.js`：在 Embind 函数注册后补充 `quantize` 别名映射；
2. `src/utils/wasmCompressor.ts`：增加自适应函数调用与安全 `withTimeout` 清理机制；
3. `src/utils/compressor.ts`：清理外层僵尸定时器，统一采用 `withTimeout` 机制；
4. `contexts/context.md`：更新 PRD 文档索引与架构说明。
