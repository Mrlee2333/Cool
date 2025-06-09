import Hls from 'hls.js';

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

// ---- 自动主片段前缀匹配 ----
let mainTsPrefix = '';
function extractTsPrefix(url) {
  // 取到最后一个/为止，保证片段都用同一前缀
  return url.replace(/[^/]+\.ts.*$/i, '');
}

/**
 * AdAwareLoader - 能感知并过滤广告（以及前缀不符的片段）的 HLS 加载器
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
  static _alreadyInitLog = false;
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    if (this.debugMode && !AdAwareLoader._alreadyInitLog) {
      console.log(`${this.logPrefix} Initialized. Ad filtering is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
      AdAwareLoader._alreadyInitLog = true;
    }
  }

  _stripManifest(manifestText) {
    if (!this.adFilteringEnabled) {
      if (this.debugMode) console.log(`${this.logPrefix} Manifest stripping skipped (filter disabled).`);
      return manifestText;
    }
    let inAdBreak = false;
    let skipCounter = 0;
    const lines = manifestText.split(/\r?\n/);
    const filteredLines = [];

    // 自动找第一个 ts 片段前缀，作为白名单前缀（不含广告规则的片段）
    let localMainTsPrefix = mainTsPrefix;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      // 非广告 url 且是 .ts
      if (
        line.endsWith('.ts') &&
        !AD_FRAGMENT_URL_RE.test(line) &&
        !AD_KEYWORDS.some(k => line.toLowerCase().includes(k)) &&
        !AD_REGEX_RULES.some(r => r.test(line))
      ) {
        localMainTsPrefix = extractTsPrefix(line);
        if (this.debugMode) console.log(`${this.logPrefix} Main ts prefix auto-detected:`, localMainTsPrefix);
        break;
      }
    }
    if (localMainTsPrefix) mainTsPrefix = localMainTsPrefix;

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
      // 不是#开头（分片），先走主片段前缀过滤
      if (!trimmedLine.startsWith("#")) {
        if (skipCounter > 0) {
          if (this.debugMode) console.log(`${this.logPrefix} Skipping segment via SKIP: ${trimmedLine}`);
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          skipCounter--;
          continue;
        }
        // 主片段前缀不符直接丢弃
        if (mainTsPrefix && !trimmedLine.startsWith(mainTsPrefix)) {
          if (this.debugMode) console.log(`${this.logPrefix} Drop ts (by prefix): ${trimmedLine}`);
          continue;
        }
        let isAdUrl = false;
        const lowerTrimmedLine = trimmedLine.toLowerCase();
        for (const keyword of AD_KEYWORDS) {
          if (lowerTrimmedLine.includes(keyword)) {
            isAdUrl = true;
            if (this.debugMode) console.log(`${this.logPrefix} Ad URL detected by keyword '${keyword}': ${trimmedLine}`);
            break;
          }
        }
        if (!isAdUrl) {
          for (const regex of AD_REGEX_RULES) {
            if (regex.test(trimmedLine)) {
              isAdUrl = true;
              if (this.debugMode) console.log(`${this.logPrefix} Ad URL detected by regex '${regex.source}': ${trimmedLine}`);
              break;
            }
          }
        }
        if (isAdUrl) {
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            if (this.debugMode) console.log(`${this.logPrefix} Removing #EXTINF for ad URL: ${filteredLines[filteredLines.length - 1]}`);
            filteredLines.pop();
          }
          if (this.debugMode) console.log(`${this.logPrefix} Skipping ad URL: ${trimmedLine}`);
          continue;
        }
      }
      filteredLines.push(line);
    }
    return filteredLines.join("\n");
  }

  load(context, config, callbacks) {
    const { type, url } = context;

    // manifest/level 阶段，提取主片段前缀并清理
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    // fragment 阶段：白名单前缀检查+广告url过滤
    else if (this.adFilteringEnabled && type === "fragment") {
      // 主片段前缀不符直接拒绝
      if (mainTsPrefix && !url.startsWith(mainTsPrefix)) {
        if (this.debugMode) {
          console.warn(`${this.logPrefix} Blocked fragment by prefix: ${url}`);
        }
        callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Blocked by ts-prefix" }, context, null);
        return;
      }
      // 你的原有广告URL正则过滤（冗余保险）
      if (AD_FRAGMENT_URL_RE.test(url)) {
        if (this.debugMode) {
          console.warn(`${this.logPrefix} Blocking ad fragment by URI: ${url}`);
        }
        callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Ad fragment blocked by client" }, context, null);
        return;
      }
    }
    // 其他正常请求
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
