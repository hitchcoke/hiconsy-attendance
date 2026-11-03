<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '../store';
const session = useSession(),
  router = useRouter();
const login = ref('kim'),
  password = ref('demo1234'),
  busy = ref(false),
  error = ref('');
const accounts = [
  { id: 'kim', name: '김근태', role: '팀원' },
  { id: 'yeon', name: '연차원', role: '팀원' },
  { id: 'im', name: '임자율', role: '팀원' },
  { id: 'lead', name: '개발 리드', role: '리드' },
];
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await session.login(login.value, password.value);
    await router.push('/today');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="login-page">
    <section class="login-story">
      <div class="brand">
        <span class="brand-mark">h.</span> hiconsy<span class="brand-divider">/</span
        ><span class="brand-sub">내신콘텐츠팀</span>
      </div>
      <div class="story-copy">
        <h1>근태관리</h1>
        <p>출퇴근 · 휴가 · 재택근무</p>
      </div>
    </section>
    <section class="login-form-wrap">
      <div class="login-form">
        <h2>로그인</h2>

        <form @submit.prevent="submit">
          <label for="login">아이디</label
          ><el-input
            id="login"
            v-model="login"
            size="large"
            autocomplete="username"
            placeholder="아이디를 입력하세요"
          /><label for="password">비밀번호</label
          ><el-input
            id="password"
            v-model="password"
            type="password"
            show-password
            size="large"
            autocomplete="current-password"
          /><el-alert
            v-if="error"
            :title="error"
            type="error"
            :closable="false"
            show-icon
            class="mt"
          /><el-button
            type="primary"
            size="large"
            native-type="submit"
            :loading="busy"
            class="login-submit"
            >로그인 <span>→</span></el-button
          >
        </form>
        <div class="sample-box">
          <h3>과제 시연용 계정 <span>공통 비밀번호 · demo1234</span></h3>
          <div class="sample-grid">
            <button
              v-for="a in accounts"
              :key="a.id"
              type="button"
              :class="{ selected: login === a.id }"
              @click="
                login = a.id;
                password = 'demo1234';
              "
            >
              <strong>{{ a.name }}</strong
              ><small>{{ a.role }} · {{ a.id }}</small>
            </button>
          </div>
        </div>
        <p class="login-note">등록된 IP 또는 신청한 장소·시간에서 접속할 수 있어요.</p>
      </div>
    </section>
  </div>
</template>
