import Hls from 'hls.js';

// --- 广告识别规则 ---
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
const LL_HLS_PART_RE = /^#EXT-X-PART:.*URI="([^"]+)"/i;
const LL_HLS_SKIP_RE = /#EXT-X-SKIP:SKIPPED-SEGMENTS=(\d+)/;

// === 目录投票法仅对以下host生效 ===
const VOTING_HOSTS = [
  'kkzycdn.com:65', 'vod.360zyx.vip', 'bfikuncdn.com',
];

// 全局变量
let votingActive = false;
let votingAdTsSet = new Set();
let mainDir = '';

// 工具函数
function isVotingHost(url) {
  return VOTING_HOSTS.some(h => url && url.includes(h));
}
function getSecondDir(url) {
  try {
    const u = url.split('?')[0].split('#')[0];
    const m = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
    return m ? m[1] : '';
  } catch { return ''; }
}
function normalizeTsUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].split('#')[0].toLowerCase();
  }
}

// 目录投票法广告识别
function buildVotingAdTsSet(manifest, manifestUrl) {
  votingAdTsSet.clear();
  mainDir = '';
  const counts = {};
  const lines = manifest.split(/\r?\n/).filter(l => l.trim().endsWith('.ts'));
  lines.forEach(u => {
    const d = getSecondDir(u);
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  let max = 0;
  Object.entries(counts).forEach(([d, c]) => c > max && (max = c, mainDir = d));
  lines.forEach(u => getSecondDir(u) !== mainDir && votingAdTsSet.add(normalizeTsUrl(u)));
  if (votingAdTsSet.size) {
    console.log('[AdBlocker][投票法] 主目录:', mainDir, '广告片段:', Array.from(votingAdTsSet));
  }
}

// 加权广告识别
function isAdUrlDefault(trimmedLine) {
  const lower = trimmedLine.toLowerCase();
  for (const keyword of AD_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }
  for (const regex of AD_REGEX_RULES) {
    if (regex.test(trimmedLine)) return true;
  }
  return false;
}

/**
 * AdAwareLoader - 支持目录投票法和加权过滤
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    if (this.debugMode) {
      console.log(`${this.logPrefix} Initialized. Ad filtering is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
    }
  }

  /**
   * manifestText: m3u8 文本内容
   * manifestUrl: manifest 的实际url
   */
  _stripManifest(manifestText, manifestUrl) {
    if (!this.adFilteringEnabled) return manifestText;

    votingActive = isVotingHost(manifestUrl);
    if (votingActive) {
      buildVotingAdTsSet(manifestText, manifestUrl);
    }

    let inAdBreak = false;
    let skipCounter = 0;
    const lines = manifestText.split(/\r?\n/);
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (AD_TRIGGER_RE.test(trimmedLine)) {
        inAdBreak = true;
        if (this.debugMode) console.log(`${this.logPrefix} Ad Break Start: ${trimmedLine}`);
        filteredLines.push("#EXT-X-DISCONTINUITY");
        continue;
      }
      if (inAdBreak && AD_END_RE.test(trimmedLine)) {
        inAdBreak = false;
        if (this.debugMode) console.log(`${this.logPrefix} Ad Break End: ${trimmedLine}`);
        continue;
      }
      if (inAdBreak) {
        if (this.debugMode && !LL_HLS_PART_RE.test(trimmedLine)) console.log(`${this.logPrefix} Skipping line in ad break: ${trimmedLine}`);
        continue;
      }
      const skipMatch = trimmedLine.match(LL_HLS_SKIP_RE);
      if (skipMatch) {
        skipCounter = parseInt(skipMatch[1], 10) || 0;
        if (this.debugMode) console.log(`${this.logPrefix} Skip directive found. Skipping next ${skipCounter} segments.`);
        continue;
      }
      // ts片段判定逻辑
      if (!trimmedLine.startsWith("#")) {
        if (skipCounter > 0) {
          if (this.debugMode) console.log(`${this.logPrefix} Skipping segment via SKIP: ${trimmedLine}`);
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          skipCounter--;
          continue;
        }
        // === 新增：特定host走目录投票法 ===
        if (votingActive) {
          if (votingAdTsSet.has(normalizeTsUrl(trimmedLine))) {
            if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
              if (this.debugMode) console.log(`${this.logPrefix} [投票法] Remove #EXTINF for ad ts: ${filteredLines[filteredLines.length - 1]}`);
              filteredLines.pop();
            }
            if (this.debugMode) console.log(`${this.logPrefix} [投票法] Skipping ad ts: ${trimmedLine}`);
            continue;
          }
        } else {
          // 其他host走原有加权判定
          if (isAdUrlDefault(trimmedLine)) {
            if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
              if (this.debugMode) console.log(`${this.logPrefix} Removing #EXTINF for ad URL: ${filteredLines[filteredLines.length - 1]}`);
              filteredLines.pop();
            }
            if (this.debugMode) console.log(`${this.logPrefix} Skipping ad URL: ${trimmedLine}`);
            continue;
          }
        }
      }
      filteredLines.push(line);
    }
    return filteredLines.join("\n");
  }

  load(context, config, callbacks) {
    const { type, url } = context;
    // 清单(manifest)处理
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data, url);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    // 片段(fragment)处理，目录投票法和加权法都要一致处理
    else if (this.adFilteringEnabled && type === "fragment") {
      if (
        (votingActive && votingAdTsSet.has(normalizeTsUrl(url))) ||
        (!votingActive && AD_FRAGMENT_URL_RE.test(url))
      ) {
        if (this.debugMode) {
          console.warn(`${this.logPrefix} Blocking ad fragment by URI: ${url}`);
        }
        callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Ad fragment blocked by client" }, context, null);
        return;
      }
    }
    super.load(context, config, callbacks);
  }
}

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
