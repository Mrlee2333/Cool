<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import Artplayer from "artplayer";
import Hls from "hls.js";

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
let triedProxy = false;
let playTimeout = null;

const WORKER_API = import.meta.env.VITE_OK_PROXY_URL;
const WORKER_PASSWORD = import.meta.env.VITE_WORKER_API_PASSWORD;

// 云端去广告
async function getFilteredM3u8(url) {
  try {
    const resp = await fetch(WORKER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Password": WORKER_PASSWORD,
      },
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) throw new Error("Worker API error: " + resp.status);
    return await resp.text();
  } catch (e) {
    console.error("去广告m3u8获取失败", e);
    return null;
  }
}

// 只需倍速/静音辅助片段识别（简单正则）
function isAdFragmentTs(url = "") {
  return (
    /\/(ad|adv|advert|ads)[^/]*\//i.test(url) ||
    /(\b|_|-)(ad|adv)(\b|_|-)/i.test(url)
  );
}

// 倍速广告兜底
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
      art.notice?.show("疑似广告，倍速静音", 1000);
    } else if (!isAd && lastState !== "normal") {
      art.video.playbackRate = 1.0;
      art.video.muted = false;
      lastState = "normal";
    }
  });
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

async function initializePlayer(strategy = "direct") {
  const id = ++initializeId;
  cleanup();

  if (!artplayerRef.value) return;

  let playUrl = props.episodeUrl;
  let adFilterFailed = false;

  // 仅m3u8请求后端去广告
  if (/\.m3u8(\?|$)/i.test(props.episodeUrl)) {
    const filteredText = await getFilteredM3u8(props.episodeUrl);
    if (filteredText) {
      playUrl = URL.createObjectURL(
        new Blob([filteredText], { type: "application/vnd.apple.mpegurl" })
      );
    } else {
      adFilterFailed = true;
      playUrl = props.episodeUrl;
    }
  }

  const hlsConfig = {
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 60,
  };

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
          hls = new Hls(hlsConfig);
          hls.loadSource(src);
          hls.attachMedia(video);
          player.hls = hls;
          attachAdPlaybackControl(hls, player);
          player.on("destroy", () => hls && hls.destroy());
          if (adFilterFailed) {
            player.notice.show("去广告失败，播放原始流", 2000);
          }
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          player.notice.show("原生HLS，可能无法去广告", 2000);
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

  art.on("error", (err) => {
    clearTimeout(playTimeout);
    if (strategy === "direct" && !triedProxy) {
      triedProxy = true;
      initializePlayer("proxy");
    } else if (strategy === "proxy") {
      emit("error", err || new Error("播放失败：直连和代理都不可用"));
    }
  });

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

watch(() => props.option.title, (title) => {
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