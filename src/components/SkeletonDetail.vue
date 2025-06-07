<template>
  <div class="skeleton-detail-container container py-5 animated-fadeIn">
    <div class="columns is-desktop">
      <div class="column is-one-third-desktop poster-column">
        <div class="skeleton-image"></div>
        <div class="skeleton-tags mt-4">
          <div class="skeleton-text" style="width: 120px; height: 1.75rem;"></div>
          <div class="skeleton-text" style="width: 200px; margin-top: 0.5rem;"></div>
        </div>
      </div>
      
      <div class="column is-two-thirds-desktop info-column is-glass-card">
        <div class="skeleton-text skeleton-main-title" style="width: 70%; height: 2.5rem;"></div>
        <div class="skeleton-text skeleton-subtitle" style="width: 40%; height: 1rem; margin-top: 1rem;"></div>
        
        <div class="skeleton-description mt-5">
          <div class="skeleton-text" style="width: 95%;"></div>
          <div class="skeleton-text" style="width: 98%;"></div>
          <div class="skeleton-text" style="width: 90%;"></div>
          <div class="skeleton-text" style="width: 60%;"></div>
        </div>

        <div class="skeleton-meta mt-5">
            <div class="skeleton-text" style="width: 80%; margin-bottom: 0.5rem;"></div>
            <div class="skeleton-text" style="width: 90%;"></div>
        </div>

        <div class="skeleton-episodes mt-5">
          <div class="skeleton-text" style="width: 150px; height: 1.5rem; margin-bottom: 1rem;"></div>
          <div class="buttons are-small">
            <div v-for="n in 12" :key="n" class="skeleton-text skeleton-button"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes skeleton-pulse {
  0% { background-color: rgba(165, 165, 165, 0.1); }
  50% { background-color: rgba(165, 165, 165, 0.2); }
  100% { background-color: rgba(165, 165, 165, 0.1); }
}

.animated-fadeIn {
  animation: fadeIn 0.5s ease-out forwards;
  opacity: 0;
}
@keyframes fadeIn {
  to { opacity: 1; }
}

.poster-column, .info-column {
  opacity: 0;
  animation: fadeIn 0.5s 0.2s ease-out forwards;
}

.skeleton-image {
  padding-top: 150%; /* 2:3 aspect ratio */
  border-radius: 12px;
  animation: skeleton-pulse 1.8s ease-in-out infinite;
  background-color: #333;
}
.skeleton-tags {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.skeleton-text {
  background-color: #333;
  animation: skeleton-pulse 1.8s ease-in-out infinite;
  border-radius: 4px;
  height: 1em;
  margin-bottom: 0.5rem;
}
.skeleton-button {
    width: 80px;
    height: 1.75rem;
    margin: 0.25rem;
}

.skeleton-description .skeleton-text {
    height: 0.9em;
}
</style>

