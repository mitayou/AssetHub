/**
 * 客户端图片压缩并发调度器
 * @description 支持自适应 4~8 核心极速全并发测算、多任务独立 30s 倒计时管理与排队平滑流转。
 */

import type { IQueueItem } from '../types/asset';
import { compressImageInBrowser } from './compressor';
import { WORKER_POOL_SIZE } from './workerPool';

/** 最大并发数（自适应探测系统核心数，严格限制在 4~8 之间） */
export const MAX_CONCURRENCY = WORKER_POOL_SIZE;

/**
 * 正在执行的任务信息包装
 */
interface IActiveTaskInfo {
  item: IQueueItem;
  countdownTimer: any;
  timeoutTimer: any;
  startTime: number;
}

class CompressScheduler {
  /** 等待执行的任务队列 */
  private waitingQueue: IQueueItem[] = [];

  /** 当前正在执行中的活跃任务映射表 (key: item.id) */
  private activeTasks: Map<string, IActiveTaskInfo> = new Map();

  /** 当前全局画质比值 (0.1 ~ 1.0，默认 0.85 极致均衡，>=0.98 为原画无损) */
  private globalQuality: number = 0.85;

  /** 当前全局单图超时熔断秒数 (默认 30s，支持 60s 或 120s) */
  private globalTimeoutSeconds: number = 30;

  /**
   * 设置全局压缩画质比值
   * @param {number} quality - 画质比值 (0.1 ~ 1.0)
   */
  public setGlobalQuality(quality: number) {
    this.globalQuality = quality;
  }

  /**
   * 获取当前全局压缩画质比值
   * @returns {number}
   */
  public getGlobalQuality(): number {
    return this.globalQuality;
  }

  /**
   * 设置全局单图超时秒数
   * @param {number} seconds - 超时秒数 (例如 30, 60, 120)
   */
  public setGlobalTimeoutSeconds(seconds: number) {
    this.globalTimeoutSeconds = seconds;
  }

  /**
   * 获取当前全局单图超时秒数
   * @returns {number}
   */
  public getGlobalTimeoutSeconds(): number {
    return this.globalTimeoutSeconds;
  }

  /**
   * 将切图条目加入压缩调度队列
   * @param {IQueueItem} item - 目标切图项
   */
  public enqueue(item: IQueueItem) {
    // 检查是否已在活跃任务或等待队列中，避免重复调度
    if (this.activeTasks.has(item.id)) return;
    if (this.waitingQueue.some((i) => i.id === item.id)) return;

    // 检查是否有空闲并发槽位
    if (this.activeTasks.size < MAX_CONCURRENCY) {
      // 立即启动并发测算
      this.startTask(item);
    } else {
      // 槽位已满，标记为排队中并进入等待队列
      item.compressStatus = 'WAITING';
      item.compressError = undefined;
      item.compressCountdown = undefined;
      item.compressStage = undefined;
      this.waitingQueue.push(item);
    }
  }

  /**
   * 立即启动单项切图的并发测算与独立倒计时
   * @param {IQueueItem} item - 目标切图项
   */
  private startTask(item: IQueueItem) {
    // 设置当前处于测算中状态
    item.compressStatus = 'COMPRESSING';
    item.compressError = undefined;
    // 初始细分阶段置为解码像素
    item.compressStage = 'DECODING';
    // 开启独立倒计时（由全局设定的超时秒数初始化，例如 30s / 60s / 120s）
    item.compressCountdown = this.globalTimeoutSeconds;

    const startTime = Date.now();

    // 1. 启动每秒递减的独立倒计时定时器
    const countdownTimer = setInterval(() => {
      // 检查倒计时是否仍大于 0
      if (typeof item.compressCountdown === 'number' && item.compressCountdown > 0) {
        item.compressCountdown -= 1;
      }
    }, 1000);

    // 2. 启动硬超时熔断防护
    const timeoutMs = this.globalTimeoutSeconds * 1000;
    const timeoutTimer = setTimeout(() => {
      console.warn(`[CompressScheduler] 切图 "${item.fileName}" 达到 ${this.globalTimeoutSeconds} 秒超时上限，强制熔断保底`);
      this.handleTaskComplete(
        item,
        {
          blob: item.file,
          size: item.fileSize,
          previewUrl: URL.createObjectURL(item.file),
          savedPercent: 0,
          isFallback: true,
        },
        '测算超时已保底原图'
      );
    }, timeoutMs);

    // 登记为活跃任务
    this.activeTasks.set(item.id, {
      item,
      countdownTimer,
      timeoutTimer,
      startTime,
    });

    /**
     * 阶段流转回调：实时更新响应式对象上的阶段
     */
    const onStageChange = (stage: 'DECODING' | 'QUANTIZING' | 'OPTIMIZING') => {
      item.compressStage = stage;
    };

    // 3. 异步调用底层压缩引擎（透传全局画质、阶段流转监听与动态超时秒数）
    compressImageInBrowser(item.file, this.globalQuality, onStageChange, this.globalTimeoutSeconds)
      .then((res) => {
        // 检查返回结果是否有效
        if (res) {
          this.handleTaskComplete(item, res);
        } else {
          this.handleTaskComplete(
            item,
            {
              blob: item.file,
              size: item.fileSize,
              previewUrl: URL.createObjectURL(item.file),
              savedPercent: 0,
              isFallback: true,
            },
            '测算未产出有效结果，已保底原图'
          );
        }
      })
      .catch((err) => {
        console.warn(`[CompressScheduler] 切图 "${item.fileName}" 压缩执行异常:`, err);
        this.handleTaskComplete(
          item,
          {
            blob: item.file,
            size: item.fileSize,
            previewUrl: URL.createObjectURL(item.file),
            savedPercent: 0,
            isFallback: true,
          },
          '测算异常已保底原图'
        );
      });
  }

  /**
   * 处理单项任务完成与清理
   * @param {IQueueItem} item - 目标切图
   * @param {any} compResult - 压缩产物
   * @param {string} [fallbackError] - 保底错误原因提示
   */
  private handleTaskComplete(item: IQueueItem, compResult: any, fallbackError?: string) {
    const active = this.activeTasks.get(item.id);
    // 检查该任务是否仍在活跃状态中（可能已被手动移除或超时提前结算）
    if (!active) return;

    // 清理该任务的定时器
    clearInterval(active.countdownTimer);
    clearTimeout(active.timeoutTimer);
    this.activeTasks.delete(item.id);

    // 清空倒计时与细分阶段
    item.compressCountdown = undefined;
    item.compressStage = undefined;

    // 判定是否为保底原图
    if (compResult.isFallback) {
      item.isFallback = true;
      item.compressStatus = 'FAIL';
      item.compressError = fallbackError || '测算超时已保底原图';
      item.compressedSize = item.fileSize;
      item.compressedFile = compResult.blob;
      item.compressedPreviewUrl = compResult.previewUrl;
    } else {
      item.isFallback = false;
      item.compressStatus = 'SUCCESS';
      item.compressError = undefined;
      item.compressedSize = compResult.size;
      item.compressedFile = compResult.blob;
      item.compressedPreviewUrl = compResult.previewUrl;
    }

    // 槽位释放，立刻唤醒并调度下一个排队切图
    this.scheduleNext();
  }

  /**
   * 尝试从等待队列中调度下一个切图执行
   */
  private scheduleNext() {
    // 检查是否有空闲槽位且等待队列不为空
    while (this.activeTasks.size < MAX_CONCURRENCY && this.waitingQueue.length > 0) {
      const nextItem = this.waitingQueue.shift();
      // 检查取出的队列项
      if (nextItem) {
        this.startTask(nextItem);
      }
    }
  }

  /**
   * 用户手动重试单项压缩
   * @param {IQueueItem} item - 目标切图条目
   */
  public retry(item: IQueueItem) {
    // 若原先处于活跃状态，先安全移除清理
    this.removeItem(item.id);

    // 重置状态为待测算并重新入队（优先插入等待队列队首）
    item.compressStatus = 'WAITING';
    item.compressError = undefined;
    item.compressCountdown = undefined;
    item.compressStage = undefined;

    if (this.activeTasks.size < MAX_CONCURRENCY) {
      this.startTask(item);
    } else {
      // 插队到排队队列头部，优先享受下一个空闲槽位
      this.waitingQueue.unshift(item);
    }
  }

  /**
   * 移除特定切图任务
   * @param {string} itemId - 目标任务 ID
   */
  public removeItem(itemId: string) {
    // 1. 从等待队列中剔除
    const waitIdx = this.waitingQueue.findIndex((i) => i.id === itemId);
    if (waitIdx !== -1) {
      this.waitingQueue.splice(waitIdx, 1);
    }

    // 2. 从活跃任务中清理
    const active = this.activeTasks.get(itemId);
    if (active) {
      clearInterval(active.countdownTimer);
      clearTimeout(active.timeoutTimer);
      this.activeTasks.delete(itemId);
      // 释放出槽位，唤醒排队项
      this.scheduleNext();
    }
  }

  /**
   * 清空全部排队与活跃任务
   */
  public clearAll() {
    // 清除所有活跃任务的定时器
    this.activeTasks.forEach((active) => {
      clearInterval(active.countdownTimer);
      clearTimeout(active.timeoutTimer);
    });
    this.activeTasks.clear();
    this.waitingQueue = [];
  }

  /**
   * 依据最新画质比值重新对指定切图队列全量测算
   * @param {IQueueItem[]} items - 目标队列列表
   */
  public recompressAll(items: IQueueItem[]) {
    // 1. 彻底清空正在执行的定时器与等待队列
    this.clearAll();

    // 2. 遍历尚未上传成功或未处于上传中的切图，重置测算数据并重新入队
    items.forEach((item) => {
      if (item.status !== 'UPLOADING' && item.status !== 'SUCCESS') {
        item.compressedSize = undefined;
        item.compressedFile = undefined;
        item.compressedPreviewUrl = undefined;
        item.compressStatus = 'WAITING';
        item.compressError = undefined;
        item.compressCountdown = undefined;
        item.compressStage = undefined;
        this.enqueue(item);
      }
    });
  }
}

/** 导出单例压缩调度器 */
export const compressScheduler = new CompressScheduler();
