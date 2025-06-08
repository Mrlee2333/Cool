<template>
  <div class="card skeleton-card is-glass-card">
    <div class="skeleton-image"></div>
    <div class="card-content custom-card-content">
      <div class="skeleton-text skeleton-title"></div>
      <div class="skeleton-text skeleton-subtitle"></div>
    </div>
  </div>
</template>

<script setup>
// 空脚本，不需逻辑
</script>

<style lang="scss" scoped>
// ----- Shimmer 流光动画 -----
@keyframes skeleton-shimmer {
  0%   { background-position: -150% 0; }
  100% { background-position: 150% 0; }
}

// ---- 骨架卡片整体 ----
.skeleton-card {
  padding: 0;
  border-color: transparent;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(20, 40, 80, 0.08);
  background: none;
}

// ---- 骨架图片（2:3比例） ----
.skeleton-image {
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  width: 100%;
  padding-top: 150%; // 2:3
  background: linear-gradient(
    90deg,
    #23242a 10%,
    #383b47 20%,
    #484b5a 35%,
    #23242a 80%
  );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.3s cubic-bezier(.4,0,.2,1) infinite;
  position: relative;
  overflow: hidden;
}

// ---- 骨架文本 ----
.custom-card-content {
  padding: 0.75rem;
}

.skeleton-text {
  border-radius: 4px;
  height: 1em;
  margin-bottom: 0.6rem;
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    #2c2f36 8%,
    #43465a 18%,
    #2c2f36 33%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s cubic-bezier(.4,0,.2,1) infinite;
}

// ---- 标题、副标题尺寸 ----
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
