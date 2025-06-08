<template>
  <div id="app-container">
    <Navbar />
    <main class="container is-fluid py-5 px-4">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <footer class="cool-footer glass-footer">
      <div class="footer-content">
        <p>
          <strong>Cool Movie Site</strong>
          <span class="divider">|</span>
          <span class="sub">BY ARKSEC.NET</span>
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import Navbar from './components/Navbar.vue';
</script>

<style lang="scss">
#app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bulma-body-background-color, hsl(0, 0%, 10%)); // Use Bulma variable or fallback
}

// 保证 main 区域自适应
main.container {
  flex: 1 0 auto;
}

.cool-footer.glass-footer {
  // 只保留背景、圆角、毛玻璃等，不加定位
  width: 100vw;
  margin-left: calc(-1 * (100vw - 100%) / 2);
  background: linear-gradient(
    120deg,
    rgba(57, 70, 120, 0.48) 0%,
    rgba(62, 97, 140, 0.42) 60%,
    rgba(45, 49, 80, 0.55) 100%
  );
  background-size: 200% 200%;
  animation: huawei-gradient-move 9s ease-in-out infinite;
  box-shadow: 0 8px 32px 0 rgba(20,40,100,0.18);
  border-top-left-radius: 30px;
  border-top-right-radius: 30px;
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  padding: 1.8rem 0.5rem 1.3rem 0.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 78px;
  border-top: 1px solid rgba(255,255,255,0.16);
  position: static; // 确保不是 fixed
  overflow: hidden;


}
// Footer内容排版和自定义颜色
.footer-content {
  width: 100%;
  text-align: center;
  color: #f6f8fa;
  font-size: 1.06em;
  font-weight: 500;
  letter-spacing: 0.02em;
  .divider {
    margin: 0 0.6em;
    color: #23ade5;
    opacity: 0.9;
    font-size: 1.1em;
  }
  .sub {
    font-size: 0.99em;
    font-weight: 400;
    color: #e5f3fb;
    opacity: 0.86;
  }
}

.footer { // 用于覆盖 Bulma 的默认样式
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s cubic-bezier(.7,1.7,.4,1.1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
