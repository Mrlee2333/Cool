// src/player.js
import Hls from 'hls.js';

// --- 黑名单与HLS标签规则 ---
const AD_KEYWORDS = ['/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking', 'doubleclick.net'];
const AD_REGEX_RULES = [/^https?:\/\/[^\/]*?adserver\.[^\/]+\//i, /\/advertisements\//i];
const BLOCKED_EXTENSIONS_RE = /\.(vtt)$/i;
const AD_TRIGGER_RE = /#EXT-X-CUE-OUT/i;
const AD_END_RE = /#EXT-X-CUE-IN/i;

// ========================================================================
// !! 白名单策略引擎 !!
// ========================================================================
const whitelistStrategies = [
  // 策略一：Date+Hash 指纹策略
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
  // 策略二：JPEG 日期指纹策略
  {
    name: "JPEG Date Fingerprint Strategy",
    detector: (url) => url.includes('play.ly166.com'),
    createValidator: (manifestText, baseUrl) => {
      const firstFragUrlLine = manifestText.split('\n').find(line => !line.startsWith('#') && line.includes('.ts'));
      if (!firstFragUrlLine) return null;
      const firstFragUrl = new URL(firstFragUrlLine, baseUrl).href;
      const match = firstFragUrl.match(/\/(\d{8})\//);
      if (!match) return null;
      const contentDate = match[1];
      console.log(`[白名单] JPEG日期策略已学习指纹: 日期=${contentDate}`);
      return (fragUrl) => {
        if (!/\.jpe?g$/i.test(fragUrl)) return true;
        const fragMatch = fragUrl.match(/\/(\d{8})\//);
        return fragMatch ? fragMatch[1] === contentDate : false;
      };
    }
  },
  // [核心修改] 策略三：特定域名数字序列策略 (逻辑重构)
  {
    name: "Domain-Specific Sequence Strategy",
    detector: (url) => ['selfcdn.simaguo.com', 'cdn.wlcdn88.com'].some(domain => url.includes(domain)),
    createValidator: (manifestText, baseUrl) => {
      let lastContentNumber = null;
      const logPrefix = '[白名单-序列策略]';
      console.log(`${logPrefix} 已激活，将严格检查数字连续性。`);
      
      const extractNumber = (url) => {
        const m = url.match(/(?:[a-zA-Z\-_]*)(\d+)\.(ts|jpeg|jpg)/i);
        return m ? parseInt(m[1], 10) : null;
      };

      // 返回最终的检查函数 (check function)
      return (fragUrl) => {
        const currentNumber = extractNumber(fragUrl);

        // case 1: 当前URL没有可识别的序列号
        if (currentNumber === null) {
          console.log(`${logPrefix} 判断为广告 (原因: URL中无序列号) -> ${fragUrl}`);
          return false; // 在此策略下，没有编号的片段被视为非正片
        }

        // case 2: 这是我们看到的第一个带编号的片段
        if (lastContentNumber === null) {
          console.log(`${logPrefix} 学习到序列起点: ${currentNumber}`);
          lastContentNumber = currentNumber;
          return true; // 认定为正片序列起点
        }
        
        // case 3: 检查序列是否连续
        if (currentNumber === lastContentNumber + 1) {
          lastContentNumber = currentNumber; // 更新序列
          return true; // 是连续的正片
        }
        
        // case 4: 序列中断
        console.log(`${logPrefix} 判断为广告 (原因: 序列中断，期望 ${lastContentNumber + 1}，得到 ${currentNumber}) -> ${fragUrl}`);
        return false;
      };
    }
  }
];


class AdAwareLoader extends Hls.DefaultConfig.loader {
    constructor(config) { super(config); const customConfig = config.p2pConfig || {}; this.adFilteringEnabled = customConfig.adFilteringEnabled !== false; this.debugMode = customConfig.debugMode === true; this.logPrefix = '[AdBlocker]'; }
    _stripManifest(manifestText, baseUrl) {
        if (!this.adFilteringEnabled) return manifestText;
        const activeWhitelistStrategy = whitelistStrategies.find(s => s.detector(baseUrl));
        const checkIsContent = activeWhitelistStrategy ? activeWhitelistStrategy.createValidator(manifestText, baseUrl) : null;
        if (this.debugMode) {
            if (activeWhitelistStrategy) { console.log(`[策略引擎] 已激活白名单策略: ${activeWhitelistStrategy.name}`); }
            else { console.log(`[策略引擎] 未激活任何特定白名单策略，将仅使用通用黑名单。`); }
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
                else if (checkIsContent && !checkIsContent(fragUrl)) { if(this.debugMode) console.log(`[广告检测] : 白名单规则'${activeWhitelistStrategy.name}'已删除广告 -> ${fragUrl}`); isAd = true; }
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
function isUniversalAd(url, debugMode) { const lowerUrl = url.toLowerCase(); if (BLOCKED_EXTENSIONS_RE.test(lowerUrl)) { if (debugMode) console.log(`[黑名单] 命中: 非法文件扩展名 -> ${url}`); return true; } for (const keyword of AD_KEYWORDS) { if (lowerUrl.includes(keyword)) { if (debugMode) console.log(`[黑名单] 命中: 关键字 '${keyword}' -> ${url}`); return true; } } for (const regex of AD_REGEX_RULES) { if (regex.test(url)) { if (debugMode) console.log(`[黑名单] 命中: 正则 '${regex.source}' -> ${url}`); return true; } } return false; }
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
