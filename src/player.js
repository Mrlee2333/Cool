import Hls from 'hls.js';

const VOTING_HOSTS = [
  'kkzycdn.com:65',
  'vod.360zyx.vip',
  'bfikuncdn.com',
];

const AD_KEYWORDS = [
  '/ads/', 'advertis', '//ad.', '.com/ad/', '.com/ads/', 'tracking',
  'doubleclick.net', 'googleads.g.doubleclick.net', 'googlesyndication.com',
  'imasdk.googleapis.com', 'videoad', 'preroll', 'midroll', 'postroll', 'imasdk'
];
const AD_REGEX = [
  /^https?:\/\/[^\/]*?adserver\.[^\/]+\//i,
  /^https?:\/\/[^\/]*?sponsor\.[^\/]+\//i,
  /\/advertisements\//i
];
const AD_TS_RE = /\/(?:ad|ads|adv|preroll|gg|sponsor)[^\/]*\.ts([?#]|$)/i;

let votingAdSet = new Set();
let weightedAdSet = new Set();
let votingActive = false;
let mainDir = '';

function isVotingHost(url) {
  return VOTING_HOSTS.some(host => url.includes(host));
}

function getSecondDir(url) {
  try {
    const u = url.split('?')[0].split('#')[0];
    const m = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
    return m ? m[1] : '';
  } catch { return ''; }
}

function normalizeTsUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].split('#')[0].toLowerCase();
  }
}

function isLikelyAd(url) {
  let score = 0;
  const l = url.toLowerCase();
  AD_KEYWORDS.forEach(k => l.includes(k) && score++);
  AD_REGEX.forEach(r => r.test(url) && score++);
  if (AD_TS_RE.test(url)) score += 2;
  return score >= 2;
}

function buildWeightedAdSet(manifest) {
  weightedAdSet.clear();
  manifest.split(/\r?\n/).forEach(line => {
    const u = line.trim();
    if (u.endsWith('.ts') && isLikelyAd(u)) weightedAdSet.add(normalizeTsUrl(u));
  });
}

function buildVotingAdSet(manifest) {
  const counts = {};
  votingAdSet.clear();
  const lines = manifest.split(/\r?\n/).filter(l => l.trim().endsWith('.ts'));
  lines.forEach(u => {
    const d = getSecondDir(u);
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  mainDir = '';
  let max = 0;
  Object.entries(counts).forEach(([d, c]) => c > max && (max = c, mainDir = d));
  lines.forEach(u => getSecondDir(u) !== mainDir && votingAdSet.add(normalizeTsUrl(u)));
}

function updateAdSets(manifest, url) {
  votingActive = isVotingHost(url);
  if (votingActive) buildVotingAdSet(manifest);
  else buildWeightedAdSet(manifest);
  if (typeof window !== 'undefined') {
    window.votingActive = votingActive;
    window.votingAdSet = votingAdSet;
    window.weightedAdSet = weightedAdSet;
  }
}

class AdLoader extends Hls.DefaultConfig.loader {
  constructor(cfg) { super(cfg); }
  _stripManifest(txt, url) {
    updateAdSets(txt, url);
    return txt;
  }
  load(ctx, cfg, cb) {
    if (ctx.type === 'manifest' || ctx.type === 'level') {
      const o = cb.onSuccess;
      cb.onSuccess = (res, st, c) => {
        if (typeof res.data === 'string') res.data = this._stripManifest(res.data, c.url);
        o(res, st, c);
      };
    }
    super.load(ctx, cfg, cb);
  }
}

export function getHlsConfig(opts = {}) {
  return {
    p2pConfig: {
      adFilteringEnabled: true,
      debugMode: opts.debugMode === true
    },
    loader: AdLoader,
    maxBufferLength: 60,
    maxBufferSize: 100 * 1000 * 1000,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 2
  };
}

// 智能提前跳播，不卡死不卡顿
export function attachAdSkipLogic(hls) {
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const currentUrl = normalizeTsUrl(data.frag.url);
    const frags = hls.levels[hls.currentLevel]?.details?.fragments || [];
    let i = frags.findIndex(f => normalizeTsUrl(f.url) === currentUrl);
    if (i < 0) return;

    // 判断当前 host 用哪种方式过滤
    let isAd = false, adSet = null;
    if (votingActive) {
      adSet = votingAdSet;
    } else {
      adSet = weightedAdSet;
    }
    isAd = adSet.has(currentUrl);

    // 如果当前不是广告，提前判断“接下来的片段”
    if (!isAd) {
      let j = i + 1;
      // 找到下一个广告片段（若有，直接跳过所有广告跳到下一个正常片段）
      let foundAd = false;
      while (j < frags.length && adSet.has(normalizeTsUrl(frags[j].url))) {
        foundAd = true;
        j++;
      }
      // j现在指向下一个正常片段
      if (foundAd && j < frags.length) {
        hls.currentTime = frags[j].start;
        hls.startLoad();
        if (typeof window !== 'undefined' && window.console)
          console.log('[AdBlocker] 提前跳过广告片段，直接跳到', frags[j].url);
      }
    }
  });
}

export function resetAdDetectionState() {
  weightedAdSet.clear();
  votingAdSet.clear();
  votingActive = false;
  mainDir = '';
  if (typeof window !== 'undefined') {
    window.votingActive = false;
    window.votingAdSet = undefined;
    window.weightedAdSet = undefined;
  }
}
