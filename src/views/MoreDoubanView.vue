<template>
  <div class="more-douban-view container py-5">
    <h1 class="title is-3 has-text-centered has-text-light mb-5">豆瓣热门电影</h1>

    <div v-if="error" class="notification is-danger is-light is-glass-card">{{ error }}</div>

    <transition name="fade" mode="out-in">
      <div v-if="isLoading" key="skeletons" class="columns is-multiline is-mobile">
        <div
          v-for="n in 10"
          :key="`more-skel-${n}`"
          class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen"
          :style="{ animationDelay: (n*0.07)+'s' }"
        >
          <SkeletonCard />
        </div>
      </div>
    </transition>

    <!-- 数据卡片列表，TransitionGroup 错峰动画，不卡顿 -->
    <TransitionGroup
      name="fade"
      tag="div"
      class="columns is-multiline is-mobile"
      v-if="!isLoading"
    >
      <div
        v-for="(movie, index) in pageMovies"
        :key="`more-movie-${index}`"
        class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen animated-fadeInUp"
        :style="{ animationDelay: (index*0.04)+'s' }"
      >
        <VideoCard :video="movie" @card-click="searchFromCard" />
      </div>
    </TransitionGroup>

    <div class="has-text-centered mt-5">
      <button class="button is-light is-rounded mr-2"
        :disabled="currentPage === 1 || isLoading"
        @click="goPage(currentPage-1)">
        上一页
      </button>
      <button class="button is-link is-rounded"
        :disabled="currentPage === maxPage || isLoading"
        @click="goPage(currentPage+1)">
        下一页
      </button>
      <div class="page-indicator" style="margin-top: 0.6em;">
        <span class="is-size-7 has-text-grey">第 {{ currentPage }} / {{ maxPage }} 页</span>
      </div>
      <div v-if="rateLimitError" class="has-text-danger mt-2">{{ rateLimitError }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import VideoCard from '@/components/VideoCard.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'

// 分页参数
const PAGE_SIZE = 20
const MIN_START = 20
const MAX_START = 180
const maxPage = Math.floor(MAX_START / PAGE_SIZE)
const router = useRouter()

const currentPage = ref(1) // 页码从1开始
const pageMovies = ref([])
const isLoading = ref(false)
const error = ref(null)
const rateLimitError = ref('')
const pageCache = ref({}) // { [page]: [movies] }

const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW = 60 * 1000
let clickTimes = []

function checkRateLimit() {
  const now = Date.now()
  clickTimes = clickTimes.filter(t => now - t < RATE_LIMIT_WINDOW)
  if (clickTimes.length >= RATE_LIMIT_MAX) {
    rateLimitError.value = '请求过于频繁，请稍后再试。'
    return false
  }
  clickTimes.push(now)
  rateLimitError.value = ''
  return true
}

// 缓存本地
const CACHE_KEY = 'douban_page_cache_v1'
const CACHE_EXPIRE = 1000 * 60 * 30
function loadCache() {
  const cacheStr = localStorage.getItem(CACHE_KEY)
  if (cacheStr) {
    try {
      const cache = JSON.parse(cacheStr)
      if (Date.now() - cache.time < CACHE_EXPIRE && cache.pages) {
        pageCache.value = cache.pages
      }
    } catch {}
  }
}
function saveCache() {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ time: Date.now(), pages: pageCache.value })
  )
}

// 拉取单页
const fetchPage = async (page) => {
  if (!checkRateLimit()) return
  isLoading.value = true
  error.value = ''
  try {
    const start = MIN_START + (page - 1) * PAGE_SIZE
    const json = await api.getDoubanHotJson(start)
    const items = json.items || []
    // 去重（同一页内，按标题和图片）
    const seen = new Set()
    const movies = items.map(item => ({
      vod_name: item.title,
      vod_pic: item.pic?.normal || '',
      vod_remarks: item.rating?.value ? `评分: ${item.rating.value}` : '暂无评分',
      description: item.card_subtitle || '',
    })).filter(m => {
      const key = m.vod_name + m.vod_pic
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    pageCache.value[page] = movies
    saveCache()
    pageMovies.value = movies
  } catch (err) {
    error.value = err.message || '加载失败'
    pageMovies.value = []
  } finally {
    isLoading.value = false
  }
}

// 翻页
function goPage(page) {
  if (page < 1 || page > maxPage) return
  currentPage.value = page
  if (pageCache.value[page]) {
    pageMovies.value = pageCache.value[page]
  } else {
    fetchPage(page)
  }
}

// 搜索
function searchFromCard(video) {
  if (video && video.vod_name) {
    router.push({ name: 'Search', query: { query: video.vod_name, source: 'aggregated' } })
  }
}

// 初始化
function firstLoad() {
  loadCache()
  if (pageCache.value[1]) {
    pageMovies.value = pageCache.value[1]
  } else {
    fetchPage(1)
  }
}
firstLoad()
</script>

<style scoped>
.more-douban-view .title {
  font-weight: 500;
}
.page-indicator {
  margin-top: 0.7em;
  font-size: 0.95em;
  letter-spacing: 0.07em;
}
/* 动画优化 */
.animated-fadeInUp {
  animation: fadeInUp 0.45s cubic-bezier(.41,.94,.59,1.08) both;
  opacity: 0;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(22px);}
  to   { opacity: 1; transform: none;}
}
.fade-enter-active,
.fade-leave-active,
.fade-move {
  transition: opacity 0.22s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
