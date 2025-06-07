<template>
  <div class="custom-source-manager is-glass-card p-4 mb-5">
    <h3 class="title is-5 has-text-primary mb-3">管理自定义源</h3>
    
    <div class="field is-horizontal">
      <div class="field-body">
        <div class="field">
          <p class="control is-expanded">
            <input class="input is-small" type="text" v-model="newSourceName" placeholder="源名称 (例如：我的备用源)">
          </p>
        </div>
        <div class="field">
          <p class="control is-expanded">
            <input class="input is-small" type="url" v-model="newSourceUrl" placeholder="源API基础URL (例如：https://源域名.com/api.php/provide/vod)">
          </p>
        </div>
        <div class="field">
          <p class="control">
            <button class="button is-primary is-small" @click="handleAddSource" :disabled="!newSourceName || !newSourceUrl">
              <span class="icon is-small"><i class="fas fa-plus"></i></span>
              <span>添加</span>
            </button>
          </p>
        </div>
      </div>
    </div>
    <p v-if="addError" class="has-text-danger is-size-7 mt-1">{{ addError }}</p>
    <p v-if="addSuccess" class="has-text-success is-size-7 mt-1">源已成功添加！</p>


    <div v-if="sourcesStore.sources.length > 0" class="mt-4">
      <h4 class="subtitle is-6 has-text-light">已保存的源:</h4>
      <div class="custom-sources-list">
        <div v-for="source in sourcesStore.sources" :key="source.id" class="custom-source-item level is-mobile">
          <div class="level-left">
            <div class="level-item">
              <p>
                <strong class="has-text-light">{{ source.name }}</strong><br>
                <small class="has-text-grey-light">{{ source.url }}</small>
              </p>
            </div>
          </div>
          <div class="level-right">
            <div class="level-item">
              <button class="button is-danger is-outlined is-small" @click="sourcesStore.removeSource(source.id)" title="删除此源">
                <span class="icon is-small"><i class="fas fa-trash-alt"></i></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="has-text-grey is-size-7 mt-3">暂无自定义源。添加的源将显示在此处并可用于搜索。</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useCustomSourcesStore } from '@/store/customSourcesStore';

const sourcesStore = useCustomSourcesStore();

const newSourceName = ref('');
const newSourceUrl = ref('');
const addError = ref('');
const addSuccess = ref(false);

const handleAddSource = () => {
  addError.value = '';
  addSuccess.value = false;
  if (!newSourceName.value.trim() || !newSourceUrl.value.trim()) {
    addError.value = "名称和URL不能为空。";
    return;
  }
  if (!newSourceUrl.value.startsWith('http://') && !newSourceUrl.value.startsWith('https://')) {
    addError.value = "URL格式不正确，必须以 http:// 或 https:// 开头。";
    return;
  }

  const success = sourcesStore.addSource(newSourceName.value, newSourceUrl.value);
  if (success) {
    newSourceName.value = '';
    newSourceUrl.value = '';
    addSuccess.value = true;
    setTimeout(() => addSuccess.value = false, 3000); // 3秒后清除成功提示
  } else {
    addError.value = "添加失败，可能URL已存在或格式无效。";
  }
};
</script>

<style lang="scss" scoped>
.custom-source-manager {
  // is-glass-card 样式来自 main.css
  // 可以添加更多特定样式
}
.custom-sources-list {
  max-height: 200px; // 限制列表高度，超出则滚动
  overflow-y: auto;
  padding-right: 5px; // 为滚动条留空间
}
.custom-source-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--my-glass-border-color, rgba(180, 180, 200, 0.1));
  &:last-child {
    border-bottom: none;
  }
  p {
    line-height: 1.3;
    word-break: break-all; // 长URL换行
  }
}
.field.is-horizontal .field { // 确保水平字段间距
    margin-right: 0.75rem;
    &:last-child {
        margin-right: 0;
    }
}
</style>

