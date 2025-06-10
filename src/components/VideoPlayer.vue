<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig } from '@/player.js';

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
});

const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error']);
const artplayerRef = ref(null);
let art = null;
let hasSeeked = false;
let playStrategy = 'direct'; // 'direct' or 'proxy'
let directFailCount = 0;
let proxyFailCount = 0;
let lastPlayUrl = '';

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 自动构造 referer
function autoReferer(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return u.origin + '/';
  } catch {
    return '';
  }
}

// 构造代理 URL
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

// 关键：播放 HLS 支持去广告
function playWithHls(url, art, strategy = 'direct') {
  if (art.hls) {
    art.hls.destroy();
    art.hls = null;
  }
  let finalUrl = url;
  if (strategy === 'proxy') finalUrl = buildProxyUrl(url);

  if (Hls.isSupported()) {
    const hls = new Hls(getHlsConfig({ adFilteringEnabled: true, debugMode: false }));
    hls.loadSource(finalUrl);
    hls.attachMedia(art.video);
    art.hls = hls;
    art.on('destroy', () => { hls.destroy(); });
  } else if (art.video.canPlayType('application/vnd.apple.mpegurl')) {
    art.video.src = finalUrl;
    art.notice.show('当前为原生HLS播放，可能无法过滤广告', 2500);
  } else {
    art.notice.show('您的浏览器不支持播放此视频格式');
  }
}

// 自动重试播放函数
async function tryPlay(strategy = 'direct', retryCount = 3) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    function doTry() {
      playWithHls(lastPlayUrl, art, strategy);
      // 只监听一次
      const onError = (e) => {
        tries++;
        if (tries < retryCount) {
          setTimeout(doTry, 600);
        } else {
          art.off('video:error', onError);
          reject(e);
        }
      };
      art.once('video:error', onError);
      art.once('video:canplay', () => {
        art.off('video:error', onError);
        resolve();
      });
    }
    doTry();
  });
}

// 初始化播放器
function initializePlayer() {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);

  hasSeeked = false;
  playStrategy = 'direct';
  directFailCount = 0;
  proxyFailCount = 0;
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
    customType: {
      m3u8: (video, url, artInstance) => {
        // 自动直连失败后切换代理
        tryPlay('direct', 3)
          .catch(() => tryPlay('proxy', 3))
          .catch((err) => emit('error', err || new Error('播放失败，直连和代理都无法访问此视频源。')));
      }
    }
  };
  art = new Artplayer(playerOptions);

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
      art.video.addEventListener('timeupdate', () => {
        emit('timeupdate', { time: art.currentTime, duration: art.duration });
      });
    }
  });

  art.on('destroy', () => {
    if (art && art.video) art.video.removeEventListener('timeupdate', () => {});
  });

  art.on('video:ended', () => emit('ended'));

  // 兜底错误
  art.on('error', (e) => emit('error', e));
}

// 集切换监听
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      lastPlayUrl = newUrl;
      playStrategy = 'direct';
      directFailCount = 0;
      proxyFailCount = 0;
      if (art && art.url) {
        tryPlay('direct', 3)
          .catch(() => tryPlay('proxy', 3))
          .catch((err) => emit('error', err));
      } else {
        nextTick(() => initializePlayer());
      }
    }
  }
);

// 标题同步
watch(
  () => props.option.title,
  (newTitle) => {
    if (art && art.option && art.option.title !== newTitle) {
      art.option.title = newTitle;
    }
  }
);

onMounted(() => { initializePlayer(); });
onBeforeUnmount(() => { if (art) art.destroy(false); });
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
}
</style>
