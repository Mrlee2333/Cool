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
let useWeightedFallback = false;
let checkedSample = false;

let votingActive = false;
let mainDirStat = {};
let mainSecondDir = '';
let adTsSet = new Set();

let skipHistorySet = new Set();
let skipLoopLimit = 10;

function isVotingHost(manifestUrl) {
  return VOTING_HOSTS.some(host => manifestUrl.includes(host));
}

function getSecondDir(url) {
  const u = url.split('?')[0].split('#')[0];
  const match = u.match(/^https?:\/\/[^/]+(\/[^/]+\/[^/]+)\//);
  return match ? match[1] : '';
}

function isLikelyAd(url) {
  let adScore = 0;
  const lowerUrl = url.toLowerCase();
  for (const keyword of AD_KEYWORDS) {
    if (lowerUrl.includes(keyword)) adScore++;
  }
  for (const reg of AD_REGEX_RULES) {
    if (reg.test(url)) adScore++;
  }
  if (AD_FRAGMENT_URL_RE.test(url)) adScore += 2;
  return adScore >= 2;
}

function buildWeightedAdSet(manifestText) {
  weightedAdSet.clear();
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  for (const tsUrl of tsLines) {
    if (isLikelyAd(tsUrl)) weightedAdSet.add(tsUrl);
  }
}

function statTsDirAndAdSet(manifestText, manifestUrl) {
  mainDirStat = {};
  adTsSet.clear();
  mainSecondDir = '';
  checkedSample = true;
  const tsLines = manifestText.split(/\r?\n/).filter(line => line.trim().endsWith('.ts'));
  if (tsLines.length < 1) return;
  for (const tsUrl of tsLines) {
    const dir = getSecondDir(tsUrl);
    if (!dir) continue;
    mainDirStat[dir] = (mainDirStat[dir] || 0) + 1;
  }
  let max = 0;
  for (const dir in mainDirStat) {
    if (mainDirStat[dir] > max) {
      max = mainDirStat[dir];
      mainSecondDir = dir;
    }
  }
  for (const tsUrl of tsLines) {
    if (getSecondDir(tsUrl) !== mainSecondDir) {
      adTsSet.add(tsUrl);
    }
  }
}

function handleManifestSampling(manifestText, manifestUrl) {
  checkedSample = true;
  votingActive = isVotingHost(manifestUrl);
  if (votingActive) {
    statTsDirAndAdSet(manifestText, manifestUrl);
    useWeightedFallback = false;
  } else {
    buildWeightedAdSet(manifestText);
    useWeightedFallback = true;
  }
}

function skipIfAd(currentUrl, hls) {
  if (skipHistorySet.has(currentUrl)) {
    if (skipHistorySet.size > skipLoopLimit) {
      if (hls.config?.debugMode) console.error('[AdBlocker] 循环跳播，停止。');
      return;
    }
  }
  skipHistorySet.add(currentUrl);

  if (votingActive && adTsSet.size && adTsSet.has(currentUrl)) {
    seekToNextNormalTs(currentUrl, hls);
    return;
  }
  if (useWeightedFallback && weightedAdSet.has(currentUrl)) {
    seekToNextNonAd(currentUrl, hls);
    return;
  }
  skipHistorySet.clear();
}

function seekToNextNormalTs(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  let count = 0;
  while (nextIndex < playlist.length - 1 && count < skipLoopLimit) {
    nextIndex++; count++;
    if (!adTsSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      break;
    }
  }
}

function seekToNextNonAd(currentUrl, hls) {
  const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
  let nextIndex = playlist.findIndex(frag => frag.url === currentUrl);
  let count = 0;
  while (nextIndex < playlist.length - 1 && count < skipLoopLimit) {
    nextIndex++; count++;
    if (!weightedAdSet.has(playlist[nextIndex].url)) {
      hls.currentTime = playlist[nextIndex].start;
      hls.startLoad?.();
      break;
    }
  }
}

class AdAwareLoader extends Hls.DefaultConfig.loader {
  static _alreadyInitLog = false;
  constructor(config) {
    super(config);
    const customConfig = config.p2pConfig || {};
    this.adFilteringEnabled = customConfig.adFilteringEnabled !== false;
    this.debugMode = customConfig.debugMode === true;
    this.logPrefix = '[AdBlocker]';
    if (this.debugMode && !AdAwareLoader._alreadyInitLog) {
      console.log(`${this.logPrefix} Initialized. Ad skipping is ${this.adFilteringEnabled ? 'ENABLED' : 'DISABLED'}.`);
      AdAwareLoader._alreadyInitLog = true;
    }
  }
  _stripManifest(manifestText, manifestUrl) {
    if (!this.adFilteringEnabled) return manifestText;
    handleManifestSampling(manifestText, manifestUrl);
    return manifestText;
  }
  load(context, config, callbacks) {
    const { type, url } = context;
    if (this.adFilteringEnabled && (type === "manifest" || type === "level")) {
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

export function attachAdSkipLogic(hls) {
  hls.on(Hls.Events.FRAG_LOADING, function (event, data) {
    const fragUrl = data?.frag?.url;
    if (!fragUrl) return;
    if (
      (votingActive && adTsSet.size && adTsSet.has(fragUrl)) ||
      (useWeightedFallback && weightedAdSet.has(fragUrl))
    ) {
      const playlist = hls.levels[hls.currentLevel]?.details?.fragments || [];
      let nextIndex = playlist.findIndex(frag => frag.url === fragUrl);
      let count = 0;
      while (nextIndex < playlist.length - 1 && count < skipLoopLimit) {
        nextIndex++; count++;
        const nextUrl = playlist[nextIndex].url;
        if (
          (votingActive && (!adTsSet.has(nextUrl))) ||
          (useWeightedFallback && !weightedAdSet.has(nextUrl))
        ) {
          hls.currentTime = playlist[nextIndex].start;
          hls.startLoad?.();
          break;
        }
      }
    }
  });
  hls.on(Hls.Events.FRAG_CHANGED, function (event, data) {
    const fragUrl = data.frag.url;
    skipIfAd(fragUrl, hls);
  });
  hls.on(Hls.Events.FRAG_BUFFERED, function (event, data) {
    const fragUrl = data.frag.url;
    skipIfAd(fragUrl, hls);
  });
}

export function resetAdDetectionState() {
  weightedAdSet.clear();
  checkedSample = false;
  useWeightedFallback = false;
  votingActive = false;
  mainDirStat = {};
  mainSecondDir = '';
  adTsSet.clear();
  skipHistorySet.clear();
}
