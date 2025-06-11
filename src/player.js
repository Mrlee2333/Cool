import Hls from 'hls.js';

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
const AD_FRAGMENT_URL_RE = /\/(?:ad|ads|adv|preroll|gg|sponsor)[^\/]*\.ts([?#]|$)/i;

const VOTING_HOSTS = [
  'bfikuncdn.com',
  'kkzycdn.com:65',
  'vod.360zyx.vip'
];

let weightedAdSet = new Set();
let adTsSet = new Set();
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
  let score = 0, lower = url.toLowerCase();
  AD_KEYWORDS.forEach(k => lower.includes(k) && score++);
  AD_REGEX_RULES.forEach(r => r.test(url) && score++);
  if (AD_FRAGMENT_URL_RE.test(url)) score += 2;
  return score >= 2;
}

function buildWeightedAdSet(manifest) {
  weightedAdSet.clear();
  manifest.split(/\r?\n/).forEach(line => {
    if (line.trim().endsWith('.ts') && isLikelyAd(line.trim())) {
      weightedAdSet.add(line.trim());
    }
  });
}

function statVotingSet(manifest) {
  const dirs = {}, lines = manifest.split(/\r?\n/).filter(l => l.trim().endsWith('.ts'));
  adTsSet.clear();
  lines.forEach(url => {
    const d = getSecondDir(url);
    if (d) dirs[d] = (dirs[d] || 0) + 1;
  });
  let maxCount = 0, mainDir = '';
  Object.entries(dirs).forEach(([d,c]) => { if (c > maxCount) { maxCount = c; mainDir = d; } });
  lines.forEach(url => { if (getSecondDir(url) !== mainDir) adTsSet.add(url); });
}

function handleManifest(manifestText, manifestUrl) {
  votingActive = isVotingHost(manifestUrl);
  if (votingActive) {
    statVotingSet(manifestText);
  } else {
    buildWeightedAdSet(manifestText);
  }
}

class AdAwareLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    this.adFilteringEnabled = !(config.p2pConfig?.adFilteringEnabled === false);
    this.debug = config.p2pConfig?.debugMode === true;
  }
  _stripManifest(text, url) {
    handleManifest(text, url);
    return text;
  }
  load(ctx, cfg, callbacks) {
    if (this.adFilteringEnabled && (ctx.type === 'manifest' || ctx.type === 'level')) {
      const orig = callbacks.onSuccess;
      callbacks.onSuccess = (res, stats, context) => {
        if (typeof res.data === 'string') {
          res.data = this._stripManifest(res.data, context.url);
        }
        orig(res, stats, context);
      };
    }
    super.load(ctx, cfg, callbacks);
  }
}

export function getHlsConfig(opts = {}) {
  return {
    p2pConfig: {
      adFilteringEnabled: opts.adFilteringEnabled !== false,
      debugMode: opts.debugMode === true
    },
    loader: AdAwareLoader,
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
    const isAd = votingActive ? adTsSet.has(url) : weightedAdSet.has(url);
    if (isAd) {
      skipping = true;
      const frags = hls.levels[hls.currentLevel]?.details?.fragments || [];
      let i = frags.findIndex(f => f.url === url);
      while (++i < frags.length) {
        const next = frags[i].url;
        const ok = votingActive ? !adTsSet.has(next) : !weightedAdSet.has(next);
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
  adTsSet.clear();
  votingActive = false;
}
