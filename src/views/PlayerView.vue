<template>
  <div class="player-view-container" :style="playerPageBackgroundStyle">
    <div v-if="isLoading" class="loading-screen">
      <div class="tech-loader"></div>
      <p class="loading-text letter-spacing-1">正在启动播放核心...</p>
    </div>
    <div v-if="error && !isLoading" class="error-screen is-glass-card animated-fadeIn">
      <button class="delete" @click="goBack"></button>
      <p class="has-text-weight-semibold is-size-5 mb-2 has-text-danger">播放错误</p>
      <p>{{ error }}</p>
      <button class="button is-primary is-outlined mt-4" @click="goBack">返回</button>
    </div>

    <div v-if="!isLoading && currentEpisodeData" class="player-layout animated-fadeIn">
      <div class="player-main-area">
        <div class="player-header mb-3">
          <router-link :to="detailPageLink" class="back-to-detail has-text-primary">
            <span class="icon"><i class="fas fa-arrow-left"></i></span>
            <span>返回{{ videoInfo?.type_name === '电影' ? '电影' : '剧集' }}详情</span>
          </router-link>
          <h1 class="title is-size-3-desktop is-size-4-mobile has-text-light video-main-title" :title="videoTitle">
            {{ videoTitle }}
          </h1>
          <h2 v-if="currentEpisodePageTitle"
              class="subtitle is-5 has-text-primary episode-sub-title"
              :title="currentEpisodePageTitle">
            {{ currentEpisodePageTitle }}
          </h2>
        </div>
        <div class="player-wrapper artplayer-host-wrapper">
          <VideoPlayer
            :option="playerOptions"
            :episode-url="currentEpisodeData.url"
            :start-time="currentEpisodeStartTime"
	    @timeupdate="handleTimeUpdate"
            @ended="handleEpisodeEnd"
            @ready="onPlayerReady"
            @error="onPlayerError"
            ref="videoPlayerComponent"
          />
        </div>
        <p v-if="playerError" class="has-text-danger mt-2 has-text-centered player-error-message">{{ playerError }}</p>
      </div>

      <div class="player-sidebar-area is-glass-card">
        <div class="sidebar-header level is-mobile mb-2">
          <div class="level-left">
            <h3 class="title is-5 has-text-primary">播放列表</h3>
          </div>
          <div class="level-right">
            <div class="buttons has-addons">
              <button class="button is-small is-outlined is-info"
                :class="{'is-active is-selected': sortOrder === 'asc'}"
                @click="setSortOrder('asc')"
                title="正序">
                <span class="icon is-small"><i class="fas fa-sort-amount-down-alt"></i></span>
              </button>
              <button class="button is-small is-outlined is-info"
                :class="{'is-active is-selected': sortOrder === 'desc'}"
                @click="setSortOrder('desc')"
                title="倒序">
                <span class="icon is-small"><i class="fas fa-sort-amount-up-alt"></i></span>
              </button>
            </div>
          </div>
        </div>
        <div class="episode-buttons-container scrollable-list">
          <button
            v-for="(episode) in displayedEpisodesInPlayer"
            :key="episode.originalIndex"
            class="button episode-button is-fullwidth"
            :class="{
              'is-primary': currentEpisodeIndex === episode.originalIndex,
              'is-light is-outlined': currentEpisodeIndex !== episode.originalIndex
            }"
            @click="selectEpisode(episode.originalIndex)"
            :title="`播放 ${episode.name}`"
          >
            <span class="episode-index-badge tag is-dark is-rounded mr-2">{{ episode.originalIndex + 1 }}</span>
            <span class="episode-name-text">{{ episode.name }}</span>
          </button>
        </div>
        <div v-if="sortedEpisodesInPlayer.length > maxInitialEpisodesInPlayer" class="has-text-centered mt-2 expand-toggle">
          <button class="button is-small is-link is-outlined is-fullwidth" @click="showAllEpisodesInPlayer = !showAllEpisodesInPlayer">
            <span class="icon is-small"><i :class="showAllEpisodesInPlayer ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i></span>
            <span>{{ showAllEpisodesInPlayer ? '收起列表' : `展开全部 (${sortedEpisodesInPlayer.length}集)` }}</span>
          </button>
        </div>
        <p v-if="episodes.length === 0 && !isLoading" class="has-text-grey-light has-text-centered mt-3">暂无剧集信息。</p>
      </div>
    </div>

    <div v-if="!isLoading && !currentEpisodeData && !error" class="error-screen is-glass-card animated-fadeIn">
      <p class="title is-4 has-text-grey-light">未能加载视频信息。</p>
      <button class="button is-primary is-outlined mt-4" @click="goBack">返回</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { historyManager } from '@/utils/history.js';
import api from '@/services/api';
import VideoPlayer from '@/components/VideoPlayer.vue';
const route = useRoute();
const router = useRouter();
const videoId = ref(decodeURIComponent(route.params.videoId));
const source = ref(route.params.source);
const videoTitle = ref(decodeURIComponent(route.query.title || '正在播放'));
const cover = ref(route.query.cover ? decodeURIComponent(route.query.cover) : '');
const videoInfo = ref(null);
const episodes = ref([]);
const currentEpisodeIndex = ref(0);
const currentEpisodeStartTime = ref(0);
const isLoading = ref(true);
const error = ref(null);
const playerError = ref(null);
let artRef = null;
const sortOrder = ref('asc');
const showAllEpisodesInPlayer = ref(false);
const maxInitialEpisodesInPlayer = 15;


const playerPageBackgroundStyle = computed(() => {
  if (videoInfo.value?.cover) {
    return {
      backgroundImage: `linear-gradient(rgba(var(--my-body-background-color-rgb, 15, 18, 23), 0.92), rgba(var(--my-body-background-color-rgb, 15, 18, 23), 0.98)), url(${videoInfo.value.cover})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center center',
      backgroundAttachment: 'fixed',
    };
  }
  return { backgroundColor: 'var(--my-body-background-color)' };
});

// 关键：allSources参数传递
const allSourcesQuery = computed(() => route.query.allSources ? { allSources: route.query.allSources } : {});

const detailPageLink = computed(() => {
    if (source.value === 'spider') {
    const data = {
      title: videoTitle.value,
      cover: cover.value,
      detailUrl: route.query.detailUrl || '', // 或者保存到 videoInfo 时带上
      desc: route.query.desc || '',
      m3u8Url: episodes.value[0]?.url || ''
    }
    return {
      name: 'SpiderDetail',
      params: {
        data: encodeURIComponent(JSON.stringify(data)),
      },
    };
  }
  const baseParams = { id: videoId.value };
  let queryParams = { ...allSourcesQuery.value };
  if (route.query.customApi) queryParams.customApi = route.query.customApi;
  if (route.query.customDetail) queryParams.customDetail = route.query.customDetail;
  if (source.value === 'custom') {
    return { name: 'CustomDetail', params: baseParams, query: queryParams };
  }
  return { name: 'Detail', params: { ...baseParams, source: source.value }, query: queryParams };
});

const currentEpisodeData = computed(() => episodes.value[currentEpisodeIndex.value] || null);

const currentEpisodePageTitle = computed(() => {
  if (videoInfo.value?.type_name === '电影' && episodes.value.length <= 1) {
    return '';
  }
  return currentEpisodeData.value?.name || '';
});

const sortedEpisodesInPlayer = computed(() => {
  return [...episodes.value]
    .map((ep, index) => ({ ...ep, originalIndex: index }))
    .sort((a, b) => (sortOrder.value === 'asc' ? a.originalIndex - b.originalIndex : b.originalIndex - a.originalIndex));
});

const displayedEpisodesInPlayer = computed(() => {
  if (showAllEpisodesInPlayer.value || sortedEpisodesInPlayer.value.length <= maxInitialEpisodesInPlayer) {
    return sortedEpisodesInPlayer.value;
  }
  return sortedEpisodesInPlayer.value.slice(0, maxInitialEpisodesInPlayer);
});

const setSortOrder = (order) => { sortOrder.value = order; };

function parseEpisodeString(epData, index) {
  if (typeof epData === 'string') {
    const parts = epData.split('$');
    if (parts.length >= 2) {
      const url = parts.pop();
      const name = parts.join('$');
      if (url && url.toLowerCase().startsWith('http')) {
        return { name: name || `第 ${index + 1} 集`, url: url.trim() };
      }
    }
    if (epData && epData.toLowerCase().startsWith('http')) {
      return { name: `第 ${index + 1} 集`, url: epData.trim() };
    }
    return { name: `无效数据 #${index + 1}`, url: '' };
  }
  return { name: epData.name || `第 ${index + 1} 集`, url: epData.url || '' };
}

let lastSaveTime = 0;
const handleTimeUpdate = ({ time, duration }) => {
  const now = Date.now();
  if (now - lastSaveTime < 5000) return;
  if (isLoading.value || !videoInfo.value || time < 1 || duration < 1) return;
  const saveTitle = videoInfo.value?.title || videoInfo.value?.vod_name || videoTitle.value || '未知';
  const saveCover = videoInfo.value?.cover || videoInfo.value?.vod_pic || cover.value || '';
  historyManager.updateProgress({
    videoId: videoId.value,
    source: source.value,
    vod_name: saveTitle,
    vod_pic: saveCover,
    episodeIndex: currentEpisodeIndex.value,
    currentTime: time,
    duration: duration,
  });
  lastSaveTime = now;
};

async function fetchVideoDetailsAndEpisodes() {
  if (source.value === 'spider') return;
  isLoading.value = true;
  error.value = null;
  try {
    const response = await api.getVideoDetails(videoId.value, source.value, route.query.customApi, route.query.customDetail);
    if (response.data?.code === 200) {
      videoInfo.value = response.data.videoInfo;
      episodes.value = (response.data.episodes || []).map((ep, index) => parseEpisodeString(ep, index)).filter(ep => ep.url);
      videoTitle.value = videoInfo.value?.title || videoInfo.value?.vod_name || videoTitle.value;
      cover.value = videoInfo.value?.cover || videoInfo.value?.vod_pic || cover.value;
      playerOptions.value = { ...playerOptions.value, title: videoTitle.value, poster: cover.value };
      const historyEntry = historyManager.getProgress(videoId.value, source.value);
      const initialIndexFromRoute = parseInt(route.params.episodeIndex, 10);
      let targetEpisodeIndex = 0;
      if (!isNaN(initialIndexFromRoute) && initialIndexFromRoute < episodes.value.length) {
        targetEpisodeIndex = initialIndexFromRoute;
      } else if (historyEntry && historyEntry.episodeIndex < episodes.value.length) {
        targetEpisodeIndex = historyEntry.episodeIndex;
      }
      currentEpisodeIndex.value = targetEpisodeIndex;
      currentEpisodeStartTime.value = (historyEntry && historyEntry.episodeIndex === currentEpisodeIndex.value) ? historyEntry.currentTime : 0;
    } else {
      throw new Error(response.data?.message || '加载视频信息失败。');
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

function selectEpisode(originalIndex) {
  if (originalIndex >= 0 && originalIndex < episodes.value.length) {
    currentEpisodeIndex.value = originalIndex;
    playerError.value = null;
    const historyEntry = historyManager.getProgress(videoId.value, source.value);
    currentEpisodeStartTime.value = (historyEntry && historyEntry.episodeIndex === currentEpisodeIndex.value) ? historyEntry.currentTime : 0;
    let artPlayerDynamicTitle = videoInfo.value?.title || videoInfo.value?.vod_name || videoTitle.value || '视频';
    const newEpObj = episodes.value[originalIndex];
    if (newEpObj) {
      if (videoInfo.value?.type_name !== '电影' && newEpObj.name && episodes.value.length > 1) {
        artPlayerDynamicTitle += ` - ${newEpObj.name}`;
      }
    }
    playerOptions.value = { ...playerOptions.value, title: artPlayerDynamicTitle, poster: cover.value };
    if (artRef?.option) artRef.option.title = artPlayerDynamicTitle;
  }
}

const playNextEpisode = () => {
  if (currentEpisodeIndex.value < episodes.value.length - 1) {
    selectEpisode(currentEpisodeIndex.value + 1);
  } else {
    if (artRef) artRef.notice.show('已是最后一集', 2000);
  }
};
const handleEpisodeEnd = () => playNextEpisode();

const onPlayerReady = (artInstance) => {
  artRef = artInstance;
  if (artRef.option) {
    artRef.option.poster = playerOptions.value.poster;
    artRef.option.title = playerOptions.value.title;
  }

  // 只在全屏状态下安全调用 orientation.lock
  if (isMobile() && screen.orientation && typeof screen.orientation.lock === 'function') {
    const lockIfFullscreen = (isFull) => {
      try {
        if (isFull) {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        } else {
          screen.orientation.unlock && screen.orientation.unlock();
        }
      } catch (e) { /* ignore */ }
    };
    artInstance.on('fullscreen', lockIfFullscreen);
    artInstance.on('fullscreenWeb', lockIfFullscreen);
  }
  artInstance.on('fullscreen', (isFull) => { if (!isFull) setTimeout(() => artRef?.resize && artRef.resize(), 150); });
  artInstance.on('fullscreenWeb', (isWebFull) => { if (!isWebFull) setTimeout(() => artRef?.resize && artRef.resize(), 150); });
};

function isMobile() {
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const onPlayerError = (event) => {
  let message = "视频加载失败，请更换剧集或检查网络。";
  if (artRef?.video?.error) {
    switch (artRef.video.error.code) {
      case 1: message = '视频加载被中止。'; break;
      case 2: message = '网络错误导致视频加载失败。'; break;
      case 3: message = '视频解码错误，文件可能损坏或格式不支持。'; break;
      case 4: message = '视频源格式不支持或无法访问。'; break;
    }
  }
  playerError.value = message;
  if (artRef && artRef.notice && typeof artRef.notice.show === 'function') {
    artRef.notice.show(message, 3500);
  }
};

const goBack = () => {
  router.push(detailPageLink.value);
};

// ========= 独立支持spider源 =========

function setSpiderInfo() {
  let url = videoId.value;
  try {
    url = decodeURIComponent(url);
    if (url.includes('%2F') || url.includes('%3A')) {
      url = decodeURIComponent(url);
    }
  } catch {}
  episodes.value = [{ name: videoTitle.value, url }];
  videoInfo.value = {
    title: videoTitle.value,
    cover: cover.value,
  };
  playerOptions.value = {
    ...playerOptions.value,
    title: videoTitle.value,
    poster: cover.value,
  };
  isLoading.value = false;
}

// 只要 source 变成 spider，都走 setSpiderInfo
onMounted(() => {
  if (source.value === 'spider') {
    setSpiderInfo();
  } else {
    fetchVideoDetailsAndEpisodes();
  }
});

onUnmounted(() => {
  if (artRef && videoInfo.value) {
    const now = Date.now();
    if (now - lastSaveTime > 1000) {
      handleTimeUpdate({ time: artRef.currentTime, duration: artRef.duration });
    }
  }
});
watch(() => route.params.episodeIndex, (newIndexStr) => {
  if (newIndexStr && !isLoading.value && episodes.value.length > 0) {
    const newIndex = parseInt(newIndexStr, 10);
    if (newIndex >= 0 && newIndex < episodes.value.length && newIndex !== currentEpisodeIndex.value) {
      selectEpisode(newIndex);
    }
  }
}, { flush: 'post' });

watch([() => route.params.videoId, () => route.params.source], ([newVideoId, newSource]) => {
  if (newSource === 'spider') {
    setSpiderInfo();
  } else {
    fetchVideoDetailsAndEpisodes();
  }
});


</script>

<style lang="scss" scoped>
.player-view-container {
  min-height: calc(100vh - 3.25rem);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background-image 0.5s ease-in-out;
}
.loading-screen, .error-screen {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex-grow: 1;
    text-align: center;
    min-height: 300px;
    &.is-glass-card {
      padding: 2rem;
      max-width: 500px;
      margin: auto;
    }
}
.player-layout {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 1600px;
    margin: auto;
    flex-grow: 1;
    @media screen and (min-width: 1200px) {
        flex-direction: row;
        align-items: flex-start;
    }
}
.player-main-area {
    flex: 3;
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0 auto;
    width: 100%;
}
.player-sidebar-area {
    flex: 1;
    min-width: 300px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    @media screen and (min-width: 1200px) {
        max-width: 400px;
        max-height: calc(100vh - 3.25rem - 2rem - 2.5rem);
        overflow-y: hidden;
    }
     @media screen and (max-width: 1199px) {
        max-height: 45vh;
    }
}
.player-header {
    text-align: center;
    padding: 0 0.5rem;
    margin-bottom: 1rem;
    max-width: 1000px;
    width: 100%;
    margin-left: auto;
    margin-right: auto;
    .back-to-detail {
        display: block;
        margin: 0 auto 0.75rem auto;
        max-width: max-content;
        font-size: 0.9rem;
        color: var(--my-primary-color);
        &:hover {
            color: hsl(var(--my-primary-h,171), var(--my-primary-s,100%), calc(var(--my-primary-l,41%) + 10%));
        }
    }
    .video-main-title {
        margin-bottom: 0.1rem;
        font-weight: 600;
        line-height: 1.2;
    }
    .episode-sub-title {
        font-size: 1.1rem;
        font-weight: 400;
        margin-top: 0.25rem;
        color: var(--my-primary-color);
    }
}
.player-wrapper.artplayer-host-wrapper {
  position: relative;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  background-color: #000;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.4);
}
:deep(.artplayer-app) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 8px;
}
.player-error-message { font-size: 0.9rem; }
.sidebar-header .level-right .buttons.has-addons .button {
    border-width: 1px;
    &.is-active.is-selected {
        background-color: var(--my-primary-color) !important;
        color: hsl(var(--my-primary-h, 171), 20%, 10%) !important;
        border-color: var(--my-primary-color) !important;
        box-shadow: 0 0 8px rgba(var(--my-primary-color-rgb),0.5);
    }
}
.episode-buttons-container.scrollable-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  flex-grow: 1;
  padding-right: 0.5rem;
}
.episode-button {
  font-size: 0.85rem;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
  height: auto;
  line-height: 1.3;
  padding: 0.6em 0.8em;
  display: flex;
  align-items: center;
  border-radius: 6px;
  .episode-index-badge {
    font-size: 0.7rem;
    min-width: 1.8em;
    text-align: center;
    padding: 0.2em 0.4em;
    line-height: 1;
  }
  .episode-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    flex-grow: 1;
  }
}
.expand-toggle {
    padding-top: 0.75rem;
    border-top: 1px solid var(--my-glass-border-color);
}
.letter-spacing-1 { letter-spacing: 1px; }
.animated-fadeIn {
  animation: fadeIn 0.7s ease-out forwards;
  opacity: 0;
}
@keyframes fadeIn {
  to { opacity: 1; }
}
</style>






