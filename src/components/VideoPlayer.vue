<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
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
  hasPlayed = false;
}

function onTimeupdate() {
  if (art) emit("timeupdate", { time: art.currentTime, duration: art.duration });
}

function onPlaying() {
  hasPlayed = true;
  clearTimeout(playTimeout);
}

// 广告片段高倍速+静音，正片恢复
function attachAdPlaybackControl(hls, art) {
  let lastState = null;
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const fragUrl = data.frag.url;
    const isAd = isAdFragmentTs(fragUrl);
    if (!art || !art.video) return;
    if (isAd && lastState !== "ad") {
      art.video.playbackRate = 6.0;
      art.video.muted = true;
      lastState = "ad";
    } else if (!isAd && lastState !== "normal") {
      art.video.playbackRate = 1.0;
      art.video.muted = false;
      lastState = "normal";
    }
  });
}

async function initializePlayer(strategy = "direct") {
  const id = ++initializeId;
  cleanup();

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
    // 代理优先顺序：先直连失败，再代理，代理再失败就报错
    if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      initializePlayer("proxy");
    } else if (strategy === "proxy") {
      emit("error", err || new Error("播放失败：直连和代理都不可用"));
    }
  });

  // 直连5秒无playing自动切代理；代理6秒无playing报错
  playTimeout = setTimeout(() => {
    if (hasPlayed) return;
    if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      initializePlayer("proxy");
    } else if (strategy === "proxy") {
      emit("error", new Error("播放超时：直连和代理都不可用"));
    }
  }, strategy === "direct" ? 8000 : 8000);
}

watch(() => props.episodeUrl, () => {
  triedProxy = false;
  nextTick(() => initializePlayer("direct"));
});

watch(() => props.option.title, title => {
  if (art?.option?.title !== title) art.option.title = title;
});

onMounted(() => initializePlayer("direct"));
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
</style>
