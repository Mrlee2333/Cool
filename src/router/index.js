// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import DetailView from '../views/DetailView.vue';
import PlayerView from '../views/PlayerView.vue'; // Import PlayerView
import NotFoundView from '../views/NotFoundView.vue';
import SearchView from '../views/SearchView.vue';
import HistoryView from '../views/HistoryView.vue';
import MoreDouban from '../views/MoreDoubanView.vue';
import UnlockView from '../views/UnlockView.vue';

const routes = [
  //  { path: '/test', name: 'SwiperTest', component: SwiperTest },
  {
    path: '/unlock',
    name: 'Unlock',
    component: UnlockView,
  },
  {
    path: '/',
    name: 'Home',
    component: HomeView,
  },
  {
    path: '/detail/:source/:id',
    name: 'Detail',
    component: DetailView,
    props: true,
  },
  {
    path: '/search',
    name: 'Search',
    component: SearchView,
  },
  {
  path: '/douban/more',
  name: 'MoreDouban',
  component: MoreDouban,
},
  {
    path: '/history',
    name: 'History',
    component: HistoryView,
  },
  {
    path: '/detail/custom/:id',
    name: 'CustomDetail',
    component: DetailView,
    props: (route) => ({
        id: route.params.id,
        source: 'custom',
        customApi: route.query.customApi,
        customDetail: route.query.customDetail
    })
  },
  { // New Player Route
    path: '/play/:source/:videoId/:episodeIndex',
    name: 'Player',
    component: PlayerView,
    props: true, // videoId, source, episodeIndex passed as props
                 // title, customApi, customDetail passed via query in DetailView
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundView,
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  }
});

// 路由守卫：加密解锁逻辑
router.beforeEach((to, from, next) => {
  const unlocked = localStorage.getItem('unlocked_v2') === 'yes';
  // 只允许访问 /unlock 或已经解锁的页面
  if (!unlocked && to.name !== 'Unlock') {
    next({
      name: 'Unlock',
      query: { redirect: to.fullPath }
    });
  } else if (unlocked && to.name === 'Unlock') {
    // 已解锁再次访问解锁页，跳回首页或目标页
    next({ path: to.query.redirect || '/' });
  } else {
    next();
  }
});

export default router;

