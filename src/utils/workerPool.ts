/**
 * PNG Web Worker 线程池管理器
 * @description 依据设备物理 CPU 核心数自适应维护 4~8 个常驻独立 Web Worker，
 * 实现真正的多核极速全并发计算，压榨 CPU 极限性能，且完全解放浏览器主线程。
 */

import type { CompressResult } from './compressor';
import { getWasmAssetUrl } from './wasmLoader';

/**
 * 计算推荐的 Worker 线程池容量（自适应核心数 4~8）
 */
function calculatePoolSize(): number {
  const threads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  // 严格限制在 4 到 8 之间
  return Math.max(4, Math.min(threads, 8));
}

/** 线程池固定容量 */
export const WORKER_POOL_SIZE = calculatePoolSize();

/**
 * 单个 Worker 槽位包装
 */
interface IWorkerSlot {
  id: number;
  worker: Worker;
  busy: boolean;
  currentTaskId: string | null;
  currentReject?: (reason?: any) => void;
}

/** 活跃的 Worker 槽位列表 */
const workerSlots: IWorkerSlot[] = [];

/** 自增任务 ID 计数器 */
let taskIdCounter = 0;

/**
 * 创建单个 Web Worker 实例
 * @param {number} slotId - 槽位序号
 * @returns {IWorkerSlot} Worker 槽位对象
 */
function createWorkerSlot(slotId: number): IWorkerSlot {
  // 采用 Vite 原生 ESM Worker 加载语法
  const worker = new Worker(
    new URL('../workers/pngCompressor.worker.ts', import.meta.url),
    { type: 'module' }
  );

  const slot: IWorkerSlot = {
    id: slotId,
    worker,
    busy: false,
    currentTaskId: null,
  };

  // 监听 Worker 错误
  worker.onerror = (err) => {
    console.warn(`[WorkerPool] Worker #${slotId} 发生运行时异常:`, err);
    // 如果当前有等待中的任务，触发 reject
    if (slot.currentReject) {
      slot.currentReject(new Error(`Worker #${slotId} 内部错误`));
      slot.currentReject = undefined;
    }
    // 销毁异常 Worker 并热替换重启
    try {
      worker.terminate();
    } catch (_) {}
    slot.worker = new Worker(
      new URL('../workers/pngCompressor.worker.ts', import.meta.url),
      { type: 'module' }
    );
    slot.busy = false;
    slot.currentTaskId = null;
  };

  return slot;
}

/**
 * 确保 Worker 线程池已完成初始化
 */
function ensureWorkerPoolInitialized() {
  // 惰性填满线程池至 WORKER_POOL_SIZE 个
  while (workerSlots.length < WORKER_POOL_SIZE) {
    const slot = createWorkerSlot(workerSlots.length);
    workerSlots.push(slot);
  }
}

/**
 * 检查当前环境是否完全支持 Web Worker 与 OffscreenCanvas
 * @returns {boolean} 是否可用
 */
export function isWorkerCompressionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

/**
 * 在 Worker 线程池中寻找一个空闲的 Worker 槽位
 * @returns {IWorkerSlot | null}
 */
function getIdleSlot(): IWorkerSlot | null {
  ensureWorkerPoolInitialized();
  return workerSlots.find((slot) => !slot.busy) || null;
}

/**
 * PNG Worker 压缩配置选项
 */
export interface WorkerPngOptions {
  /** 压缩质量 (0.1 ~ 1.0) */
  quality?: number;
  /** 调色板最大颜色数 (0为无损，64~256为有损量化) */
  maxColors?: number;
  /** 误差扩散抖动系数 */
  dithering?: number;
  /** oxipng 优化级别 (默认 2) */
  oxipngLevel?: number;
  /** 可选的动态 Wasm 资源加载完整地址 */
  wasmUrl?: string;
}

/**
 * 外部派发 PNG 压缩任务给 Worker 线程池
 * @param {File} file - 待压缩 PNG 切图
 * @param {WorkerPngOptions} [options] - 压缩参数选项
 * @param {Function} [onStageChange] - 阶段流转回调函数
 * @returns {Promise<CompressResult>} 压缩结果
 */
export function executePngInWorker(
  file: File,
  options: WorkerPngOptions = {},
  onStageChange?: (stage: 'DECODING' | 'QUANTIZING' | 'OPTIMIZING') => void
): Promise<CompressResult> {
  ensureWorkerPoolInitialized();

  const slot = getIdleSlot();
  // 检查是否具备空闲槽位（若不具备，由上层 Scheduler 排队调度；此防御避免直接穿透）
  if (!slot) {
    return Promise.reject(new Error('所有 Worker 均在繁忙中'));
  }

  const taskId = `png_task_${++taskIdCounter}_${Date.now()}`;
  slot.busy = true;
  slot.currentTaskId = taskId;

  return new Promise<CompressResult>((resolve, reject) => {
    slot.currentReject = reject;

    /**
     * 消息监听器
     */
    const messageHandler = (e: MessageEvent) => {
      // 校验任务 ID 是否对齐
      if (e.data?.id !== taskId) return;

      // 阶段流转通知 (不结束当前任务)
      if (e.data?.type === 'STAGE_CHANGE') {
        if (typeof onStageChange === 'function' && e.data.stage) {
          onStageChange(e.data.stage);
        }
        return;
      }

      // 任务结算，移除监听器并释放槽位
      slot.worker.removeEventListener('message', messageHandler);
      slot.busy = false;
      slot.currentTaskId = null;
      slot.currentReject = undefined;

      const { success, blob, size, error } = e.data;

      // 检查执行结果
      if (!success || !blob) {
        console.warn(`[WorkerPool] Worker 任务 ${taskId} 执行失败:`, error);
        reject(new Error(error || 'Worker 压缩未能生成有效产物'));
        return;
      }

      // 计算体积节省情况
      const finalSize = Math.min(file.size, size);
      const saved = Math.max(0, file.size - finalSize);
      const savedPercent = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
      const previewUrl = URL.createObjectURL(blob);

      resolve({
        blob,
        size: finalSize,
        previewUrl,
        savedPercent,
        isFallback: false,
      });
    };

    slot.worker.addEventListener('message', messageHandler);

    // 向 Worker 发送任务报文（注入动态计算的 Wasm 地址，双重保障多级代理与跨域环境寻址精准）
    const resolvedOptions = {
      wasmUrl: getWasmAssetUrl('squoosh_oxipng_bg.wasm'),
      ...options,
    };

    slot.worker.postMessage({
      id: taskId,
      file,
      options: resolvedOptions,
    });
  });
}

/**
 * 强行重置/终止某个特定任务对应的 Worker（用于超时熔断防死循环）
 * @param {string} taskId - 目标任务 ID
 */
export function terminateWorkerByTaskId(taskId: string) {
  const slot = workerSlots.find((s) => s.currentTaskId === taskId);
  // 检查是否存在匹配槽位
  if (slot) {
    try {
      slot.worker.terminate();
    } catch (_) {}
    // 重新创建新的健康 Worker 补位
    slot.worker = new Worker(
      new URL('../workers/pngCompressor.worker.ts', import.meta.url),
      { type: 'module' }
    );
    slot.busy = false;
    slot.currentTaskId = null;
    slot.currentReject = undefined;
  }
}
