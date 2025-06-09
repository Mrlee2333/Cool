<template>
  <div class="spider-detail-view">
    <div v-if="isLoading" class="spider-loading">
      <span class="loader"></span>
      <p class="loading-text">加载中...</p>
    </div>

    <div v-else class="spider-detail-content container py-5 animated-fadeIn">
      <div class="columns is-desktop">
        <!-- 卡片1：封面 -->
        <div class="column is-one-third-desktop poster-column">
          <figure class="image detail-poster-container">
            <img
              :src="cover || defaultPoster"
              :alt="title"
              @error="onImageError"
              class="detail-poster"
            />
          </figure>
          <div class="tags has-addons mt-4 is-centered">
            <span class="tag is-dark is-rounded-left">采集来源</span>
            <span class="tag is-primary is-light is-rounded-right">爬虫采集</span>
          </div>
        </div>
        <!-- 卡片2：信息 -->
        <div class="column is-two-thirds-desktop info-column is-glass-card">
          <h1 class="main-title">{{ title || '未知标题' }}</h1>
          <div v-if="detailUrl" class="mb-3">
            <a :href="detailUrl" target="_blank" class="button is-link is-light is-small">
              访问原始详情页
            </a>
          </div>
          <div class="video-description content p-3 mb-4 has-text-grey-lighter">
            <h3 class="subtitle is-6 has-text-primary mb-1">简介</h3>
            <p v-text="desc || '暂无简介。'"></p>
          </div>

          <div v-if="m3u8Url" class="mt-4">
            <button class="button is-primary is-medium play-btn" @click="goPlay">
              <i class="fas fa-play mr-2"></i> 立即播放
            </button>
            <div class="mt-2 video-url-section">
              <span class="has-text-grey is-size-7">视频直链:</span>
              <a :href="m3u8Url" target="_blank" class="break-all-url">{{ m3u8Url }}</a>
            </div>
          </div>
          <div v-else-if="videoErr" class="notification is-danger is-light mt-2">
            {{ videoErr }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { fetchHtmlViaProxy } from '@/utils/spiderHelper'
import defaultPosterImg from '@/assets/test.png'

const route = useRoute()
const router = useRouter()

// 兼容返回/跳转都支持的参数
let detail = {}
try {
  detail = route.params.data
    ? JSON.parse(decodeURIComponent(route.params.data))
    : {}
} catch {
  detail = {}
}

const title = ref(detail.title || '')
const cover = ref(detail.cover || '')
const detailUrl = ref(detail.detailUrl || '')
const desc = ref(detail.desc || '')
const m3u8Url = ref(detail.m3u8Url || '')
const videoErr = ref('')
const isLoading = ref(true)
const defaultPoster = defaultPosterImg

function onImageError(e) {
  e.target.src = defaultPoster
}

onMounted(async () => {
  if (m3u8Url.value) {
    // 已经有直链，无需重复请求
    isLoading.value = false
    return
  }
  if (!detailUrl.value) {
    videoErr.value = '无详情链接'
    isLoading.value = false
    return
  }
  try {
    const html = await fetchHtmlViaProxy(detailUrl.value)
    const match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8(\?[^\s"'<>]*)?/i)
    m3u8Url.value = match ? match[0] : ''
    if (!m3u8Url.value) videoErr.value = '未匹配到 m3u8 视频直链'
  } catch (e) {
    videoErr.value = '页面加载失败: ' + e
  }
  isLoading.value = false
})

function goPlay() {
  router.push({
    name: 'Player',
    params: {
      videoId: encodeURIComponent(m3u8Url.value),
      source: 'spider',
      episodeIndex: 0, // 修复点
    },
    query: {
      title: encodeURIComponent(title.value),
      cover: encodeURIComponent(cover.value),
      detailUrl: encodeURIComponent(detailUrl.value),
      desc: encodeURIComponent(desc.value),
      m3u8Url: encodeURIComponent(m3u8Url.value)
    }
  })
}
</script>

<style scoped>
.spider-detail-view {
  color: var(--my-text-color, #eaf6ff);
  background: var(--night-bg, #1a222c);
}

.spider-detail-content {
  max-width: 960px;
  margin: 0 auto;
  background: transparent;
}
.poster-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-right: 1rem;
}
.detail-poster-container {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 4px 20px #222b3850;
  width: 220px;
  max-width: 100%;
  aspect-ratio: 2/3;
  margin-bottom: 1rem;
  border: 1.5px solid #294169;
  background: #23242a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-poster {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #23242a;
}
@media (max-width: 900px) {
  .spider-detail-content { padding: 0.2em; }
  .detail-poster-container { width: 600px; }
}
@media (max-width: 600px) {
  .spider-detail-content { padding: 0; }
  .poster-column { padding-right: 0; }
  .detail-poster-container { width: 300px; }
}
.info-column.is-glass-card {
  padding: 1.3rem 2rem;
  background: rgba(28,38,54,0.92);
  border-radius: 14px;
  box-shadow: 0 2px 20px #12204536;
  min-width: 0;
}
.main-title {
  font-size: 1.48em;
  font-weight: 600;
  color: var(--night-accent, #49d8ff);
  letter-spacing: 0.03em;
  margin-bottom: 0.5em;
  text-shadow: 0 2px 8px #1a496433;
  word-break: break-all;
}
.video-description {
  background: rgba(0,0,0,0.10);
  border-radius: 7px;
  padding: 1rem 1.3rem;
  color: #b9e9ff;
  min-height: 60px;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid #19304744;
}
.video-url-section {
  margin-top: 0.6em;
  color: #a1c9ef;
  font-size: 0.98em;
  word-break: break-all;
  /* 关键：保证长链接不溢出 */
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.break-all-url {
  display: inline-block;
  max-width: 100%;
  word-break: break-all;
  overflow-wrap: anywhere;
  color: #39c7fc;
}
.play-btn {
  font-size: 1.07em;
  font-weight: 600;
  padding: 0.6em 1.6em;
  border-radius: 6px;
  margin-right: 1em;
}
.loader {
  width: 32px; height: 32px; border: 4px solid #23ade5; border-radius: 50%; border-top-color: transparent; animation: spin 0.7s linear infinite;
  display: block; margin: 0 auto;
}
@keyframes spin { to { transform: rotate(360deg);} }
.loading-text { color: #b9e9ff; text-align: center; margin-top: 0.5em; }
</style>
