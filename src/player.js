import Hls from 'hls.js';

// 广告特征常量
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
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg|sponsor)[^\/]*\.ts([?#]|$)/i;

// 特殊host列表
const SPECIAL_HOSTS = [
  'bfikuncdn.com',
  'kkzycdn.com:65',
  'vod.360zyx.vip'
];

// ================== 全局状态 ==================
let mainTsPrefix = '';         // 正片前缀（默认通用方式）
let mainSecondDir = '';        // 特殊host下“正片二级目录”
let specialHostActive = false; // 是否启用特殊host模式
let checkedSample = false;     // 是否已采样过
let adCount = 0;               // 统计广告片段
let useWeightedFallback = false; // 是否启用加权判定
let weightedAdSet = new Set();   // 加权判定出的广告ts列表

// 跳播循环保护
let skipHistorySet = new Set();
let skipLoopLimit = 5;

// ================== 工具函数 ==================

// 获取 ts 路径前缀（去除 query/hash 防止误判）
function getTsPrefix(url) {
  const pureUrl = url.split('?')[0].split('#')[0];
  const match = pureUrl.match(/^(.*\/)[^/]+\.ts/);
  return match ? match[1] : null;
}

// 二级目录，如 /20250608/VYJLSmhJ/
function getSecondDir(url) {
  // 去除参数
  const u = url.split('?')[0].split('#')[0];
  // 匹配 https://host/dir1/dir2/
  const match = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
  return match ? match[1] : '';
}

// 均匀分布取3个采样点
function randomSampleIndexes(totalCount) {
  if (totalCount < 3) return [0, 1, 2].slice(0, totalCount);
  const step = Math.floor(totalCount / 4);
  return [step, step * 2, step * 3];
}

// 检查是否特殊host
function isSpecialHost(manifestUrl) {
  return SPECIAL_HOSTS.some(host => manifestUrl.includes(host));
}

// ================== 主前缀/目录采样逻辑 ==================

// 主入口，兼容特殊host与通用逻辑
function sampleMainTsPrefix(manifestText, manifestUrl) {
  checkedSample = true;
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  if (tsLines.length < 1) return;

  if (isSpecialHost(manifestUrl)) {
    specialHostActive = true;
    // 取第3个（不足3个取第1个），记录其二级目录
    const idx = tsLines.length > 2 ? 2 : 0;
    mainSecondDir = getSecondDir(tsLines[idx]);
    mainTsPrefix = '';
    useWeightedFallback = false;
  } else {
    specialHostActive = false;
    mainSecondDir = '';
    // 默认前缀采样
    const idxs = randomSampleIndexes(tsLines.length);
    const prefixes = idxs.map(idx => getTsPrefix(tsLines[idx]));
    // 取出现最多的前缀为主前缀
    const freq = {};
    prefixes.forEach(pre => { if (pre) freq[pre] = (freq[pre] || 0) + 1; });
    mainTsPrefix = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b, '');
    // 如果采样到的都不一样，启用加权
    if (!mainTsPrefix || freq[mainTsPrefix] === 1) useWeightedFallback = true;
    else useWeightedFallback = false;
  }
}

// 加权广告判定
function isLikelyAd(url) {
  let adScore = 0;
  const lowerUrl = url.toLowerCase();
  for (const keyword of AD_KEYWORDS) {
    if (lowerUrl.includes(keyword)) adScore++;
  }
  for (const reg of AD_REGEX_RULES) {
    if (reg.test(url)) adScore++;
  }
  if (AD_FRAGMENT_URL_RE.test(url)) adScore += 2;
  return adScore >= 2;
}

// 采集所有广告ts到Set，供播放时跳过
function buildWeightedAdSet(manifestText) {
  weightedAdSet.clear();
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  for (const tsUrl of tsLines) {
    if (isLikelyAd(tsUrl)) weightedAdSet.add(tsUrl);
  }
}

// 统一入口，manifestText + manifestUrl
function handleManifestSampling(manifestText, manifestUrl) {
  sampleMainTsPrefix(manifestText, manifestUrl);
  if (useWeightedFallback) {
    buildWeightedAdSet(manifestText);
  }
}

// ================== 特殊host广告判定 ==================

// 判断特殊host广告（目录不同即广告）
function isSpecialHostAdTs(tsUrl) {
  if (!mainSecondDir) return false;
  return getSecondDir(tsUrl) !== mainSecondDir;
}

// ================== 跳过广告片段逻辑 ==================

function skipIfAd(currentUrl, hls) {
  // 循环保护
  if (skipHistorySet.has(currentUrl)) {
    if (skipHistorySet.size > skipLoopLimit) {
      hls.config?.debugMode && console.error('[AdBlocker] 跳播循环, 停止跳播！');
      return;
    }
  }
  skipHistorySet.add(currentUrl);

  // 特殊host
  if (specialHostActive && mainSecondDir) {
    if (isSpecialHostAdTs(currentUrl)) {
      seekToNextSpecialHostTs(currentUrl, hls);
      return;
    } else {
      skipHistorySet.clear();
      return;
    }
  }

  // 通用host
  if (mainTsPrefix && !useWeightedFallback) {
    if (!currentUrl.startsWith(mainTsPrefix)) {
      seekToNextMainTs(currentUrl, hls);
    } else {
      skipHistorySet.clear();
    }
  } else if (useWeightedFallback && weightedAdSet.has(currentUrl)) {
    seekToNextNonAd(currentUrl, hls);
  } else {
    skipHistorySet.clear();
  }
}

// 特殊host，跳到下一个同二级目录的正片ts
function seekToNextSpecialHostTs(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  while (nextIndex < playlist.length - 1) {
    nextIndex++;
    if (!isSpecialHostAdTs(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      if (hls.config?.debugMode) console.log('[AdBlocker] Seek to next main ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// 通用前缀跳播
function seekToNextMainTs(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  while (nextIndex < playlist.length - 1) {
    nextIndex++;
    if (playlist[nextIndex].url.startsWith(mainTsPrefix)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      if (hls.config?.debugMode) console.log('[AdBlocker] Seek to next main ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// 加权跳播
function seekToNextNonAd(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  while (nextIndex < playlist.length - 1) {
    nextIndex++;
    if (!weightedAdSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      if (hls.config?.debugMode) console.log('[AdBlocker] Seek to next non-ad ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// ================== Loader类实现 ==================

class AdAwareLoader extends Hls.DefaultConfig.loader {
  static _alreadyInitLog = false;

  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    if (this.debugMode && !AdAwareLoader._alreadyInitLog) {
      console.log(`${this.logPrefix} Initialized. Ad skipping is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
      AdAwareLoader._alreadyInitLog = true;
    }
  }

  _stripManifest(manifestText, manifestUrl) {
    if (!this.adFilteringEnabled) return manifestText;
    handleManifestSampling(manifestText, manifestUrl);
    // 不过滤任何片段，全部让播放器端处理跳过
    return manifestText;
  }

  load(context, config, callbacks) {
    const { type, url } = context;
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data, url);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    super.load(context, config, callbacks);
  }
}

// ================== hls.js 配置 ==================

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

// ================== 绑定播放器事件 ==================

export function attachAdSkipLogic(hls) {
  hls.on(Hls.Events.FRAG_CHANGED, function (event, data) {
    const fragUrl = data.frag.url;
    skipIfAd(fragUrl, hls);
  });
}

// ================== 外部重置全局状态 ==================

export function resetAdDetectionState() {
  mainTsPrefix = '';
  checkedSample = false;
  adCount = 0;
  useWeightedFallback = false;
  weightedAdSet.clear();
  skipHistorySet.clear();
  mainSecondDir = '';
  specialHostActive = false;
}
