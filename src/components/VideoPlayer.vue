<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig, skipAdIfNeeded } from '@/player.js';

// ---- 工具函数：自动提取Referer ----
function autoReferer(targetUrl) {
  try {
    const match = targetUrl.match(/\/proxy\/([^?]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]);
      const u = new URL(decoded);
      return u.origin + '/';
    } else {
      const u = new URL(targetUrl);
      return u.origin + '/';
    }
  } catch {
    return '';
  }
}
function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL;
  if (!proxyBase) return targetUrl;
  const urlObj = new URL(proxyBase);
  urlObj.searchParams.set('url', targetUrl);
  const ua = import.meta.env.VITE_PROXY_UA;
  if (ua) urlObj.searchParams.set('ua', ua);
  urlObj.searchParams.set('referer', autoReferer(targetUrl));
  return urlObj.toString();
}
function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// ---- Props/Emit ----
const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
});
const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error']);

// ---- Ref/State ----
const artplayerRef = ref(null);
let art = null;
let hasSeeked = false;
let orientationLocking = false;
const playStrategy = ref('direct'); // direct | proxy
let directFailCount = 0;
let proxyFailCount = 0;
let loadingEpisodeUrl = '';
let lastPlayUrl = '';

// ------- 自动广告跳过
let adBlockSkipHandler = null;

// ------- 自动切换代理 + 跳广告集成 -------
async function tryPlayUrl(url, strategy, retryCount = 3) {
  return new Promise((resolve, reject) => {
    let errorCount = 0;
    let resolved = false;
    const tryPlay = (currentTry) => {
      if (resolved) return;
      let realUrl = url;
      if (strategy === 'proxy') {
        realUrl = buildProxyUrl(url);
      }
      if (art) {
        // 关闭上次HLS
        if (art.hls) { try { art.hls.destroy(); } catch {} art.hls = null; }
        if (art.hlsTimer) { clearTimeout(art.hlsTimer); art.hlsTimer = null; }

        // HLS+广告拦截
        if (Hls.isSupported() && /\.m3u8(\?.*)?$/.test(realUrl)) {
          const hlsConfig = getHlsConfig({ adFilteringEnabled: true, debugMode: false });
          const hls = new Hls(hlsConfig);
          hls.loadSource(realUrl);
          hls.attachMedia(art.video);
          art.hls = hls;
          art.on('destroy', () => { if (hls) hls.destroy(); });
        } else {
          art.switchUrl(realUrl);
        }

        // 绑定广告自动跳过
        if (art.video) {
          if (adBlockSkipHandler) art.video.removeEventListener('timeupdate', adBlockSkipHandler);
          adBlockSkipHandler = function() {
            skipAdIfNeeded(art.video, (ad, jumpTo) => {
              art.notice && art.notice.show('已跳过广告片段', 1000);
            });
          };
          art.video.addEventListener('timeupdate', adBlockSkipHandler);
        }

        // 检查加载成功，否则重试
        let timer = setTimeout(() => {
          errorCount++;
          if (errorCount < retryCount) {
            tryPlay(currentTry + 1);
          } else {
            resolved = true;
            reject(new Error('播放失败'));
          }
        }, 4000); // 4秒内未触发play/error则判定失败

        art.video.oncanplay = () => {
          clearTimeout(timer);
          art.video.oncanplay = null;
          resolved = true;
          resolve(true);
        };
        art.video.onerror = () => {
          clearTimeout(timer);
          art.video.oncanplay = null;
          resolved = true;
          reject(new Error('播放错误'));
        };
      } else {
        resolved = true;
        reject(new Error('ArtPlayer 未初始化'));
      }
    };
    tryPlay(0);
  });
}

// ---- 横屏锁定 ----
async function lockOrientationLandscape() {
  if (orientationLocking) return;
  orientationLocking = true;
  try {
    if (isMobile() && screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape');
    }
  } catch (e) {}
  orientationLocking = false;
}
async function unlockOrientation() {
  if (orientationLocking) return;
  orientationLocking = true;
  try {
    if (isMobile() && screen.orientation && typeof screen.orientation.unlock === 'function') {
      await screen.orientation.unlock();
    }
  } catch (e) {}
  orientationLocking = false;
}

// ---- 初始化播放器 ----
function initializePlayer() {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);
  hasSeeked = false;
  playStrategy.value = 'direct';
  directFailCount = 0;
  proxyFailCount = 0;
  loadingEpisodeUrl = props.episodeUrl;
  lastPlayUrl = props.episodeUrl;

  // 不用customType，直接走Hls实例，避免与 Artplayer customType 冲突
  const playerOptions = {
    ...props.option,
    container: artplayerRef.value,
    url: props.episodeUrl,
    autoMini: false,
    playbackRate: true,
    setting: true,
    hotkey: true,
    pip: true,
    fullscreen: true,
    flip: true,
  };

  art = new Artplayer(playerOptions);

  art.on('fullscreen', (isFull) => {
    if (isMobile()) {
      if (isFull) lockOrientationLandscape();
      else unlockOrientation();
    }
  });

  art.on('ready', async () => {
    // 自动广告跳过
    if (art.video) {
      if (adBlockSkipHandler) art.video.removeEventListener('timeupdate', adBlockSkipHandler);
      adBlockSkipHandler = function() {
        skipAdIfNeeded(art.video, (ad, jumpTo) => {
          art.notice && art.notice.show('已跳过广告片段', 1000);
        });
      };
      art.video.addEventListener('timeupdate', adBlockSkipHandler);
    }

    // 恢复播放进度
    if (props.startTime && props.startTime > 0) {
      setTimeout(() => {
        if (art && !hasSeeked && Math.abs(art.currentTime - props.startTime) > 1) {
          art.currentTime = props.startTime;
          hasSeeked = true;
        }
      }, 500);
    }
    emit('ready', art);
  });

  art.on('destroy', () => {
    if (art && art.video && adBlockSkipHandler) {
      art.video.removeEventListener('timeupdate', adBlockSkipHandler);
      adBlockSkipHandler = null;
    }
  });

  art.on('video:ended', () => emit('ended'));
  art.on('error', async (error) => {
    // 自动切换直连/代理
    if (playStrategy.value === 'direct') {
      directFailCount++;
      if (directFailCount < 3) {
        try { await tryPlayUrl(loadingEpisodeUrl, 'direct'); return; } catch {}
      }
      playStrategy.value = 'proxy';
      proxyFailCount = 0;
      try { await tryPlayUrl(loadingEpisodeUrl, 'proxy'); return; } catch {}
    }
    if (playStrategy.value === 'proxy') {
      proxyFailCount++;
      if (proxyFailCount < 3) {
        try { await tryPlayUrl(loadingEpisodeUrl, 'proxy'); return; } catch {}
      }
    }
    emit('error', error || new Error('播放失败，直连和代理都无法访问此视频源。'));
  });
}

// ---- props.episodeUrl 切换，重新初始化播放器 ----
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      loadingEpisodeUrl = newUrl;
      playStrategy.value = 'direct';
      directFailCount = 0;
      proxyFailCount = 0;
      if (art) {
        art.switchUrl(newUrl).catch(() => {
          // error自动进入error流程
        });
      } else {
        nextTick(() => initializePlayer());
      }
    }
  }
);

// ---- 标题变化也同步 ----
watch(
  () => props.option.title,
  (newTitle) => {
    if (art && art.option && art.option.title !== newTitle) {
      art.option.title = newTitle;
    }
  }
);

onMounted(() => { initializePlayer(); });
onBeforeUnmount(() => {
  if (art) {
    art.destroy(false);
  }
  unlockOrientation();
  if (adBlockSkipHandler && art && art.video) {
    art.video.removeEventListener('timeupdate', adBlockSkipHandler);
    adBlockSkipHandler = null;
  }
});
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
}
</style>
