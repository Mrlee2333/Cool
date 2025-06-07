<template>
  <div class="search-view container py-5">
    <div class="search-title-box is-glass-card mb-5 animated-fadeIn">
      <p class="is-size-7 has-text-grey mb-1">搜索结果</p>
      <h1 class="title is-3 has-text-light">
        {{ searchQuery }}
      </h1>
      <p v-if="sourceName" class="subtitle is-6 has-text-primary">
        搜索源: {{ sourceName }}
      </p>
    </div>

    <div v-if="isLoading" class="columns is-multiline is-mobile">
      <div v-for="n in 12" :key="`skel-${n}`" class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen">
        <SkeletonCard />
      </div>
    </div>
    
    <div v-if="error" class="notification is-danger is-light is-glass-card animated-fadeIn">
      <p>{{ error }}</p>
    </div>

    <div v-if="!isLoading && searchResults.length === 0 && hasSearched" class="has-text-centered py-6 is-glass-card animated-fadeIn">
      <p class="title is-4 has-text-grey-light">未能找到相关内容。</p>
      <p class="subtitle is-6 has-text-grey">你可以返回首页尝试其他搜索源。</p>
    </div>

    <div v-if="!isLoading && searchResults.length > 0" class="columns is-multiline is-mobile animated-fadeInUp">
        <div v-for="(video, index) in searchResults" :key="`search-${index}`" class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen">
          <VideoCard :video="video" />
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import VideoCard from '@/components/VideoCard.vue';
import SkeletonCard from '@/components/SkeletonCard.vue';

const resultCache = {};

const route = useRoute();
const searchResults = ref([]);
const isLoading = ref(false);
const error = ref(null);
const searchQuery = ref(route.query.query || '');
const sourceKey = ref(route.query.source || 'aggregated');
const hasSearched = ref(false);

const sourceName = computed(() => {
    const key = sourceKey.value;
    if (key === 'aggregated') return '聚合搜索';
    if (key === 'custom') return '自定义源';
    const sourceMap = { heimuer: '黑木耳', ruyi: '如意资源' /* ... */ };
    return sourceMap[key] || key;
});

// 核心：聚合去重（按名称+年份）
function mergeByTitleAndYear(results) {
  const map = new Map();
  for (const item of results) {
    const key = `${item.vod_name?.trim() || ''}_${item.year || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        _sources: [{
          source_code: item.source_code,
          source_name: item.source_name,
          vod_id: item.vod_id,
          api_url: item.api_url,
          remarks: item.vod_remarks,
        }]
      });
    } else {
      map.get(key)._sources.push({
        source_code: item.source_code,
        source_name: item.source_name,
        vod_id: item.vod_id,
        api_url: item.api_url,
        remarks: item.vod_remarks,
      });
    }
  }
  return Array.from(map.values());
}

const performSearch = async () => {
  const query = route.query.query;
  const source = route.query.source || 'aggregated';
  const customApi = route.query.customApi || '';
  if (!query) {
    searchResults.value = [];
    return;
  }
  searchQuery.value = query;
  sourceKey.value = source;
  isLoading.value = true;
  error.value = null;
  hasSearched.value = false;
  const cacheKey = JSON.stringify({ query, source, customApi });
  if (resultCache[cacheKey]) {
    searchResults.value = resultCache[cacheKey];
    isLoading.value = false;
    hasSearched.value = true;
    return;
  }
  try {
    const response = await api.searchVideos(query, source, customApi);
    if (response.data && response.data.code === 200) {
      const merged = mergeByTitleAndYear(response.data.list || []);
      searchResults.value = merged;
      resultCache[cacheKey] = searchResults.value;
    } else {
      throw new Error(response.data?.message || '未能获取搜索结果。');
    }
  } catch (err) {
    error.value = `搜索时发生错误: ${err.message}`;
  } finally {
    isLoading.value = false;
    hasSearched.value = true;
  }
};

watch(() => route.query, (newQuery) => {
  if (newQuery.query) {
    performSearch();
  } else {
    searchResults.value = [];
    searchQuery.value = '';
  }
}, { immediate: true, deep: true });
</script>

<style scoped>
.search-title-box {
  text-align: center;
}
</style>
