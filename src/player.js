// src/player.js
import Hls from 'hls.js';

// --- 广告识别规则 (整合自你提供的所有文件) ---
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


/**
 * AdAwareLoader - 一个能感知并过滤广告的 HLS 加载器
 */
class AdAwareLoader extends Hls.DefaultConfig.loader {
  static _alreadyInitLog = false;
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    // 只在第一个 Loader 初始化时 log 一次
    if (this.debugMode && !AdAwareLoader._alreadyInitLog) {
      console.log(`${this.logPrefix} Initialized. Ad filtering is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
      AdAwareLoader._alreadyInitLog = true;
    }
  }


    /**
     * 核心的 M3U8 清理函数，整合了你提供的所有逻辑
     * @param {string} manifestText - 原始M3U8内容
     * @returns {string} - 清理后的M3U8内容
     */
    _stripManifest(manifestText) {
        if (!this.adFilteringEnabled) {
            if (this.debugMode) console.log(`${this.logPrefix} Manifest stripping skipped (filter disabled).`);
            return manifestText;
        }

        let inAdBreak = false;
        let skipCounter = 0;
        const lines = manifestText.split(/\r?\n/);
        const filteredLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (!trimmedLine) continue; // 跳过空行

            if (AD_TRIGGER_RE.test(trimmedLine)) {
                inAdBreak = true;
                if (this.debugMode) console.log(`${this.logPrefix} Ad Break Start: ${trimmedLine}`);
                filteredLines.push("#EXT-X-DISCONTINUITY"); // 添加一个断点标记
                continue;
            }

            if (inAdBreak && AD_END_RE.test(trimmedLine)) {
                inAdBreak = false;
                if (this.debugMode) console.log(`${this.logPrefix} Ad Break End: ${trimmedLine}`);
                continue;
            }

            if (inAdBreak) {
                if (this.debugMode && !LL_HLS_PART_RE.test(trimmedLine)) console.log(`${this.logPrefix} Skipping line in ad break: ${trimmedLine}`);
                continue;
            }
            
            const skipMatch = trimmedLine.match(LL_HLS_SKIP_RE);
            if (skipMatch) {
                skipCounter = parseInt(skipMatch[1], 10) || 0;
                if (this.debugMode) console.log(`${this.logPrefix} Skip directive found. Skipping next ${skipCounter} segments.`);
                continue;
            }

            // 如果不是元数据行 (即可能是分片URL)
            if (!trimmedLine.startsWith("#")) {
                if (skipCounter > 0) {
                    if (this.debugMode) console.log(`${this.logPrefix} Skipping segment via SKIP: ${trimmedLine}`);
                    if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
                        filteredLines.pop();
                    }
                    skipCounter--;
                    continue;
                }
                
                let isAdUrl = false;
                const lowerTrimmedLine = trimmedLine.toLowerCase();
                for (const keyword of AD_KEYWORDS) {
                    if (lowerTrimmedLine.includes(keyword)) {
                        isAdUrl = true;
                        if (this.debugMode) console.log(`${this.logPrefix} Ad URL detected by keyword '${keyword}': ${trimmedLine}`);
                        break;
                    }
                }
                if (!isAdUrl) {
                    for (const regex of AD_REGEX_RULES) {
                        if (regex.test(trimmedLine)) {
                            isAdUrl = true;
                            if (this.debugMode) console.log(`${this.logPrefix} Ad URL detected by regex '${regex.source}': ${trimmedLine}`);
                            break;
                        }
                    }
                }

                if (isAdUrl) {
                    if (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].startsWith("#EXTINF:")) {
                        if (this.debugMode) console.log(`${this.logPrefix} Removing #EXTINF for ad URL: ${filteredLines[filteredLines.length - 1]}`);
                        filteredLines.pop();
                    }
                    if (this.debugMode) console.log(`${this.logPrefix} Skipping ad URL: ${trimmedLine}`);
                    continue;
                }
            }

            filteredLines.push(line);
        }
        return filteredLines.join("\n");
    }

    load(context, config, callbacks) {
        const { type, url } = context;

        // 清单(manifest)处理：拦截并修改内容
        if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
            const originalOnSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, context) => {
                if (typeof response.data === "string") {
                    response.data = this._stripManifest(response.data);
                }
                originalOnSuccess(response, stats, context);
            };
        }
        // 片段(fragment)处理：如果URL匹配广告特征，直接阻止请求
        else if (this.adFilteringEnabled && type === "fragment" && AD_FRAGMENT_URL_RE.test(url)) {
            if (this.debugMode) {
                console.warn(`${this.logPrefix} Blocking ad fragment by URI: ${url}`);
            }
            callbacks.onError({ code: Hls.ErrorCodes.NETWORK_ERROR, text: "Ad fragment blocked by client" }, context, null);
            return;
        }
        
        // 对于其他所有情况，执行默认的加载行为
        super.load(context, config, callbacks);
    }
}

/**
 * 导出一个函数，用于生成 HLS 的自定义配置。
 * @param {object} options - 配置项，例如 { adFilteringEnabled: boolean, debugMode: boolean }
 * @returns {object} - Hls.js 的配置对象。
 */
export function getHlsConfig(options = {}) {
    return {
        // Artplayer 会将 p2pConfig 传递给 Loader 的 constructor
        p2pConfig: {
            adFilteringEnabled: options.adFilteringEnabled !== false, // 默认为 true
            debugMode: options.debugMode === true, // 默认为 false
        },
        // 应用我们的自定义加载器
        loader: AdAwareLoader,
        // 其他 HLS 优化配置
        maxBufferLength: 60,
        maxBufferSize: 100 * 1000 * 1000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 2,
    };
}

