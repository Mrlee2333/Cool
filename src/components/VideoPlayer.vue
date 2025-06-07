<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Artplayer from 'artplayer';

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
let orientationLocking = false; // 用于防止多次锁屏并发

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
  } catch (e) {
    // 部分浏览器可能报错，无视即可
  }
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

const initializePlayer = () => {
  if (!artplayerRef.value || !props.episodeUrl) return;
  if (art) art.destroy(false);

  // 解决"未知"问题：确保 option.title 始终有值
  const defaultTitle = props.option?.title || '';
  const playerOptions = {
    ...props.option,
    title: defaultTitle, // 播放记录用的标题
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
  hasSeeked = false;

  // 横屏：只监听 art 的 fullscreen 事件，且只在移动端
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
    // 处理播放进度恢复
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
          // 解决播放记录"未知"：切集时同步标题
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

// 播放标题实时同步
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
  // 退出全屏时自动解锁方向
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
