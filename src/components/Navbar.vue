<template>
  <nav class="navbar is-fixed-top is-glass-enhanced" role="navigation" aria-label="main navigation">
    <div class="container is-fluid">
      <div class="navbar-brand">
        <router-link class="navbar-item site-brand-container" to="/">
          <img src="/mrlee.ico" width="32" height="32" alt="Logo" class="site-logo" />
          <strong class="site-title animated-title">MOVIE<span class="title-後半">SITE</span></strong>
        </router-link>
        <a role="button"
           class="navbar-burger"
           :class="{ 'is-active': isActive }"
           @click="isActive = !isActive"
           aria-label="menu"
           aria-expanded="false"
           data-target="navbarMenu">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>
      <div id="navbarMenu" class="navbar-menu" :class="{ 'is-active': isActive }">
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
        <div class="navbar-end"></div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
const isActive = ref(false)
</script>

<style lang="scss" scoped>
.navbar.is-glass-enhanced {
  background: var(--my-glass-bg, rgba(30, 35, 45, 0.67));
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  border-bottom: 1px solid var(--my-glass-border-color, rgba(180, 180, 200, 0.15));
  box-shadow: 0 2px 15px rgba(0,0,0,0.17);
  transition: background 0.28s, box-shadow 0.22s;
  will-change: background, box-shadow;
}

.site-brand-container {
  display: flex;
  align-items: center;
}
.site-logo {
  margin-right: 0.68rem;
  filter: drop-shadow(0 0 5px rgba(var(--my-primary-color-rgb), 0.36));
}

.navbar-item, .navbar-link {
  color: var(--my-text-light-color, #ccc);
  font-weight: 500;
  transition: color 0.15s, background-color 0.17s;
  &:hover, &:focus, &.is-active {
    background-color: rgba(var(--my-primary-color-rgb), 0.12) !important;
    color: var(--my-primary-color, hsl(171, 100%, 41%)) !important;
    border-radius: 4px;
  }
}
:deep(.router-link-active.navbar-item) {
  color: var(--my-primary-color, hsl(171, 100%, 41%)) !important;
  padding-bottom: calc(0.75rem - 2px);
}

.navbar-burger {
  color: var(--my-text-light-color, #ccc);
  span {
    background-color: var(--my-text-light-color, #ccc);
    height: 2px;
    transition: background-color 0.18s;
  }
  &:hover {
    background-color: rgba(var(--my-primary-color-rgb), 0.10);
  }
  &.is-active span:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
    transition: transform 0.22s;
  }
  &.is-active span:nth-child(2) {
    opacity: 0;
    transition: opacity 0.14s;
  }
  &.is-active span:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
    transition: transform 0.22s;
  }
}

.site-title {
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  will-change: filter, transform, text-shadow;
}
.animated-title {
  color: var(--my-primary-color, hsl(171, 100%, 41%));
  animation: throbAndGlow 2.7s infinite cubic-bezier(.4,0,.6,1);
  filter: drop-shadow(0 0 4px var(--my-primary-color, hsl(171, 100%, 41%)));
  will-change: filter, transform, text-shadow;
}
.animated-title .title-後半 {
  color: #fff;
}

@keyframes throbAndGlow {
  0%, 100% {
    transform: scale(1);
    text-shadow:
      0 0 2px rgba(255,255,255,0.18),
      0 0 6px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 13px rgba(var(--my-primary-color-rgb), 0.5);
  }
  50% {
    transform: scale(1.03);
    text-shadow:
      0 0 4px rgba(255,255,255,0.28),
      0 0 13px var(--my-primary-color, hsl(171, 100%, 41%)),
      0 0 22px rgba(var(--my-primary-color-rgb), 0.64);
  }
}

@media (max-width: 600px) {
  .site-title { font-size: 1.12rem; }
  .site-logo { margin-right: 0.39rem; }
  .navbar-menu {
    backdrop-filter: blur(6px);
    background: var(--my-glass-bg, rgba(30,35,45,0.95));
  }
}
</style>
