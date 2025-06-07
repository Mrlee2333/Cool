/**
 * 一个简单的基于 localStorage 的客户端速率限制器
 */
const STORAGE_KEY_PREFIX = 'rate_limiter_';

export const rateLimiter = {
  /**
   * 检查特定操作是否已达到速率限制
   * @param {string} key - 操作的唯一标识，例如 'douban_home_fetch'
   * @param {number} limit - 在时间窗口内的最大允许次数
   * @param {number} windowMinutes - 时间窗口（分钟）
   * @returns {boolean} - 如果未达到限制则返回 true，否则返回 false
   */
  check(key, limit, windowMinutes) {
    const storageKey = `${STORAGE_KEY_PREFIX}${key}`;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    // 1. 从 localStorage 获取时间戳记录
    let timestamps = [];
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        timestamps = JSON.parse(storedData);
      } catch (e) {
        timestamps = [];
      }
    }

    // 2. 过滤掉时间窗口之外的旧记录
    const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);

    // 3. 更新 localStorage 中的记录为过滤后的有效记录
    localStorage.setItem(storageKey, JSON.stringify(recentTimestamps));
    
    // 4. 检查次数是否已超限
    if (recentTimestamps.length >= limit) {
      console.warn(`[RateLimiter] a'${key}' 操作已达到速率限制 (${limit}次 / ${windowMinutes}分钟).`);
      return false; // 已超限
    }

    return true; // 未超限
  },

  /**
   * 为特定操作记录一次新的时间戳
   * @param {string} key - 操作的唯一标识
   */
  record(key) {
    const storageKey = `${STORAGE_KEY_PREFIX}${key}`;
    let timestamps = [];
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        timestamps = JSON.parse(storedData);
      } catch (e) {
        timestamps = [];
      }
    }

    // 添加当前时间戳并保存
    timestamps.push(Date.now());
    localStorage.setItem(storageKey, JSON.stringify(timestamps));
    console.log(`[RateLimiter] a'${key}' 操作已记录。当前计数: ${timestamps.length}`);
  }
};

