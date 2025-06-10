<template>
  <div class="result-view container py-5">
    <h1 class="title is-3 has-text-centered has-text-light mb-5">采集结果展示</h1>

    <div v-if="error" class="notification is-danger is-light is-glass-card">{{ error }}</div>

    <transition name="fade" mode="out-in">
      <div v-if="isLoading && items.length === 0" key="skeletons" class="columns is-multiline is-mobile">
        <div v-for="n in 12" :key="`res-skel-${n}`"
          class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen">
          <SkeletonCard />
        </div>
      </div>
    </transition>

    <TransitionGroup
      name="fade"
      tag="div"
      class="columns is-multiline is-mobile"
      v-if="!isLoading || items.length"
    >
      <div
        v-for="(item, index) in items"
        :key="`res-item-${index}`"
        class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen animated-fadeInUp"
      >
        <div
          class="card is-glass-card result-card-link"
          :class="{ 'is-clickable': !!item.detailUrl }"
          @click="goDetail(item)"
          tabindex="0"
        >
          <div class="result-img-section">
            <img
              v-if="item.cover"
              :src="item.cover"
              :alt="item.title"
              loading="lazy"
              class="result-cover-img"
              @error="onImgError($event)"
            />
            <div v-else class="missing-cover">无封面</div>
          </div>
          <div class="result-meta-section">
            <div class="result-title" :title="item.title">{{ item.title || '无标题' }}</div>
            <div class="result-desc" v-if="item.desc">{{ item.desc }}</div>
            <div class="result-link-section mt-2">
              <span v-if="item.detailUrl" class="result-detail-link">{{ item.detailUrl }}</span>
              <span v-else class="result-detail-link disabled">无详情页</span>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <div class="has-text-centered mt-5">
      <div v-if="nextUrl">
        <button class="button is-info" :disabled="isLoadingNext" @click="loadNextPage">
          {{ isLoadingNext ? '加载中...' : '加载更多' }}
        </button>
      </div>
      <div v-else-if="!isLoading && items.length">
        <span class="has-text-grey">已无更多数据</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SkeletonCard from '@/components/SkeletonCard.vue'
import { fetchAndParseMovies } from '@/utils/spiderHelper'

const resultCacheKey = 'spider_movies'

const isLoading = ref(true)
const isLoadingNext = ref(false)
const error = ref('')
const items = ref([])
const nextUrl = ref('')

const router = useRouter()

let rules = null

const defaultCover = './assets/test.png'

function onImgError(event) {
  event.target.src = defaultCover
}

function loadData() {
  isLoading.value = true
  error.value = ''
  items.value = []
  try {
    const cache = JSON.parse(localStorage.getItem(resultCacheKey) || '{}')
    if (Array.isArray(cache.movies)) {
      items.value = cache.movies
      nextUrl.value = cache.nextUrl || ''
      rules = cache.rules || {}
    } else {
      error.value = '没有采集到结果'
      items.value = []
    }
  } catch (e) {
    error.value = '结果加载异常: ' + e
    items.value = []
  }
  isLoading.value = false
}

function goDetail(item) {
  if (!item.detailUrl) return
  // 传递所有 item 字段，兼容 SpiderDetailView.vue
  router.push({
    name: 'SpiderDetail',
    params: {
      data: encodeURIComponent(JSON.stringify(item))
    }
  })
}

async function loadNextPage() {
  if (!nextUrl.value) return
  isLoadingNext.value = true
  error.value = ''
  try {
    const { movies: newMovies, nextUrl: newNext } = await fetchAndParseMovies(nextUrl.value, rules)
    if (!newMovies.length) throw new Error('未获取到新数据')
    items.value = [...items.value, ...newMovies]
    nextUrl.value = newNext
    // 覆盖保存新结果
    localStorage.setItem(resultCacheKey, JSON.stringify({
      movies: items.value,
      nextUrl: nextUrl.value,
      rules
    }))
  } catch (e) {
    error.value = '加载下一页失败: ' + e
  }
  isLoadingNext.value = false
}

loadData()
</script>

<style scoped>
.result-view .title {
  font-weight: 500;
}
.result-card-link {
  cursor: pointer;
  border-radius: 14px;
  padding: 0;
  background: var(--night-card,#212a36);
  box-shadow: 0 2px 10px #1a2a4240;
  display: flex;
  flex-direction: column;
  min-height: 225px;
  transition: box-shadow 0.18s, transform 0.16s;
  overflow: hidden;
  margin-bottom: 1em;
}
.result-card-link.is-clickable:hover,
.result-card-link.is-clickable:focus {
  box-shadow: 0 8px 30px #16b4ff3d;
  transform: translateY(-2px) scale(1.03);
}
.result-img-section {
  width: 100%;
  aspect-ratio: 2/3;
  background: #192030;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px 14px 0 0;
}
.result-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  min-height: 120px;
  background: #232942;
  display: block;
  border-radius: 14px 14px 0 0;
}
.missing-cover {
  width: 100%;
  height: 100%;
  background: #22323c;
  color: #7bbfff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px 12px 0 0;
  font-size: 0.93em;
}
.result-meta-section {
  width: 100%;
  padding: 0.95em 0.9em 0.95em 0.9em;
  background: rgba(25,28,38,0.96);
  min-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.result-title {
  font-size: 1.07em;
  font-weight: 500;
  color: #f2f9ff;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  margin-bottom: 0.47em;
}
.result-desc {
  font-size: 0.97em;
  color: #a9c7df;
  max-height: 2.6em;
  overflow: hidden;
  text-overflow: ellipsis;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.result-link-section {
  margin-top: 0.3em;
  font-size: 0.95em;
  color: #72cfff;
  word-break: break-all;
  max-width: 100%;
}
.result-detail-link {
  color: #54bcff;
  text-decoration: underline;
  word-break: break-all;
  font-size: 0.96em;
}
.result-detail-link.disabled {
  color: #888;
  text-decoration: none;
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
/* 移动端优化 */
@media (max-width: 600px) {
  .result-card-link {
    border-radius: 9px;
    min-height: 100px;
    padding: 0;
  }
  .result-img-section {
    aspect-ratio: 1/1.3;
    border-radius: 9px 9px 0 0;
  }
  .result-meta-section {
    padding: 0.55em 0.4em 0.55em 0.45em;
    min-height: 50px;
  }
  .result-title {
    font-size: 0.98em;
    margin-bottom: 0.21em;
  }
  .result-desc {
    font-size: 0.91em;
    max-height: 1.7em;
  }
}
</style>

