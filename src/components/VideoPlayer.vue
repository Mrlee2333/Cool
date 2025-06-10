<template>
  <div ref="artplayerRef" class="artplayer-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Artplayer from 'artplayer'
import Hls from 'hls.js'

// 自动提取 Referer
function autoReferer(targetUrl) {
  try {
    const match = targetUrl.match(/\/proxy\/([^?]+)/)
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1])
      const u = new URL(decoded)
      return u.origin + '/'
    } else {
      const u = new URL(targetUrl)
      return u.origin + '/'
    }
  } catch {
    return ''
  }
}
// 构造代理url
function buildProxyUrl(targetUrl) {
  const proxyBase = import.meta.env.VITE_NETLIFY_PROXY_URL
  if (!proxyBase) return targetUrl
  const urlObj = new URL(proxyBase)
  urlObj.searchParams.set('url', targetUrl)
  const ua = import.meta.env.VITE_PROXY_UA
  if (ua) urlObj.searchParams.set('ua', ua)
  urlObj.searchParams.set('referer', autoReferer(targetUrl))
  return urlObj.toString()
}

const props = defineProps({
  option: { type: Object, required: true },
  episodeUrl: { type: String, required: true },
  startTime: { type: Number, default: 0 }
})

const emit = defineEmits(['timeupdate', 'ended', 'ready', 'error'])
const artplayerRef = ref(null)
let art = null
let hasSeeked = false
let orientationLocking = false

// 状态
let lastSourceUrl = ''
let hasTriedProxy = false

function initializePlayer() {
  if (!artplayerRef.value || !props.episodeUrl) return
  if (art) art.destroy(false)
  hasSeeked = false
  lastSourceUrl = props.episodeUrl
  hasTriedProxy = false

  art = new Artplayer({
    ...props.option,
    title: props.option?.title || '',
    container: artplayerRef.value,
    url: props.episodeUrl,
    customType: {
      m3u8: (video, url, artInstance) => {
        // 优先直连，失败自动切换代理
        playM3u8WithAutoProxy(video, url, artInstance)
      }
    }
  })

  art.on('fullscreen', (isFull) => {
    if (isMobile()) {
      if (isFull) lockOrientationLandscape()
      else unlockOrientation()
    }
  })

  art.on('ready', () => {
    if (props.startTime && props.startTime > 0) {
      setTimeout(() => {
        if (art && !hasSeeked && Math.abs(art.currentTime - props.startTime) > 1) {
          art.currentTime = props.startTime
          hasSeeked = true
        }
      }, 500)
    }
    emit('ready', art)
    if (art.video) {
      art.video.addEventListener('timeupdate', onTimeupdateNative)
    }
  })

  art.on('destroy', () => {
    if (art && art.video) {
      art.video.removeEventListener('timeupdate', onTimeupdateNative)
    }
  })

  art.on('video:ended', () => emit('ended'))
}

function playM3u8WithAutoProxy(video, url, artInstance) {
  let hls = null
  let useProxy = false
  let failCount = 0

  function loadHls(playUrl) {
    if (hls) {
      hls.destroy()
      hls = null
    }
    hls = new Hls({
      // 你可以定制更多 HLS 配置
      maxBufferLength: 60,
      maxMaxBufferLength: 120
    })
    hls.attachMedia(video)
    hls.loadSource(playUrl)

    hls.on(Hls.Events.ERROR, function (event, data) {
      if (data && data.fatal) {
        failCount++
        // 只要是致命错误都自动切换一次
        if (!useProxy) {
          useProxy = true
          hls.destroy()
          hls = null
          setTimeout(() => loadHls(buildProxyUrl(url)), 180)
        } else if (failCount < 3) {
          // 代理失败也重试最多2次
          hls.destroy()
          hls = null
          setTimeout(() => loadHls(buildProxyUrl(url)), 250)
        } else {
          if (hls) hls.destroy()
          artInstance.notice.show('视频源加载失败（已尝试代理）', 3500)
          emit('error', new Error('播放失败，直连和代理都无法访问此视频源。'))
        }
      }
    })
  }
  loadHls(url)
}

function onTimeupdateNative() {
  if (art) emit('timeupdate', { time: art.currentTime, duration: art.duration })
}

// ... 横屏相关逻辑略（和你现有一致）

watch(
  () => props.episodeUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl) {
      lastSourceUrl = newUrl
      if (art && art.url) {
        art.switchUrl(newUrl)
      } else {
        nextTick(() => initializePlayer())
      }
    }
  }
)

watch(
  () => props.option.title,
  (newTitle) => {
    if (art && art.option && art.option.title !== newTitle) {
      art.option.title = newTitle
    }
  }
)

onMounted(() => { initializePlayer() })
onBeforeUnmount(() => {
  if (art) art.destroy(false)
  unlockOrientation()
})

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}
async function lockOrientationLandscape() {
  if (orientationLocking) return
  orientationLocking = true
  try {
    if (
      isMobile() &&
      screen.orientation &&
      typeof screen.orientation.lock === 'function'
    ) {
      await screen.orientation.lock('landscape')
    }
  } catch (e) {}
  orientationLocking = false
}
async function unlockOrientation() {
  if (orientationLocking) return
  orientationLocking = true
  try {
    if (
      isMobile() &&
      screen.orientation &&
      typeof screen.orientation.unlock === 'function'
    ) {
      await screen.orientation.unlock()
    }
  } catch (e) {}
  orientationLocking = false
}
</script>
<style scoped>
.artplayer-container {
  width: 100%;
  height: 500px;
  background-color: #000;
}
</style>
