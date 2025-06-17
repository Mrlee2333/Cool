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
    name: "Date+Hash Fingerprint Strategy",
    detector: (url) => { const targetDomains = ['kkzycdn.com', 'ryplay17.com', '360zyx.vip']; return targetDomains.some(domain => url.includes(domain)); },
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
  {
    name: "Generic Sequence Strategy",
    detector: () => true, // 默认备用策略
    // !! 核心修复：重写此处的 `createValidator`，不再使用内部API !!
    createValidator: (manifestText, baseUrl) => {
        // 通过轻量级文本解析获取所有ts文件行
        const tsUrlLines = manifestText.split('\n').filter(line => !line.startsWith('#') && line.includes('.ts'));
        
        if (tsUrlLines.length < 3) return null; // 切片不足，无法学习

        const getCommonPrefix = (s1, s2) => { let i = 0; while(i < s1.length && i < s2.length && s1[i] === s2[i]){ i++; } return s1.substring(0, i); };
        
        // 解析前三个URL
        const url1 = new URL(tsUrlLines[0], baseUrl).href;
        const url2 = new URL(tsUrlLines[1], baseUrl).href;
        const url3 = new URL(tsUrlLines[2], baseUrl).href;
        
        // 计算公共前缀
        const prefix12 = getCommonPrefix(url1, url2);
        const finalPrefix = getCommonPrefix(prefix12, url3);
        const lastSlashIndex = finalPrefix.lastIndexOf('/');
        
        if (lastSlashIndex <= "https://".length) return null; // 学习到的前缀无意义

        const commonPrefix = finalPrefix.substring(0, lastSlashIndex + 1);
        console.log(`[白名单] 数字序列策略已学习URL前缀: ${commonPrefix}`);
        
        let lastContentNumber = null;
        
        // 返回最终的检查函数
        return (fragUrl) => {
            if (!fragUrl.startsWith(commonPrefix)) return false; // 首先检查前缀
            
            const extractNumber = (url) => { const m = url.match(/(?:[a-zA-Z\-_]*)(\d+)\.ts/); return m ? parseInt(m[1], 10) : null; };
            const currentNumber = extractNumber(fragUrl);
            
            if (currentNumber !== null) {
                // 如果上一个正片的编号存在，且当前编号不连续，则判定为非正片
                if (lastContentNumber !== null && currentNumber !== lastContentNumber + 1) return false;
                // 这是一个连续的正片，更新编号
                lastContentNumber = currentNumber;
            }
            // 如果没有编号或者序列连续，则认为是正片
            return true;
        };
    }
  }
];

/**
 * AdAwareLoader - 一个能感知并过滤广告的 HLS 加载器
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const customConfig = config.p2pConfig || {};
        this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
        this.debugMode = customConfig.debugMode === true;
        this.logPrefix = '[AdBlocker]';
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
                
                if (isAdUniversalAd(fragUrl)) { // 新增的isAdUniversalAd辅助函数
                    isAd = true;
                } else if (checkIsContent) {
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
        
        if (this.debugMode) console.log(`${this.logPrefix} Filtering complete. Removed ${adCount} ad fragments.`);
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

// 辅助函数，将黑名单检查逻辑提取出来
function isAdUniversalAd(url) {
    const lowerUrl = url.toLowerCase();
    for (const keyword of AD_KEYWORDS) { if (lowerUrl.includes(keyword)) return true; }
    for (const regex of AD_REGEX_RULES) { if (regex.test(url)) return true; }
    return false;
}


/**
 * 导出一个函数，用于生成 HLS 的自定义配置。
 */
export function getHlsConfig(options = {}) {
    return {
        p2pConfig: {
            adFilteringEnabled: options.adFilteringEnabled !== false,
            debugMode: options.debugMode === true,
        },
        loader: AdAwareLoader,
        // 其他 HLS 优化配置
        maxBufferLength: 60,
        maxBufferSize: 100 * 1000 * 1000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 2,
    };
}
