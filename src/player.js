import Hls from 'hls.js';

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

function buildWeightedAdSet(manifest) {
  weightedAdSet.clear();
  manifest.split(/\r?\n/).forEach(line => {
    const u = line.trim();
    if (u.endsWith('.ts') && isLikelyAd(u)) weightedAdSet.add(u);
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
  let main = '', max = 0;
  Object.entries(counts).forEach(([d,c]) => c > max && (max = c, main = d));
  lines.forEach(u => getSecondDir(u) !== main && votingAdSet.add(u));
}

function updateAdSets(manifest, url) {
  votingActive = isVotingHost(url);
  if (votingActive) buildVotingAdSet(manifest);
  else buildWeightedAdSet(manifest);
}

class AdLoader extends Hls.DefaultConfig.loader {
  constructor(cfg) {
    super(cfg);
    this.enabled = cfg.p2pConfig?.adFilteringEnabled !== false;
    this.debug = cfg.p2pConfig?.debugMode === true;
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

export function attachAdSkipLogic(hls) {
  let skipping = false;
  hls.on(Hls.Events.FRAG_LOADING, (_e, data) => {
    if (skipping) return;
    const url = data.frag.url;
    const isAd = votingActive ? votingAdSet.has(url) : weightedAdSet.has(url);
    if (isAd) {
      skipping = true;
      const frags = hls.levels[hls.currentLevel]?.details?.fragments || [];
      let i = frags.findIndex(f => f.url === url);
      while (++i < frags.length) {
        const next = frags[i].url;
        const ok = votingActive ? !votingAdSet.has(next) : !weightedAdSet.has(next);
        if (ok) {
          hls.currentTime = frags[i].start;
          hls.startLoad();
          break;
        }
      }
      setTimeout(() => { skipping = false; }, 100);
    }
  });
}

export function resetAdDetectionState() {
  weightedAdSet.clear();
  votingAdSet.clear();
  votingActive = false;
}
