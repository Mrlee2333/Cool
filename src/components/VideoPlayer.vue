<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig, attachAdSkipLogic, resetAdDetectionState } from '@/player.js';

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

let playStrategy = ref('proxy');
let triedDirect = false;
let triedProxy = false;
let hasPlayed = false;
let playTimeout = null;

// 防抖标识
let initializePlayerDebounceId = 0;

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

// playing事件
function onPlaying() {
  hasPlayed = true;
  cleanupTimeout();
}

// 初始化播放器（含副作用防抖）
async function initializePlayer(strategy = 'proxy') {
  // 增加防抖唯一标识
  const myId = ++initializePlayerDebounceId;

  cleanupTimeout();
  hasPlayed = false;

  // 每次切流/切集前重置广告检测全局状态
  resetAdDetectionState();

  if (!artplayerRef.value || !props.episodeUrl) return;

  // 销毁上一个实例
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
            adFilteringEnabled: true,
            debugMode: true
          });
          const hls = new Hls(hlsConfig);
          hls.loadSource(url);
          hls.attachMedia(video);
          artInstance.hls = hls;
          artInstance.on('destroy', () => { if (hls) hls.destroy(); });

          // 绑定广告自动跳过
          import('@/player.js').then(({ attachAdSkipLogic }) => {
            attachAdSkipLogic(hls);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          artInstance.notice.show('当前为原生HLS播放，无法过滤广告', 2500);
        } else {
          artInstance.notice.show('您的浏览器不支持播放此视频格式');
        }
      }
    }
  };

  art = new Artplayer(playerOptions);

  // 横屏事件
  art.on('fullscreen', (isFull) => {
    if (myId !== initializePlayerDebounceId) return;
    if (isMobile()) {
      if (isFull) lockOrientationLandscape();
      else unlockOrientation();
    }
  });

  // 进度恢复
  art.on('ready', () => {
    if (myId !== initializePlayerDebounceId) return;
    cleanupTimeout();
    if (props.startTime && props.startTime > 0) {
      setTimeout(() => {
        if (
          art &&
          !hasSeeked &&
          Math.abs(art.currentTime - props.startTime) > 1
        ) {
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
    if (myId !== initializePlayerDebounceId) return;
    cleanupTimeout();
    if (art && art.video) {
      art.video.removeEventListener('timeupdate', onTimeupdateNative);
      art.video.removeEventListener('playing', onPlaying);
    }
  });

  art.on('video:ended', () => {
    if (myId !== initializePlayerDebounceId) return;
    emit('ended');
  });

  art.on('error', (error) => {
    if (myId !== initializePlayerDebounceId) return;
    cleanupTimeout();
    if (playStrategy.value === 'proxy' && !triedDirect) {
      triedDirect = true;
      triedProxy = false;
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

  // 代理模式下超时切直连，直连超时报错
  if (strategy === 'proxy') {
    playTimeout = setTimeout(() => {
      if (myId !== initializePlayerDebounceId) return;
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
    playTimeout = setTimeout(() => {
      if (myId !== initializePlayerDebounceId) return;
      if (!hasPlayed) {
        emit('error', new Error('视频播放超时：直连不可用'));
      }
    }, 6000);
  }
}

// 监听切集，防抖+彻底清理
watch(
  () => props.episodeUrl,
  () => {
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
