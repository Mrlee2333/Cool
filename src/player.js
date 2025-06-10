import Hls from 'hls.js';

// 广告识别规则
const AD_KEYWORDS = [
  '/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking',
  'doubleclick.net', 'googleads.g.doubleclick.net', 'googlesyndication.com',
  'imasdk.googleapis.com', 'videoad', 'preroll', 'midroll', 'postroll', 'imasdk',
];
const AD_REGEX_RULES = [
  /^https?:\/\/[^\/]*?adserver\.[^\/]+\//i,
  /^https?:\/\/[^\/]*?sponsor\.[^\/]+\//i,
  /\/advertisements\//i,
];
const AD_TRIGGER_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CLASS="?ad"?|CUE-OUT|SCTE35-OUT|PLACEMENT-OPPORTUNITY|SCTE35-OUT-CONT)/i;
const AD_END_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CUE-IN|SCTE35-IN|PLACEMENT-OPPORTUNITY-END)/i;
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg)[^\/]*\.ts([?#]|$)/i;

let globalAdSegments = []; // { start: 秒, end: 秒, index: 片段序号 }
let adCountLastLog = 0;

let adSkipCount = 0;
const MAX_CONSECUTIVE_AD_SKIP = 6; // 连续跳广告最大次数，防止死循环

function extractTsPrefix(url) {
  return url.replace(/[^/]+\.ts.*$/i, '');
}

/**
 * 分析 m3u8，标记广告片段
 * 返回所有 ts 片段 [{ index, url, start, end, isAd }]
 */
function analyzeM3u8Segments(m3u8) {
  const lines = m3u8.split(/\r?\n/);
  const tsList = [];
  let curDuration = 0;
  let curStart = 0;
  let tsIndex = 0;
  let inAdBreak = false;
  globalAdSegments = [];

  // 用于连续广告跳跃统计
  let adStreak = 0;
  let adStreakMax = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (AD_TRIGGER_RE.test(line)) {
      inAdBreak = true;
      continue;
    }
    if (inAdBreak && AD_END_RE.test(line)) {
      inAdBreak = false;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      curDuration = parseFloat(line.match(/#EXTINF:([0-9.]+)/)?.[1] || '0');
      continue;
    }

    // TS片段
    if (!line.startsWith('#') && line.endsWith('.ts')) {
      const isAd = inAdBreak
        || AD_FRAGMENT_URL_RE.test(line)
        || AD_KEYWORDS.some(k => line.toLowerCase().includes(k))
        || AD_REGEX_RULES.some(r => r.test(line));

      tsList.push({
        index: tsIndex,
        url: line,
        start: curStart,
        end: curStart + curDuration,
        isAd
      });

      // 累计广告区间
      if (isAd) {
        globalAdSegments.push({ index: tsIndex, start: curStart, end: curStart + curDuration });
        adStreak++;
        adStreakMax = Math.max(adStreakMax, adStreak);
      } else {
        adStreak = 0;
      }

      curStart += curDuration;
      tsIndex++;
    }
  }

  // 日志：仅当有广告片段且广告数变化时输出
  if (globalAdSegments.length && globalAdSegments.length !== adCountLastLog) {
    console.info(`[AdBlocker] 标记广告片段 ${globalAdSegments.length} 个，最大连续广告片段：${adStreakMax}。`);
    adCountLastLog = globalAdSegments.length;
  }
  return tsList;
}

/**
 * Hls.js自定义loader，只解析m3u8，标记广告片段
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    this.adFilteringEnabled = config?.p2pConfig?.adFilteringEnabled !== false;
    this.debugMode = config?.p2pConfig?.debugMode === true;
  }

  load(context, config, callbacks) {
    const { type, url } = context;
    if (this.adFilteringEnabled && (type === 'manifest' || type === 'level')) {
      // 只分析，不直接过滤
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === 'string') {
          analyzeM3u8Segments(response.data); // 标记广告片段
        }
        originalOnSuccess(response, stats, context);
      };
    }
    super.load(context, config, callbacks);
  }
}

/**
 * 返回Hls.js的配置
 */
export function getHlsConfig(options = {}) {
  return {
    p2pConfig: {
      adFilteringEnabled: options.adFilteringEnabled !== false,
      debugMode: options.debugMode === true,
    },
    loader: AdAwareLoader,
    maxBufferLength: 60,
    maxBufferSize: 100 * 1000 * 1000,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 2,
  };
}

/**
 * 判断当前时间是否在广告片段内
 * @param {number} currentTime 
 * @returns {object|undefined} 广告片段对象或 undefined
 */
export function findAdSegment(currentTime) {
  return globalAdSegments.find(ad => currentTime >= ad.start && currentTime < ad.end);
}

/**
 * 跳到下一个正常片段起始时间（播放时调用）
 * @param {number} currentTime 
 * @returns {number|null} 下一个正常片段的start时间或null
 */
export function getNextNormalSegmentStart(currentTime) {
  // 找到当前广告片段
  const currentAd = findAdSegment(currentTime);
  if (!currentAd) return null;

  // 找到后面第一个非广告片段
  let minDiff = Infinity;
  let nextStart = null;
  for (const ad of globalAdSegments) {
    if (ad.start > currentTime && ad.start - currentTime < minDiff) {
      minDiff = ad.start - currentTime;
    }
  }
  // 找到所有片段，找广告片段end之后的第一个正常片段
  // 这里建议你在 VideoPlayer.vue 外部保存 analyzeM3u8Segments 的 tsList 结果
  // 这里简单假设广告片段不重叠
  let afterAdEnd = currentAd.end;
  for (const ad of globalAdSegments) {
    if (ad.start === afterAdEnd) afterAdEnd = ad.end; // 连续广告
  }
  return afterAdEnd;
}

/**
 * 广告片段跳过逻辑，供播放器调用
 * @param {HTMLVideoElement} video 
 * @param {function} onSkipAd 可选，跳过广告回调
 */
export function skipAdIfNeeded(video, onSkipAd) {
  const now = video.currentTime;
  const ad = findAdSegment(now);
  if (ad) {
    adSkipCount++;
    if (adSkipCount > MAX_CONSECUTIVE_AD_SKIP) {
      console.warn('[AdBlocker] 连续跳过广告次数过多，疑似死循环，停止跳过。');
      return;
    }
    const nextStart = getNextNormalSegmentStart(now);
    if (nextStart !== null) {
      video.currentTime = nextStart;
      if (typeof onSkipAd === 'function') onSkipAd(ad, nextStart);
    }
  } else {
    adSkipCount = 0;
  }
}

// 可导出广告片段全局标记
export { globalAdSegments as adSegments };
