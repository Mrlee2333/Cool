// 广告相关的常量
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

let mainTsPrefix = '';  // 用于存储主 ts 片段前缀
let adCount = 0;  // 用于统计广告片段数量

function extractTsPrefix(url) {
  return url.replace(/[^/]+\.ts.*$/i, '');
}

function isLikelyAd(url, mainPrefix) {
  let adScore = 0;

  // 路径里广告关键词
  for (const kw of AD_KEYWORDS) {
    if (url.toLowerCase().includes(kw)) adScore++;
  }

  // 广告相关正则规则
  for (const reg of AD_REGEX_RULES) {
    if (reg.test(url)) adScore++;
  }

  // 明显广告文件名规则
  if (AD_FRAGMENT_URL_RE.test(url)) adScore += 2;  // 明显广告片段

  // 主片段前缀不同且带广告关键词
  if (mainPrefix && !url.startsWith(mainPrefix) && adScore > 0) adScore++;

  return adScore >= 2;  // 只有得分>=2时才认为是广告
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
    if (!this.adFilteringEnabled) return manifestText;

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

        // 如果 ts URL 认为是广告
        if (isLikelyAd(trimmedLine, mainTsPrefix)) {
          adCount++;
          if (this.debugMode) console.log(`${this.logPrefix} Skipped potential ad segment:`, trimmedLine);
          continue;
        }
      }
      filteredLines.push(line);
    }

    if (this.debugMode && adCount > 0) {
      console.log(`${this.logPrefix} Total ${adCount} ad-like segments skipped.`);
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
