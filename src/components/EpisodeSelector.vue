<template>
  <div class="episode-selector my-4">
    <h3 class="title is-5 has-text-light">Episodes</h3>
    <div class="buttons are-small">
      <button
        v-for="(episodeUrl, index) in episodes"
        :key="index"
        class="button"
        :class="{ 'is-primary': currentIndex === index, 'is-outlined is-light': currentIndex !== index }"
        @click="selectEpisode(index)"
      >
        {{ getEpisodeName(episodeUrl, index) }}
      </button>
    </div>
    <p v-if="episodes.length === 0" class="has-text-grey-light">No episodes found for this source.</p>
  </div>
</template>

<script setup>
const props = defineProps({
  episodes: {
    type: Array,
    required: true,
    default: () => []
  },
  currentIndex: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['select']);

const selectEpisode = (index) => {
  emit('select', index);
};

const getEpisodeName = (url, index) => {
  // Basic naming, can be improved if URLs have names
  try {
    const urlParts = new URL(url).pathname.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    if (lastPart && !lastPart.includes('.m3u8')) { // Check if it's not just index.m3u8
        return decodeURIComponent(lastPart);
    }
  } catch (e) { /* ignore, fallback to index */ }
  return `Episode ${index + 1}`;
};
</script>

<style scoped lang="scss">
.episode-selector {
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem; // Bulma 0.9.4+ supports gap for buttons

    .button {
      // For a "techy" feel, you might use more squared buttons or add subtle effects
      // border-radius: 4px;
      // transition: all 0.2s ease;
      &:hover:not(.is-primary) {
        // border-color: var(--bulma-primary);
        // color: var(--bulma-primary);
      }
    }
  }
}
</style>

