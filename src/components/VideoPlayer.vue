<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig } from '@/player.js'; // 去广告配置

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

let playStrategy = ref('proxy');  // 当前：'proxy' 或 'direct'
let triedDirect = false;
let triedProxy = false;
let hasPlayed = false;
let playTimeout = null;

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL;
  if (!proxyBase) return targetUrl;

  const encodedTarget = encodeURIComponent(targetUrl);
  return proxyBase.endsWith('/')
    ? proxyBase + encodedTarget
    : proxyBase + '/' + encodedTarget;
}

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

function cleanupTimeout() {
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }
}

// 主初始化函数，支持切换
async function initializePlayer(strategy = 'proxy') {
  cleanupTimeout();
  hasPlayed = false;

  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) {
    art.destroy(false);
    art = null;
  }
  // 选择 url
  const playUrl = strategy === 'proxy' ? buildProxyUrl(props.episodeUrl) : props.episodeUrl;
  playStrategy.value = strategy;

  hasSeeked = false;

  const playerOptions = {
    ...props.option,
    title: props.option?.title || '',
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
      m3u8: function playM3u8(video, url, artInstance) {
        if (Hls.isSupported()) {
          if (artInstance.hls) artInstance.hls.destroy();
          const hlsConfig = getHlsConfig({
            adFilteringEnabled: true,   // 始终开启去广告
            debugMode: true
          });
          const hls = new Hls(hlsConfig);
          hls.loadSource(url);
          hls.attachMedia(video);
          artInstance.hls = hls;
          artInstance.on('destroy', () => { if (hls) hls.destroy() });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          artInstance.notice.show('当前为原生HLS播放，无法过滤广告', 2500);
        } else {
          artInstance.notice.show('您的浏览器不支持播放此视频格式');
        }
      },
    },
  };

  art = new Artplayer(playerOptions);

  // 横屏事件
  art.on('fullscreen', (isFull) => {
    if (isMobile()) {
      if (isFull) lockOrientationLandscape();
      else unlockOrientation();
    }
  });

  // 进度恢复
  art.on('ready', () => {
    // 清理超时
    cleanupTimeout();
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
      art.video.addEventListener('playing', onPlaying);
    }
  });

  art.on('destroy', () => {
    cleanupTimeout();
    if (art && art.video) {
      art.video.removeEventListener('timeupdate', onTimeupdateNative);
      art.video.removeEventListener('playing', onPlaying);
    }
  });

  art.on('video:ended', () => emit('ended'));

  art.on('error', (error) => {
    cleanupTimeout();
    if (playStrategy.value === 'proxy' && !triedDirect) {
      triedDirect = true;
      triedProxy = false; // 避免重复
      initializePlayer('direct');
      return;
    }
    if (playStrategy.value === 'direct' && !triedProxy) {
      triedProxy = true;
      initializePlayer('proxy');
      return;
    }
    emit('error', error || new Error('视频播放失败：直连和代理均不可用。'));
  });

  // 代理时10秒无playing，切直连
  if (strategy === 'proxy') {
    playTimeout = setTimeout(() => {
      if (!hasPlayed) {
        if (!triedDirect) {
          triedDirect = true;
          triedProxy = false;
          initializePlayer('direct');
        } else {
          emit('error', new Error('视频播放超时：代理不可用'));
        }
      }
    }, 5000);
  } else {
    // 直连8秒无playing，报错
    playTimeout = setTimeout(() => {
      if (!hasPlayed) {
        emit('error', new Error('视频播放超时：直连不可用'));
      }
    }, 6000);
  }
}

// playing事件
function onPlaying() {
  hasPlayed = true;
  cleanupTimeout();
}

// 切集监听
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    triedDirect = false;
    triedProxy = false;
    nextTick(() => initializePlayer('proxy'));
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

onMounted(() => {
  triedDirect = false;
  triedProxy = false;
  initializePlayer('proxy');
});
onBeforeUnmount(() => {
  cleanupTimeout();
  if (art) art.destroy(false);
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
