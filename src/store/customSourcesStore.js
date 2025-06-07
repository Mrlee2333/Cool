// src/store/customSourcesStore.js
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const CUSTOM_SOURCES_STORAGE_KEY = 'userCustomApiSources';

export const useCustomSourcesStore = defineStore('customSources', () => {
  const sources = ref([]);

  // 1. 从 localStorage 加载源
  function loadSources() {
    const storedSources = localStorage.getItem(CUSTOM_SOURCES_STORAGE_KEY);
    if (storedSources) {
      try {
        sources.value = JSON.parse(storedSources);
      } catch (e) {
        console.error("Error parsing custom sources from localStorage:", e);
        sources.value = []; // 解析失败则重置
      }
    }
  }

  // 2. 添加源
  function addSource(name, url) {
    if (!name || !url || !url.startsWith('http')) {
      console.warn("Invalid custom source name or URL.");
      return false;
    }
    // 检查是否已存在相同的 URL
    if (sources.value.some(s => s.url === url)) {
      console.warn(`Custom source with URL "${url}" already exists.`);
      return false; // 或者提示用户已存在
    }
    sources.value.push({ 
      id: Date.now().toString(), // 简单的唯一ID
      name: name.trim(), 
      url: url.trim() 
    });
    return true;
  }

  // 3. 移除源
  function removeSource(sourceId) {
    sources.value = sources.value.filter(s => s.id !== sourceId);
  }

  // 4. 监听 sources 变化并保存到 localStorage
  watch(sources, (newSources) => {
    localStorage.setItem(CUSTOM_SOURCES_STORAGE_KEY, JSON.stringify(newSources));
  }, { deep: true });

  // 初始化时加载一次
  loadSources();

  return {
    sources,
    addSource,
    removeSource,
    loadSources, // 暴露以便外部需要时重新加载
  };
});

