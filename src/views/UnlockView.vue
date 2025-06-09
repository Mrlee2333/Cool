<template>
  <div class="unlock-huawei-bg">
    <div class="unlock-huawei-card">
      <h2 class="unlock-title">🔒 访问加密</h2>
      <form @submit.prevent="handleUnlock" autocomplete="off">
        <div class="field">
          <div class="control has-icons-left">
            <input
              class="input unlock-input"
              type="password"
              v-model="password"
              placeholder="请输入访问密码"
              :class="{ 'is-danger': error }"
              autocomplete="new-password"
              autofocus
              :disabled="locked"
              maxlength="48"
              @input="sanitizeInput"
              @paste.prevent
            />
            <span class="icon is-left"><i class="fas fa-key"></i></span>
          </div>
          <transition name="fade">
            <p v-if="locked" class="help is-danger unlock-err-tip">多次输错，已封禁，请稍后再试</p>
            <p v-else-if="error" class="help is-danger unlock-err-tip">{{ error }}</p>
          </transition>
        </div>
        <button
          class="button unlock-btn is-large is-fullwidth mt-2"
          :class="{ 'is-loading': loading }"
          :disabled="locked"
          type="submit"
        >
          <span>解锁</span>
        </button>
      </form>
      <p class="unlock-tips">
        本站需授权访问。<br>
        <span class="unlock-tip-sub">密码有效期一周，输错 10 次后封禁 30 分钟</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const API_AUTH = import.meta.env.VITE_API_URL + '/api/proxy/auth'

const password = ref('')
const error = ref('')
const loading = ref(false)
const locked = ref(false)

// 只允许安全字符，防止多字节爆破和特殊字符攻击
const sanitizeInput = () => {
  password.value = password.value.replace(/[<>"'`\\\s]/g, '').slice(0, 48)
}

onMounted(() => {
  const exp = Number(localStorage.getItem('proxy_token_exp') || '0')
  const token = localStorage.getItem('proxy_token')
  if (token && Date.now() < exp) {
    const redirect = route.query.redirect || '/'
    router.replace(redirect)
  }
})

async function handleUnlock() {
  error.value = ''
  loading.value = true
  locked.value = false

  // 前端安全校验
  if (!password.value) {
    error.value = '密码不能为空'
    loading.value = false
    return
  }
  if (password.value.length < 4) {
    error.value = '密码过短'
    loading.value = false
    return
  }
  // 阻止特殊符号和超长密码
  if (/[<>"'`\\\s]/.test(password.value)) {
    error.value = '密码不能含特殊字符'
    loading.value = false
    password.value = ''
    return
  }
  if (password.value.length > 48) {
    error.value = '密码过长'
    loading.value = false
    password.value = ''
    return
  }

  try {
    const resp = await axios.post(API_AUTH, { password: password.value })
    const { token, expires } = resp.data
    localStorage.setItem('proxy_token', token)
    localStorage.setItem('proxy_token_exp', Date.now() + expires * 1000)
    const redirect = route.query.redirect || '/'
    router.replace(redirect).then(() => {
      window.location.reload()
    })
  } catch (err) {
    if (err.response?.status === 429) {
      locked.value = true
      error.value = err.response.data.error || '尝试次数过多，请稍后再试'
    } else if (err.response?.data?.error) {
      error.value = err.response.data.error
    } else if (err.code === 'ECONNABORTED') {
      error.value = '网络超时，请检查网络'
    } else if (err.message && err.message.includes('Network')) {
      error.value = '无法连接服务器'
    } else {
      error.value = '解锁失败，请重试'
    }
    password.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.unlock-huawei-bg {
  min-height: 100vh;
  width: 100vw;
  position: fixed;
  left: 0; top: 0;
  z-index: 100;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 华为极光流光渐变，科技蓝紫色 */
  background: linear-gradient(125deg, #6C63FF 0%, #48C6EF 51%, #36D1C4 100%);
  animation: gradientFlow 12s ease-in-out infinite;
  background-size: 180% 180%;
}

@keyframes gradientFlow {
  0% {background-position: 0% 50%;}
  50% {background-position: 100% 50%;}
  100% {background-position: 0% 50%;}
}

.unlock-huawei-card {
  position: relative;
  z-index: 3;
  max-width: 370px;
  width: 94vw;
  margin: 0 auto;
  background: rgba(32,36,58,0.92);
  border-radius: 19px;
  box-shadow: 0 12px 44px 2px rgba(44,80,188,0.16), 0 0px 2px #36d1c444;
  padding: 2.3rem 1.7rem 2.1rem 1.7rem;
  backdrop-filter: blur(22px) saturate(150%);
  border: 1.5px solid rgba(75,168,255,0.18);
  animation: fadeInUp .85s cubic-bezier(.18,.8,.45,1.25);
  transition: box-shadow 0.22s;
}
@media (max-width: 520px) {
  .unlock-huawei-card { padding: 1.15rem 0.77rem 1.15rem 0.77rem; }
  .unlock-title { font-size: 1.33rem; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(48px) scale(.98);}
  to { opacity: 1; transform: none;}
}
.unlock-title {
  color: #f2f6fa;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 1.3rem;
  text-align: center;
}
.unlock-input {
  font-size: 1.16rem;
  border-radius: 9px;
  padding-left: 2.6em !important;
  box-shadow: 0 0 0 1.1px #45aee1a8, 0 2px 12px #69aefc0e;
  background: rgba(33,43,66,0.89);
  color: #e7f3ff;
  border: 1.1px solid #61c2f844;
  transition: box-shadow .2s,border-color .19s;
}
.unlock-input:focus {
  border-color: #38e1ffb7;
  box-shadow: 0 0 0 2.2px #23ade57c;
  background: #253d67ee;
}
.unlock-err-tip {
  margin-top: 2px;
  font-size: 0.97em;
  letter-spacing: 0.5px;
}
.unlock-btn {
  font-size: 1.15rem;
  font-weight: 600;
  border-radius: 10px;
  background: linear-gradient(93deg, #6C63FF 24%, #48C6EF 100%);
  box-shadow: 0 4px 16px #4d60f933, 0 1px 2px #36b2e12a;
  transition: background .22s,box-shadow .19s;
  margin-top: 0.7em;
}
.unlock-btn:active { background: #4b8fe2; }

.unlock-tips {
  text-align: center;
  color: #d2ecffa6;
  margin-top: 1.7rem;
  font-size: 0.98em;
  letter-spacing: 0.5px;
}
.unlock-tip-sub {
  font-size: 0.88em;
  color: #b2e7ff;
  margin-top: 0.5em;
  display: block;
}
@media (max-width: 500px) {
  .unlock-huawei-card { max-width: 98vw; }
  .unlock-tips { font-size: 0.97em; }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.33s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>




