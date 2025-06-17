<template>
  <div class="spider-page container py-6">
    <h1 class="spider-title">🕷️ 前端爬虫采集工具</h1>

    <!-- 工具栏 -->
    <div class="spider-toolbox">
      <button class="button is-info is-light" @click="exportRules">
        <i class="fas fa-download mr-1"></i> 导出规则
      </button>
      <button class="button is-success is-light" @click="showImport = true">
        <i class="fas fa-upload mr-1"></i> 导入规则
      </button>
      <input v-if="showImport" class="input import-area" v-model="importText" placeholder="粘贴加密规则数据" />
      <div v-if="showImport" class="mt-2">
        <button class="button is-primary is-small mr-2" @click="importRules">导入</button>
        <button class="button is-light is-small" @click="showImport = false">取消</button>
      </div>
      <div v-if="importMsg" class="notification is-info is-light mt-2">{{ importMsg }}</div>
    </div>

    <!-- 规则管理区 -->
    <div class="spider-card box mb-5 rule-manager-bar">
      <div class="columns is-mobile is-multiline is-vcentered rule-toolbar">
        <div class="column is-narrow" style="min-width:120px;">
          <input class="input spider-input" v-model="newRuleName" placeholder="规则名称" style="min-width:110px;display:inline-block;margin-right:7px;" />
        </div>
        <div class="column is-narrow">
          <button class="button is-primary is-small" @click="saveCurrentRule">
            <i class="fas fa-save"></i> 保存规则
          </button>
        </div>
        <div class="column">
          <span v-if="allRules.length" class="rule-list-bar">
            <span class="mr-2 rule-label">快速切换：</span>
            <span v-for="(r, idx) in allRules" :key="r.name" class="rule-chip-group">
              <button
                class="button rule-chip"
                :class="{selected: rulesMatch(r.rules, r.url)}"
                @click="loadRule(r)">
                <i class="fas fa-code"></i> {{ r.name }}
              </button>
              <button class="button rule-chip rule-chip-edit" title="编辑" @click="editRule(r)">
                <i class="fas fa-pen"></i>
              </button>
              <button class="button rule-chip rule-chip-del" title="删除" @click="deleteRule(r.name)">
                <i class="fas fa-trash"></i>
              </button>
            </span>
          </span>
        </div>
      </div>
      <!-- 编辑弹窗 -->
      <div v-if="editIdx !== null" class="notification is-glass-card edit-panel">
        <div class="mb-2"><b>编辑规则：</b> {{ allRules[editIdx]?.name }}</div>
        <input class="input spider-input mb-2" v-model="editRuleName" placeholder="规则名称" />
        <input class="input spider-input mb-2" v-model="editRuleUrl" placeholder="目标页面URL" />
        <div class="columns is-multiline">
          <div class="column is-half" v-for="key in Object.keys(rules)" :key="key">
            <label style="color:#66e6fc;">{{ key }}</label>
            <input class="input spider-input" v-model="editRuleFields[key]" />
          </div>
        </div>
        <button class="button is-success is-small mr-2" @click="doEditRule"><i class="fas fa-check"></i> 保存修改</button>
        <button class="button is-light is-small" @click="cancelEdit"><i class="fas fa-times"></i> 取消</button>
      </div>
    </div>

    <!-- 规则输入区 -->
    <div class="spider-card box mb-5">
      <div class="field mb-2">
        <label>列表(list)</label>
        <input class="input spider-input" v-model="rules.list" placeholder="//ul[@id='list']/li" />
      </div>
      <div class="field mb-2">
        <label>标题(title)</label>
        <input class="input spider-input" v-model="rules.title" placeholder="./a/text()" />
      </div>
      <div class="field mb-2">
        <label>封面(cover)</label>
        <input class="input spider-input" v-model="rules.cover" placeholder="./img/@src" />
      </div>
      <div class="field mb-2">
        <label>详情地址(detailUrl)</label>
        <input class="input spider-input" v-model="rules.detailUrl" placeholder="./a/@href" />
      </div>
      <div class="field mb-2">
        <label>下一页(nextUrl)</label>
	<input class="input spider-input" v-model="rules.nextUrl" placeholder="https://test.com/ok/?page=${num}" />
      </div>
      <div class="field mt-4">
        <label>目标页面URL</label>
        <input class="input spider-input" v-model="url" placeholder="https://example.com/list" />
      </div>
      <button class="button is-primary mt-2" @click="fetchHtmlAndParse" :disabled="loading">
        {{ loading ? "采集中..." : "采集" }}
      </button>
    </div>

    <div v-if="err" class="notification is-danger mb-2">{{ err }}</div>
    <div v-if="logList.length" class="notification is-warning mb-2">
      <ul><li v-for="(log, idx) in logList" :key="idx">{{ log }}</li></ul>
    </div>

    <div v-if="movies.length" class="mt-5">
      <h2 class="subtitle">采集结果 (仅展示前5条):</h2>
      <ul>
        <li v-for="(m, idx) in movies.slice(0,5)" :key="idx">
          <span>标题: {{ m.title || emptyTip }}</span> |
          <span>封面: {{ m.cover ? m.cover : emptyTip }}</span> |
          <span>详情页: <a v-if="m.detailUrl" :href="m.detailUrl" target="_blank">{{ m.detailUrl }}</a>
            <span v-else>{{ emptyTip }}</span>
          </span>
        </li>
      </ul>
      <div v-if="nextUrl" class="mt-2">下一页地址: {{ nextUrl }}</div>
      <button class="button is-link mt-3" @click="toResultView">查看全部结果</button>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import CryptoJS from 'crypto-js'

const url = ref('')
const loading = ref(false)
const err = ref('')
const logList = ref([])
const movies = ref([])
const nextUrl = ref('')
const router = useRouter()
const emptyTip = '为空，请检查XPath语法或网站不支持vercel代理'
const pageNum = ref(1)

const LS_KEY = 'spider_rule_list_v2'
const AES_KEY = 'SPIDER_RULE_SECRET' // 强烈建议放到.env

const rules = reactive({
  list: '',
  title: '',
  cover: '',
  detailUrl: '',
  nextUrl: ''
})
const allRules = ref([])
const newRuleName = ref('')
const editIdx = ref(null)
const editRuleFields = reactive({ list: '', title: '', cover: '', detailUrl: '', nextUrl: '' })
const editRuleName = ref('')
const editRuleUrl = ref('')

function loadAllRules() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    allRules.value = Array.isArray(arr) ? arr : []
  } catch { allRules.value = [] }
}
function saveCurrentRule() {
  if (!newRuleName.value.trim()) return alert('请填写规则名称')
  const newObj = {
    name: newRuleName.value.trim(),
    rules: { ...rules },
    url: url.value || ''
  }
  const idx = allRules.value.findIndex(r => r.name === newObj.name)
  if (idx >= 0) allRules.value[idx] = newObj
  else allRules.value.push(newObj)
  localStorage.setItem(LS_KEY, JSON.stringify(allRules.value))
  newRuleName.value = ''
}
function loadRule(ruleObj) {
  Object.keys(rules).forEach(k => { rules[k] = ruleObj.rules[k] || '' })
  url.value = ruleObj.url || ''
}
function deleteRule(name) {
  const idx = allRules.value.findIndex(r => r.name === name)
  if (idx >= 0) {
    allRules.value.splice(idx, 1)
    localStorage.setItem(LS_KEY, JSON.stringify(allRules.value))
  }
  if (editIdx.value === idx) cancelEdit()
}
function editRule(ruleObj) {
  const idx = allRules.value.findIndex(r => r.name === ruleObj.name)
  if (idx === -1) return
  editIdx.value = idx
  editRuleName.value = ruleObj.name
  editRuleUrl.value = ruleObj.url || ''
  Object.keys(editRuleFields).forEach(k => editRuleFields[k] = ruleObj.rules[k] || '')
}
function cancelEdit() {
  editIdx.value = null
  editRuleName.value = ''
  editRuleUrl.value = ''
  Object.keys(editRuleFields).forEach(k => editRuleFields[k] = '')
}
function doEditRule() {
  if (editIdx.value === null) return
  allRules.value[editIdx.value] = {
    name: editRuleName.value,
    rules: { ...editRuleFields },
    url: editRuleUrl.value || ''
  }
  localStorage.setItem(LS_KEY, JSON.stringify(allRules.value))
  cancelEdit()
}
function rulesMatch(otherRules, otherUrl) {
  return Object.keys(rules).every(k => rules[k] === (otherRules[k] || '')) && url.value === (otherUrl || '')
}
loadAllRules()

function fixUrl(href, baseUrl) {
  try {
    if (!href) return ''
    return new URL(href, baseUrl).href
  } catch {
    return href
  }
}

function makePagedUrl(template, num) {
  if (!template) return ''
  return template.includes('${num}')
    ? template.replace(/\$\{num\}/g, num)
    : template
}
function isUsePagedTemplate(str) {
  return str && str.includes('${num}')
}

async function fetchHtmlViaProxy(targetUrl) {
  const proxyUrl = import.meta.env.VITE_PROXY_URL
  const proxyKey = localStorage.getItem('proxy_token')
  const proxyUA = import.meta.env.VITE_PROXY_UA
  const urlObj = new URL(proxyUrl)
  urlObj.searchParams.set('url', targetUrl)
  if (proxyKey) urlObj.searchParams.set('token', proxyKey)
  if (proxyUA) urlObj.searchParams.set('ua', proxyUA)
  urlObj.searchParams.set('referer', targetUrl)
  const response = await fetch(urlObj.toString())
  if (!response.ok) throw new Error(`Proxy fetch failed: ${response.status}`)
  return await response.text()
}

async function fetchHtmlAndParse(resetPage = true) {
  err.value = ''
  logList.value = []
  movies.value = []
  nextUrl.value = ''
  if (!url.value) { err.value = '请填写URL'; return }
  if (resetPage) pageNum.value = 1

  loading.value = true
  try {
    const currentUrl = isUsePagedTemplate(url.value)
      ? makePagedUrl(url.value, pageNum.value)
      : url.value

    const html = await fetchHtmlViaProxy(currentUrl)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const listNodes = doc.evaluate(rules.list, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
    const arr = []
    for (let i = 0; i < listNodes.snapshotLength; i++) {
      const node = listNodes.snapshotItem(i)
      let title = '', cover = '', detailUrl = ''
      try {
        title = doc.evaluate(rules.title, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
      } catch {}
      try {
        cover = doc.evaluate(rules.cover, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
        if (cover) cover = fixUrl(cover, currentUrl)
      } catch {}
      try {
        detailUrl = doc.evaluate(rules.detailUrl, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
        if (detailUrl) detailUrl = fixUrl(detailUrl, currentUrl)
      } catch {}
      arr.push({
        title: title || '',
        cover: cover || '',
        detailUrl: detailUrl || ''
      })
    }
    let next = ''
    if (rules.nextUrl) {
      if (isUsePagedTemplate(rules.nextUrl)) {
        pageNum.value += 1
        next = makePagedUrl(rules.nextUrl, pageNum.value)
      } else {
        try {
          next = doc.evaluate(rules.nextUrl, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim()
          if (next) next = fixUrl(next, currentUrl)
        } catch {}
      }
    }
    movies.value = arr
    nextUrl.value = next
    // 重要：把pageNum也一并存入localStorage，方便ResultView.vue读取
    localStorage.setItem('spider_movies', JSON.stringify({ movies: arr, nextUrl: next, pageNum: pageNum.value, url: url.value, rules: { ...rules } }))
  } catch (e) {
    err.value = '采集失败: ' + e
  } finally {
    loading.value = false
  }
}

function toResultView() {
  router.push({ name: 'Result' })
}

// --- 导出/导入功能 ----
const showImport = ref(false)
const importText = ref('')
const importMsg = ref('')

function exportRules() {
  try {
    const data = JSON.stringify(allRules.value)
    const ciphertext = CryptoJS.AES.encrypt(data, AES_KEY).toString()
    navigator.clipboard.writeText(ciphertext)
      .then(() => { importMsg.value = '已复制加密规则到剪贴板！'; showImport.value = false })
      .catch(() => { importMsg.value = '复制失败，请手动复制内容！' })
  } catch (e) {
    importMsg.value = '加密或复制失败: ' + e
  }
}

function importRules() {
  if (!importText.value.trim()) {
    importMsg.value = '请粘贴规则文本'
    return
  }
  try {
    const bytes = CryptoJS.AES.decrypt(importText.value, AES_KEY)
    const jsonStr = bytes.toString(CryptoJS.enc.Utf8)
    const arr = JSON.parse(jsonStr)
    if (Array.isArray(arr)) {
      localStorage.setItem(LS_KEY, JSON.stringify(arr))
      allRules.value = arr
      importMsg.value = '规则导入成功！'
      showImport.value = false
      importText.value = ''
      setTimeout(() => { importMsg.value = '' }, 1800)
    } else {
      importMsg.value = '规则格式错误！'
    }
  } catch (e) {
    importMsg.value = '解密失败，请确认加密文本正确'
  }
}
</script>

<style scoped>
.spider-title {
  font-weight: 700;
  color: #38d9fa;
  text-shadow: 0 2px 12px #35b6fa44;
  font-size: 2em;
  margin-bottom: 1.1em;
  text-align: center;
  letter-spacing: .07em;
}

.spider-toolbox {
  display: flex;
  gap: 1.1em;
  margin-bottom: 1.2em;
  align-items: center;
  flex-wrap: wrap;
}
.import-area {
  margin-left: 8px;
  width: 240px;
  display: inline-block;
}
.edit-panel {
  background: #162743f2 !important;
  color: #e2f7ff;
  border-radius: 12px;
}

.spider-card.box {
  border-radius: 13px;
  box-shadow: 0 3px 18px #06142755;
  background: #232f3b;
  border: 1.5px solid #2c4d81;
  color: #d4edff;
  padding: 1.9em 1.5em 1.3em 1.5em;
}
.spider-input {
  background: #192130;
  border: 1.2px solid #295988;
  color: #e6faff;
  border-radius: 7px;
  transition: border .22s;
  font-size: 1.08em;
  font-weight: 500;
}
.spider-input::placeholder { color: #7bbfff88; opacity: 1; }
.spider-input:focus { border-color: #38d9fa; outline: none; background: #232f48; }
.rule-label { color: #82c8ff; font-weight: 400; font-size: 0.98em; }
.rule-chip-group { display: inline-flex; align-items: center; margin-right: 8px; }
.rule-chip { background: linear-gradient(95deg,#25468a,#163a62); color: #52dfff; border: none; border-radius: 13px; font-size: 0.97em; padding: 0.25em 0.8em 0.22em 0.8em; margin-right: 3px; transition: box-shadow .13s, background .14s, color .13s; font-weight: 500; }
.rule-chip.selected, .rule-chip:hover { background: linear-gradient(90deg,#26d9fa 18%,#1253a5 91%); color: #fff; box-shadow: 0 2px 14px #00e0ff33; }
.rule-chip-edit { background: #212e41; color: #ffd277; padding: 0.14em 0.48em; margin-right: 2px; }
.rule-chip-edit:hover { background: #ffd277; color: #27324a; }
.rule-chip-del { 
  background: #281a23; 
  color: #fd94a7; 
  padding: 0.15em 0.45em;
}
.rule-chip-del:hover { background: #fc6978; color: #fff; }

.notification {
  background: #1c2639;
  border-radius: 9px;
  color: #e6f8ff;
  font-size: 1.04em;
  margin-bottom: 0.7em;
  border-left: 4px solid #38d9fa;
  padding: 1em 1.2em;
}
.notification.is-danger {
  background: #2c1b23;
  color: #ff99a8;
  border-color: #fc6978;
}
.notification.is-warning {
  background: #24305a;
  color: #ffd995;
  border-color: #ffae19;
}

h1, .subtitle {
  color: #4be0f8;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-shadow: 0 2px 8px #1ab6ea25;
}
ul {
  color: #b3e7ff;
  font-size: 1.07em;
  letter-spacing: 0.01em;
}

.spider-card .field label {
  color: #84eaff;
  font-weight: 500;
}

.spider-card .input, .spider-card .spider-input {
  background: #13213a;
  border: 1.5px solid #294169;
  color: #c5f6ff;
  border-radius: 6px;
  font-size: 1.06em;
}

.button.is-primary {
  background: linear-gradient(90deg, #26d9fa 60%, #1458d1 100%);
  border: none;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 9px #27b5f644;
  border-radius: 7px;
}
.button.is-primary:active,
.button.is-primary:focus {
  box-shadow: 0 1px 5px #17c9e233;
  background: #1987c9;
}
.button.is-link {
  background: linear-gradient(90deg, #5ad1ff 70%, #225299 100%);
  color: #fff;
  border-radius: 6px;
  font-weight: 500;
  box-shadow: 0 2px 8px #00e2ff33;
}
.button.is-link:hover { background: #1987c9; color: #fff; }

@media (max-width: 900px) {
  .spider-card.box { padding: 1.1em 0.7em; }
  .spider-page { padding: 0.7em 0.1em 2em 0.1em; }
}

@media (max-width: 600px) {
  .spider-card.box { font-size: 0.97em; }
  .spider-title { font-size: 1.22em; }
  .spider-input, .input { font-size: 0.97em; }
}

.mt-2 { margin-top: 0.8em; }
.mt-3 { margin-top: 1.5em; }
.mb-2 { margin-bottom: 0.8em; }
.mb-5 { margin-bottom: 2.2em; }
.py-6 { padding-top: 2.2em; padding-bottom: 2.2em; }
.py-5 { padding-top: 1.5em; padding-bottom: 1.5em; }

li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 0.5em;
  background: linear-gradient(90deg,#142244,#1e4155 90%);
  border-radius: 7px;
  box-shadow: 0 2px 8px #29f1fa0d;
  padding: 0.56em 0.9em;
}

li span, li a {
  max-width: 90vw;
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
li a {
  color: #4be0f8;
  text-decoration: underline;
  word-break: break-all;
  max-width: 46vw;
  transition: color .18s;
}
li a:hover { color: #fff; background: #162743; border-radius: 4px; }

@media (max-width: 600px) {
  li span, li a { max-width: 75vw; font-size: 0.96em; }
}
</style>

