import axios from "axios";

// ========== 路径工具 ==========
const resolve = (from, to) => {
  const resolvedUrl = new URL(to, new URL(from, "resolve://"));
  if (resolvedUrl.protocol === "resolve:") {
    const { pathname, search, hash } = resolvedUrl;
    return pathname + search + hash;
  }
  return resolvedUrl.href;
};

const urljoin = (fromPath, nowPath) => {
  fromPath = fromPath || "";
  nowPath = nowPath || "";
  return resolve(fromPath, nowPath);
};

// ========== Hls.js 配置 ==========
export function getHlsConfig(opt = {}) {
  return {
    // 可自定义
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 60,
    ...opt,
  };
}

// ========== m3u8 智能去广告 ==========
function median(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function parseSlices(lines, m3u8_url) {
  const slices = [];
  let tags = [];
  let extinf = -1;
  let rawLines = [];
  lines.forEach((line) => {
    if (line.startsWith("#EXTINF:")) {
      extinf = parseFloat(line.match(/^#EXTINF:([\d.]+)/)?.[1] ?? "-1");
      tags.push(line);
      rawLines = [line];
    } else if (line.startsWith("#")) {
      tags.push(line);
      rawLines.push(line);
    } else if (line.trim().length > 0) {
      slices.push({
        extinf,
        url: urljoin(m3u8_url, line.trim()),
        tags: [...tags],
        rawLines: [...rawLines, line],
      });
      tags = [];
      extinf = -1;
      rawLines = [];
    }
  });
  return slices;
}

function detectAdSlices(slices, durationMedian) {
  const adSlices = new Set();
  let inAdRange = false;
  slices.forEach((slice) => {
    // tag判断广告区间
    if (
      slice.tags.some((tag) =>
        /EXT-X-DATERANGE.*CLASS="?ad"?/i.test(tag) ||
        /SCTE35-OUT/i.test(tag) ||
        /EXT-AD-START/i.test(tag)
      )
    ) {
      inAdRange = true;
    }
    if (
      slice.tags.some((tag) =>
        /SCTE35-IN/i.test(tag) ||
        /EXT-AD-END/i.test(tag)
      )
    ) {
      inAdRange = false;
    }
    // 短片段广告判断
    if (slice.extinf > 0 && durationMedian > 0 && slice.extinf < durationMedian * 0.55) {
      adSlices.add(slice.url);
    }
    // tag区间内视为广告
    if (inAdRange) {
      adSlices.add(slice.url);
    }
  });
  return adSlices;
}

// 主函数
export async function fixAdM3u8Ai(m3u8_url, headers = null, depth = 0) {
  if (depth > 3) return ""; // 嵌套过深保护
  let m3u8;
  try {
    const option = headers ? { headers } : {};
    const res = await axios.get(m3u8_url, option);
    m3u8 = res.data;
  } catch (e) {
    // 失败兜底返回原始地址
    return "";
  }
  const lines = m3u8
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 检查是否嵌套m3u8，递归处理
  const m3u8Lines = lines.filter((l) => !l.startsWith("#"));
  const lastUrl = m3u8Lines.slice(-1)[0] || "";
  if (
    depth < 3 &&
    lastUrl &&
    /\.m3u8(\?|$)/i.test(lastUrl) &&
    lastUrl !== m3u8_url
  ) {
    const abs = urljoin(m3u8_url, lastUrl);
    return await fixAdM3u8Ai(abs, headers, depth + 1);
  }

  // 解析所有切片
  const slices = parseSlices(lines, m3u8_url);
  const durations = slices.map((s) => s.extinf).filter((d) => d > 0);
  const durationMedian = median(durations);

  // 找广告
  const adSliceUrls = detectAdSlices(slices, durationMedian);

  // 拼接m3u8
  let outputLines = [];
  let lastWasAd = false;
  for (let i = 0; i < slices.length; i++) {
    if (adSliceUrls.has(slices[i].url)) {
      lastWasAd = true;
      continue;
    } else {
      // 正片和广告间插入DISCONTINUITY提升容错
      if (lastWasAd) {
        outputLines.push("#EXT-X-DISCONTINUITY");
      }
      lastWasAd = false;
      outputLines = outputLines.concat(slices[i].rawLines);
    }
  }
  // 保留m3u8首部非切片配置
  const head = lines.filter((l) => l.startsWith("#") && !l.startsWith("#EXTINF"));
  const result = head.concat(outputLines).join("\n");
  return result;
}

// ========== 判断ts片段是否为广告 ==========
export function isAdFragmentTs(url) {
  // 可以结合实际广告切片命名规律、host、目录、特征tag等增强
  return /\/(ad|adv|advert|ads)[^/]*\//i.test(url) || /(\b|_|-)(ad|adv)(\b|_|-)/i.test(url);
}