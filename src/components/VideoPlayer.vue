<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { getHlsConfig } from '../player.js';

// 工具函数：简单判断是否为移动端
function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
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
    if (isMobile() && screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape');
    }
  } catch (e) { /* ignore */ }
  orientationLocking = false;
}

async function unlockOrientation() {
  if (orientationLocking) return;
  orientationLocking = true;
  try {
    if (isMobile() && screen.orientation && typeof screen.orientation.unlock === 'function') {
      await screen.orientation.unlock();
    }
  } catch (e) { /* ignore */ }
  orientationLocking = false;
}

const initializePlayer = () => {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);

  const defaultTitle = props.option?.title || '';
  const hlsConfig = getHlsConfig({
    adFilteringEnabled: true, // 开启广告过滤
    debugMode: true,          // 开启调试日志，方便观察拦截过程
  });

  const playerOptions = {
    ...props.option,
    title: defaultTitle,
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
      m3u8(video, src, player) {
        if (Hls.isSupported()) {
          // 使用带广告拦截的配置来初始化 Hls
          const hls = new Hls(hlsConfig);
          hls.loadSource(src);
          hls.attachMedia(video);
          player.hls = hls; // 关联实例，Artplayer 会辅助管理
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // 对于原生支持的设备（如iOS Safari），直接播放
          video.src = src;
        } else {
          player.notice.show('您的浏览器不支持 HLS 播放');
        }
      },
    },
  };

  art = new Artplayer(playerOptions);
  hasSeeked = false;

  art.on('fullscreen', (isFull) => {
    if (isMobile()) {
      if (isFull) {
        lockOrientationLandscape();
      } else {
        unlockOrientation();
      }
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
  art.on('error', (error) => emit('error', error));
};

// 切集、切title监听
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      if (art && art.url) {
        art.switchUrl(newUrl).then(() => {
          if (props.option.title) art.option.title = props.option.title;
          hasSeeked = false;
          if (props.startTime && props.startTime > 0) {
            setTimeout(() => {
              if (art && !hasSeeked && Math.abs(art.currentTime - props.startTime) > 1) {
                art.currentTime = props.startTime;
                hasSeeked = true;
              }
            }, 500);
          }
        });
      } else {
        nextTick(initializePlayer);
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
