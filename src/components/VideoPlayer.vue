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

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

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

// Artplayer 广告遮罩插件
function createAdMaskPlugin(isMobile) {
  return (art) => {
    const mask = document.createElement('div');
    mask.className = "ad-mask-plugin";
    const img = document.createElement('img');
    img.src = "https://testingcf.jsdelivr.net/gh/macklee6/hahah/ok.gif";
    img.alt = "广告中...";
    img.className = isMobile ? "ad-image-mobile" : "ad-image-pc";

    const text = document.createElement("div");
    text.className = "ad-text";
    text.textContent = "正在跳过广告";

    mask.appendChild(img);
    mask.appendChild(text);

    // 插入/移除遮罩
    return {
      name: "admask",
      show() {
        // 设置白色背景
        art.template.$container.classList.add(isMobile ? "ad-bg-mobile" : "ad-bg-pc");
        if (!mask.isConnected) art.template.$container.appendChild(mask);
      },
      hide() {
        art.template.$container.classList.remove("ad-bg-mobile", "ad-bg-pc");
        if (mask.isConnected) mask.remove();
      }
    };
  };
}

function attachAdPlaybackControl(hls, art) {
  let lastState = null;
  const admask = art.plugins.admask; // 插件实例
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const fragUrl = data.frag.url;
    const isAd = isAdFragmentTs(fragUrl);
    if (!art || !art.video) return;
    if (isAd && lastState !== "ad") {
      art.video.playbackRate = 4.0;
      art.video.muted = true;
      admask && admask.show();
      lastState = "ad";
    } else if (!isAd && lastState !== "normal") {
      art.video.playbackRate = 1.0;
      art.video.muted = false;
      admask && admask.hide();
      lastState = "normal";
    }
  });
}

async function initializePlayer(strategy = "proxy") {
  const id = ++initializeId;
  cleanup();
  hasPlayed = false;

  const playUrl =
    strategy === "proxy"
      ? buildProxyUrl(props.episodeUrl)
      : props.episodeUrl;

  const adMaskPlugin = createAdMaskPlugin(isMobile);

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
    plugins: [adMaskPlugin],
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
  background-color: #000;
  position: relative;
  transition: background 0.2s;
}

.ad-bg-mobile,
.ad-bg-pc {
  background: #fff !important;
  transition: background 0.2s;
}

.ad-mask-plugin {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  z-index: 999;
  background: transparent;
}
.ad-image-mobile {
  width: 88px;
  height: 88px;
  border-radius: 44px;
  margin-bottom: 16px;
  user-select: none;
  pointer-events: none;
  object-fit: contain;
  box-shadow: 0 0 18px #ffe066bb;
  background: rgba(255,255,255,0.09);
}
.ad-image-pc {
  max-width: 60%;
  max-height: 70%;
  border-radius: 18px;
  margin-bottom: 18px;
  user-select: none;
  pointer-events: none;
  object-fit: contain;
  box-shadow: 0 0 20px #ffe066bb;
  background: rgba(255,255,255,0.09);
}
.ad-text {
  color: #222;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-shadow: 0 2px 12px #fff9, 0 1px 0 #fff;
  background: rgba(255,255,255,0.7);
  border-radius: 8px;
  padding: 7px 20px 6px 20px;
  margin-top: 4px;
  box-shadow: 0 0 2px #fff7;
  user-select: none;
}
</style>
