<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
  <transition name="fade">
    <div v-if="adToast" class="ad-toast">{{ adToast }}</div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { getHlsConfig, attachAdSkipLogic, resetAdDetectionState } from '@/player.js'

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
})
const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error'])

const artplayerRef = ref(null)
let art = null
let hls = null
let initializeId = 0
let hasPlayed = false
let triedDirect = false
let triedProxy = false
let playTimeout = null

const adToast = ref('')
let toastTimer = null

function showAdToast(msg = '已自动跳过广告片段，若出现卡顿属片源问题') {
  adToast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (adToast.value = ''), 3000)
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL
  if (!proxyBase) return targetUrl
  const encodedTarget = encodeURIComponent(targetUrl)
  return proxyBase.endsWith('/')
    ? proxyBase + encodedTarget
    : proxyBase + '/' + encodedTarget
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
  clearTimeout(toastTimer)
}

function onTimeupdate() {
  if (art) emit('timeupdate', { time: art.currentTime, duration: art.duration })
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
  hasPlayed = false

  if (!artplayerRef.value || !props.episodeUrl) return

  const playUrl = strategy === 'proxy'
    ? buildProxyUrl(props.episodeUrl)
    : props.episodeUrl

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
          if (player.hls) player.hls.destroy()
          hls = new Hls(getHlsConfig({ adFilteringEnabled: true, debugMode: true }))
          hls.loadSource(src)
          hls.attachMedia(video)
          attachAdSkipLogicWithToast(hls, showAdToast)
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

  art = new Artplayer(playerOptions)

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
    // 只在真正播放失败或超时后才切换代理/直连
    if (strategy === 'proxy' && !triedDirect) {
      triedDirect = true
      triedProxy = false
      initializePlayer('direct')
      return
    }
    if (strategy === 'direct' && !triedProxy) {
      triedProxy = true
      triedDirect = false
      initializePlayer('proxy')
      return
    }
    emit('error', err || new Error('播放失败'))
  })

  playTimeout = setTimeout(() => {
    if (id !== initializeId || hasPlayed) return
    if (strategy === 'proxy' && !triedDirect) {
      triedDirect = true
      triedProxy = false
      initializePlayer('direct')
      return
    }
    if (strategy === 'direct' && !triedProxy) {
      triedProxy = true
      triedDirect = false
      initializePlayer('proxy')
      return
    }
    emit('error', new Error('播放超时'))
  }, strategy === 'proxy' ? 6000 : 6000)
}

watch(() => props.episodeUrl, () => {
  triedDirect = false
  triedProxy = false
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

function attachAdSkipLogicWithToast(hls, showAdToast) {
  let skipCount = 0
  const SKIP_MAX = 10
  hls.on(Hls.Events.FRAG_CHANGED, (_e, data) => {
    const url = data.frag.url
    // 全局变量方案和 player.js 保持一致
    let isAd = false
    if (typeof window !== 'undefined') {
      isAd = window.votingActive
        ? window.votingAdSet?.has(url)
        : window.weightedAdSet?.has(url)
    }
    if (isAd && skipCount < SKIP_MAX) {
      skipCount++
      const frags = hls.levels[hls.currentLevel]?.details?.fragments || []
      let i = frags.findIndex(f => f.url === url)
      while (++i < frags.length) {
        const next = frags[i].url
        const ok = window.votingActive
          ? !window.votingAdSet?.has(next)
          : !window.weightedAdSet?.has(next)
        if (ok) {
          hls.currentTime = frags[i].start
          hls.startLoad()
          showAdToast()
          break
        }
      }
    }
    if (skipCount >= SKIP_MAX) {
      showAdToast('广告太多，已停止自动跳播')
    }
    if (!isAd) skipCount = 0
  })
}
</script>

<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
  position: relative;
}
.ad-toast {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24,24,24,0.92);
  color: #ffe066;
  padding: 8px 24px;
  font-size: 15px;
  border-radius: 30px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.13);
  pointer-events: none;
  z-index: 99;
  white-space: nowrap;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
