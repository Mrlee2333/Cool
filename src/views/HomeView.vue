<template>
  <div class="home-view">
    <!-- 推荐幻灯片 -->
    <section class="carousel-section mb-4">
      <Carousel
        :autoplay="3000"
        :wrap-around="true"
        :transition="800"
        :pauseAutoplayOnHover="true"
        class="recommend-carousel"
      >
        <Slide v-for="(slide, index) in slides" :key="index">
          <div class="carousel-slide-content">
            <img
              :src="slide.img"
              alt=""
              class="carousel-slide-img"
              loading="lazy"
              decoding="async"
              draggable="false"
            />
            <div class="carousel-slide-info">
              <div class="carousel-slide-title">{{ slide.title }}</div>
              <div class="carousel-slide-desc">{{ slide.desc }}</div>
            </div>
          </div>
        </Slide>
      </Carousel>
    </section>

    <div class="container px-4 main-content-area">
      <section class="search-section is-glass-card mb-5 animated-fadeIn">
        <SearchBar />
      </section>

      <CustomSourceManager
        v-if="showCustomSourceManager"
        class="mb-5 animated-fadeInUp"
      />

      <div class="has-text-centered mb-5">
        <button
          class="button is-small is-info is-outlined"
          @click="showCustomSourceManager = !showCustomSourceManager"
        >
          {{ showCustomSourceManager ? '收起自定义源管理' : '展开自定义源管理' }}
        </button>
      </div>

      <hr class="is-divider" />

      <section class="popular-movies-section">
        <div class="level is-mobile is-align-items-center mb-3">
          <div class="level-left">
            <h2 class="title is-3 has-text-light">豆瓣热门电影</h2>
          </div>
          <div class="level-right">
            <RouterLink
              class="button is-small is-light is-outlined"
              :to="{ name: 'MoreDouban' }"
            >
              查看更多
            </RouterLink>
          </div>
        </div>

        <!-- 骨架动画淡入淡出 -->
        <transition name="fade" mode="out-in">
          <div
            v-if="isHomeLoading && popularMovies.length === 0"
            class="columns is-multiline is-mobile"
          >
            <div
              v-for="n in 10"
              :key="n"
              class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen"
              :style="{ animationDelay: (n * 0.08) + 's' }"
            >
              <SkeletonCard />
            </div>
          </div>
        </transition>

        <div
          v-if="homeError"
          class="notification is-danger is-light is-glass-card"
        >
          {{ homeError }}
        </div>

        <!-- 列表卡片动画错峰渲染 -->
        <TransitionGroup
          name="fade"
          tag="div"
          class="columns is-multiline is-mobile"
        >
          <div
            v-for="(movie, index) in popularMovies"
            :key="movie.vod_name + '-' + index"
            class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen animated-fadeInUp"
            :style="{ animationDelay: `${index * 0.05}s` }"
          >
            <VideoCard :video="movie" @card-click="searchFromCard" />
          </div>
        </TransitionGroup>
      </section>
    </div>
    <RecentHistoryFab />
    <BackToTopRocket />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Carousel, Slide } from 'vue3-carousel'
import 'vue3-carousel/dist/carousel.css'

import api from '@/services/api'
import SearchBar from '@/components/SearchBar.vue'
import CustomSourceManager from '@/components/CustomSourceManager.vue'
import VideoCard from '@/components/VideoCard.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'
import RecentHistoryFab from '@/components/RecentHistoryFab.vue'
import BackToTopRocket from '@/components/BackToTopRocket.vue'

const router = useRouter()
const popularMovies = ref([])
const isHomeLoading = ref(true)
const homeError = ref(null)
const showCustomSourceManager = ref(false)

const HOME_CACHE_KEY = 'douban_home_movies_v1'
const CACHE_EXPIRE = 1000 * 60 * 30 // 30分钟

const fetchHomeData = async () => {
  isHomeLoading.value = true
  homeError.value = null

  const cacheStr = localStorage.getItem(HOME_CACHE_KEY)
  if (cacheStr) {
    try {
      const cache = JSON.parse(cacheStr)
      if (Date.now() - cache.time < CACHE_EXPIRE) {
        popularMovies.value = cache.data
        isHomeLoading.value = false
        return
      }
    } catch {}
  }

  try {
    const json = await api.getDoubanHotJson()
    const movies = json.items.map(item => ({
      vod_name: item.title,
      vod_pic: item.pic?.large || item.pic?.normal || '',
      vod_remarks: item.rating?.value ? `评分: ${item.rating.value}` : '暂无评分',
      description: item.card_subtitle || '',
    }))
    if (!movies.length) throw new Error('未能从 JSON 中提取热门电影数据。')

    popularMovies.value = movies
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ time: Date.now(), data: movies }))
  } catch (err) {
    console.error('Failed to fetch Douban JSON:', err)
    homeError.value = `加载热门电影失败：${err.message}`
  } finally {
    isHomeLoading.value = false
  }
}

const searchFromCard = (video) => {
  if (video?.vod_name) {
    router.push({ name: 'Search', query: { query: video.vod_name, source: 'aggregated' } })
  }
}

// 幻灯片内容
const slides = [
  { title: '新番推荐', img: 'https://testingcf.jsdelivr.net/gh/macklee6/hahah/iu.jpeg', desc: '高分热播新剧，点此搜索' },
  { title: '豆瓣高分', img: 'https://testingcf.jsdelivr.net/gh/macklee6/hahah/kali.png', desc: '热评电影榜单，超高口碑' },
  { title: '热门剧集', img: 'https://testingcf.jsdelivr.net/gh/macklee6/hahah/iu.jpeg', desc: '正在热播剧集强烈推荐' },
]

onMounted(fetchHomeData)
</script>

<style lang="scss" scoped>
.is-divider {
  margin: 2rem 0;
}
.popular-movies-section .title {
  margin-bottom: 1.5rem;
}
.animated-fadeIn {
  animation: fadeIn 0.6s ease-out forwards;
  opacity: 0;
}
.animated-fadeInUp {
  animation: fadeInUp 0.5s cubic-bezier(.45,.93,.52,1.11) both;
  opacity: 0;
}
@keyframes fadeIn {
  to { opacity: 1; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px);}
  to   { opacity: 1; transform: none;}
}
.fade-enter-active,
.fade-leave-active,
.fade-move {
  transition: opacity 0.28s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* carousel 样式 */
.carousel-section {
  .custom-carousel {
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }

  .carousel-slide {
    display: flex;
    align-items: center;
    padding: 1rem;
    background: linear-gradient(90deg, #0e2a50 60%, #23e5ba30 100%);
    min-height: 110px;
    @media (max-width: 600px) {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .carousel-img {
    width: 78px;
    height: 78px;
    border-radius: 10px;
    object-fit: cover;
    margin-right: 16px;
    background: #1d2a3a;
  }

  .carousel-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .carousel-title {
    font-size: 1.4rem;
    font-weight: 600;
    color: #fff;
  }

  .carousel-desc {
    font-size: 1rem;
    color: #ffd;
    opacity: 0.85;
  }
}

.carousel-slide-img {
  border-radius: 12px;
  object-fit: cover;
  width: 100%;
  height: auto;
}
.popular-movies-section .level {
  margin-bottom: 1rem;
}
.popular-movies-section .title {
  margin-bottom: 0;
}
</style>
