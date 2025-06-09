<template>
  <div class="search-container mb-4 px-3">
    <div class="field has-addons has-addons-centered search-bar-field">
      <div class="control is-expanded">
        <input
          class="input is-medium is-rounded search-input"
          type="text"
          v-model="searchQuery"
          @keyup.enter="performSearch"
          placeholder="搜索电影、剧集..."
          :disabled="isLoading"
        />
      </div>
      <div class="control">
        <button
          class="button is-primary is-medium is-rounded search-btn"
          @click="performSearch"
          :disabled="isLoading"
          :class="{'is-loading': isLoading && !isCustomSourceSelected}"
        >
          <span v-if="!isLoading" class="icon search-btn-icon">
            <i class="fas fa-search"></i>
          </span>
          <span v-if="isLoading" class="searching-text">搜索中...</span>
          <span v-else class="search-text">搜索</span>
        </button>
      </div>
    </div>

    <div class="field is-grouped is-grouped-centered mt-3 search-group-responsive">
      <div class="control">
        <div class="select is-rounded is-small"
             :class="{'is-loading': isLoading && selectedSourceValue !== 'custom_manual_input' && !isCustomSourceSelected}">
          <select v-model="selectedSourceValue" @change="handleSourceSelection" :disabled="isLoading">
            <option value="aggregated">聚合搜索</option>
            <option disabled>--- 配置源 ---</option>
            <option value="ruyi">如意资源</option>
            <option value="heimuer">黑木耳</option>
	    <option value="hwba">华为吧资源</option>
            <option value="zuid">最大资源</option>
            <option value="ikun">iKun资源</option>
            <template v-if="customSourcesStore.sources.length > 0">
              <option disabled>--- 自定义源 (已保存) ---</option>
              <option
                v-for="source in customSourcesStore.sources"
                :key="source.id"
                :value="`custom_${source.url}`">
                {{ source.name }}
              </option>
            </template>
            <option value="custom_manual_input">手动输入自定义API</option>
          </select>
        </div>
      </div>
      <div class="control" v-if="selectedSourceValue === 'custom_manual_input'">
        <input
          class="input is-rounded is-small custom-api-input"
          type="text"
          v-model="manualCustomApiUrl"
          placeholder="自定义API基础URL"
          @keyup.enter="performSearch"
          :disabled="isLoading"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useCustomSourcesStore } from '@/store/customSourcesStore';
import { useRouter } from 'vue-router';
const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  }
});
const router = useRouter();
const customSourcesStore = useCustomSourcesStore();

const searchQuery = ref('');
const selectedSourceValue = ref('aggregated');
const manualCustomApiUrl = ref('');

const isCustomSourceSelected = computed(() =>
  selectedSourceValue.value.startsWith('custom_') &&
  selectedSourceValue.value !== 'custom_manual_input'
);

const handleSourceSelection = () => {};

const performSearch = () => {
  if (props.isLoading || !searchQuery.value.trim()) return;

  let sourceKeyForApi;
  let apiUrlForApi = '';

  if (selectedSourceValue.value === 'custom_manual_input') {
    sourceKeyForApi = 'custom';
    apiUrlForApi = manualCustomApiUrl.value.trim();
  } else if (isCustomSourceSelected.value) {
    sourceKeyForApi = 'custom';
    apiUrlForApi = selectedSourceValue.value.replace('custom_', '');
  } else {
    sourceKeyForApi = selectedSourceValue.value;
  }

  const queryParams = {
    query: searchQuery.value.trim(),
    source: sourceKeyForApi
  };
  if (apiUrlForApi) {
    queryParams.customApi = apiUrlForApi;
  }

  router.push({
    name: 'Search',
    query: queryParams
  });
};

watch(() => customSourcesStore.sources, (newSourcesArray) => {
  if (isCustomSourceSelected.value) {
    const currentSelectedCustomUrl = selectedSourceValue.value.replace('custom_', '');
    if (!newSourcesArray.some(s => s.url === currentSelectedCustomUrl)) {
      selectedSourceValue.value = 'aggregated';
    }
  }
}, { deep: true });
</script>

<style lang="scss" scoped>
.search-container {
  background: rgba(32,40,60,0.48);
  border-radius: 16px;
  box-shadow: 0 4px 32px rgba(25, 30, 48, 0.15);
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
  padding: 1.1rem 1.3rem 1rem 1.3rem;
  margin-bottom: 1.7rem;
}

// 优化 field 对齐方式，按钮与输入严格等高
.search-bar-field {
  align-items: stretch;
  .control {
    display: flex;
    align-items: stretch;
  }
}

.search-input,
.search-btn {
  height: 48px;
  line-height: 48px;
  font-size: 1.13em;
  border-radius: 999px;
}

.search-input {
  padding: 0 1.1em;
  background: rgba(38,45,61,0.88);
  border: 1.5px solid var(--my-input-border-color, #335);
  color: var(--my-text-color, #fff);
  transition: border-color 0.18s;
  &:focus {
    border-color: var(--my-primary-color, #20e3b2);
    box-shadow: 0 0 0 2px rgba(var(--my-primary-color-rgb, 0,209,178), 0.13);
  }
}

.search-btn {
  padding: 0 1.15em;
  min-width: 48px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--my-primary-color, #11e6b2), #2499f6 80%);
  color: #fff;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(50,200,180,0.07);
  transition: background 0.22s, box-shadow 0.17s, transform 0.14s;
  display: flex;
  align-items: center;
  justify-content: center;

  .search-btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15em;
    margin-right: 0.35em;
  }
  .searching-text,
  .search-text {
    display: flex;
    align-items: center;
    font-size: 1em;
    margin-left: 0.12em;
  }

  &:hover, &:focus {
    background: linear-gradient(90deg, #2499f6 10%, var(--my-primary-color, #11e6b2) 100%);
    transform: scale(1.05);
    box-shadow: 0 4px 20px rgba(0,240,190,0.14);
  }
  &:active {
    transform: scale(0.96);
  }
}

// 下拉和手动输入API美化，并排自适应不溢出
.search-group-responsive {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8em;
  .control {
    flex: 1 1 0;
    min-width: 0;
    max-width: 270px;
    display: flex;
    align-items: center;
  }
}

.custom-api-input {
  width: 100%;
  min-width: 0;
  max-width: 230px;
  box-sizing: border-box;
}

.select.is-rounded select,
.input.is-rounded.is-small {
  border-radius: 999px;
  font-size: 0.98em;
  background: rgba(34,36,42,0.88);
  color: var(--my-text-color, #eee);
  border: 1.2px solid var(--my-input-border-color, #335);
}
.select select option {
  background: #282a31;
  color: #ddd;
}

// 响应式
@media (max-width: 600px) {
  .search-container {
    padding: 0.6rem 0.7rem 0.5rem 0.7rem;
  }
  .search-input, .search-btn {
    height: 40px;
    line-height: 40px;
    font-size: 1em;
  }
  .search-btn {
    min-width: 40px;
    padding: 0 0.85em;
  }
  .search-group-responsive {
    flex-direction: column;
    align-items: stretch;
    gap: 0.4em;
    .control {
      max-width: 100%;
    }
  }
  .custom-api-input {
    max-width: 100%;
  }
}
.search-group-responsive {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.8em;
}
</style>
