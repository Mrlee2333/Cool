import Hls from "hls.js";

const SPECIAL_HOSTS = [
  "kkzycdn.com:65",
  "vod.360zyx.vip",
  "svip.ryplay15.com",
];

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

let adTsSet = new Set();         // 特定站点广告片段
let isSpecial = false;           // 是否特定站
let manifestHost = "";           // 当前manifest主机

function isSpecialHost(url) {
  return SPECIAL_HOSTS.some(h => url && url.includes(h));
}
function getSecondDir(url) {
  try {
    const u = url.split("?")[0].split("#")[0];
    const m = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
    return m ? m[1] : "";
  } catch { return ""; }
}
function normalizeTsUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.split("?")[0].split("#")[0].toLowerCase();
  }
}

// 关键字+正则判断（对普通站点生效）
function isAdUrlByKeyword(url) {
  const t = url.trim().toLowerCase();
  for (const keyword of AD_KEYWORDS) if (t.includes(keyword)) return true;
  for (const re of AD_REGEX_RULES) if (re.test(t)) return true;
  if (AD_FRAGMENT_URL_RE.test(t)) return true;
  return false;
}

// 特定网站：采集广告片段set，其他：不处理
function buildAdSet(manifestText, manifestUrl) {
  adTsSet.clear();
  isSpecial = isSpecialHost(manifestUrl);
  manifestHost = manifestUrl || "";
  if (isSpecial) {
    const counts = {};
    const lines = manifestText.split(/\r?\n/).filter(l => l.trim().endsWith(".ts"));
    lines.forEach(u => {
      const d = getSecondDir(u);
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    let mainDir = "", max = 0;
    Object.entries(counts).forEach(([d, c]) => {
      if (c > max) {
        max = c;
        mainDir = d;
      }
    });
    lines.forEach(u => {
      if (getSecondDir(u) !== mainDir) adTsSet.add(normalizeTsUrl(u));
    });
  }
}

class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) { super(config); }
  _stripManifest(manifestText, manifestUrl) {
    buildAdSet(manifestText, manifestUrl);
    return manifestText;
  }
  load(context, config, callbacks) {
    const { type, url } = context;
    if (type === "manifest" || type === "level") {
      const originalOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, context) => {
        if (typeof response.data === "string") {
          response.data = this._stripManifest(response.data, url);
        }
        originalOnSuccess(response, stats, context);
      };
    }
    super.load(context, config, callbacks);
  }
}

export function getHlsConfig(options = {}) {
  return {
    loader: AdAwareLoader,
    maxBufferLength: 60,
    maxBufferSize: 100 * 1000 * 1000,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 2,
  };
}

// 给前端判定广告用（兼容 VideoPlayer.vue）
export function isAdFragmentTs(url) {
  if (isSpecial) {
    return adTsSet.has(normalizeTsUrl(url));
  } else {
    return isAdUrlByKeyword(url);
  }
}
