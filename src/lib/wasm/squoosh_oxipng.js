/**
 * squoosh oxipng wasm 胶水层
 * 移植自 Google Chrome Labs squoosh
 */

let wasm;

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();

let cachegetUint8Memory0 = null;
/**
 * 获取 wasm 内存 Uint8Array 视图
 * @returns {Uint8Array}
 */
function getUint8Memory0() {
    // 检查缓存内存视图是否有效
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
}

/**
 * 从 wasm 内存中解码字符串
 * @param {number} ptr - 内存指针
 * @param {number} len - 字符串字节长度
 * @returns {string} 解码后的字符串
 */
function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

/**
 * 将 Uint8Array 传递到 wasm 内存堆中
 * @param {Uint8Array} arg - 二进制字节数组
 * @param {Function} malloc - 内存分配函数
 * @returns {number} 内存地址指针
 */
function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1);
    getUint8Memory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachegetInt32Memory0 = null;
/**
 * 获取 wasm 内存 Int32Array 视图
 * @returns {Int32Array}
 */
function getInt32Memory0() {
    // 检查缓存内存视图是否有效
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachegetInt32Memory0;
}

/**
 * 从 wasm 内存中提取 Uint8Array 切片
 * @param {number} ptr - 内存指针
 * @param {number} len - 字节长度
 * @returns {Uint8Array}
 */
function getArrayU8FromWasm0(ptr, len) {
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}

/**
 * 执行 oxipng 无损深度压缩
 * @param {Uint8Array} data - 输入 PNG 字节数组
 * @param {number} level - 压缩级别 (1-6)
 * @param {boolean} interlace - 是否隔行扫描
 * @returns {Uint8Array} 优化压缩后的 PNG 字节数组
 */
export function optimise(data, level, interlace) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.optimise(retptr, ptr0, len0, level, interlace);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var v1 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * 异步加载 WebAssembly 模块
 * @param {Response|ArrayBuffer} module - wasm 数据源
 * @param {object} imports - 导入对象
 * @returns {Promise<{instance: WebAssembly.Instance, module: WebAssembly.Module}>}
 */
async function load(module, imports) {
    // 判断是否为网络请求响应流
    if (typeof Response === 'function' && module instanceof Response) {
        // 如果响应状态码不是 200~299，提前中断抛出精准提示，避免 WebAssembly 报错
        if (!module.ok) {
            throw new Error(`Wasm 资源加载失败，HTTP 状态码: ${module.status} ${module.statusText} (${module.url})`);
        }
        // 判断是否支持流式实例化
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                // 如果 Content-Type 不匹配，降级为普通 buffer 方式
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` 降级为 `WebAssembly.instantiate`:", e);
                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);
        // 检查返回类型
        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

/**
 * 初始化 oxipng wasm 模块
 * @param {string|Request|URL} [input] - wasm 二进制资源路径
 * @returns {Promise<object>} 导出的 wasm 实例方法
 */
export async function init(input) {
    // 若未传入路径，依据执行上下文自适应解析
    if (typeof input === 'undefined') {
        if (typeof document === 'undefined' && typeof self !== 'undefined' && self.location && self.location.href.includes('/assets/')) {
            input = new URL('../wasm/squoosh_oxipng_bg.wasm', self.location.href).href;
        } else if (typeof document !== 'undefined') {
            const baseUri = document.baseURI || (typeof window !== 'undefined' ? window.location.href : '');
            const cleanBase = baseUri.split('?')[0].split('#')[0];
            const normalizedBase = cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`;
            input = new URL('wasm/squoosh_oxipng_bg.wasm', normalizedBase).href;
        } else {
            input = '/wasm/squoosh_oxipng_bg.wasm';
        }
    }
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    // 如果传入的是路径字符串或 URL，发起 fetch 请求
    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }

    const { instance, module } = await load(await input, imports);

    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;

    return wasm;
}
