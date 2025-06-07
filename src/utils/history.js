// localStorage 中存储记录所用的键名
const HISTORY_KEY = 'movie_watch_history_simple';

/**
 * 从 localStorage 读取并解析播放记录
 * @returns {Array}
 */
function getHistoryArray() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
        return [];
    }
}

/**
 * 将播放记录数组保存到 localStorage
 * @param {Array} historyArray 
 */
function saveHistoryArray(historyArray) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyArray));
    } catch(e) {
        console.error("保存播放记录失败:", e);
    }
}

/**
 * 导出的工具对象
 */
export const historyManager = {
    /**
     * 获取按最近观看时间排序的所有历史记录
     * @returns {Array}
     */
    getSortedHistory() {
        const history = getHistoryArray();
       // console.log('[DEBUG] getSortedHistory', history);
	return history.sort((a, b) => b.lastWatchedTimestamp - a.lastWatchedTimestamp);
    },

    /**
     * 获取单个视频的播放进度信息
     * @param {string} videoId 
     * @param {string} source 
     * @returns {object | null}
     */
    getProgress(videoId, source) {
        const id = `${source}_${videoId}`;
        const history = getHistoryArray();
        return history.find(item => item.id === id) || null;
    },

    /**
     * 更新或添加一条播放记录
     * @param {object} videoData - 包含所有视频信息的对象
     */
    updateProgress(videoData) {
        let history = getHistoryArray();
        const id = `${videoData.source}_${videoData.videoId}`;
        const now = Date.now();
        const existingIndex = history.findIndex(item => item.id === id);

        const entry = {
            id,
            videoId: videoData.videoId,
            source: videoData.source,
            vod_name: videoData.vod_name,
            vod_pic: videoData.vod_pic,
            episodeIndex: videoData.episodeIndex,
            currentTime: videoData.currentTime,
            duration: videoData.duration,
            lastWatchedTimestamp: now
        };
        
        if (existingIndex > -1) {
            // 更新现有记录
            history[existingIndex] = entry;
        } else {
            // 添加新记录
            history.unshift(entry);
        }

        // 为了防止记录无限增长，可以只保留最近的 N 条记录，例如100条
        if (history.length > 100) {
            history = history.slice(0, 100);
        }
       // console.log('[DEBUG] updateProgress to localStorage:', entry);
        saveHistoryArray(history);
    },

    /**
     * 删除单条记录
     * @param {string} id - 'source_videoId' 格式的ID
     */
    removeEntry(id) {
        let history = getHistoryArray();
        history = history.filter(item => item.id !== id);
        saveHistoryArray(history);
    },

    /**
     * 清空所有记录
     */
    clearAll() {
        saveHistoryArray([]);
    }
};

