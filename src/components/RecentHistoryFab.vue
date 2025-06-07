<template>
  <div
    class="fab-container"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @touchstart.stop.prevent="onTouchFab"
  >
    <button
      class="fab-btn"
      @click="onClickFab"
      title="最近播放"
      :aria-expanded="show"
      tabindex="0"
    >
      <i class="fas fa-history"></i>
    </button>
    <transition name="fab-pop-fade">
      <div
        v-if="show"
        ref="popupRef"
        class="fab-popup is-glass-card"
        @click.stop
        @mouseenter="onMouseEnter"
        @mouseleave="onMouseLeave"
        @touchstart.stop
      >
        <div class="fab-popup-header">
          <span>最近播放</span>
          <button
            v-if="historyList.length > 0"
            class="fab-clear-btn"
            title="清空全部记录"
            @click.stop="clearHistory"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="fab-history-list">
          <div
            v-for="item in historyList"
            :key="item.id"
            class="fab-history-item"
            @click="resume(item)"
          >
            <span class="fab-movie-name">{{ item.vod_name }}</span>
            <span class="fab-progress">({{ formatTime(item.currentTime) }}/{{ formatTime(item.duration) }})</span>
          </div>
          <div v-if="historyList.length === 0" class="fab-history-empty">暂无播放记录</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { historyManager } from '@/utils/history.js';

const router = useRouter();
const show = ref(false);
const historyList = ref([]);
const popupRef = ref(null);
let hoverTimer = null;

const isMobile = () =>
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || window.innerWidth < 768);

function loadHistory() {
  historyList.value = historyManager.getSortedHistory().slice(0, 5);
}

function onMouseEnter() {
  if (isMobile()) return;
  clearTimeout(hoverTimer);
  show.value = true;
  loadHistory();
}
function onMouseLeave() {
  if (isMobile()) return;
  hoverTimer = setTimeout(() => {
    show.value = false;
  }, 120);
}
function onTouchFab() {
  if (!isMobile()) return;
  show.value = !show.value;
  if (show.value) loadHistory();
  // 解决部分安卓初次触摸弹窗无动画
  if (show.value) nextTick(() => void 0);
}
function onClickFab() {
  if (isMobile()) {
    show.value = !show.value;
    if (show.value) loadHistory();
    return;
  }
  if (show.value) {
    show.value = false;
  } else {
    show.value = true;
    loadHistory();
  }
}
function onClickOutside(event) {
  if (!show.value) return;
  if (!isMobile()) return;
  if (popupRef.value && !popupRef.value.contains(event.target)) {
    show.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onClickOutside, true);
  document.addEventListener('touchstart', onClickOutside, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside, true);
  document.removeEventListener('touchstart', onClickOutside, true);
});

function resume(item) {
  show.value = false;
  router.push({
    name: 'Player',
    params: {
      source: item.source,
      videoId: item.videoId,
      episodeIndex: item.episodeIndex,
    },
    query: { title: encodeURIComponent(item.vod_name),
             cover: encodeURIComponent(item.vod_pic || '')
    },
  });
}
function clearHistory() {
  if (window.confirm('确定要清空所有播放记录吗？')) {
    historyManager.clearAll();
    loadHistory();
  }
}
function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
</script>

<style scoped>
.fab-container {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 999;
  @media (max-width: 600px) {
    right: 20px;
    bottom: 20px;
  }
}
.fab-btn {
  background: var(--my-primary-color, #23ade5);
  color: #fff;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  font-size: 1.7rem;
  box-shadow: 0 4px 16px rgba(30,40,80,0.18);
  transition: background 0.23s cubic-bezier(.4,2,.5,.7);
  cursor: pointer;
  @media (max-width: 600px) {
    width: 46px;
    height: 46px;
    font-size: 1.4rem;
  }
}
.fab-btn:hover,
.fab-btn:focus {
  background: #148dbe;
}

.fab-pop-fade-enter-active,
.fab-pop-fade-leave-active {
  transition:
    opacity 0.36s cubic-bezier(.5,.7,.4,1.1),
    transform 0.32s cubic-bezier(.4,2,.6,.9);
}
.fab-pop-fade-enter-from,
.fab-pop-fade-leave-to {
  opacity: 0;
  transform: translateY(28px) scale(.97);
}
.fab-pop-fade-enter-to,
.fab-pop-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.fab-popup {
  position: absolute;
  right: 0;
  bottom: 60px;
  min-width: 230px;
  max-width: 98vw;
  padding: 0.7rem 1.1rem 0.8rem 1.1rem;
  background: rgba(30,40,60,0.96);
  border-radius: 12px;
  box-shadow: 0 3px 24px rgba(30,40,80,0.18);
  @media (max-width: 600px) {
    min-width: 145px;
    max-width: 95vw;
    font-size: 0.98em;
    padding: 0.5rem 0.75rem 0.7rem 0.75rem;
    border-radius: 9px;
  }
}
.fab-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.09em;
  font-weight: 600;
  margin-bottom: 4px;
  color: #f6f7fb;
}
.fab-clear-btn {
  background: none;
  border: none;
  color: #ef5959;
  font-size: 1.06em;
  cursor: pointer;
  transition: color 0.15s;
  margin-left: 8px;
  margin-right: -3px;
  padding: 0 3px;
}
.fab-clear-btn:hover { color: #bd2323; }
.fab-history-list {
  max-height: 280px;
  overflow-y: auto;
}
.fab-history-item {
  cursor: pointer;
  padding: 7px 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  justify-content: space-between;
  font-size: 1rem;
  color: #f5f6fa;
  transition: color 0.18s cubic-bezier(.6,1,.6,.94);
  user-select: none;
  border-radius: 5px;
  @media (max-width: 600px) {
    font-size: 0.98rem;
    padding: 5px 0;
  }
}
.fab-history-item:hover {
  color: #23ade5;
  background: rgba(27,176,228,0.10);
}
.fab-movie-name {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 600px) {
    max-width: 70px;
  }
}
.fab-progress {
  font-size: 0.93em;
  color: #bbb;
  min-width: 46px;
  text-align: right;
  @media (max-width: 600px) {
    min-width: 36px;
  }
}
.fab-history-empty {
  color: #aaa;
  text-align: center;
  padding: 0.8rem 0;
  font-size: 0.99em;
}
</style>
