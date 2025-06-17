// src/player.js
import Hls from 'hls.js';

// --- 黑名单规则 ---
const AD_KEYWORDS = ['/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking', 'doubleclick.net'];
const AD_REGEX_RULES = [/^https?:\/\/[^\/]*?adserver\.[^\/]+\//i, /\/advertisements\//i];
const BLOCKED_EXTENSIONS_RE = /\.(vtt)$/i; // 仅拦截字幕等非视频文件，jpeg由白名单处理

// --- HLS标准广告标签规则 ---
const AD_TRIGGER_RE = /#EXT-X-CUE-OUT/i;
const AD_END_RE = /#EXT-X-CUE-IN/i;

// ========================================================================
// !! 白名单策略引擎 !!
// ========================================================================
const whitelistStrategies = [
  // 策略一：Date+Hash 指纹策略 (保持不变)
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
        if (fragMatch) return fragMatch[1] === contentSignature.date && fragMatch[2] === contentSignature.hash;
        return false;
      };
    }
  },
  // [新增] 策略二：专门处理 play.ly166.com 的 JPEG 广告
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
        // 不论是.ts还是.jpeg，都必须匹配日期指纹
        return fragMatch ? fragMatch[1] === contentDate : false;
      };
    }
  },
  // [修改] 策略三：为特定域名提供严格的数字序列检测
  {
    name: "Domain-Specific Sequence Strategy",
    detector: (url) => ['selfcdn.simaguo.com', 'cdn.wlcdn88.com','tyyszywvod5.com'].some(domain => url.includes(domain)),
    createValidator: () => {
      let lastContentNumber = null;
      console.log(`[白名单] 数字序列策略已激活，将严格检查数字连续性。`);
      return (fragUrl) => {
        const extractNumber = (url) => {
          const m = url.match(/(?:[a-zA-Z\-_]*)(\d+)\.(?:ts|jpeg|jpg)/i);
          return m ? parseInt(m[1], 10) : null;
        };
        const currentNumber = extractNumber(fragUrl);
        if (currentNumber === null) return false; // 在此策略下，没有编号的片段被视为非正片
        if (lastContentNumber === null) { lastContentNumber = currentNumber; return true; }
        if (currentNumber === lastContentNumber + 1) { lastContentNumber = currentNumber; return true; }
        // 序列中断，是广告，但我们需要让序列从这个新数字重新开始，以防是多段正片
        // 为简化，这里我们采取严格中断策略
        console.log(`[白名单] 数字序列策略命中: 序列中断 (期望: ${lastContentNumber + 1}, 得到: ${currentNumber})`);
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
    }

    _stripManifest(manifestText, baseUrl) {
        if (!this.adFilteringEnabled) return manifestText;

        const activeWhitelistStrategy = whitelistStrategies.find(s => s.detector(baseUrl));
        const checkIsContent = activeWhitelistStrategy ? activeWhitelistStrategy.createValidator(manifestText, baseUrl) : null;
        if (activeWhitelistStrategy) {
            console.log(`[策略引擎] 已激活白名单策略: ${activeWhitelistStrategy.name}`);
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
                
                // 1. 黑名单检测
                if (isUniversalAd(fragUrl)) {
                    isAd = true;
                } 
                // 2. 如果有激活的白名单策略，则使用它进行判断
                else if (checkIsContent) {
                    if (!checkIsContent(fragUrl)) isAd = true;
                }
                // 3. 如果没有激活的白名单策略，则默认放行（因为黑名单已检查过）

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
        
        if (this.debugMode) console.log(`${this.logPrefix} Filtering complete. Removed ${adCount} ad fragments.`);
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

function isUniversalAd(url) {
    const lowerUrl = url.toLowerCase();
    if (BLOCKED_EXTENSIONS_RE.test(lowerUrl)) { return true; }
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
    };
}