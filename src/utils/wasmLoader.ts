/**
 * WebAssembly 静态资源动态寻址加载器
 * @description 兼容本地开发环境、标准 Web 部署、微前端子目录，以及带有多级网关路径（如 /api/cos/proxy/e/...）的 iframe 容器，
 * 能够自适应主线程与 Worker 独立线程环境，动态解析出正确的绝对 URL，彻底根治 HTTP 404 导致 Wasm 编译失败的问题。
 */

/**
 * 获取指定 Wasm 资源文件的全量可用 URL
 * @param {string} filename - Wasm 文件名称（如 'squoosh_oxipng_bg.wasm'、'imagequant.wasm'）
 * @returns {string} 可直接供 fetch 或 WebAssembly.instantiateStreaming 消费的绝对 URL
 */
export function getWasmAssetUrl(filename: string): string {
  // 1. 如果在 Web Worker 独立线程上下文中（Worker 无 DOM document 对象）
  if (typeof document === 'undefined' && typeof self !== 'undefined' && self.location) {
    const workerHref = self.location.href;
    // 生产构建后 Worker 位于 assets/ 目录下，通过 ../wasm/ 定位
    if (workerHref.includes('/assets/')) {
      return new URL(`../wasm/${filename}`, workerHref).href;
    }
    // 开发环境下回退使用当前域名根路径
    return new URL(`/wasm/${filename}`, workerHref).href;
  }

  // 2. 如果在浏览器主线程上下文中
  if (typeof document !== 'undefined') {
    // 优先采用 index.html 注入或浏览器计算的 document.baseURI
    const baseUri = document.baseURI || (typeof window !== 'undefined' ? window.location.href : '');
    const cleanBase = baseUri.split('?')[0].split('#')[0];
    const normalizedBase = cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`;
    return new URL(`wasm/${filename}`, normalizedBase).href;
  }

  // 3. 通用保底
  return `/wasm/${filename}`;
}
