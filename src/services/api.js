import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000, // Adjust as needed
});

// Add a request interceptor to include the API password if set
apiClient.interceptors.request.use(config => {
  const apiPassword = import.meta.env.VITE_API_PASSWORD;
  if (apiPassword) {
    config.headers['X-API-Password'] = apiPassword;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

export default {
  searchVideos(query, source = 'heimuer', customApiUrl = '') {
    let params = { wd: query };
    if (source) {
        params.source = source;
    }
    if (source === 'custom' && customApiUrl) {
        params.customApi = customApiUrl;
    }
    return apiClient.get('/api/search', { params });
  },

  getVideoDetails(id, source = 'heimuer', customApiBaseUrl = '', customDetailScrapeUrl = '') {
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

  async getDoubanHotJson(start = 0) {
    const doubanJsonUrl = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?start=${start}&limit=20&category=%E7%83%AD%E9%97%A8&type=%E5%85%A8%E9%83%A8`;
    const proxyUrl = import.meta.env.VITE_PROXY_URL;
    const proxyKey = import.meta.env.VITE_PROXY_KEY;
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
