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
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg)[^\/]*\.ts([?#]|$)/i;

let mainTsPrefix = '';         // 正片前缀（自动采样得到）
let checkedSample = false;     // 是否已采样过
let adCount = 0;               // 统计广告片段
let useWeightedFallback = false; // 是否启用加权判定
let weightedAdSet = new Set();   // 加权判定出的广告ts列表

// 获取 ts 路径前缀
function getTsPrefix(url) {
  const match = url.match(/^(.*\/)[^/]+\.ts/);
  return match ? match[1] : null;
}

// 均匀分布取3个采样点
function randomSampleIndexes(totalCount) {
  if (totalCount < 3) return [0, 1, 2].slice(0, totalCount);
  const step = Math.floor(totalCount / 4);
  return [step, step * 2, step * 3];
}

// 从manifest采样前缀
function sampleMainTsPrefix(manifestText) {
  if (checkedSample) return;
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  const total = tsLines.length;
  if (total < 1) {
    checkedSample = true;
    return;
  }
  const idxs = randomSampleIndexes(total);
  const prefixes = idxs.map(idx => getTsPrefix(tsLines[idx]));
  // 取出现最多的前缀为主前缀
  const freq = {};
  prefixes.forEach(pre => { if (pre) freq[pre] = (freq[pre] || 0) + 1; });
  mainTsPrefix = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b, '');
  checkedSample = true;
  // 如果采样到的都不一样，启用加权
  if (!mainTsPrefix || freq[mainTsPrefix] === 1) useWeightedFallback = true;
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

// 自动采样及加权备选
function handleManifestSampling(manifestText) {
  sampleMainTsPrefix(manifestText);
  if (useWeightedFallback) {
    buildWeightedAdSet(manifestText);
  }
}

// 跳过广告片段逻辑
function skipIfAd(currentUrl, hls) {
  if (mainTsPrefix && !useWeightedFallback) {
    // 只要不是主前缀就是广告
    if (!currentUrl.startsWith(mainTsPrefix)) {
      seekToNextMainTs(currentUrl, hls);
    }
  } else if (useWeightedFallback && weightedAdSet.has(currentUrl)) {
    seekToNextNonAd(currentUrl, hls);
  }
}

// seek 到下一个主前缀 ts
function seekToNextMainTs(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  while (nextIndex < playlist.length - 1) {
    nextIndex++;
    if (playlist[nextIndex].url.startsWith(mainTsPrefix)) {
      hls.currentTime = playlist[nextIndex].start;
      if (hls.config?.debugMode) console.log('[AdBlocker] Seek to next main ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// seek 到下一个非广告 ts
function seekToNextNonAd(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  while (nextIndex < playlist.length - 1) {
    nextIndex++;
    if (!weightedAdSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      if (hls.config?.debugMode) console.log('[AdBlocker] Seek to next non-ad ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// ============ Loader类 ============
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

  _stripManifest(manifestText) {
    if (!this.adFilteringEnabled) return manifestText;
    handleManifestSampling(manifestText);
    // 不过滤任何片段，全部让播放器端处理跳过
    return manifestText;
  }

  load(context, config, callbacks) {
    const { type } = context;
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    super.load(context, config, callbacks);
  }
}

// ============ hls.js 配置 ============
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

// ============ 绑定播放器事件 ============
export function attachAdSkipLogic(hls) {
  hls.on(Hls.Events.FRAG_CHANGED, function (event, data) {
    const fragUrl = data.frag.url;
    skipIfAd(fragUrl, hls);
  });
}
