<template>
  <div ref="artplayerContainer" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { getHlsConfig, attachAdSkipLogic, resetAdDetectionState } from '@/player.js'

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 },
})
const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error'])

const artplayerContainer = ref(null)
let art = null
let hls = null
let initializeId = 0
let hasPlayed = false
let playTimeout = null

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function buildProxyUrl(url) {
  const base = import.meta.env.VITE_NETLIFY_PROXY_URL
  if (!base) return url
  const enc = encodeURIComponent(url)
  return base.endsWith('/') ? base + enc : base + '/' + enc
}

function cleanup() {
  clearTimeout(playTimeout)
  if (art) {
    art.destroy(false)
    art = null
  }
  if (hls) {
    hls.destroy()
    hls = null
  }
}

function onTimeupdate() {
  if (art) {
    emit('timeupdate', { time: art.currentTime, duration: art.duration })
  }
}

function onPlaying() {
  hasPlayed = true
  clearTimeout(playTimeout)
}

async function lockLandscape() {
  if (screen.orientation?.lock && isMobile()) {
    try { await screen.orientation.lock('landscape') } catch {}
  }
}
async function unlockOrientation() {
  if (screen.orientation?.unlock && isMobile()) {
    try { await screen.orientation.unlock() } catch {}
  }
}

async function initializePlayer(strategy = 'proxy') {
  const id = ++initializeId
  resetAdDetectionState()
  cleanup()
  if (!artplayerContainer.value || !props.episodeUrl) return

  const url = strategy === 'proxy'
    ? buildProxyUrl(props.episodeUrl)
    : props.episodeUrl

  const options = {
    ...props.option,
    container: artplayerContainer.value,
    url,
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
          if (player.hls) player.hls.destroy()
          hls = new Hls(getHlsConfig({ adFilteringEnabled: true, debugMode: true }))
          hls.loadSource(src)
          hls.attachMedia(video)
          attachAdSkipLogic(hls)
          player.hls = hls
          player.on('destroy', () => hls && hls.destroy())
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src
          player.notice.show('原生 HLS，无法过滤广告', 2500)
        } else {
          player.notice.show('浏览器不支持此视频格式')
        }
      },
    },
  }

  art = new Artplayer(options)

  art.on('fullscreen', isFull => {
    if (id !== initializeId) return
    if (isFull) lockLandscape()
    else unlockOrientation()
  })

  art.on('ready', () => {
    if (id !== initializeId) return
    if (props.startTime > 0) {
      setTimeout(() => {
        if (art && Math.abs(art.currentTime - props.startTime) > 1) {
          art.currentTime = props.startTime
        }
      }, 500)
    }
    art.video?.addEventListener('timeupdate', onTimeupdate)
    art.video?.addEventListener('playing', onPlaying)
    emit('ready', art)
  })

  art.on('video:ended', () => {
    if (id !== initializeId) return
    emit('ended')
  })

  art.on('error', err => {
    if (id !== initializeId) return
    clearTimeout(playTimeout)
    if (strategy === 'proxy') {
      initializePlayer('direct')
    } else {
      emit('error', err || new Error('播放失败'))
    }
  })

  // 超时自动切换或报错
  playTimeout = setTimeout(() => {
    if (id !== initializeId || hasPlayed) return
    if (strategy === 'proxy') initializePlayer('direct')
    else emit('error', new Error('播放超时'))
  }, strategy === 'proxy' ? 5000 : 6000)
}

watch(() => props.episodeUrl, () => {
  nextTick(() => initializePlayer('proxy'))
})

watch(() => props.option.title, title => {
  if (art?.option?.title !== title) {
    art.option.title = title
  }
})

onMounted(() => initializePlayer('proxy'))
onBeforeUnmount(() => {
  cleanup()
  unlockOrientation()
})
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  aspect-ratio: 16/9;
  background-color: #000;
}
</style>
