<template>
  <div class="search-container mb-4 px-3">
    <div class="field has-addons has-addons-centered">
      <div class="control is-expanded">
        <input
          class="input is-medium is-rounded"
          type="text"
          v-model="searchQuery"
          @keyup.enter="performSearch"
          placeholder="搜索电影、剧集..."
          :disabled="isLoading"
        />
      </div>
      <div class="control">
        <button
          class="button is-primary is-medium is-rounded"
          @click="performSearch"
          :disabled="isLoading"
          :class="{'is-loading': isLoading && !isCustomSourceSelected}"
        >
          <span>{{ isLoading ? '搜索中...' : '搜索' }}</span>
        </button>
      </div>
    </div>

    <div class="field is-grouped is-grouped-centered mt-3">
      <label class="label has-text-light mr-2 my-auto is-size-6">来源:</label>
      <div class="control">
        <div class="select is-rounded is-small" :class="{'is-loading': isLoading && selectedSourceValue !== 'custom_manual_input' && !isCustomSourceSelected}">
          <select v-model="selectedSourceValue" @change="handleSourceSelection" :disabled="isLoading">
            <option value="aggregated">聚合搜索</option>
            <option disabled>--- 配置源 ---</option>
            <option value="ruyi">如意资源</option>
            <option value="heimuer">黑木耳</option>
            <option value="hwba">华为吧资源</option>
            <option value="jisu">极速资源</option>
            <option value="dbzy">豆瓣资源</option>
            <option value="mozhua">魔爪资源</option>
            <option value="mdzy">魔都资源</option>
            <option value="zuid">最大资源</option>
            <option value="wujin">无尽资源</option>
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
          class="input is-rounded is-small"
          type="text"
          v-model="manualCustomApiUrl"
          placeholder="自定义API基础URL"
          @keyup.enter="performSearch"
          :disabled="isLoading"
          style="max-width: 250px;"
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

//const emit = defineEmits(['search']);
const router = useRouter();
const customSourcesStore = useCustomSourcesStore();

const searchQuery = ref('');
const selectedSourceValue = ref('aggregated');
const manualCustomApiUrl = ref('');

const isCustomSourceSelected = computed(() => {
  return selectedSourceValue.value.startsWith('custom_') && selectedSourceValue.value !== 'custom_manual_input';
});

const handleSourceSelection = () => {
  // 可以在这里添加切换源后立即搜索的逻辑（如果需要）
};

// ** 3. 重写 performSearch 函数，使用 router.push **
const performSearch = () => {
  if (props.isLoading || !searchQuery.value.trim()) return; // 正在加载或搜索词为空则不执行

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
  
  // 构建查询参数
  const queryParams = {
      query: searchQuery.value.trim(),
      source: sourceKeyForApi
  };
  if (apiUrlForApi) {
      queryParams.customApi = apiUrlForApi;
  }

  // 执行路由跳转
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
// 在 main.css 中定义的 .button.is-primary.is-loading::after 样式会处理加载动画
// 你可以在这里添加 SearchBar 特有的其他样式
.search-container {
  // background-color: rgba(var(--my-body-background-color-rgb), 0.5); /* 轻微的背景，如果需要 */
  // padding-bottom: 1rem; /* 调整与下方内容的间距 */
}

.label.has-text-light {
    color: var(--my-text-light-color, #ccc); 
}

.select select, .input {
    // 如果需要进一步自定义输入框和下拉菜单的深色主题样式：
    // background-color: var(--my-input-background-color, #2a2a2a);
    // border-color: var(--my-input-border-color, #444);
    // color: var(--my-text-color, #eee);
    // &:focus {
    //   border-color: var(--my-primary-color);
    //   box-shadow: 0 0 0 0.125em rgba(var(--my-primary-color-rgb), 0.25);
    // }
}
.select select option { // 下拉选项的样式（部分浏览器支持有限）
    // background-color: var(--my-input-background-color, #2a2a2a);
    // color: var(--my-text-color, #eee);
}
</style>



