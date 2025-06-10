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

let mainTsPrefix = '';
let adCount = 0;  // 用于统计广告片段数量

function extractTsPrefix(url) {
  return url.replace(/[^/]+\.ts.*$/i, '');
}

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
      return manifestText;
    }

    let inAdBreak = false;
    let skipCounter = 0;
    const lines = manifestText.split(/\r?\n/);
    const filteredLines = [];

    // 自动寻找主 ts 片段前缀
    let localMainTsPrefix = mainTsPrefix;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // 过滤广告URL
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

      if (!trimmedLine.startsWith("#")) {
        if (skipCounter > 0) {
          filteredLines.pop();
          skipCounter--;
          continue;
        }

        // 如果主片段前缀不匹配则丢弃
        if (mainTsPrefix && !trimmedLine.startsWith(mainTsPrefix)) {
          adCount++;
          continue;
        }

        // 检查广告链接
        let isAdUrl = false;
        const lowerTrimmedLine = trimmedLine.toLowerCase();
        for (const keyword of AD_KEYWORDS) {
          if (lowerTrimmedLine.includes(keyword)) {
            isAdUrl = true;
            break;
          }
        }

        if (!isAdUrl) {
          for (const regex of AD_REGEX_RULES) {
            if (regex.test(trimmedLine)) {
              isAdUrl = true;
              break;
            }
          }
        }

        if (isAdUrl) {
          adCount++;
          continue;
        }
      }

      filteredLines.push(line);
    }

    // 如果广告片段过滤成功，输出总数
    if (this.debugMode && adCount > 0) {
      console.log(`${this.logPrefix} Total ${adCount} ads were skipped.`);
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
    } else if (this.adFilteringEnabled && type === "fragment") {
      if (mainTsPrefix && !url.startsWith(mainTsPrefix)) {
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
