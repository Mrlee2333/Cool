<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig } from '@/player.js';

// 判断是否是移动设备
function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 自动生成 referer 参数
function autoReferer(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return u.origin + '/';
  } catch {
    return '';
  }
}

// 构建代理 URL
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

// 检查 URL 是否有效（返回 200）
async function checkUrlOK(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
    return res.status === 200;
  } catch {
    return false;
  }
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

// 代理优先，直连回退逻辑
async function selectPlayUrl() {
  const proxyUrl = buildProxyUrl(props.episodeUrl);
  if (await checkUrlOK(proxyUrl)) {
    return { url: proxyUrl, strategy: 'proxy' };
  }
  if (await checkUrlOK(props.episodeUrl)) {
    return { url: props.episodeUrl, strategy: 'direct' };
  }
  return { url: proxyUrl, strategy: 'proxy' }; // 兜底走代理
}

const initializePlayer = async () => {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);
  hasSeeked = false;
  const defaultTitle = props.option?.title || '';
  const { url: playUrl } = await selectPlayUrl();

  const playerOptions = {
    ...props.option,
    title: defaultTitle,
    container: artplayerRef.value,
    url: playUrl,
    autoMini: false,
    playbackRate: true,
    setting: true,
    hotkey: true,
    pip: true,
    fullscreen: true,
    flip: true,
    customType: {
      m3u8: function playM3u8(video, url, art) {
        const hlsConfig = getHlsConfig({
          adFilteringEnabled: true,
          debugMode: true,
        });
        if (Hls.isSupported()) {
          if (art.hls) art.hls.destroy();
          const hls = new Hls(hlsConfig);
          hls.loadSource(url);
          hls.attachMedia(video);
          art.hls = hls;
          art.on('destroy', () => { if (hls) hls.destroy() });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          art.notice.show('当前为原生HLS播放，无法过滤广告', 2500);
        } else {
          art.notice.show('您的浏览器不支持播放此视频格式');
        }
      }
    }
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
    if (art.video) art.video.addEventListener('timeupdate', onTimeupdateNative);
  });
  art.on('destroy', () => {
    if (art && art.video) {
      art.video.removeEventListener('timeupdate', onTimeupdateNative);
    }
  });
  art.on('video:ended', () => emit('ended'));
  art.on('error', (error) => {
    emit('error', error);
  });
};

function onTimeupdateNative() {
  if (art) {
    emit('timeupdate', { time: art.currentTime, duration: art.duration });
  }
}

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

watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      nextTick(() => initializePlayer());
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
