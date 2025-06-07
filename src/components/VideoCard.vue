<template>
  <div class="card video-card is-glass-card" @click="clickHandler">
    <div class="card-image">
      <figure class="image is-2by3">
        <img
          :src="video.vod_pic || defaultPoster"
          :alt="video.vod_name"
          @error="handleImageError"
          class="video-poster"
          loading="lazy"
          referrerpolicy="no-referrer"
          width="200" height="300"
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
import { useRouter } from 'vue-router';
import defaultPosterPlaceholder from '@/assets/test.png';

const props = defineProps({
  video: { type: Object, required: true },
});
const emit = defineEmits(['card-click']);
const router = useRouter();
const defaultPoster = defaultPosterPlaceholder;
const PROXY_URL = 'https://api.allorigins.win/get?url=';

const handleImageError = (event) => {
  const imgElement = event.target;
  const originalUrl = props.video.vod_pic;
  if (!originalUrl) return;
  const proxiedUrl = `${PROXY_URL}${encodeURIComponent(originalUrl)}`;
  if (imgElement.src.includes('allorigins.win')) {
    imgElement.src = defaultPoster;
    return;
  }
  imgElement.src = proxiedUrl;
};

const clickHandler = () => {
  // 新增：如果是多源聚合卡片
  if (props.video._sources && props.video._sources.length > 0) {
    // 默认跳转第一个源，带上全部源
    router.push({
      name: 'Detail',
      params: { id: props.video._sources[0].vod_id, source: props.video._sources[0].source_code },
      query: { 
        allSources: encodeURIComponent(JSON.stringify(props.video._sources))
      }
    });
    return;
  }
  // 兼容原单源
  if (props.video.source_code && props.video.vod_id) {
    const routeName = props.video.source_code === 'custom' ? 'CustomDetail' : 'Detail';
    const params = { id: props.video.vod_id, source: props.video.source_code };
    const query = props.video.source_code === 'custom' ? { customApi: props.video.api_url } : undefined;
    router.push({ name: routeName, params, query });
  } else {
    emit('card-click', props.video);
  }
};
</script>

<style lang="scss" scoped>
// 确保在 main.css 中定义了 is-glass-card 和 --my-primary-color
// :root { --my-primary-color: hsl(171, 100%, 41%); }

.video-card {
  cursor: pointer;
  overflow: hidden; // 确保内容不会溢出圆角
  // is-glass-card 样式已在 main.css 定义
  // padding: 0; // 如果 is-glass-card 带有padding，可能需要重置为0让图片填满
  transition: transform 0.3s ease, box-shadow 0.3s ease; // 平滑过渡

  &:hover {
    transform: translateY(-5px) scale(1.03); // 悬停时放大并上移
    // box-shadow 由 is-glass-card:hover 控制
  }

  .card-image {
    position: relative;
    .video-poster {
      object-fit: cover;
      transition: transform 0.35s ease; // 图片放大效果
    }
    .overlay-info {
        position: absolute;
        top: 0.5rem;
        left: 0.5rem;
        right: 0.5rem;
        display: flex;
        justify-content: space-between;
        z-index: 2;
        .tag {
            opacity: 0.85;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
    }

    .play-icon-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0,0,0,0.3);
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 1;
        .icon i {
            filter: drop-shadow(0 0 8px rgba(var(--my-primary-color-rgb), 0.7));
            color: var(--my-primary-color);
        }
    }
  }

  &:hover .card-image .video-poster {
      transform: scale(1.1); // 悬停时图片放大
  }
  &:hover .card-image .play-icon-overlay {
      opacity: 1;
  }


  .custom-card-content {
    padding: 0.75rem; // 卡片内容区域的内边距
    background-color: rgba(0,0,0,0.2); // 给文字部分一个轻微的深色背景以增强可读性
    position: relative; // 确保在毛玻璃效果之上
    z-index: 2; //
  }

  .video-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    color: var(--my-text-color, #fff); // 确保标题颜色
  }
  .video-type {
    font-size: 0.75rem;
    color: var(--my-text-light-color, #ccc); // 确保类型颜色
    opacity: 0.8;
  }
}
</style>




