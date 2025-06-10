import Hls from 'hls.js';

// 广告关键字和正则（根据你原来的）
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

// 前缀提取工具
function extractTsPrefix(url) {
  // 取最后一个斜杠前的部分
  const idx = url.lastIndexOf('/');
  return idx >= 0 ? url.slice(0, idx + 1) : '';
}

/**
 * AdAwareLoader - 自动识别主片段前缀并过滤广告
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    this.mainPrefix = '';        // 统计得到的主前缀
    this.adBlockedCount = 0;     // 本次广告片段计数
    this.prefixStatDone = false; // 是否已统计过
  }

  // 清洗 m3u8 文本
  _stripManifest(manifestText) {
    if (!this.adFilteringEnabled) return manifestText;

    const lines = manifestText.split(/\r?\n/);
    let prefixCount = {};
    let adBlockedCount = 0;
    let inAdBreak = false;
    let skipCounter = 0;
    let selectedMainPrefix = '';

    // 1. 统计所有 ts 片段前缀
    for (const line of lines) {
      const trimmed = line.trim();
      if (/\.ts([?#].*)?$/i.test(trimmed)) {
        const prefix = extractTsPrefix(trimmed);
        if (prefix) {
          prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
        }
      }
    }
    // 2. 选出现次数最多的前缀
    let maxCount = 0;
    for (const [prefix, count] of Object.entries(prefixCount)) {
      if (count > maxCount) {
        maxCount = count;
        selectedMainPrefix = prefix;
      }
    }
    if (selectedMainPrefix) {
      this.mainPrefix = selectedMainPrefix;
      this.prefixStatDone = true;
      if (this.debugMode) {
        console.log(`${this.logPrefix} 统计主片段前缀为: ${this.mainPrefix} (共${maxCount}条)`);
      }
    }

    // 3. 遍历拦截广告片段
    const filteredLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (AD_TRIGGER_RE.test(trimmedLine)) {
        inAdBreak = true;
        filteredLines.push("#EXT-X-DISCONTINUITY");
        continue;
      }
      if (inAdBreak && AD_END_RE.test(trimmedLine)) {
        inAdBreak = false;
        continue;
      }
      if (inAdBreak) continue;

      const skipMatch = trimmedLine.match(LL_HLS_SKIP_RE);
      if (skipMatch) {
        skipCounter = parseInt(skipMatch[1], 10) || 0;
        continue;
      }

      // 不是#开头的分片
      if (!trimmedLine.startsWith("#")) {
        // 过滤非主前缀片段
        if (this.mainPrefix && !trimmedLine.startsWith(this.mainPrefix)) {
          adBlockedCount++;
          // 若上一行是 #EXTINF: 也一并去掉
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          continue;
        }
        // 关键字和正则再保险
        let isAd = false;
        const lower = trimmedLine.toLowerCase();
        if (AD_KEYWORDS.some(k => lower.includes(k)) || AD_REGEX_RULES.some(r => r.test(trimmedLine))) {
          isAd = true;
        }
        if (AD_FRAGMENT_URL_RE.test(trimmedLine)) isAd = true;

        if (isAd) {
          adBlockedCount++;
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          continue;
        }
        if (skipCounter > 0) {
          skipCounter--;
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          continue;
        }
      }
      filteredLines.push(line);
    }

    // 打印一次总广告拦截数
    if (adBlockedCount > 0 && this.debugMode) {
      console.log(`${this.logPrefix} 共拦截广告片段：${adBlockedCount} 条`);
    }

    return filteredLines.join("\n");
  }

  load(context, config, callbacks) {
    const { type, url } = context;
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    // fragment 阶段过滤同上（留原逻辑以防误漏）
    else if (this.adFilteringEnabled && type === "fragment") {
      if (this.mainPrefix && !url.startsWith(this.mainPrefix)) {
        if (this.debugMode) {
          // 这里不再单独打印每条片段
        }
        callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Blocked by ts-prefix" }, context, null);
        return;
      }
      if (AD_FRAGMENT_URL_RE.test(url)) {
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
