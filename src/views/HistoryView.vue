<template>
  <div class="history-view container py-5">
    <div class="header-section level is-mobile">
        <div class="level-left">
            <h1 class="title is-2 has-text-light">播放记录</h1>
        </div>
        <div class="level-right">
            <button v-if="historyList.length > 0" class="button is-danger is-outlined" @click="confirmClearHistory">
                <span class="icon"><i class="fas fa-trash-alt"></i></span>
                <span>清空记录</span>
            </button>
        </div>
    </div>
    
    <div v-if="historyList.length === 0" class="has-text-centered py-6 is-glass-card">
      <p class="title is-4 has-text-grey-light">还没有播放记录</p>
      <router-link to="/" class="button is-primary is-rounded mt-3">前往首页</router-link>
    </div>

    <div v-else class="columns is-multiline is-mobile">
      <div v-for="item in historyList" :key="item.id" class="column is-half-mobile is-one-third-tablet is-one-quarter-desktop is-one-fifth-widescreen">
        <div class="history-card-wrapper">
          <VideoCard :video="item" @click="resumePlayback(item)" />
          <progress v-if="item.duration > 0" class="progress is-primary is-small" :value="item.currentTime" :max="item.duration"></progress>
          <button class="delete is-small delete-button" @click.stop="remove(item.id)"></button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { historyManager } from '@/utils/history.js';
import VideoCard from '@/components/VideoCard.vue';

const router = useRouter();
const historyList = ref([]);

function loadHistory() {
   //console.log('[DEBUG] loadHistory start');
   historyList.value = historyManager.getSortedHistory();
   //console.log('[DEBUG] historyList.value:', historyList.value);
}

const resumePlayback = (item) => {
    router.push({
        name: 'Player',
        params: { 
            source: item.source, 
            videoId: item.videoId,
            episodeIndex: item.episodeIndex // 关键修复，回到原来的集数
        },
        query: { title: encodeURIComponent(item.vod_name),
	cover: encodeURIComponent(item.vod_pic || '') }
    });
};

const remove = (id) => {
    historyManager.removeEntry(id);
    loadHistory();
};

const confirmClearHistory = () => {
    if (window.confirm('确定要清空所有播放记录吗？')) {
        historyManager.clearAll();
        loadHistory();
    }
}

onMounted(() => {
    loadHistory();
});
</script>

<style lang="scss" scoped>
.history-card-wrapper {
  position: relative;
}
.progress.is-small {
  position: absolute;
  bottom: 5px;
  left: 5px;
  right: 5px;
  width: calc(100% - 10px);
  height: 6px;
  opacity: 0.8;
  pointer-events: none;
}
.delete-button {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: rgba(10, 10, 10, 0.6);
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  z-index: 10;
}
.history-card-wrapper:hover {
  .video-progress-bar {
    opacity: 1;
    height: 8px;
  }
  .delete-button {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
