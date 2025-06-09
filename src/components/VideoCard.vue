<template>
  <div
    class="card video-card is-glass-card"
    @click="clickHandler"
    tabindex="0"
    :title="video.vod_name"
  >
    <div class="card-image">
      <figure class="video-figure">
        <img
          :src="video.vod_pic || defaultPoster"
          :alt="video.vod_name"
          @error="handleImageError"
          class="video-poster"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          draggable="false"
        >
      </figure>
      <!-- 多源标签 -->
      <div v-if="video._sources && video._sources.length > 1" class="source-badge">
        <span class="tag is-info is-rounded">多源{{ video._sources.length }}</span>
      </div>
    </div>
    <div class="card-content custom-card-content">
      <p class="title is-6 has-text-light mb-1 video-title" :title="video.vod_name">{{ video.vod_name }}</p>
      <p v-if="video.vod_remarks" class="subtitle is-7 has-text-grey-lighter">{{ video.vod_remarks }}</p>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import defaultPosterPlaceholder from '@/assets/test.png'

const props = defineProps({
  video: { type: Object, required: true },
})
const emit = defineEmits(['card-click'])
const router = useRouter()
const defaultPoster = defaultPosterPlaceholder
const PROXY_URL = 'https://api.allorigins.win/get?url='

const handleImageError = (event) => {
  const imgElement = event.target
  const originalUrl = props.video.vod_pic
  if (!originalUrl) return
  // 若已走过代理，直接用占位图
  if (imgElement.src.includes('allorigins.win')) {
    imgElement.src = defaultPoster
    return
  }
  const proxiedUrl = `${PROXY_URL}${encodeURIComponent(originalUrl)}`
  imgElement.src = proxiedUrl
}

const clickHandler = () => {
  // 多源聚合卡片
  if (props.video._sources && props.video._sources.length > 0) {
    router.push({
      name: 'Detail',
      params: { id: props.video._sources[0].vod_id, source: props.video._sources[0].source_code },
      query: { allSources: encodeURIComponent(JSON.stringify(props.video._sources)) }
    })
    return
  }
  // 单源卡片
  if (props.video.source_code && props.video.vod_id) {
    const routeName = props.video.source_code === 'custom' ? 'CustomDetail' : 'Detail'
    const params = { id: props.video.vod_id, source: props.video.source_code }
    const query = props.video.source_code === 'custom' ? { customApi: props.video.api_url } : undefined
    router.push({ name: routeName, params, query })
  } else {
    emit('card-click', props.video)
  }
}
</script>

<style lang="scss" scoped>
.video-card {
  cursor: pointer;
  overflow: hidden;
  border-radius: 14px;
  transition: transform 0.18s cubic-bezier(.55,.07,.71,1.05);
  will-change: transform;
  box-shadow: 0 2px 8px rgba(20,40,80,0.08);

  &:hover, &:focus-visible {
    transform: translateY(-4px) scale(1.025);
    outline: none;
  }

  .card-image {
    position: relative;
    padding: 0;
    margin: 0;
    // 保证上下无空隙
  }
  .video-figure {
    margin: 0;
    width: 100%;
    aspect-ratio: 2 / 3;
    background: #23242a;
    display: flex;
    align-items: stretch;
    justify-content: center;
    border-radius: 14px 14px 0 0;
    overflow: hidden;
  }
  .video-poster {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
    background: #23242a;
    transition: transform 0.33s cubic-bezier(.41,.85,.53,1.18);
    user-select: none;
    pointer-events: none;
    display: block;
  }
  &:hover .video-poster,
  &:focus-visible .video-poster {
    transform: scale(1.07);
  }

  .custom-card-content {
    padding: 0.8em 0.6em;
    background: rgba(0,0,0,0.10);
    position: relative;
    z-index: 1;
    min-height: 45px;
    text-align: center;
  }

  .video-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.03em;
    font-weight: 500;
    color: var(--my-text-color, #fff);
    letter-spacing: 0.01em;
    margin-bottom: 0.18rem;
    line-height: 1.3;
    text-align: center;
  }

  .subtitle {
    font-size: 0.88em;
    color: var(--my-text-light-color, #ccc);
    opacity: 0.84;
    margin: 0;
    margin-top: 0.18rem;
    text-align: center;
  }

  .source-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 2;
    .tag {
      font-size: 0.82em;
      opacity: 0.85;
      box-shadow: 0 1px 4px rgba(0,0,0,0.18);
      padding: 0.22em 0.7em;
      background: rgba(var(--my-primary-color-rgb, 0,209,178), 0.18);
      color: var(--my-primary-color, #00d1b2);
      border: none;
    }
  }
}

@media (max-width: 600px) {
  .video-card {
    border-radius: 10px;
    .video-figure {
      border-radius: 10px 10px 0 0;
    }
    .custom-card-content {
      padding: 0.55rem 0.4rem;
    }
    .video-title {
      font-size: 0.98em;
    }
  }
}
</style>
