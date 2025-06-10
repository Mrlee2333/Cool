<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
});
const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error']);

const artplayerRef = ref(null);
let art = null;
let hasSeeked = false;

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 横屏锁定相关
let orientationLocking = false;
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

function onTimeupdateNative() {
  if (art) {
    emit('timeupdate', { time: art.currentTime, duration: art.duration });
  }
}

function initializePlayer() {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);

  hasSeeked = false;

  // 只用 props.option，不重写 customType！
  const playerOptions = {
    ...props.option,
    container: artplayerRef.value,
    url: props.episodeUrl,
  };

  art = new Artplayer(playerOptions);

  // 横屏监听
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
  art.on('error', (e) => emit('error', e));
}

// 切换剧集监听
watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      if (art && art.url) {
        art.switchUrl(newUrl).catch(() => {
          // 失败后会触发 error 事件，由父组件的 customType 逻辑处理代理重试等
        });
      } else {
        nextTick(() => initializePlayer());
      }
    }
  }
);

// 标题监听
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
