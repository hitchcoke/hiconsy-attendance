<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { House, Calendar, Document, User, SwitchButton, Refresh } from '@element-plus/icons-vue';
import DemoPanel from './components/DemoPanel.vue';
import { ElMessage } from 'element-plus';
import { useSession } from './store';
const session = useSession(),
  route = useRoute(),
  router = useRouter(),
  restoreError = ref(''),
  refreshKey = ref(0);
const menu = computed(() => [
  { path: '/today', label: '오늘', icon: House },
  { path: '/requests', label: '신청', icon: Calendar },
  { path: '/history', label: '내 근태', icon: Document },
  ...(session.user?.role === 'LEAD'
    ? [
        { path: '/approvals', label: '휴가 승인', icon: Document },
        { path: '/team', label: '팀 현황', icon: User },
      ]
    : []),
]);
async function restore() {
  restoreError.value = '';
  try {
    await session.restore();
    if (!session.user) router.replace('/login');
  } catch (e) {
    restoreError.value = (e as Error).message;
  }
}
async function logout() {
  try {
    await session.logout();
  } catch {
    ElMessage.info('이 기기에서 로그아웃했습니다. 서버 연결은 확인해 주세요.');
  } finally {
    router.replace('/login');
  }
}
window.addEventListener('auth-expired', () => {
  session.clear();
  router.replace('/login');
});
watch(
  () => [route.path, session.user],
  () => {
    if (!session.ready) return;
    if (!session.user && route.path !== '/login') router.replace('/login');
    else if (session.user && route.path === '/login') router.replace('/today');
    else if (route.meta.lead && session.user?.role !== 'LEAD') router.replace('/today');
  },
);
onMounted(restore);
</script>
<template>
  <div v-if="restoreError" class="connection-state">
    <h2>연결을 확인해 주세요</h2>
    <p>{{ restoreError }}</p>
    <el-button type="primary" :icon="Refresh" @click="restore">다시 연결</el-button
    ><el-button
      @click="
        session.clear();
        session.ready = true;
        restoreError = '';
        router.replace('/login');
      "
      >로그인으로</el-button
    >
  </div>
  <div v-else-if="!session.ready" class="connection-state">워크스페이스를 준비하고 있어요…</div>
  <RouterView v-else-if="!session.user" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">h.</span>hiconsy</div>
      <div class="workspace-label">WORKSPACE <span>내신콘텐츠팀</span></div>
      <nav>
        <RouterLink v-for="item in menu" :key="item.path" :to="item.path"
          ><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span
          ><i v-if="item.path === '/today'" class="nav-dot"></i
        ></RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="profile">
          <span class="avatar">{{ session.user.name[0] }}</span>
          <div>
            <strong>{{ session.user.name }}</strong
            ><small>{{ session.user.role === 'LEAD' ? '팀 리드' : '팀원' }}</small>
          </div>
          <button aria-label="로그아웃" title="로그아웃" @click="logout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </div>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <span>워크스페이스 <b>/</b> {{ route.meta.title }}</span>
        <div>
          <span v-if="session.clock?.demo" class="demo-badge">DEMO</span
          ><span class="online"><i></i>내신콘텐츠팀</span>
        </div>
      </header>
      <div class="page-content">
        <RouterView :key="refreshKey" /><DemoPanel @changed="refreshKey++" />
      </div>
    </main>
  </div>
</template>
