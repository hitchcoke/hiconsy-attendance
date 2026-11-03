import { createRouter, createWebHashHistory } from 'vue-router';
import Calendar from './pages/Calendar.vue';
import Approvals from './pages/Approvals.vue';
import Team from './pages/Team.vue';
import History from './pages/History.vue';
import Requests from './pages/Requests.vue';
import Today from './pages/Today.vue';
import Login from './pages/Login.vue';
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', component: Login },
    { path: '/', redirect: '/today' },
    { path: '/today', component: Today, meta: { title: '오늘' } },
    { path: '/calendar', component: Calendar, meta: { title: '캘린더' } },
    { path: '/requests', component: Requests, meta: { title: '신청' } },
    { path: '/history', component: History, meta: { title: '내 근태' } },
    { path: '/approvals', component: Approvals, meta: { title: '휴가 승인', lead: true } },
    { path: '/team', component: Team, meta: { title: '팀 현황', lead: true } },
  ],
});
