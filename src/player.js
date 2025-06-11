import Hls from 'hls.js';

// ========== 广告特征 ==========
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

const VOTING_HOSTS = [
  'bfikuncdn.com',
  'kkzycdn.com:65',
  'vod.360zyx.vip'
];

// ========== 全局变量 ==========
let weightedAdSet = new Set();
let votingAdSet = new Set();
let votingActive = false;

function isVotingHost(url) {
  return VOTING_HOSTS.some(h => url.includes(h));
}

function getSecondDir(url) {
  const u = url.split('?')[0].split('#')[0];
  const m = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
  return m ? m[1] : '';
}

function isLikelyAd(url) {
  let score = 0;
  const l = url.toLowerCase();
  AD_KEYWORDS.forEach(k => l.includes(k) && score++);
  AD_REGEX.forEach(r => r.test(url) && score++);
  if (AD_TS_RE.test(url)) score += 2;
  return score >= 2;
}

// 统一标准化 ts url（去参数、#、小写）
function normalizeTsUrl(url) {
  return url ? url.replace(/(\?.*)|(#.*)/g, '').toLowerCase() : '';
}

// ========== 加权法 ==========
function buildWeightedAdSet(manifest) {
  weightedAdSet.clear();
  manifest.split(/\r?\n/).forEach(line => {
    const u = line.trim();
    if (u.endsWith('.ts') && isLikelyAd(u)) weightedAdSet.add(normalizeTsUrl(u));
  });
}

// ========== 投票法 ==========
function buildVotingAdSet(manifest) {
  const counts = {};
  votingAdSet.clear();
  const lines = manifest.split(/\r?\n/).filter(l => l.trim().endsWith('.ts'));
  lines.forEach(u => {
    const d = getSecondDir(u);
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  let main = '', max = 0;
  Object.entries(counts).forEach(([d, c]) => c > max && (max = c, main = d));
  lines.forEach(u => getSecondDir(u) !== main && votingAdSet.add(normalizeTsUrl(u)));
  if (votingAdSet.size) {
    console.log('[AdBlocker][投票法识别广告片段]', votingAdSet);
  }
}

// ========== m3u8 采样主入口 ==========
function updateAdSets(manifest, url) {
  votingActive = isVotingHost(url);
  if (votingActive) buildVotingAdSet(manifest);
  else buildWeightedAdSet(manifest);
  // 挂到 window 方便调试（配合 VideoPlayer.vue Toast）
  if (typeof window !== 'undefined') {
    window.votingActive = votingActive;
    window.votingAdSet = votingAdSet;
    window.weightedAdSet = weightedAdSet;
  }
}

class AdLoader extends Hls.DefaultConfig.loader {
  constructor(cfg) {
    super(cfg);
    this.enabled = cfg.p2pConfig?.adFilteringEnabled !== false;
  }
  _stripManifest(txt, url) {
    updateAdSets(txt, url);
    return txt;
  }
  load(ctx, cfg, cb) {
    if (this.enabled && (ctx.type === 'manifest' || ctx.type === 'level')) {
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
      adFilteringEnabled: opts.adFilteringEnabled !== false,
      debugMode: opts.debugMode === true
    },
    loader: AdLoader,
    maxBufferLength: 60,
    maxBufferSize: 100 * 1000 * 1000,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 2
  };
}

// ========== 跳播事件绑定 ==========
export function attachAdSkipLogic(hls) {
  let skipCount = 0;
  const SKIP_MAX = 10;
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const url = normalizeTsUrl(data.frag.url);
    const isAd = votingActive
      ? votingAdSet.has(url)
      : weightedAdSet.has(url);
    if (isAd && skipCount < SKIP_MAX) {
      skipCount++;
      const frags = hls.levels[hls.currentLevel]?.details?.fragments || [];
      let i = frags.findIndex(f => normalizeTsUrl(f.url) === url);
      while (++i < frags.length) {
        const next = normalizeTsUrl(frags[i].url);
        const ok = votingActive
          ? !votingAdSet.has(next)
          : !weightedAdSet.has(next);
        if (ok) {
          hls.currentTime = frags[i].start;
          hls.startLoad();
          console.log('[AdBlocker][跳播广告]', url, '→', next);
          break;
        }
      }
    }
    if (skipCount >= SKIP_MAX) {
      console.warn('[AdBlocker] 跳播广告次数过多，停止自动跳播');
    }
    if (!isAd) skipCount = 0;
  });
}

export function resetAdDetectionState() {
  weightedAdSet.clear();
  votingAdSet.clear();
  votingActive = false;
  if (typeof window !== 'undefined') {
    window.votingActive = false;
    window.votingAdSet = undefined;
    window.weightedAdSet = undefined;
  }
}
