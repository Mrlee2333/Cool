// src/player.js
import Hls from 'hls.js';

// --- 黑名单规则 ---
const AD_KEYWORDS = ['/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking', 'doubleclick.net', 'googleads.g.doubleclick.net', 'googlesyndication.com', 'imasdk.googleapis.com', 'videoad', 'preroll', 'midroll', 'postroll', 'imasdk'];
const AD_REGEX_RULES = [/^https?:\/\/[^\/]*?adserver\.[^\/]+\//i, /^https?:\/\/[^\/]*?sponsor\.[^\/]+\//i, /\/advertisements\//i];
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg)[^\/]*\.ts([?#]|$)/i;

// --- HLS标准广告标签规则 ---
const AD_TRIGGER_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CLASS="?ad"?|CUE-OUT|SCTE35-OUT|PLACEMENT-OPPORTUNITY|SCTE35-OUT-CONT)/i;
const AD_END_RE = /#EXT(?:-X)?-(?:CUE|SCTE35|DATERANGE).*?(?:CUE-IN|SCTE35-IN|PLACEMENT-OPPORTUNITY-END)/i;

// ========================================================================
// !! 白名单策略引擎 (已修复) !!
// ========================================================================
const whitelistStrategies = [
  {
    name: "Regex+Keyword Strategy",
    detector: (url) => true, // 默认使用正则和关键字
    createValidator: (manifestText, baseUrl) => {
      const tsUrlLines = manifestText.split('\n').filter(line => !line.startsWith('#') && line.includes('.ts'));
      if (tsUrlLines.length < 3) return null;

      const getCommonPrefix = (s1, s2) => { 
        let i = 0; 
        while(i < s1.length && i < s2.length && s1[i] === s2[i]) { 
          i++; 
        } 
        return s1.substring(0, i); 
      };

      const url1 = new URL(tsUrlLines[0], baseUrl).href;
      const url2 = new URL(tsUrlLines[1], baseUrl).href;
      const url3 = new URL(tsUrlLines[2], baseUrl).href;
      const prefix12 = getCommonPrefix(url1, url2);
      const finalPrefix = getCommonPrefix(prefix12, url3);
      const lastSlashIndex = finalPrefix.lastIndexOf('/');
      if (lastSlashIndex <= "https://".length) return null;
      const commonPrefix = finalPrefix.substring(0, lastSlashIndex + 1);
      
      // 默认策略：数字顺序广告
      let lastContentNumber = null;
      return (fragUrl) => {
        if (!fragUrl.startsWith(commonPrefix)) return false;
        const m = fragUrl.match(/(?:[a-zA-Z\-_]*)(\d+)\.ts/);
        const currentNumber = m ? parseInt(m[1], 10) : null;
        if (currentNumber !== null) {
          if (lastContentNumber !== null && currentNumber !== lastContentNumber + 1) {
            return false;
          }
          lastContentNumber = currentNumber;
        }
        return true;
      };
    }
  },

  // ------- 数字顺序策略: 使用特定域名 ------- 
  {
    name: "Numeric Sequence Domain Strategy",
    detector: (url) => ['selfcdn.simaguo.com', 'cdn.wlcdn88.com', 'tyyszywvod5.com'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl) => {
      const tsUrlLines = manifestText.split('\n').filter(line => !line.startsWith('#') && line.includes('.ts'));
      if (tsUrlLines.length < 3) return null;

      const getCommonPrefix = (s1, s2) => { 
        let i = 0; 
        while(i < s1.length && i < s2.length && s1[i] === s2[i]) { 
          i++; 
        } 
        return s1.substring(0, i); 
      };

      const url1 = new URL(tsUrlLines[0], baseUrl).href;
      const url2 = new URL(tsUrlLines[1], baseUrl).href;
      const url3 = new URL(tsUrlLines[2], baseUrl).href;
      const prefix12 = getCommonPrefix(url1, url2);
      const finalPrefix = getCommonPrefix(prefix12, url3);
      const lastSlashIndex = finalPrefix.lastIndexOf('/');
      if (lastSlashIndex <= "https://".length) return null;
      const commonPrefix = finalPrefix.substring(0, lastSlashIndex + 1);
      
      let lastContentNumber = null;
      return (fragUrl) => {
        if (!fragUrl.startsWith(commonPrefix)) return false;
        const m = fragUrl.match(/(?:[a-zA-Z\-_]*)(\d+)\.ts/);
        const currentNumber = m ? parseInt(m[1], 10) : null;
        if (currentNumber !== null) {
          if (lastContentNumber !== null && currentNumber !== lastContentNumber + 1) {
            return false;
          }
          lastContentNumber = currentNumber;
        }
        return true;
      };
    }
  },

  // ------- 新增策略: 处理 JPEG 广告 ------- 
  {
    name: "JPEG Date Fingerprint Strategy",
    detector: (url) => ['play.ly166.com'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl) => {
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8})\//);
      if (!match) return null;
      const contentDate = match[1];
      console.log(`[白名单] JPEG日期策略已学习指纹: 日期=${contentDate}`);
      return (fragUrl) => {
        const fragMatch = fragUrl.match(/\/(\d{8})\//);
        return fragMatch ? fragMatch[1] === contentDate : false;
      };
    }
  },

  // ------- Date+Hash 策略: 仅适配指定域名 -------
  {
    name: "Date+Hash Fingerprint Strategy",
    detector: (url) => ['kkzycdn.com', 'ryplay17.com', '360zyx.vip'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl) => {
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8})\/([a-zA-Z0-9_]+)\//);
      if (!match) return null;
      const contentSignature = { date: match[1], hash: match[2] };
      console.log(`[白名单] Date+Hash策略已学习指纹: 日期=${contentSignature.date}, 哈希=${contentSignature.hash}`);
      return (fragUrl) => {
        const fragMatch = fragUrl.match(/\/(\d{8})\/([a-zA-Z0-9_]+)\//);
        return fragMatch && fragMatch[1] === contentSignature.date && fragMatch[2] === contentSignature.hash;
      };
    }
  }
];

// -------- 主要加载器 - 去广告逻辑 --------
class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    this.adPrinted = false; // 避免重复打印广告过滤日志
    if (this.debugMode) console.log(`${this.logPrefix} Initialized. Ad filtering is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
  }

  _stripManifest(manifestText, baseUrl) {
    if (!this.adFilteringEnabled) return manifestText;

    const activeWhitelistStrategy = whitelistStrategies.find(s => s.detector(baseUrl));
    const checkIsContent = activeWhitelistStrategy ? activeWhitelistStrategy.createValidator(manifestText, baseUrl) : null;
    if (activeWhitelistStrategy && !checkIsContent) {
      if(this.debugMode) console.warn(`${this.logPrefix} Strategy "${activeWhitelistStrategy.name}" failed to learn pattern.`);
    }

    let inAdBreakByTag = false;
    const lines = manifestText.split(/\r?\n/);
    const filteredLines = [];
    let adCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (AD_TRIGGER_RE.test(trimmedLine)) { inAdBreakByTag = true; continue; }
      if (inAdBreakByTag && AD_END_RE.test(trimmedLine)) { inAdBreakByTag = false; continue; }
      if (inAdBreakByTag) { adCount++; continue; }

      if (!trimmedLine.startsWith("#")) {
        const fragUrl = new URL(trimmedLine, baseUrl).href;
        let isAd = false;
        
        if (checkIsContent) {
          if (!checkIsContent(fragUrl)) isAd = true;
        }

        if (isAd) {
          adCount++;
          if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
            filteredLines.pop();
          }
          continue;
        }
      }
      
      filteredLines.push(line);
    }

    if (this.debugMode && !this.adPrinted) {
      console.log(`${this.logPrefix} Filtering complete. Removed ${adCount} ad fragments.`);
      this.adPrinted = true; // 仅第一次打印去广告结果
    }
    return filteredLines.join("\n");
  }

  load(context, config, callbacks) {
    const { type, url } = context;

    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data, context.url);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    else if (this.adFilteringEnabled && type === "fragment" && AD_FRAGMENT_URL_RE.test(url)) {
      if (this.debugMode) console.warn(`${this.logPrefix} Blocking ad fragment by URI: ${url}`);
      callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Ad fragment blocked by client" }, context, null);
      return;
    }
    
    super.load(context, config, callbacks);
  }
}

// 辅助函数，正则+关键字判断广告
function isAdUniversalAd(url) {
  const lowerUrl = url.toLowerCase();
  for (const keyword of AD_KEYWORDS) { if (lowerUrl.includes(keyword)) return true; }
  for (const regex of AD_REGEX_RULES) { if (regex.test(url)) return true; }
  return false;
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
