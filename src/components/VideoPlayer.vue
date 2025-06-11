<template>
  <div ref="artplayerRef" class="artplayer-container">
    <transition name="fade">
      <div v-if="adMask" class="ad-mask">
        <div class="ad-loading">
          <span class="spinner"></span>
          <span>正在为你自动跳过片头/广告…</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import Artplayer from "artplayer";
import Hls from "hls.js";
import { getHlsConfig, isAdFragmentTs } from "@/player.js";

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 },
});
const emit = defineEmits(["timeupdate", "ended", "ready", "error"]);

const artplayerRef = ref(null);
const adMask = ref(false);

let art = null;
let hls = null;
let initializeId = 0;
let hasPlayed = false;
let triedDirect = false;
let triedProxy = false;
let playTimeout = null;

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL;
  if (!proxyBase) return targetUrl;
  const encodedTarget = encodeURIComponent(targetUrl);
  return proxyBase.endsWith("/")
    ? proxyBase + encodedTarget
    : proxyBase + "/" + encodedTarget;
}

function cleanup() {
  clearTimeout(playTimeout);
  if (art) {
    art.destroy(false);
    art = null;
  }
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function onTimeupdate() {
  if (art)
    emit("timeupdate", { time: art.currentTime, duration: art.duration });
}

function onPlaying() {
  hasPlayed = true;
  clearTimeout(playTimeout);
}

async function lockLandscape() {
  if (screen.orientation?.lock && isMobile()) {
    try {
      await screen.orientation.lock("landscape");
    } catch {}
  }
}
async function unlockOrientation() {
  if (screen.orientation?.unlock && isMobile()) {
    try {
      await screen.orientation.unlock();
    } catch {}
  }
}

// 核心：广告片段倍速+静音+遮罩，正片恢复
function attachAdPlaybackControl(hls, art) {
  let lastState = null;
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const fragUrl = data.frag.url;
    const isAd = isAdFragmentTs(fragUrl);
    if (!art || !art.video) return;
    if (isAd && lastState !== "ad") {
      art.video.playbackRate = 4.0;
      art.video.muted = true;
      adMask.value = true;
      lastState = "ad";
    } else if (!isAd && lastState !== "normal") {
      art.video.playbackRate = 1.0;
      art.video.muted = false;
      adMask.value = false;
      lastState = "normal";
    }
  });
}

async function initializePlayer(strategy = "proxy") {
  const id = ++initializeId;
  cleanup();
  hasPlayed = false;

  if (!artplayerRef.value || !props.episodeUrl) return;

  const playUrl =
    strategy === "proxy"
      ? buildProxyUrl(props.episodeUrl)
      : props.episodeUrl;

  const playerOptions = {
    ...props.option,
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
      m3u8(video, src, player) {
        if (Hls.isSupported()) {
          if (player.hls) player.hls.destroy();
          hls = new Hls(getHlsConfig({}));
          hls.loadSource(src);
          hls.attachMedia(video);
          player.hls = hls;
          attachAdPlaybackControl(hls, player);
          player.on("destroy", () => hls && hls.destroy());
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          player.notice.show("原生 HLS，无法过滤广告", 2500);
        } else {
          player.notice.show("浏览器不支持此视频格式");
        }
      },
    },
  };

  art = new Artplayer(playerOptions);

  art.on("fullscreen", isFull => {
    if (id !== initializeId) return;
    if (isFull) lockLandscape();
    else unlockOrientation();
  });

  art.on("ready", () => {
    if (id !== initializeId) return;
    if (props.startTime > 0) {
      setTimeout(() => {
        if (
          art &&
          Math.abs(art.currentTime - props.startTime) > 1
        ) {
          art.currentTime = props.startTime;
        }
      }, 500);
    }
    art.video?.addEventListener("timeupdate", onTimeupdate);
    art.video?.addEventListener("playing", onPlaying);
    emit("ready", art);
  });

  art.on("video:ended", () => {
    if (id !== initializeId) return;
    emit("ended");
  });

  art.on("error", err => {
    if (id !== initializeId) return;
    clearTimeout(playTimeout);
    if (strategy === "proxy" && !triedDirect) {
      triedDirect = true;
      triedProxy = false;
      initializePlayer("direct");
      return;
    }
    if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      triedDirect = false;
      initializePlayer("proxy");
      return;
    }
    emit("error", err || new Error("播放失败"));
  });

  playTimeout = setTimeout(() => {
    if (id !== initializeId || hasPlayed) return;
    if (strategy === "proxy" && !triedDirect) {
      triedDirect = true;
      triedProxy = false;
      initializePlayer("direct");
      return;
    }
    if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      triedDirect = false;
      initializePlayer("proxy");
      return;
    }
    emit("error", new Error("播放超时"));
  }, strategy === "proxy" ? 6000 : 6000);
}

watch(
  () => props.episodeUrl,
  () => {
    triedDirect = false;
    triedProxy = false;
    nextTick(() => initializePlayer("proxy"));
  }
);

watch(
  () => props.option.title,
  title => {
    if (art?.option?.title !== title) {
      art.option.title = title;
    }
  }
);

onMounted(() => initializePlayer("proxy"));
onBeforeUnmount(() => {
  cleanup();
  unlockOrientation();
});
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
  position: relative;
}
.ad-mask {
  position: absolute;
  z-index: 999;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(10,10,10,0.92);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.ad-loading {
  display: flex; flex-direction: column; align-items: center;
  color: #ffe066;
  font-size: 20px;
  font-weight: 600;
}
.spinner {
  display: inline-block;
  width: 44px; height: 44px;
  border: 4px solid #ffe066;
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 1s linear infinite;
  margin-bottom: 18px;
}
@keyframes spin {
  100% { transform: rotate(360deg);}
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
