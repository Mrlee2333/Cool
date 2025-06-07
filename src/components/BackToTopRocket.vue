<template>
  <transition name="rocket-fade">
    <button v-if="show" class="rocket-btn" @click="scrollToTop" aria-label="返回顶部">
      <span class="emoji">🚀</span>
    </button>
  </transition>
</template>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const show = ref(false)
const minScroll = 200
function onScroll() {
  show.value = window.scrollY > minScroll
}
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>
<style scoped>
.rocket-btn {
  position: fixed;
  right: 20px;
  bottom: 90px;
  z-index: 998;
  background: linear-gradient(135deg, #34e2fa 50%, #006fff 100%);
  border-radius: 50%;
  box-shadow: 0 8px 30px rgba(0,0,0,0.18), 0 0 0 6px rgba(0,176,255,0.06);
  border: none;
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; transition: transform .26s, opacity .22s;
  opacity: 0.93;
  animation: rocket-in .3s;
}
.rocket-btn:hover { transform: scale(1.08) rotate(-8deg); opacity: 1; }
.rocket-fade-enter-active, .rocket-fade-leave-active {
  transition: opacity .22s, transform .28s;
}
.rocket-fade-enter-from, .rocket-fade-leave-to {
  opacity: 0; transform: translateY(60px) scale(.7);
}
@media (min-width: 900px) {
  .rocket-btn { right: 20px; bottom: 90px; }
}
@media (max-width: 600px) {
  .rocket-btn { right: 20px; bottom: 90px; width: 44px; height: 44px; font-size: 1.55rem; }
}
@keyframes rocket-in { from { opacity: 0; transform: scale(.8) translateY(100px);} }
</style>
