import axios from 'axios';

// 环境变量
const baseURL = import.meta.env.VITE_API_BASE_URL; // Worker域名
const apiPassword = import.meta.env.VITE_API_PASSWORD;

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

// 请求拦截器：自动添加 X-API-Password 头
apiClient.interceptors.request.use(config => {
  if (apiPassword) {
    config.headers['X-API-Password'] = apiPassword;
  }
  return config;
}, error => Promise.reject(error));

export default {
  /**
   * 聚合/主站/自定义源 搜索
   * @param {string} query 搜索词
   * @param {string} source 资源源（如 heimuer, aggregated, custom...）
   * @param {string} customApiUrl 自定义源URL（仅 source=custom 时用）
   */
  searchVideos(query, source = 'heimuer', customApiUrl = '') {
    let params = { wd: query };
    if (source) params.source = source;
    if (source === 'custom' && customApiUrl) {
      params.customApi = customApiUrl; // 支持多个逗号分隔
    }
    return apiClient.get('/api/search', { params });
  },

  /**
   * 获取详情
   * @param {string} id 影片ID
   * @param {string} source 资源源
   * @param {string} customApiBaseUrl 自定义API基地址
   * @param {string} customDetailScrapeUrl 额外的自定义解析页URL
   */
  getVideoDetails(id, source = 'heimuer', customApiBaseUrl = '', customDetailScrapeUrl = '') {
    if (source === 'spider') {
    // spider 源不应请求后端
    return Promise.resolve({ data: {} });
  }
    let params = { id, source };
    if (source === 'custom') {
      if (customDetailScrapeUrl) {
        params.customDetail = customDetailScrapeUrl;
      } else if (customApiBaseUrl) {
        params.customApi = customApiBaseUrl;
      }
    }
    return apiClient.get('/api/detail', { params });
  },

  /**
   * 获取豆瓣热门电影（如果你是通过 worker 代理豆瓣API，需补充 API 路径和参数）
   */
  async getDoubanHotJson(start = 0) {
    const doubanJsonUrl = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?start=${start}&limit=20&category=%E7%83%AD%E9%97%A8&type=%E5%85%A8%E9%83%A8`;
    const proxyUrl = import.meta.env.VITE_PROXY_URL;
    const proxyKey = localStorage.getItem('proxy_token');
    //const proxyKey = import.meta.env.VITE_PROXY_KEY;
    const proxyUA = import.meta.env.VITE_PROXY_UA;
    const proxyReferer = import.meta.env.VITE_PROXY_REFERER;

    // 组装 vercel 代理请求
    const url = new URL(proxyUrl);
    url.searchParams.set('url', doubanJsonUrl);
    if (proxyKey) url.searchParams.set('token', proxyKey);
    if (proxyUA) url.searchParams.set('ua', proxyUA);
    if (proxyReferer) url.searchParams.set('referer', proxyReferer);

    console.log(`[API] Fetching Douban JSON via Vercel proxy, start=${start}...`);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Proxy fetch failed: ${response.status}`);

    // 返回 JSON
    const json = await response.json();
    if (!json || !json.items) throw new Error('Douban response invalid or missing items!');
    return json;
  },
};
