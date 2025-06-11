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
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg)[^\/]*\.ts([?#]|$)/i;

let totalAdCount = 0;
let totalAdSkipped = 0;

function isAdUrl(line) {
  const t = line.trim().toLowerCase();
  if (!t || t.startsWith('#')) return false;
  for (const keyword of AD_KEYWORDS) if (t.includes(keyword)) return true;
  for (const re of AD_REGEX_RULES) if (re.test(t)) return true;
  if (AD_FRAGMENT_URL_RE.test(t)) return true;
  return false;
}

function countAdSegments(manifestText) {
  let adCount = 0;
  const lines = manifestText.split(/\r?\n/);
  for (const line of lines) if (isAdUrl(line)) adCount++;
  totalAdCount = adCount;
  if (adCount) {
    console.info(`[AdBlocker] 共检测到广告片段数: ${adCount}`);
  }
}

// --- AdAwareLoader ---
class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
  }
  _stripManifest(manifestText) {
    if (!this.adFilteringEnabled) return manifestText;
    countAdSegments(manifestText);

    let skipCounter = 0;
    const lines = manifestText.split(/\r?\n/);
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (!trimmedLine.startsWith("#")) {
        let isAd = isAdUrl(trimmedLine);

        // 不论 debugMode，广告都要过滤掉！
        if (isAd) {
          if (
            filteredLines.length > 0 &&
            filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")
          ) {
            filteredLines.pop();
          }
          if (this.debugMode) {
            console.log(`${this.logPrefix} Skipping ad URL: ${trimmedLine}`);
          }
          continue;
        }
      }
      filteredLines.push(line);
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
    } else if (
      this.adFilteringEnabled &&
      type === "fragment" &&
      AD_FRAGMENT_URL_RE.test(url)
    ) {
      totalAdSkipped++;
      if (totalAdSkipped <= totalAdCount) {
        console.info(
          `[AdBlocker] 已跳过广告片段: ${totalAdSkipped}/${totalAdCount}`
        );
      }
      callbacks.onError(
        {
          code: Hls.ErrorCodes.NETWORK_ERROR,
          text: "Ad fragment blocked by client"
        },
        context,
        null
      );
      return;
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
