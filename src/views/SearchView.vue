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
      <div class="filter-switch-area">
        <label class="switch-label">
          <input type="checkbox"
            :checked="enableBlockFilter"
            @change="handleBlockFilterChange($event.target.checked)"
            class="switch-checkbox"
          >
          <span class="switch-slider"></span>
          <span class="switch-text">芝麻开门</span>
        </label>
        <span v-if="enableBlockFilter && filteredCount>0" class="has-text-danger ml-2 filter-tip">
           已打败{{ filteredCount }} 个怪兽
        </span>
      </div>
    </div>

    <!-- 密码弹窗 -->
    <div v-if="showPasswordModal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">关闭过滤需要密码</h2>
        </div>
        <div class="modal-body">
          <input class="modal-password-input"
                 type="password"
                 v-model="passwordInput"
                 placeholder="请输入关闭密码"
                 @keyup.enter="confirmPasswordToClose"
                 autofocus>
          <p v-if="passwordError" class="modal-error-tip">{{ passwordError }}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn danger" @click="confirmPasswordToClose">确定关闭</button>
          <button class="modal-btn" @click="cancelPasswordModal">取消</button>
        </div>
      </div>
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

// AES加密依赖
import CryptoJS from "crypto-js";

// -------- 关键词过滤配置 --------
const BLOCK_KEYWORDS = [
  '三级', '倫理', '伦理', '三級', '限制级', '情色', 'R级', 'r18', '无码', '無碼'
];
const correctPassword = 'mrlee520'; // 关闭过滤的密码，请自行修改
const AES_SECRET = 'block_switch_secret_2024'; // AES密钥，自定义
const BLOCK_SWITCH_KEY = 'block_filter_switch_aes';

// 状态
const enableBlockFilter = ref(getSwitchState());
const filteredCount = ref(0);
const showPasswordModal = ref(false);
const passwordInput = ref('');
const passwordError = ref('');

// --------- 过滤开关持久化 ---------
function getSwitchState() {
  const enc = localStorage.getItem(BLOCK_SWITCH_KEY);
  if (!enc) return true;
  try {
    const bytes = CryptoJS.AES.decrypt(enc, AES_SECRET);
    const val = bytes.toString(CryptoJS.enc.Utf8);
    return val === 'on';
  } catch {
    return true;
  }
}
function setSwitchState(isOn) {
  const ciphertext = CryptoJS.AES.encrypt(isOn ? 'on' : 'off', AES_SECRET).toString();
  localStorage.setItem(BLOCK_SWITCH_KEY, ciphertext);
}

// --------- 开关与密码 ---------
function handleBlockFilterChange(val) {
  if (!val) {
    showPasswordModal.value = true;
    passwordInput.value = '';
    passwordError.value = '';
    return;
  }
  enableBlockFilter.value = true;
  setSwitchState(true);
  doFilter();
}
function confirmPasswordToClose() {
  if (passwordInput.value === correctPassword) {
    enableBlockFilter.value = false;
    setSwitchState(false);
    showPasswordModal.value = false;
    doFilter();
  } else {
    passwordError.value = "密码错误";
  }
}
function cancelPasswordModal() {
  showPasswordModal.value = false;
  enableBlockFilter.value = true;
}

// --------- 前端过滤 ---------
function filterByBlockKeywords(results) {
  if (!enableBlockFilter.value) {
    filteredCount.value = 0;
    return results;
  }
  const blockRe = new RegExp(BLOCK_KEYWORDS.join('|'), 'i');
  const filtered = results.filter(item =>
    !blockRe.test(item.vod_name || '') &&
    !blockRe.test(item.type_name || '') &&
    !blockRe.test(item.vod_remarks || '')
  );
  filteredCount.value = results.length - filtered.length;
  return filtered;
}
function doFilter() {
  const cacheKey = JSON.stringify({
    query: searchQuery.value,
    source: sourceKey.value,
    customApi: route.query.customApi || ''
  });
  const raw = resultCache[cacheKey] || [];
  searchResults.value = filterByBlockKeywords(raw);
}

// --------- 业务原有部分 ---------
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
    searchResults.value = filterByBlockKeywords(resultCache[cacheKey]);
    isLoading.value = false;
    hasSearched.value = true;
    return;
  }
  try {
    const response = await api.searchVideos(query, source, customApi);
    if (response.data && response.data.code === 200) {
      const merged = mergeByTitleAndYear(response.data.list || []);
      resultCache[cacheKey] = merged;
      searchResults.value = filterByBlockKeywords(merged);
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

watch(enableBlockFilter, (val, oldVal) => {
  if (val !== oldVal) doFilter();
});
</script>

<style scoped>
/* 开关美化 */
.filter-switch-area {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1.5em;
  margin-bottom: 0.3em;
}

.switch-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.switch-checkbox {
  display: none;
}
.switch-slider {
  width: 42px;
  height: 24px;
  background: #ececf6;
  border-radius: 12px;
  margin-right: 0.8em;
  position: relative;
  transition: background .2s;
}
.switch-checkbox:checked + .switch-slider {
  background: #36d1c4;
}
.switch-slider::after {
  content: '';
  position: absolute;
  left: 3px; top: 3px;
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px #23ade588;
  transition: left .2s;
}
.switch-checkbox:checked + .switch-slider::after {
  left: 21px;
}
.switch-text {
  font-size: 1.05em;
  color: #59d1e4;
  font-weight: 500;
  margin-left: .12em;
}
.filter-tip {
  font-size: .98em;
  font-weight: 400;
}

/* 居中弹窗美化 */
.modal-overlay {
  position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
  background: rgba(26,38,60,0.27);
  display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
.modal-content {
  background: #262a45;
  border-radius: 15px;
  box-shadow: 0 12px 44px 0 rgba(44,80,188,0.13);
  max-width: 350px;
  width: 92vw;
  padding: 2.1em 1.5em 1.4em 1.5em;
  animation: fadeInUp .35s cubic-bezier(.18,.8,.45,1.25);
  display: flex; flex-direction: column;
  align-items: center;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(44px) scale(.97);}
  to { opacity: 1; transform: none;}
}
.modal-header { margin-bottom: 0.8em; width: 100%; text-align: center; }
.modal-title {
  font-size: 1.15em;
  color: #36d1c4;
  font-weight: 600;
  margin-bottom: .4em;
}
.modal-body {
  width: 100%; margin-bottom: 1.2em; display: flex; flex-direction: column; align-items: center;
}
.modal-password-input {
  width: 95%; padding: .7em .8em; border-radius: 7px; border: 1.5px solid #47c3d9a2;
  background: #28324a; color: #f2f6fa; font-size: 1.11em;
  margin-bottom: .55em;
  outline: none;
  transition: border-color .17s;
}
.modal-password-input:focus { border-color: #4fd3b8; }
.modal-error-tip {
  color: #ff6c6c;
  font-size: .96em;
  margin-top: -.2em;
}
.modal-footer {
  width: 100%;
  display: flex; justify-content: space-between; gap: .9em;
}
.modal-btn {
  min-width: 86px;
  padding: .6em 0;
  border-radius: 7px;
  border: none;
  background: #262a45;
  color: #59d1e4;
  font-size: 1em;
  font-weight: 500;
  transition: background .19s,color .14s;
  cursor: pointer;
  box-shadow: 0 1px 6px #36d1c438;
}
.modal-btn.danger {
  background: linear-gradient(95deg,#36d1c4 10%,#4785ff 98%);
  color: #fff;
}
.modal-btn:hover { background: #253654; }
.modal-btn.danger:hover { background: #24b5a2; }
.search-title-box { text-align: center; }
</style>
