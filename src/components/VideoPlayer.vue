<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 自动提取 Referer
function autoReferer(targetUrl) {
  try {
    // /proxy/https%3A%2F%2Fabc.com%2F1.m3u8
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

// 构造代理url
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

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
});

const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error']);
const artplayerRef = ref(null);
let art = null;
let hasSeeked = false;
let orientationLocking = false;

// 内部状态
const playStrategy = ref('direct'); // direct | proxy
let directFailCount = 0;
let proxyFailCount = 0;
let loadingEpisodeUrl = '';
let lastPlayUrl = '';

// 自动切换与重试逻辑
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
        art.switchUrl(realUrl).then(() => {
          resolved = true;
          resolve(true);
        }).catch((err) => {
          errorCount++;
          if (errorCount < retryCount) {
            setTimeout(() => tryPlay(currentTry + 1), 600);
          } else {
            resolved = true;
            reject(err || new Error('播放失败'));
          }
        });
      } else {
        resolved = true;
        reject(new Error('ArtPlayer 未初始化'));
      }
    };
    tryPlay(0);
  });
}

function initializePlayer() {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);

  hasSeeked = false;
  playStrategy.value = 'direct';
  directFailCount = 0;
  proxyFailCount = 0;
  loadingEpisodeUrl = props.episodeUrl;
  lastPlayUrl = props.episodeUrl;

  const playerOptions = {
    ...props.option,
    title: props.option?.title || '',
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

  art.on('ready', () => {
    if (props.startTime && props.startTime > 0) {
      setTimeout(() => {
        if (art && !hasSeeked && Math.abs(art.currentTime - props.startTime) > 1) {
          art.currentTime = props.startTime;
          hasSeeked = true;
        }
      }, 500);
    }
    emit('ready', art);
    if (art.video) {
      art.video.addEventListener('timeupdate', onTimeupdateNative);
    }
  });

  art.on('destroy', () => {
    if (art && art.video) {
      art.video.removeEventListener('timeupdate', onTimeupdateNative);
    }
  });

  art.on('video:ended', () => emit('ended'));

  art.on('error', async (error) => {
    // 自动重试直连三次
    if (playStrategy.value === 'direct') {
      directFailCount++;
      if (directFailCount < 3) {
        // 直连再试
        try {
          await tryPlayUrl(loadingEpisodeUrl, 'direct');
          return;
        } catch {}
      }
      // 超过三次，切代理
      playStrategy.value = 'proxy';
      proxyFailCount = 0;
      try {
        await tryPlayUrl(loadingEpisodeUrl, 'proxy');
        return;
      } catch {}
    }
    // 代理也重试三次
    if (playStrategy.value === 'proxy') {
      proxyFailCount++;
      if (proxyFailCount < 3) {
        try {
          await tryPlayUrl(loadingEpisodeUrl, 'proxy');
          return;
        } catch {}
      }
    }
    // 全部失败
    emit('error', error || new Error('播放失败，直连和代理都无法访问此视频源。'));
  });
}

function onTimeupdateNative() {
  if (art) {
    emit('timeupdate', { time: art.currentTime, duration: art.duration });
  }
}

// 横屏锁定相关
async function lockOrientationLandscape() {
  if (orientationLocking) return;
  orientationLocking = true;
  try {
    if (
      isMobile() &&
      screen.orientation &&
      typeof screen.orientation.lock === 'function'
    ) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) {}
  orientationLocking = false;
}
async function unlockOrientation() {
  if (orientationLocking) return;
  orientationLocking = true;
  try {
    if (
      isMobile() &&
      screen.orientation &&
      typeof screen.orientation.unlock === 'function'
    ) {
      await screen.orientation.unlock();
    }
  } catch (e) {}
  orientationLocking = false;
}

// 切集、切title监听
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      loadingEpisodeUrl = newUrl;
      playStrategy.value = 'direct';
      directFailCount = 0;
      proxyFailCount = 0;
      if (art && art.url) {
        art.switchUrl(newUrl).catch(() => {
          // 如第一次失败，自动进入 error 自动重试机制
        });
      } else {
        nextTick(() => initializePlayer());
      }
    }
  }
);

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
});
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
}
</style>
