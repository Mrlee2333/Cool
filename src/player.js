// src/player.js
import Hls from 'hls.js';

// --- 黑名单与HLS标签规则 ---
const AD_KEYWORDS = ['/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking', 'doubleclick.net'];
const AD_REGEX_RULES = [/^https?:\/\/[^\/]*?adserver\.[^\/]+\//i, /\/advertisements\//i];
const BLOCKED_EXTENSIONS_RE = /\.(vtt)$/i;
const AD_TRIGGER_RE = /#EXT-X-CUE-OUT/i;
const AD_END_RE = /#EXT-X-CUE-IN/i;

// [新增] 两个独立的正则表达式常量
const V_DAAYEE_ADEFGI_RE = /v\d+\.(daayee\.com|adefgi\.top)/i;
const VODCND_MYRQSB_RE = /vodcnd\d+\.myrqsb\.com/i;


// ========================================================================
// !! 开心超人引擎 !!
// ========================================================================
const whitelistStrategies = [
  // [修改] 策略一：扩展其 detector，使其能处理更多域名模式
  {
    name: "Unified Date+Hash Fingerprint Strategy",
    detector: (url) => {
      // 检查固定域名列表
      const fixedDomains = ['tyyszywvod5.com', 'kkzycdn.com', 'ryplay17.com', '360zyx.vip', 'bfikuncdn.com'];
      if (fixedDomains.some(domain => url.includes(domain))) return true;

      // 检查通配符域名正则列表
      const regexPatterns = [VODCND_MYRQSB_RE];
      if (regexPatterns.some(pattern => pattern.test(url))) return true;

      return false;
    },
    createValidator: (manifestText, baseUrl) => {
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8}|\d{6}\/\d{2})\/([a-zA-Z0-9_]+)\//);
      if (!match) return null;
      const normalizedDate = match[1].replace('/', '');
      const contentSignature = { date: normalizedDate, hash: match[2] };
      console.log(`开心超人开始超人: 日期=${contentSignature.date}, 地址=${contentSignature.hash}`);
      return (fragUrl) => {
        const fragMatch = fragUrl.match(/\/(\d{8}|\d{6}\/\d{2})\/([a-zA-Z0-9_]+)\//);
        if (fragMatch) {
          const fragDate = fragMatch[1].replace('/', '');
          return fragDate === contentSignature.date && fragMatch[2] === contentSignature.hash;
        }
        return false;
      };
    }
  },
  // 策略二：JPEG 日期指纹策略
{
    name: "JPEG Date Fingerprint Strategy",
    detector: (url) => url.includes('play.ly166.com') || V_DAAYEE_ADEFGI_RE.test(url),
    createValidator: (manifestText, baseUrl) => {
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      
      // 使用更通用的正则来匹配日期
      const match = firstFragUrl.match(/\/(\d{8}|\d{6}\/\d{2})\//);
      if (!match) return null;

      const contentDate = match[1].replace('/', '');
      console.log(`开心超人开始超人：日期=${contentDate}`);
      
      return (fragUrl) => {
        if (!/\.jpe?g$/i.test(fragUrl)) return true; // 如果不是jpeg，直接放行
        const fragMatch = fragUrl.match(/\/(\d{8}|\d{6}\/\d{2})\//);
        return fragMatch ? fragMatch[1].replace('/', '') === contentDate : false;
      };
    }
  },
  // 策略三：特定域名数字序列策略 (保持不变)
  {
    name: "Domain-Specific Sequence Strategy",
    detector: (url) => ['selfcdn.simaguo.com', 'cdn.wlcdn88.com', 'm3u.nikanba.live'].some(domain => url.includes(domain)),
    createValidator: () => {
      let lastContentNumber = null;
      console.log(`开心超人启动！`);
      return (fragUrl) => {
        const extractNumber = (url) => { const m = url.match(/(?:[a-zA-Z\-_]*)(\d+)\.(?:ts|jpeg|jpg)/i); return m ? parseInt(m[1], 10) : null; };
        const currentNumber = extractNumber(fragUrl);
        if (currentNumber === null) return false;
        if (lastContentNumber === null) { lastContentNumber = currentNumber; return true; }
        if (currentNumber === lastContentNumber + 1) { lastContentNumber = currentNumber; return true; }
        return false;
      };
    }
  }
];

// ... AdAwareLoader 和其他代码保持不变 ...
class AdAwareLoader extends Hls.DefaultConfig.loader {
    constructor(config) { super(config); const customConfig = config.p2pConfig || {}; this.adFilteringEnabled = customConfig.adFilteringEnabled !== false; this.debugMode = customConfig.debugMode === true; this.logPrefix = '开心超人'; }
    _stripManifest(manifestText, baseUrl) {
        if (!this.adFilteringEnabled) return manifestText;
        const activeWhitelistStrategy = whitelistStrategies.find(s => s.detector(baseUrl));
        const checkIsContent = activeWhitelistStrategy ? activeWhitelistStrategy.createValidator(manifestText, baseUrl, this.debugMode) : null;
        if (this.debugMode) {
            if (activeWhitelistStrategy) { console.log(`开心超人启动: ${activeWhitelistStrategy.name}`); }
            else { console.log(`开心超人在度假`); }
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
                if (isUniversalAd(fragUrl, this.debugMode)) { isAd = true; }
                else if (checkIsContent && !checkIsContent(fragUrl)) { if(this.debugMode) console.log(`开心超人准备超: '${activeWhitelistStrategy.name}'已超 -> ${fragUrl}`); isAd = true; }
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
        if (this.debugMode && adCount > 0) console.log(`${this.logPrefix} 超 ${adCount} 个大明星`);
        return filteredLines.join("\n");
    }
    load(context, config, callbacks) {
        const { type } = context;
        if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
            const originalOnSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, context) => {
                if (typeof response.data === "string") {
                    response.data = this._stripManifest(response.data, context.url);
                }
                originalOnSuccess(response, stats, context);
            };
        }
        super.load(context, config, callbacks);
    }
}
function isUniversalAd(url, debugMode) { const lowerUrl = url.toLowerCase(); if (BLOCKED_EXTENSIONS_RE.test(lowerUrl)) { if (debugMode) console.log(`开心超人: 非法文件扩展名 -> ${url}`); return true; } for (const keyword of AD_KEYWORDS) { if (lowerUrl.includes(keyword)) { if (debugMode) console.log(`开心超人: 关键字 '${keyword}' -> ${url}`); return true; } } for (const regex of AD_REGEX_RULES) { if (regex.test(url)) { if (debugMode) console.log(`开心超人: 正则 '${regex.source}' -> ${url}`); return true; } } return false; }
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
