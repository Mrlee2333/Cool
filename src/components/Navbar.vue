<template>
  <nav class="navbar is-fixed-top is-glass-enhanced" role="navigation" aria-label="main navigation">
    <div class="container is-fluid">
      <div class="navbar-brand">
        <router-link class="navbar-item site-brand-container" to="/">
          <img src="/mrlee.ico" width="32" height="32" alt="Logo" class="site-logo">
          <strong class="site-title animated-title">MOVIE<span class="title-後半">SITE</span></strong>
        </router-link>

        <a role="button" 
           class="navbar-burger" 
           :class="{'is-active': isActive}" 
           @click="isActive = !isActive" 
           aria-label="menu" 
           aria-expanded="false" 
           data-target="navbarBasicExample">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>

      <div id="navbarBasicExample" class="navbar-menu" :class="{'is-active': isActive}">
        <div class="navbar-start">
          <router-link class="navbar-item" to="/" @click="isActive = false">
          <span class="icon-text">
              <span class="icon"><i class="fas fa-home"></i></span>
              <span>首页</span>
            </span>
	  </router-link>
	   <router-link class="navbar-item" to="/history" @click="isActive = false">
    <span class="icon-text">
      <span class="icon"><i class="fas fa-history"></i></span>
      <span>播放记录</span>
    </span>
  </router-link>
	  <a class="navbar-item" href="https://github.com/macklee6" target="_blank">
  <span class="icon-text">
    <span class="icon"><i class="fa-brands fa-github"></i></span>
    <span>GitHub</span>
  </span>
</a>

          </div>
        <div class="navbar-end">
            </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue';
const isActive = ref(false);
</script>

<style lang="scss" scoped>
// 确保在 main.css 中定义了 --my-primary-color, --my-text-color, --my-glass-bg, --my-glass-border-color
// 以及 --my-primary-color-rgb

.navbar.is-glass-enhanced {
  background: var(--my-glass-bg, rgba(30, 35, 45, 0.65));
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  border-bottom: 1px solid var(--my-glass-border-color, rgba(180, 180, 200, 0.15));
  box-shadow: 0 2px 15px rgba(0,0,0,0.25);
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

.site-brand-container {
    display: flex;
    align-items: center;
}
.site-logo {
    margin-right: 0.75rem;
    filter: drop-shadow(0 0 5px rgba(var(--my-primary-color-rgb), 0.5)); /* Logo也带点辉光 */
}

.navbar-item, .navbar-link { // .navbar-link for dropdowns if any
  color: var(--my-text-light-color, #ccc);
  font-weight: 500; /* 略微加粗 */
  transition: color 0.2s ease, background-color 0.2s ease;

  &:hover, &:focus, &.is-active { // .is-active for router-link-active
    background-color: rgba(var(--my-primary-color-rgb), 0.1) !important;
    color: var(--my-primary-color, hsl(171, 100%, 41%)) !important;
    border-radius: 4px; /* 悬停时给个圆角 */
  }
}
// Ensure router-link-active gets similar styling if desired
:deep(.router-link-active.navbar-item) {
    color: var(--my-primary-color, hsl(171, 100%, 41%)) !important;
    padding-bottom: calc(0.75rem - 2px); /* 调整内边距以适应边框 */
}


.navbar-burger {
  color: var(--my-text-light-color, #ccc);
  span {
    background-color: var(--my-text-light-color, #ccc);
    height: 2px; /* 汉堡线更细一点 */
  }
  &:hover {
    background-color: rgba(var(--my-primary-color-rgb), 0.1);
  }
  &.is-active span:nth-child(1) {
      transform: translateY(7px) rotate(45deg); /* 调整汉堡动画 */
  }
  &.is-active span:nth-child(2) {
      opacity: 0;
  }
  &.is-active span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg); /* 调整汉堡动画 */
  }
}

.site-title {
  font-size: 1.75rem; // 略微增大
  font-weight: 700; // 更粗的字重
  letter-spacing: 0.5px;
}

.animated-title {
  color: var(--my-primary-color, hsl(171, 100%, 41%));
  animation: throbAndGlow 2.5s infinite ease-in-out;
}

.animated-title .title-後半 {
  color: #fff;
}

@keyframes throbAndGlow {
  0%, 100% {
    transform: scale(1);
    text-shadow:
      0 0 3px rgba(255,255,255,0.3), /* 内发光 */
      0 0 6px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 12px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 20px rgba(var(--my-primary-color-rgb), 0.7),
      0 0 30px rgba(var(--my-primary-color-rgb), 0.5);
  }
  50% {
    transform: scale(1.03); // 更平滑的跳动
    text-shadow:
      0 0 5px rgba(255,255,255,0.4), /* 内发光 */
      0 0 10px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 20px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 30px rgba(var(--my-primary-color-rgb), 0.8),
      0 0 45px rgba(var(--my-primary-color-rgb), 0.6);
  }
}
</style>

