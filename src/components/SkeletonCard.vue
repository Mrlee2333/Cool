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
// SkeletonCard.vue 样式优化：丝滑 shimmer 流光骨架

.skeleton-card {
  padding: 0; // 重置 is-glass-card 的 padding
  border-color: transparent;
  border-radius: 12px;
  overflow: hidden;
  background: none; // 透出毛玻璃

  // 可选: 提高骨架卡片“浮动感”
  box-shadow: 0 2px 12px rgba(20, 40, 80, 0.08);
}

// shimmer 动画
@keyframes skeleton-shimmer {
  0% {
    background-position: -120% 0;
  }
  100% {
    background-position: 120% 0;
  }
}

// 用 shimmer 替换 pulse
.skeleton-image {
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  width: 100%;
  padding-top: 150%; /* 2:3 高宽比 */
  background: linear-gradient(
    90deg,
    #292b32 8%,
    #343846 18%,
    #43485a 33%,
    #292b32 60%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.3s cubic-bezier(.4,0,.2,1) infinite;
  position: relative;
  overflow: hidden;
}

.custom-card-content {
  padding: 0.75rem;
}

.skeleton-text {
  border-radius: 4px;
  height: 1em;
  background: linear-gradient(
    90deg,
    #30333b 8%,
    #44485a 18%,
    #30333b 33%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s cubic-bezier(.4,0,.2,1) infinite;
  margin-bottom: 0.6rem;
  position: relative;
  overflow: hidden;
}

.skeleton-title {
  width: 85%;
  height: 1.2em;
  margin-bottom: 0.5rem;
}
.skeleton-subtitle {
  width: 50%;
  height: 0.85em;
  margin-bottom: 0;
}
</style>

