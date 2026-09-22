/**
 * 切图文件辅助解析工具模块
 * @description 提供切图文件名正则分析与规格提取能力。
 */

/**
 * 精准检测切图文件名中是否显式携带 @1x / @2x / @3x 倍率标识
 * @param {string} fileName - 原始文件名
 * @returns {'@1x' | '@2x' | '@3x' | undefined} 识别出的倍率标识，若未显式包含则返回 undefined（绝不武断默认）
 */
export function detectScaleBadge(fileName: string): '@1x' | '@2x' | '@3x' | undefined {
  // 检查空文件名
  if (!fileName) {
    return undefined;
  }

  // 严格正则匹配文件名中的 @倍率 (不区分大小写)
  if (/@3x/i.test(fileName)) {
    return '@3x';
  }
  if (/@2x/i.test(fileName)) {
    return '@2x';
  }
  if (/@1x/i.test(fileName)) {
    return '@1x';
  }

  // 若文件名未包含任何 @倍率 标识，返回 undefined 杜绝误导
  return undefined;
}
