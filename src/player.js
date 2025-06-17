// src/player.js
import Hls from 'hls.js';

// --- 黑名单与标签规则 (保持不变) ---
const AD_KEYWORDS = ['/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking', 'doubleclick.net'];
const AD_REGEX_RULES = [/^https?:\/\/[^\/]*?adserver\.[^\/]+\//i, /\/advertisements\//i];
const BLOCKED_EXTENSIONS_RE = /\.(vtt)$/i;
const AD_TRIGGER_RE = /#EXT-X-CUE-OUT/i;
const AD_END_RE = /#EXT-X-CUE-IN/i;

// ========================================================================
// !! 白名单策略引擎 (已增加debugMode控制) !!
// ========================================================================
const whitelistStrategies = [
  {
    name: "Date+Hash Fingerprint Strategy",
    detector: (url) => ['kkzycdn.com', 'ryplay17.com', '360zyx.vip'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl, debugMode) => { // 接收debugMode
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8})\/([a-zA-Z0-9_]+)\//);
      if (!match) return null;
      const contentSignature = { date: match[1], hash: match[2] };
      if (debugMode) console.log(`[白名单] Date+Hash策略已学习指纹: 日期=${contentSignature.date}, 哈希=${contentSignature.hash}`);
      return (fragUrl) => {
        const fragMatch = fragUrl.match(/\/(\d{8})\/([a-zA-Z0-9_]+)\//);
        if (fragMatch) return fragMatch[1] === contentSignature.date && fragMatch[2] === contentSignature.hash;
        return false;
      };
    }
  },
  {
    name: "JPEG Date Fingerprint Strategy",
    detector: (url) => url.includes('play.ly166.com'),
    createValidator: (manifestText, baseUrl, debugMode) => { // 接收debugMode
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8})\//);
      if (!match) return null;
      const contentDate = match[1];
      if (debugMode) console.log(`[白名单] JPEG日期策略已学习指纹: 日期=${contentDate}`);
      return (fragUrl) => {
        if (!/\.jpe?g$/i.test(fragUrl)) return true;
        const fragMatch = fragUrl.match(/\/(\d{8})\//);
        return fragMatch ? fragMatch[1] === contentDate : false;
      };
    }
  },
  {
    name: "Domain-Specific Sequence Strategy",
    detector: (url) => ['selfcdn.simaguo.com', 'cdn.wlcdn88.com'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl, debugMode) => { // 接收debugMode
      let lastContentNumber = null;
      if (debugMode) console.log(`[白名单] 特定域名序列策略已激活，将严格检查数字连续性。`);
      return (fragUrl) => {
        const extractNumber = (url) => { const m = url.match(/(?:[a-zA-Z\-_]*)(\d+)\.(?:ts|jpeg|jpg)/i); return m ? parseInt(m[1], 10) : null; };
        const currentNumber = extractNumber(fragUrl);
        if (currentNumber === null) return false;
        if (lastContentNumber === null) { lastContentNumber = currentNumber; return true; }
        if (currentNumber === lastContentNumber + 1) { lastContentNumber = currentNumber; return true; }
        if (debugMode) console.log(`[白名单] 数字序列策略命中: 序列中断 (期望: ${lastContentNumber + 1}, 得到: ${currentNumber})`);
        return false;
      };
    }
  }
];

class AdAwareLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const customConfig = config.p2pConfig || {};
        this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
        this.debugMode = customConfig.debugMode === true;
        this.logPrefix = '[AdBlocker]';
        if (this.debugMode) console.log(`${this.logPrefix} Initialized.`);
    }

    _stripManifest(manifestText, baseUrl) {
        if (!this.adFilteringEnabled) return manifestText;

        const activeWhitelistStrategy = whitelistStrategies.find(s => s.detector(baseUrl));
        // 将 debugMode 传递给 createValidator
        const checkIsContent = activeWhitelistStrategy ? activeWhitelistStrategy.createValidator(manifestText, baseUrl, this.debugMode) : null;
        
        if (this.debugMode) {
            if (activeWhitelistStrategy) {
                console.log(`[策略引擎] 已激活白名单策略: ${activeWhitelistStrategy.name}`);
            } else {
                console.log(`[策略引擎] 未激活任何特定白名单策略，仅使用通用黑名单。`);
            }
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
                else if (checkIsContent && !checkIsContent(fragUrl)) { 
                    if(this.debugMode) console.log(`[广告检测] 命中: 白名单验证失败 -> ${fragUrl}`);
                    isAd = true;
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
        
        if (this.debugMode && adCount > 0) console.log(`${this.logPrefix} Filtering complete. Removed ${adCount} ad fragments.`);
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

function isUniversalAd(url, debugMode) {
    const lowerUrl = url.toLowerCase();
    if (BLOCKED_EXTENSIONS_RE.test(lowerUrl)) {
        if(debugMode) console.log(`[黑名单] 命中: 非法文件扩展名 -> ${url}`);
        return true;
    }
    for (const keyword of AD_KEYWORDS) { 
        if (lowerUrl.includes(keyword)) {
            if(debugMode) console.log(`[黑名单] 命中: 关键字 '${keyword}' -> ${url}`);
            return true;
        }
    }
    for (const regex of AD_REGEX_RULES) { 
        if (regex.test(url)) {
            if(debugMode) console.log(`[黑名单] 命中: 正则 '${regex.source}' -> ${url}`);
            return true;
        }
    }
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