<template>
  <div class="detail-view">
    <SkeletonDetail v-if="isLoading" />

    <div v-if="error && !isLoading" class="container py-5">
      <div class="notification is-danger is-light is-glass-card animated-fadeIn">
        <button class="delete" @click="clearErrorAndGoBack"></button>
        <p class="has-text-weight-semibold mb-1">错误</p>
        <p>{{ error }}</p>
        <p>
          <button class="button is-small is-danger is-outlined mt-2" @click="clearErrorAndGoBack">返回</button>
        </p>
      </div>
    </div>

    <div v-if="videoInfo && !isLoading" class="detail-content-container container py-5 animated-fadeIn">
      <div class="columns is-desktop">
        <div class="column is-one-third-desktop poster-column">
          <figure class="image is-2by3 detail-poster-container">
            <img :src="videoInfo.cover || defaultPosterUrl" :alt="videoInfo.title" @error="onImageError" class="detail-poster" />
          </figure>
          <div class="tags has-addons mt-4 is-centered">
            <span class="tag is-dark is-rounded-left">来源</span>
            <span class="tag is-primary is-light is-rounded-right">{{ videoInfo.source_name }}</span>
          </div>
          <div class="tags are-medium mt-2 is-centered">
            <span v-if="videoInfo.year" class="tag is-info is-light is-rounded">{{ videoInfo.year }}</span>
            <span v-if="videoInfo.area" class="tag is-info is-light is-rounded">{{ videoInfo.area }}</span>
            <span v-if="videoInfo.type" class="tag is-info is-light is-rounded">{{ videoInfo.type }}</span>
          </div>
        </div>

        <div class="column is-two-thirds-desktop info-column is-glass-card">
          <h1 class="title is-size-1-desktop is-size-3-mobile has-text-light mb-2 has-text-weight-light main-title">{{ videoInfo.title }}</h1>
          <p v-if="videoInfo.remarks" class="subtitle is-6 has-text-grey-light mb-4">{{ videoInfo.remarks }}</p>

          <div class="content video-description p-3 mb-4 has-text-grey-lighter">
            <h3 class="title is-5 has-text-primary mb-2">剧情简介</h3>
            <p v-text="videoInfo.desc || '暂无剧情简介。'"></p>
          </div>

          <div class="detail-meta-grid mb-4">
            <div v-if="videoInfo.director" class="detail-meta-item">
              <strong class="meta-label">导演:</strong> <span class="meta-value">{{ videoInfo.director }}</span>
            </div>
            <div v-if="videoInfo.actor" class="detail-meta-item">
              <strong class="meta-label">主演:</strong> <span class="meta-value">{{ videoInfo.actor }}</span>
            </div>
          </div>

          <div v-if="allSources.length > 1" class="source-select mb-4">
            <label class="mr-2 has-text-light">选择播放源：</label>
            <div class="select is-info is-small">
              <select v-model="currentSourceIndex">
                <option v-for="(src, idx) in allSources" :key="idx" :value="idx">
                  {{ src.source_name || src.source_code }}
                </option>
              </select>
            </div>
          </div>

          <transition name="fade">
            <div v-if="episodes.length" class="episodes-section">
              <div class="level is-mobile mb-2">
                <div class="level-left">
                  <h3 class="title is-4 has-text-primary">剧集列表</h3>
                </div>
                <div class="level-right">
                  <div class="buttons has-addons">
                    <button
                      class="button is-small is-outlined is-info"
                      :class="{ 'is-active is-selected': sortOrder === 'asc' }"
                      @click="setSortOrder('asc')"
                      title="正序"
                    >
                      <span class="icon is-small"><i class="fas fa-sort-amount-down-alt"></i></span>
                    </button>
                    <button
                      class="button is-small is-outlined is-info"
                      :class="{ 'is-active is-selected': sortOrder === 'desc' }"
                      @click="setSortOrder('desc')"
                      title="倒序"
                    >
                      <span class="icon is-small"><i class="fas fa-sort-amount-up-alt"></i></span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="buttons are-small episode-buttons-container">
                <button
                  v-for="episode in displayedEpisodes"
                  :key="episode.originalIndex"
                  class="button episode-button"
                  :class="{
                    'is-primary': selectedEpisodeIndexForPlay === episode.originalIndex,
                    'is-light is-outlined': selectedEpisodeIndexForPlay !== episode.originalIndex
                  }"
                  @click="navigateToPlayer(episode.originalIndex)"
                >
                  {{ episode.name }}
                </button>
              </div>

              <div class="has-text-centered mt-3" v-if="episodes.length > 100">
                <button
                  class="button is-small is-link is-outlined"
                  @click="showAllEpisodes = !showAllEpisodes"
                >
                  <span class="icon is-small">
                    <i :class="showAllEpisodes ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
                  </span>
                  <span>{{ showAllEpisodes ? '收起全部剧集' : `展开全部 (${episodes.length}集)` }}</span>
                </button>
              </div>
            </div>

            <div v-else class="notification is-warning is-light mt-4 is-rounded">
              未找到可播放的剧集。
            </div>
          </transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import defaultPosterPlaceholder from '@/assets/test.png';
import SkeletonDetail from '@/components/SkeletonDetail.vue';

const props = defineProps({
  id: String,
  source: String,
  customApi: String,
  customDetail: String
});

const route = useRoute();
const router = useRouter();

const videoInfo = ref(null);
const episodes = ref([]);
const isLoading = ref(true);
const error = ref(null);
const selectedEpisodeIndexForPlay = ref(0);
const defaultPosterUrl = ref(defaultPosterPlaceholder);

const sortOrder = ref('asc');
const showAllEpisodes = ref(false);

// 大量剧集时只显示前 100 个
const MAX_EPISODES_SHOWN = 100;

// 多源聚合
const allSources = ref([]);
const currentSourceIndex = ref(0);

function loadAllSources() {
  try {
    const arr = route.query.allSources
      ? JSON.parse(decodeURIComponent(route.query.allSources))
      : [];
    allSources.value = arr.length ? arr : [{
      source_code: props.source,
      vod_id: props.id
    }];
    if (currentSourceIndex.value === undefined || allSources.value[currentSourceIndex.value]?.vod_id != props.id) {
      currentSourceIndex.value = allSources.value.findIndex(
        src => src.source_code === props.source && src.vod_id == props.id
      );
      if (currentSourceIndex.value < 0) currentSourceIndex.value = 0;
    }
  } catch {
    allSources.value = [{
      source_code: props.source,
      vod_id: props.id
    }];
    currentSourceIndex.value = 0;
  }
}

const sortedEpisodes = computed(() => {
  const episodesCopy = [...episodes.value]
    .map((ep, index) => ({ ...ep, originalIndex: index }));
  if (sortOrder.value === 'asc') {
    return episodesCopy;
  } else {
    return episodesCopy.reverse();
  }
});
const displayedEpisodes = computed(() => {
  if (episodes.value.length > MAX_EPISODES_SHOWN && !showAllEpisodes.value) {
    return sortedEpisodes.value.slice(0, MAX_EPISODES_SHOWN);
  }
  return sortedEpisodes.value;
});

const setSortOrder = (order) => {
  sortOrder.value = order;
};

const fetchMainDetailAndEpisodes = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const mainSource = allSources.value[0];
    const response = await api.getVideoDetails(
      decodeURIComponent(mainSource.vod_id),
      mainSource.source_code,
      mainSource.source_code === 'custom' ? mainSource.api_url : undefined,
      undefined
    );
    if (response.data && response.data.code === 200) {
      videoInfo.value = response.data.videoInfo;
      if (currentSourceIndex.value === 0) {
        episodes.value = (response.data.episodes || []).map(ep => ({
          name: ep.name || '未知集数',
          url: ep.url
        }));
        selectedEpisodeIndexForPlay.value = 0;
      }
    } else {
      throw new Error(response.data?.message || '加载视频详情失败。');
    }
  } catch (err) {
    error.value = err.response?.data?.message || err.message || '获取详情时发生意外错误。';
  } finally {
    isLoading.value = false;
  }
};

const fetchEpisodesForSource = async (idx) => {
  isLoading.value = true;
  error.value = null;
  const curSource = allSources.value[idx];
  try {
    const response = await api.getVideoDetails(
      decodeURIComponent(curSource.vod_id),
      curSource.source_code,
      curSource.source_code === 'custom' ? curSource.api_url : undefined,
      undefined
    );
    if (response.data && response.data.code === 200) {
      episodes.value = (response.data.episodes || []).map(ep => ({
        name: ep.name || '未知集数',
        url: ep.url
      }));
      selectedEpisodeIndexForPlay.value = 0;
    } else {
      throw new Error(response.data?.message || '加载剧集失败。');
    }
  } catch (err) {
    error.value = err.response?.data?.message || err.message || '获取剧集时发生意外错误。';
    episodes.value = [];
  } finally {
    isLoading.value = false;
  }
};

const navigateToPlayer = (originalIndex) => {
  const curSource = allSources.value[currentSourceIndex.value];
  router.push({
    name: 'Player',
    params: {
      source: curSource.source_code,
      videoId: decodeURIComponent(curSource.vod_id),
      episodeIndex: originalIndex,
    },
    query: {
      title: encodeURIComponent(videoInfo.value?.title || videoInfo.value?.vod_name || '正在播放'),
      cover: encodeURIComponent(videoInfo.value?.cover || videoInfo.value?.vod_pic || ''),
      ...(curSource.source_code === 'custom' && curSource.api_url ? { customApi: encodeURIComponent(curSource.api_url) } : {}),
      allSources: encodeURIComponent(JSON.stringify(allSources.value))
    }
  });
};

const onImageError = (event) => {
  event.target.src = defaultPosterUrl.value;
};
const clearErrorAndGoBack = () => {
  error.value = null;
  router.back();
};

onMounted(async () => {
  loadAllSources();
  await fetchMainDetailAndEpisodes();
  if (currentSourceIndex.value > 0) {
    await fetchEpisodesForSource(currentSourceIndex.value);
  }
});

watch(() => [props.id, props.source, props.customApi, props.customDetail, route.query.allSources], async (newVal, oldVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
    loadAllSources();
    videoInfo.value = null;
    episodes.value = [];
    sortOrder.value = 'asc';
    showAllEpisodes.value = false;
    await fetchMainDetailAndEpisodes();
    if (currentSourceIndex.value > 0) {
      await fetchEpisodesForSource(currentSourceIndex.value);
    }
  }
}, { deep: true });

watch(currentSourceIndex, async (newIdx, oldIdx) => {
  if (newIdx !== oldIdx) {
    await fetchEpisodesForSource(newIdx);
    showAllEpisodes.value = false; // 切换源时自动收起
  }
});
</script>

<style lang="scss" scoped>
.source-select {
  display: flex;
  align-items: center;
  margin-bottom: 1.1rem;
  gap: 0.7rem;
}

.source-tabs, .source-select {
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: thin;
  scrollbar-color: #23e5ba rgba(0,0,0,0.1);
  &::-webkit-scrollbar { height: 7px; background: transparent; }
  &::-webkit-scrollbar-thumb { background: linear-gradient(90deg, #23e5ba 30%, #00d1b2 100%); border-radius: 6px; }
  position: relative;
}
.detail-view { color: var(--my-text-color); }
.poster-column { display: flex; flex-direction: column; align-items: center; padding-right: 1.5rem; }
.detail-poster-container {
  border-radius: 12px; overflow: hidden; box-shadow: 0 10px 35px rgba(0,0,0,0.45);
  max-width: 320px; width: 100%; margin-bottom: 1rem;
  border: 2px solid var(--my-glass-border-color, rgba(180,180,200,0.1));
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  &:hover { transform: scale(1.03); box-shadow: 0 15px 45px rgba(var(--my-primary-color-rgb), 0.2);}
  .detail-poster { object-fit: cover; width: 100%; height: 100%; }
}
.info-column.is-glass-card { padding: 2rem; }
.main-title { text-shadow: 0 0 12px rgba(var(--my-primary-color-rgb), 0.35); font-weight: 300; letter-spacing: 0.5px; }
.video-description { background-color: rgba(0,0,0,0.25); padding: 1rem 1.5rem; border-radius: 8px; max-height: 180px; overflow-y: auto; border: 1px solid var(--my-glass-border-color); line-height: 1.7; color: var(--my-text-light-color); h3.title { margin-bottom: 0.5rem; font-weight: 500; } }
.detail-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.5rem 1rem; }
.detail-meta-item { font-size: 0.9rem; .meta-label { color: var(--my-text-light-color); font-weight: 600; margin-right: 0.5em; } .meta-value { color: var(--my-text-color); }}
.episodes-section { margin-top: 2rem; .title.is-4 { margin-bottom: 1rem; font-weight: 500;} .level-right .buttons.has-addons .button { border-width: 1px; &.is-active.is-selected { background-color: var(--my-primary-color) !important; color: black !important; border-color: var(--my-primary-color) !important; box-shadow: 0 0 8px rgba(var(--my-primary-color-rgb),0.5); } }}
.episode-buttons-container { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-start; }
.episode-button { font-size: 0.8rem; padding: 0.5em 0.9em; }
.tags.is-centered { justify-content: center; gap: 0.5rem; }
.tag.is-rounded-left { border-top-right-radius: 0; border-bottom-right-radius: 0;}
.tag.is-rounded-right { border-top-left-radius: 0; border-bottom-left-radius: 0;}
.letter-spacing-1 { letter-spacing: 1px; }
.animated-fadeIn { animation: fadeIn 0.7s ease-out forwards; opacity: 0; }
@keyframes fadeIn { to { opacity: 1; } }
</style>
