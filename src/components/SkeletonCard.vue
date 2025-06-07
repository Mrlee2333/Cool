<template>
  <div class="card skeleton-card is-glass-card">
    <div class="skeleton-image"></div>
    <div class="card-content custom-card-content">
      <div class="skeleton-text skeleton-title"></div>
      <div class="skeleton-text skeleton-subtitle"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes skeleton-pulse {
  0% {
    background-color: rgba(165, 165, 165, 0.1);
  }
  50% {
    background-color: rgba(165, 165, 165, 0.25);
  }
  100% {
    background-color: rgba(165, 165, 165, 0.1);
  }
}

.skeleton-card {
  // is-glass-card 样式来自 main.css，我们这里只定义骨架特有的样式
  padding: 0; // 重置 is-glass-card 的 padding
  border-color: transparent; // 加载时边框可以不那么明显
}

.skeleton-image {
  background-color: #333; /* 骨架屏基础色 */
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  padding-top: 150%; /* 模拟 is-2by3 的宽高比 (3/2 * 100%) */
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.custom-card-content {
  padding: 0.75rem;
}

.skeleton-text {
  background-color: #333;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: 4px;
  height: 1em;
}

.skeleton-title {
  width: 85%;
  margin-bottom: 0.5rem;
}

.skeleton-subtitle {
  width: 50%;
  height: 0.75em;
}
</style>

