// utils/spiderHelper.js
export async function fetchHtmlViaProxy(targetUrl) {
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

// 采集 movies、nextUrl
export async function fetchAndParseMovies(targetUrl, rules) {
  const html = await fetchHtmlViaProxy(targetUrl)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // 采集电影集合
  const listNodes = doc.evaluate(rules.list, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
  const arr = []
  for (let i = 0; i < listNodes.snapshotLength; i++) {
    const node = listNodes.snapshotItem(i)
    let title = '', cover = '', detailUrl = '', desc = ''
    try {
      title = doc.evaluate(rules.title, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
    } catch {}
    try {
      cover = doc.evaluate(rules.cover, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
    } catch {}
    try {
      detailUrl = doc.evaluate(rules.detailUrl, node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
    } catch {}
    try {
      desc = doc.evaluate(rules.desc || '', node, null, XPathResult.STRING_TYPE, null).stringValue.trim()
    } catch {}
    arr.push({ title, cover, detailUrl, desc })
  }
  let next = ''
  if (rules.nextUrl) {
    try {
      next = doc.evaluate(rules.nextUrl, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim()
    } catch {}
  }
  return { movies: arr, nextUrl: next }
}
