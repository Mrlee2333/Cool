// src/store/watchProgress.js
import { defineStore } from 'pinia';

const STORE_KEY = 'videoWatchProgress';

export const useWatchProgressStore = defineStore('watchProgress', {
  state: () => ({
    progress: JSON.parse(localStorage.getItem(STORE_KEY) || '{}'),
    // progress format: { 'videoId_source': { episodeIndex: number, time: number, duration: number } }
  }),
  actions: {
    saveProgress(videoId, source, episodeIndex, time, duration) {
      const key = `${videoId}_${source}`;
      if (!this.progress[key]) {
        this.progress[key] = {};
      }
      this.progress[key] = { episodeIndex, time, duration };
      localStorage.setItem(STORE_KEY, JSON.stringify(this.progress));
    },
    getProgress(videoId, source) {
      const key = `${videoId}_${source}`;
      return this.progress[key] || null;
    },
    clearProgress(videoId, source) {
        const key = `${videoId}_${source}`;
        if (this.progress[key]) {
            delete this.progress[key];
            localStorage.setItem(STORE_KEY, JSON.stringify(this.progress));
        }
    }
  },
});

