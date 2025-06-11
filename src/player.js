import Hls from 'hls.js';

// ========== 广告特征常量 ==========
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

// ========== 特定投票法网站 ==========
const VOTING_HOSTS = [
  'bfikuncdn.com',
  'kkzycdn.com:65',
  'vod.360zyx.vip'
];

// ========== 全局状态 ==========
let weightedAdSet = new Set();         // 加权法：广告片段url集合
let useWeightedFallback = false;       // 当前是否启用加权法
let checkedSample = false;             // 是否已采样过

let votingActive = false;              // 当前是否特定网站
let mainDirStat = {};                  // 目录统计
let mainSecondDir = '';                // 正片目录（投票法）
let adTsSet = new Set();               // 投票法：广告片段url集合

let skipHistorySet = new Set();        // 跳播循环保护
let skipLoopLimit = 10;                // 连续最多跳过N片段

// ========== 工具函数 ==========

function isVotingHost(manifestUrl) {
  return VOTING_HOSTS.some(host => manifestUrl.includes(host));
}

// 获取二级目录，如/20250608/VYJLSmhJ/
function getSecondDir(url) {
  const u = url.split('?')[0].split('#')[0];
  const match = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
  return match ? match[1] : '';
}

// ========== 加权判定相关 ==========
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

function buildWeightedAdSet(manifestText) {
  weightedAdSet.clear();
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  for (const tsUrl of tsLines) {
    if (isLikelyAd(tsUrl)) weightedAdSet.add(tsUrl);
  }
}

// ========== 目录投票法相关 ==========
function statTsDirAndAdSet(manifestText, manifestUrl) {
  mainDirStat = {};
  adTsSet.clear();
  mainSecondDir = '';
  checkedSample = true;

  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  if (tsLines.length < 1) return;

  // 统计所有二级目录
  for (const tsUrl of tsLines) {
    const dir = getSecondDir(tsUrl);
    if (!dir) continue;
    mainDirStat[dir] = (mainDirStat[dir] || 0) + 1;
  }
  // 找出现最多的目录
  let max = 0;
  for (const dir in mainDirStat) {
    if (mainDirStat[dir] > max) {
      max = mainDirStat[dir];
      mainSecondDir = dir;
    }
  }

  // 标记广告片段（不是正片目录的 ts）
  for (const tsUrl of tsLines) {
    if (getSecondDir(tsUrl) !== mainSecondDir) {
      adTsSet.add(tsUrl);
    }
  }

  // 输出统计
  if (adTsSet.size) {
    console.log('[AdBlocker][目录投票统计]', mainDirStat);
    console.log('[AdBlocker][广告片段]', Array.from(adTsSet));
  }
}

// ========== 采样主入口 ==========
function handleManifestSampling(manifestText, manifestUrl) {
  checkedSample = true;
  votingActive = isVotingHost(manifestUrl);

  if (votingActive) {
    // 投票法
    statTsDirAndAdSet(manifestText, manifestUrl);
    useWeightedFallback = false;
  } else {
    // 加权法
    buildWeightedAdSet(manifestText);
    useWeightedFallback = true;
  }
}

// ========== 跳过广告片段逻辑 ==========
function skipIfAd(currentUrl, hls) {
  // 循环保护
  if (skipHistorySet.has(currentUrl)) {
    if (skipHistorySet.size > skipLoopLimit) {
      hls.config?.debugMode && console.error('[AdBlocker] 跳播循环, 停止跳播！');
      return;
    }
  }
  skipHistorySet.add(currentUrl);

  // 投票法（只对特定网站生效）
  if (votingActive && adTsSet.size && adTsSet.has(currentUrl)) {
    seekToNextNormalTs(currentUrl, hls);
    return;
  }

  // 加权法
  if (useWeightedFallback && weightedAdSet.has(currentUrl)) {
    seekToNextNonAd(currentUrl, hls);
    return;
  }

  // 不是广告
  skipHistorySet.clear();
}

// 跳到下一个正常片段
function seekToNextNormalTs(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  let count = 0;
  while (nextIndex < playlist.length - 1 && count < skipLoopLimit) {
    nextIndex++; count++;
    if (!adTsSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      hls.config?.debugMode && console.log('[AdBlocker] Seek to next normal ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// 跳到下一个非广告片段（加权法）
function seekToNextNonAd(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  let count = 0;
  while (nextIndex < playlist.length - 1 && count < skipLoopLimit) {
    nextIndex++; count++;
    if (!weightedAdSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      hls.config?.debugMode && console.log('[AdBlocker] Seek to next non-ad ts:', playlist[nextIndex].url);
      break;
    }
  }
}

// ========== Loader类实现 ==========
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

// ========== HLS.js配置 ==========
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

// ========== 绑定播放器事件 ==========
export function attachAdSkipLogic(hls) {
  hls.on(Hls.Events.FRAG_CHANGED, function (event, data) {
    const fragUrl = data.frag.url;
    skipIfAd(fragUrl, hls);
  });
}

// ========== 重置全局状态 ==========
export function resetAdDetectionState() {
  weightedAdSet.clear();
  checkedSample = false;
  useWeightedFallback = false;

  votingActive = false;
  mainDirStat = {};
  mainSecondDir = '';
  adTsSet.clear();

  skipHistorySet.clear();
}
