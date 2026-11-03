<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Right, Clock } from '@element-plus/icons-vue';
import { api } from '../api';
import { useSession } from '../store';
import type { Today } from '../../shared/contracts';
import { datetime, time, hours, kindLabel } from '../format';
import BalanceCards from '../components/BalanceCards.vue';
const session = useSession(),
  value = ref<Today>(),
  error = ref(''),
  loading = ref(false),
  busy = ref(false);
let timer: ReturnType<typeof setInterval>;
const status = computed(() =>
  value.value?.attendance?.checkOut
    ? '퇴근 완료'
    : value.value?.attendance
      ? '근무 중'
      : value.value?.request?.kind === 'ANNUAL'
        ? '연차 사용 중'
        : '출근 전',
);
const workGuide = computed(() => {
  const mode = value.value?.attendance?.mode || value.value?.request?.kind;
  if (mode === 'HALF_AM') return '12:30부터 출근 · 12:30까지 정상 출근 · 4시간 근무 기준';
  if (mode === 'HALF_PM') return '11:30부터 퇴근 · 07:30~11:30 근무 시 4시간';
  if (mode === 'ANNUAL') return '승인된 연차 사용일 · 출퇴근 등록 대상이 아닙니다.';
  return '07시부터 출근 · 10시까지 정상 출근 · 16시부터 퇴근';
});
const progress = computed(() =>
  Math.min(
    100,
    ((value.value?.workSeconds || 0) /
      (value.value?.attendance?.mode.startsWith('HALF_') ? 14400 : 28800)) *
      100,
  ),
);
async function load(quiet = false) {
  if (!quiet) loading.value = true;
  try {
    value.value = await api<Today>('/today');
    session.clock = value.value.clock;
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function punch(which: 'check-in' | 'check-out') {
  if (which === 'check-out') {
    try {
      await ElMessageBox.confirm('퇴근을 등록하면 오늘의 근무가 마감됩니다.', '퇴근하시겠어요?', {
        confirmButtonText: '퇴근 등록',
        cancelButtonText: '계속 근무',
      });
    } catch {
      return;
    }
  }
  busy.value = true;
  try {
    await api(`/attendance/${which}`, {});
    ElMessage.success(which === 'check-in' ? '출근이 등록되었습니다.' : '퇴근이 등록되었습니다.');
    await load();
  } catch (e) {
    await load(true);
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function changed() {
  load();
}
onMounted(() => {
  load();
  timer = setInterval(() => {
    if (!session.clock?.demo && !busy.value) load(true);
  }, 60000);
  window.addEventListener('clock-changed', changed);
});
onUnmounted(() => {
  clearInterval(timer);
  window.removeEventListener('clock-changed', changed);
});
</script>
<template>
  <div class="page-heading">
    <div>
      <h1 style="margin-top: 10px">오늘</h1>
    </div>
    <div class="date-heading">
      <strong>{{ value?.date }}</strong
      ><span>{{ value ? datetime(value.clock.now) : '서버 시각 확인 중' }}</span>
    </div>
  </div>
  <el-alert
    v-if="error"
    :title="error"
    type="error"
    :closable="false"
    show-icon
    class="mb"
  /><el-alert
    v-if="value?.pendingRequest"
    title="오늘 휴가가 승인 대기 중입니다."
    type="warning"
    :closable="false"
    show-icon
    class="mb"
    ><p>리드 승인 전에는 기존 근무 기준으로 출퇴근해 주세요.</p>
    <RouterLink to="/requests" class="text-link">신청 상태 확인 →</RouterLink></el-alert
  ><el-alert
    v-if="value?.missing.length"
    title="퇴근 기록이 비어 있어요"
    :description="`${value.missing.length}건의 퇴근 시각을 입력하면 오늘 출근을 등록할 수 있어요.`"
    type="warning"
    :closable="false"
    show-icon
    class="mb"
    ><template #default
      ><p>{{ value.missing.length }}건의 퇴근 시각을 입력하면 오늘 출근을 등록할 수 있어요.</p>
      <RouterLink to="/history" class="text-link">미기록 입력하러 가기 →</RouterLink></template
    ></el-alert
  ><el-skeleton v-if="!value && !error" :rows="8" animated /><template v-if="value"
    ><div class="today-grid">
      <section class="panel attendance-panel" v-loading="loading">
        <div class="panel-title">
          <h2>오늘의 근무</h2>
          <span
            class="tag"
            :class="{
              green: !!value.attendance && !value.attendance.checkOut,
              blue: !!value.attendance?.checkOut,
            }"
            ><i v-if="value.attendance && !value.attendance.checkOut" class="tiny-dot"></i
            >{{ status }}</span
          >
        </div>
        <div class="work-clock">
          <strong
            >{{ Math.floor(value.workSeconds / 3600) }}<span>시간</span>
            {{ Math.floor((value.workSeconds % 3600) / 60) }}<span>분</span></strong
          >
        </div>
        <div class="progress-track"><span :style="{ width: progress + '%' }"></span></div>
        <div class="progress-caption">
          <span>근무시간</span
          ><span
            >목표
            {{
              value.attendance?.mode.startsWith('HALF_') || value.request?.kind.startsWith('HALF_')
                ? '4'
                : '8'
            }}시간</span
          >
        </div>
        <div class="punch-times">
          <div>
            <span class="time-dot blue"></span><small>출근</small
            ><strong>{{ time(value.attendance?.checkIn || null) }}</strong
            ><span v-if="value.attendance?.late" class="tag orange">지각</span>
          </div>
          <div>
            <span class="time-dot gray"></span><small>퇴근</small
            ><strong>{{ time(value.attendance?.checkOut || null) }}</strong
            ><span v-if="value.attendance?.early" class="tag orange">조퇴</span>
          </div>
        </div>
        <div class="punch-buttons">
          <el-button
            type="primary"
            size="large"
            :loading="busy"
            :disabled="!value.checkIn.enabled || busy || !!error"
            @click="punch('check-in')"
            >출근하기 <el-icon><Right /></el-icon></el-button
          ><el-button
            size="large"
            :disabled="!value.checkOut.enabled || busy || !!error"
            @click="punch('check-out')"
            >퇴근하기</el-button
          >
        </div>
        <p class="button-hint">
          {{ value.attendance ? value.checkOut.reason : value.checkIn.reason }}
        </p>
      </section>
      <section class="panel rhythm-panel">
        <div class="panel-title">
          <h2>오늘의 일정</h2>
          <el-icon color="#a3b0c4"><Clock /></el-icon>
        </div>
        <div class="schedule-date">
          <span>{{ value.date.slice(5, 7) }}월</span
          ><strong>{{ Number(value.date.slice(8)) }}</strong
          ><small>{{ value.holiday ? '주말 · 공휴일' : '평일' }}</small>
        </div>
        <div class="schedule-item">
          <span class="schedule-line"></span>
          <div>
            <strong>{{ value.request ? kindLabel[value.request.kind] : '사무실 근무' }}</strong>
            <p>{{ value.request?.reason || '내신콘텐츠팀 · 연구실' }}</p>
            <small v-if="value.request?.startTime"
              >{{ value.request.startTime }} – {{ value.request.endTime }}</small
            >
          </div>
          <span class="tag blue">{{ value.request ? '확정' : '기본' }}</span>
        </div>
        <div class="lunch-note">
          <span>☕</span>
          <div>
            <strong>점심시간</strong>
            <p>점심시간 11:30 – 12:30</p>
          </div>
        </div>
        <RouterLink to="/requests" class="text-link">다음 일정 신청하기 →</RouterLink>
      </section>
    </div>
    <BalanceCards :value="value.balances" />
    <section class="work-guide">
      <div>
        <span class="guide-icon">✦</span>
        <div>
          <strong>근무 기준</strong>
          <p>{{ workGuide }}</p>
        </div>
      </div>
      <el-button text :icon="Refresh" @click="load()">새로고침</el-button>
    </section></template
  >
</template>
<style scoped>
.wave {
  color: #d3b78c;
  margin-left: 12px;
  font-size: 29px;
}
.date-heading {
  text-align: right;
}
.date-heading strong {
  display: block;
  font-size: 12px;
  font-weight: 550;
  color: #718199;
}
.date-heading span {
  display: block;
  font-size: 10px;
  color: #a0aabc;
  margin-top: 7px;
}
.today-grid {
  display: grid;
  grid-template-columns: 1.45fr 1fr;
  gap: 22px;
}
.attendance-panel {
  padding: 25px 28px;
}
.work-clock {
  text-align: center;
  padding: 26px 0 24px;
}
.work-clock > strong {
  font-size: 43px;
  font-weight: 650;
  letter-spacing: -1.5px;
  color: #34445e;
}
.work-clock > strong span {
  font-size: 14px;
  font-weight: 400;
  color: #99a5b9;
  letter-spacing: 0;
  margin: 0 7px;
}
.work-clock p {
  font-size: 11px;
  color: #99a5ba;
  margin-top: 11px;
}
.progress-track {
  height: 6px;
  background: #f0f3f9;
  border-radius: 10px;
  overflow: hidden;
}
.progress-track span {
  height: 100%;
  display: block;
  background: #7487ed;
  border-radius: 10px;
  transition: width 0.5s;
}
.progress-caption {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #a2adc0;
  margin-top: 9px;
}
.punch-times {
  display: flex;
  justify-content: space-around;
  margin: 28px 0;
  padding: 15px 0;
  border-top: 1px solid #f0f3f8;
  border-bottom: 1px solid #f0f3f8;
}
.punch-times > div {
  display: flex;
  gap: 8px;
  align-items: center;
}
.punch-times small {
  color: #9aa7ba;
  font-size: 11px;
}
.punch-times strong {
  font-size: 16px;
  margin-left: 5px;
  font-weight: 550;
}
.time-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.time-dot.blue {
  background: #8193ed;
}
.time-dot.gray {
  background: #cbd3e2;
}
.punch-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.punch-buttons .el-button {
  margin: 0;
  height: 44px;
}
.punch-buttons .el-icon {
  margin-left: 12px;
}
.button-hint {
  font-size: 10px;
  color: #98a5ba;
  text-align: center;
  margin-top: 13px;
  min-height: 15px;
}
.schedule-date {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 24px 0 28px;
  border-bottom: 1px solid #f0f3f8;
}
.schedule-date > span {
  font-size: 15px;
  color: #99a6bb;
}
.schedule-date strong {
  font-size: 37px;
  font-weight: 600;
  color: #40516b;
}
.schedule-date small {
  margin-left: auto;
  color: #a1adc0;
  font-size: 10px;
}
.schedule-item {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 25px 0;
}
.schedule-line {
  width: 3px;
  height: 46px;
  background: #a2b0ef;
  border-radius: 4px;
}
.schedule-item strong {
  font-size: 13px;
  font-weight: 600;
}
.schedule-item p {
  font-size: 11px;
  line-height: 1.7;
  color: #9aa6b9;
  margin-top: 8px;
}
.schedule-item small {
  display: block;
  font-size: 11px;
  color: #8796b0;
  margin-top: 5px;
}
.schedule-item > .tag {
  margin-left: auto;
}
.lunch-note {
  display: flex;
  gap: 12px;
  background: #f8f9fc;
  border-radius: 9px;
  padding: 16px;
  margin: 4px 0 22px;
}
.lunch-note strong {
  font-size: 11px;
  font-weight: 550;
  color: #8997ad;
}
.lunch-note p {
  font-size: 10px;
  color: #a3aec0;
  margin-top: 6px;
}
.text-link {
  font-size: 11px;
  color: #788dd4;
  text-decoration: none;
}
.work-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: #edf2fa;
  border-radius: 12px;
}
.work-guide > div {
  display: flex;
  align-items: center;
  gap: 14px;
}
.guide-icon {
  font-size: 22px;
  color: #97a8c9;
}
.work-guide strong {
  font-size: 11px;
  font-weight: 550;
  color: #7788a3;
}
.work-guide p {
  font-size: 10px;
  color: #96a4bb;
  margin-top: 6px;
}
.tiny-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #38b088;
  margin-right: 6px;
}
.mb {
  margin-bottom: 20px;
}
@media (max-width: 1000px) {
  .today-grid {
    gap: 15px;
    grid-template-columns: 1.35fr 1fr;
  }
  .attendance-panel {
    padding: 22px;
  }
  .work-clock > strong {
    font-size: 36px;
  }
  .punch-times > div {
    gap: 5px;
  }
}
@media (max-width: 860px) {
  .today-grid {
    grid-template-columns: 1fr;
  }
  .date-heading {
    display: none;
  }
}
</style>
