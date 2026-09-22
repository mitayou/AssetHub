# PRD 33: iframe 微前端代理子路径与 Wasm/Worker 相对寻址重构

## 一、背景与问题根因

在将应用通过 iframe 嵌套到外部宿主环境（如百果科技 AI 商店）并经由代理子路径（`/api/cos/proxy/e/qwGByRMT9u`）提供预览服务时，控制台连续报出以下两项运行时异常：
1. `[compressImageInBrowser] Worker PNG 压缩异常，尝试降级为主线程 Wasm: Error: Worker #0 内部错误`
2. `WebAssembly.instantiateStreaming 降级为 WebAssembly.instantiate: TypeError: Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok`

### 根因剖析：
* **并非被安全策略或沙箱阻止**，而是由于静态资源在多级代理子目录下寻址错误导致的 **HTTP 404**。
* `vite.config.ts` 缺少 `base: './'` 相对路径配置，构建时默认使用绝对根路径 `/`，导致打包产物中的 Worker 脚本路径形如 `/assets/pngCompressor.worker-*.js`，直接向后端 API 域名根目录发起请求，返回 404 引发 Worker 加载失败。
* Wasm 资源在 `src/workers/pngCompressor.worker.ts` 和 `src/utils/wasmCompressor.ts` 中硬编码为绝对路径 `/wasm/squoosh_oxipng_bg.wasm`，在降级到主线程时直接向域名根目录请求同样返回 404，进而触发了 WebAssembly 编译引擎的 `HTTP status code is not ok` 异常。
* **Worker 运行崩溃根因**：`upng-js` 源码中使用 `else { window.UPNG = UPNG; }`，在 Web Worker 线程内部不存在 `window` 对象（全局对象为 `self`），从而直接抛出 `Uncaught ReferenceError: window is not defined` 导致整个 Worker 脚本启动失败。
* `index.html` 中的外部配置文件写死为 `/app-config.js`，在子路径下同样脱离了实际部署的代理上下文。

---

## 二、目标与收益

1. **绝对根路径清零**：生产构建统一配置 `base: './'`，所有 CSS、JS Chunks、Worker 产物均使用相对路径定位。
2. **Worker 注入 `self.window = self` Polyfill**：通过 Vite `worker.rollupOptions.output.banner` 在 Worker 产物最顶层注入 `self.window = self`，彻底治愈老旧 CommonJS 库在 Worker 内的未定义报错。
3. **Wasm 动态上下文自适应**：封装通用 `getWasmAssetUrl` 工具函数，主线程与 Worker 线程均能依据自身执行上下文（`document.baseURI` 与 `self.location`）自适应精准解析出 Wasm 真实地址，彻底杜绝根路径 404。
4. **深层无斜杠代理路径自适应**：在 `index.html` 中注入动态 `<base>` 标签补偿机制，防止因子路径末尾无斜杠导致相对路径丢失父级代理路由。
5. **Wasm 加载防御增强**：在 `squoosh_oxipng.js` 胶水层强化 `response.ok` 提前拦截与语义化中文提示，避免底层编译器抛出晦涩的类型报错。

---

## 三、详细改造点与架构变更

### 1. 构建配置升级 ([vite.config.ts](../vite.config.ts))
* 增加 `base: './'` 配置项，使 Rolldown/Vite 打包时对所有资源产物、代码拆包 Chunk 及 Worker 实例均以当前页面/脚本所在目录进行相对解析。

### 2. 动态 Wasm 路径解析工具 ([src/utils/wasmLoader.ts](../src/utils/wasmLoader.ts))
* 新建 `getWasmAssetUrl(filename: string)` 函数：
  - **Worker 上下文**：依据 `self.location.href` 与构建后 `assets/` 目录结构，通过 `../wasm/${filename}` 动态计算绝对 URL；
  - **主线程上下文**：依据 `document.baseURI`（由 `<base>` 标签保障）与 `wasm/${filename}` 拼接规范绝对 URL；
  - **本地开发**：自适应命中本地开发服务器的 `public/wasm` 静态目录。

### 3. Worker 线程池双保险传参 ([src/utils/workerPool.ts](../src/utils/workerPool.ts))
* 派发任务时在 `options` 报文中主动附加主线程解析好的 `wasmUrl`；
* `WorkerPngOptions` 接口补充 `wasmUrl?: string` 字段；
* Worker 线程在收到任务时优先消费注入的 `wasmUrl`，未传入时通过 `getWasmAssetUrl` 动态自解析兜底。

### 4. 主线程 Wasm 调用重构 ([src/utils/wasmCompressor.ts](../src/utils/wasmCompressor.ts))
* 移除硬编码 `'/wasm/squoosh_oxipng_bg.wasm'`，统一通过 `getWasmAssetUrl('squoosh_oxipng_bg.wasm')` 动态计算传入。

### 5. 胶水层防御与自适应兜底 ([src/lib/wasm/squoosh_oxipng.js](../src/lib/wasm/squoosh_oxipng.js))
* 在 `load(module, imports)` 中增加 `if (!module.ok)` 检查，HTTP 状态码异常时提前中断并提示友好错误；
* 在 `init()` 中缺省路径时自动调用上下文环境自适应解析。

### 6. 入口 HTML 增强与相对配置 ([index.html](../index.html))
* 顶部注入无斜杠子路径 `<base>` 动态注入微脚本；
* 将 `/app-config.js` 改为 `./app-config.js`。

---

## 四、验证结果

* `yarn build`（`vue-tsc && vite build`）通过，产物耗时 3.69s，0 错误；
* 检查构建产物 `dist/index.html`，所有依赖资源均转为相对路径；
* 检查 `dist/assets/index-*.js` 与 `dist/assets/pngCompressor.worker-*.js`，Wasm 与 Worker 的跨层级相对寻址均符合预期。
