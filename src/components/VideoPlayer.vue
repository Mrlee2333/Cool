<template>
  <div ref="artplayerRef" class="artplayer-container"
       :style="adMask ? {background: '#fff'} : {}">
    <div v-if="adMask" class="global-ad-mask">
      <img
        class="ad-image-final"
        src="https://testingcf.jsdelivr.net/gh/macklee6/hahah/ok.gif"
        alt="广告中"
        draggable="false"
      />
      <div class="ad-text-final">正在跳过广告</div>
    </div>
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
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

let art = null;
let hls = null;
let initializeId = 0;
let hasPlayed = false;
let triedDirect = false;
let triedProxy = false;
let playTimeout = null;

function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL;
  if (!proxyBase) return targetUrl;
  return proxyBase.replace(/\/$/, "") + "/" + encodeURIComponent(targetUrl);
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
  if (art) emit("timeupdate", { time: art.currentTime, duration: art.duration });
}

function onPlaying() {
  hasPlayed = true;
  clearTimeout(playTimeout);
}

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

  if (!artplayerRef.value) return;

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
          hls = new Hls(getHlsConfig({}));
          hls.loadSource(src);
          hls.attachMedia(video);
          player.hls = hls;
          attachAdPlaybackControl(hls, player);
          player.on("destroy", () => hls && hls.destroy());
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          player.notice.show("原生HLS，无法去广告", 2000);
        } else {
          player.notice.show("浏览器不支持播放此格式");
        }
      },
    },
  };

  art = new Artplayer(playerOptions);

  art.on("ready", () => {
    if (id !== initializeId) return;
    if (props.startTime > 0) {
      setTimeout(() => {
        if (art && Math.abs(art.currentTime - props.startTime) > 1) {
          art.currentTime = props.startTime;
        }
      }, 500);
    }
    art.video?.addEventListener("timeupdate", onTimeupdate);
    art.video?.addEventListener("playing", onPlaying);
    emit("ready", art);
  });

  art.on("video:ended", () => emit("ended"));

  art.on("error", err => {
    clearTimeout(playTimeout);
    if (strategy === "proxy" && !triedDirect) {
      triedDirect = true;
      triedProxy = false;
      initializePlayer("direct");
    } else if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      triedDirect = false;
      initializePlayer("proxy");
    } else {
      emit("error", err || new Error("播放失败"));
    }
  });

  playTimeout = setTimeout(() => {
    if (hasPlayed) return;
    if (strategy === "proxy" && !triedDirect) {
      triedDirect = true;
      initializePlayer("direct");
    } else if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      initializePlayer("proxy");
    } else {
      emit("error", new Error("播放超时"));
    }
  }, 6000);
}

watch(() => props.episodeUrl, () => {
  triedDirect = false;
  triedProxy = false;
  nextTick(() => initializePlayer("proxy"));
});

watch(() => props.option.title, title => {
  if (art?.option?.title !== title) art.option.title = title;
});

onMounted(() => initializePlayer("proxy"));
onBeforeUnmount(() => cleanup());
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background: #000;
  position: relative;
  transition: background 0.2s;
  overflow: hidden;
}

.ad-bg-mobile,
.ad-bg-pc {
  background: #fff !important;
  transition: background 0.2s;
}

.global-ad-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  z-index: 99999;
  background: rgba(255,255,255,0.02);
}

.ad-image-final {
  width: 88px;
  height: 88px;
  max-width: 180px;
  max-height: 180px;
  border-radius: 50%;
  margin-bottom: 18px;
  user-select: none;
  pointer-events: none;
  object-fit: contain;
  box-shadow: 0 0 18px #ffe066bb;
  background: rgba(255,255,255,0.09);
}
.ad-text-final {
  color: #222;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 2px 12px #fff9, 0 1px 0 #fff;
  background: rgba(255,255,255,0.93);
  border-radius: 12px;
  padding: 10px 28px 10px 28px;
  margin-top: 6px;
  box-shadow: 0 0 2px #fff7;
  user-select: none;
}
</style>
