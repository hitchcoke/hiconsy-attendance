<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Refresh } from '@element-plus/icons-vue';
import { api } from '../api';
import { useSession } from '../store';
import { datetime, hours, kindLabel, requestStatusLabel, time } from '../format';
import type { CalendarDay, CalendarMonth } from '../../shared/contracts';
const route = useRoute(),
  router = useRouter(),
  session = useSession();
const queryString = (value: unknown) => (typeof value === 'string' ? value : '');
const month = ref(queryString(route.query.month)),
  userId = ref(queryString(route.query.userId));
const data = ref<CalendarMonth>(),
  loading = ref(false),
  error = ref(''),
  drawer = ref(false);
const selectedDate = ref(queryString(route.query.date)),
  focusDate = ref('');
const selected = computed(() => data.value?.days.find((d) => d.date === selectedDate.value));
const own = computed(() => data.value?.user.id === session.user?.id);
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const cells = computed(() => {
  if (!data.value) return [];
  return Array.from(
    { length: 42 },
    (_, index) => data.value!.days[index - data.value!.days[0].weekday] || null,
  );
});
const stateLabels = {
  NONE: '기록 없음',
  WORKING: '근무 중',
  MISSING_CHECKOUT: '퇴근 미기록',
  COMPLETED: '퇴근 완료',
};
let sequence = 0;
async function load(openSelected = false) {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  const query = new URLSearchParams();
  if (month.value) query.set('month', month.value);
  if (userId.value) query.set('userId', userId.value);
  try {
    const result = await api<CalendarMonth>('/calendar?' + query.toString());
    if (current !== sequence) return;
    data.value = result;
    month.value = result.month;
    userId.value = String(result.user.id);
    focusDate.value = result.days.some((d) => d.date === focusDate.value)
      ? focusDate.value
      : result.days.some((d) => d.date === result.today)
        ? result.today
        : result.days[0].date;
    if (openSelected && selected.value) drawer.value = true;
    await router.replace({
      path: '/calendar',
      query: {
        month: result.month,
        ...(result.user.id !== session.user?.id ? { userId: String(result.user.id) } : {}),
        ...(selected.value ? { date: selectedDate.value } : {}),
      },
    });
  } catch (e) {
    if (current === sequence) {
      error.value = (e as Error).message;
      data.value = undefined;
      drawer.value = false;
    }
  } finally {
    if (current === sequence) loading.value = false;
  }
}
function change() {
  drawer.value = false;
  selectedDate.value = '';
  void load();
}
function stepMonth(step: number) {
  if (!month.value) return;
  const [year, m] = month.value.split('-').map(Number);
  const next = new Date(Date.UTC(year, m - 1 + step, 1)).toISOString().slice(0, 7);
  if (next < (data.value?.minMonth || '2026-01') || next > (data.value?.maxMonth || '2026-12'))
    return;
  month.value = next;
  change();
}
function thisMonth() {
  month.value = '';
  change();
}
function show(day: CalendarDay) {
  selectedDate.value = day.date;
  focusDate.value = day.date;
  drawer.value = true;
}
function events(day: CalendarDay) {
  const items: { label: string; tone: string }[] = [];
  if (day.attendance) {
    const flags = [
      day.attendance.late ? '지각' : '',
      day.attendance.early ? '조퇴' : '',
      day.attendance.manual ? '직접 입력' : '',
    ].filter(Boolean);
    items.push({
      label: [stateLabels[day.attendanceState], ...flags].join(' · '),
      tone:
        day.attendanceState === 'MISSING_CHECKOUT' || day.attendance.late || day.attendance.early
          ? 'problem'
          : 'work',
    });
  }
  for (const r of day.requests)
    items.push({
      label: `${kindLabel[r.kind]} · ${r.status === 'PENDING' ? '대기' : requestStatusLabel[r.status]}`,
      tone: r.status.toLowerCase(),
    });
  return items;
}
function dayLabel(day: CalendarDay) {
  return [day.date, day.holidayName, ...events(day).map((e) => e.label)]
    .filter(Boolean)
    .join(' · ');
}
async function moveFocus(event: KeyboardEvent, index: number) {
  const offset: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (!(event.key in offset) || !data.value) return;
  event.preventDefault();
  const next = Math.max(0, Math.min(data.value.days.length - 1, index + offset[event.key]));
  const grid = (event.currentTarget as HTMLElement).closest('.calendar-grid');
  focusDate.value = data.value.days[next].date;
  await nextTick();
  grid?.querySelector<HTMLButtonElement>(`[data-date="${focusDate.value}"]`)?.focus();
}
async function apply() {
  if (!selected.value?.canRequest.enabled || !own.value || loading.value) return;
  await router.push({
    path: '/requests',
    query: {
      date: selected.value.date,
      kind: selected.value.business ? 'ANNUAL' : 'HOLIDAY',
      from: 'calendar',
    },
  });
}
onMounted(() => load(true));
onUnmounted(() => {
  sequence++;
});
</script>
<template>
  <div class="page-heading calendar-heading">
    <h1>캘린더</h1>
    <el-button :icon="Refresh" :loading="loading" @click="load(false)">새로고침</el-button>
  </div>
  <div class="calendar-toolbar">
    <div class="month-navigation">
      <el-button
        :icon="ArrowLeft"
        aria-label="이전 달"
        :disabled="!month || month <= (data?.minMonth || '2026-01')"
        @click="stepMonth(-1)"
      />
      <input
        v-model="month"
        type="month"
        aria-label="조회 월"
        :min="data?.minMonth || '2026-01'"
        :max="data?.maxMonth || '2026-12'"
        @change="change"
      />
      <el-button
        :icon="ArrowRight"
        aria-label="다음 달"
        :disabled="!month || month >= (data?.maxMonth || '2026-12')"
        @click="stepMonth(1)"
      />
      <el-button @click="thisMonth">이번 달</el-button>
    </div>
    <label v-if="session.user?.role === 'LEAD' && data" class="person-filter"
      >조회 대상<select v-model="userId" aria-label="캘린더 사용자" @change="change">
        <option v-for="user in data.users" :key="user.id" :value="String(user.id)">
          {{ user.name }}{{ user.id === session.user?.id ? ' (본인)' : '' }}
        </option>
      </select></label
    >
    <span v-else-if="data" class="calendar-owner">{{ data.user.name }}</span>
  </div>
  <div class="calendar-legend" aria-label="캘린더 상태 범례">
    <span class="work">근태</span><span class="approved">승인</span
    ><span class="pending">승인 대기</span><span class="rejected">반려</span
    ><span class="problem">지각·조퇴·미기록</span>
  </div>
  <el-alert
    v-if="error"
    :title="error"
    type="error"
    :closable="false"
    show-icon
    class="calendar-error"
  />
  <el-skeleton v-if="!data && loading" :rows="10" animated />
  <section
    v-if="data"
    class="calendar-panel"
    v-loading="loading"
    :aria-label="`${data.user.name} ${data.month} 캘린더`"
  >
    <div class="calendar-weekdays">
      <span
        v-for="(name, index) in weekdays"
        :key="name"
        :class="{ sunday: index === 0, saturday: index === 6 }"
        >{{ name }}</span
      >
    </div>
    <div class="calendar-grid">
      <template v-for="(day, index) in cells" :key="day?.date || `empty-${index}`">
        <button
          v-if="day"
          class="calendar-day"
          :data-date="day.date"
          :class="{
            today: day.date === data.today,
            holiday: !day.business,
            selected: day.date === selectedDate,
          }"
          :aria-label="dayLabel(day)"
          :aria-current="day.date === data.today ? 'date' : undefined"
          :tabindex="day.date === focusDate ? 0 : -1"
          :disabled="loading"
          @focus="focusDate = day.date"
          @keydown="moveFocus($event, Number(day.date.slice(8)) - 1)"
          @click="show(day)"
        >
          <span class="day-heading"
            ><span
              class="day-number"
              :class="{
                sunday: day.weekday === 0 || !!day.holidayName,
                saturday: day.weekday === 6,
              }"
              >{{ Number(day.date.slice(8)) }}</span
            ><span class="holiday-label" :title="day.holidayName || ''">{{
              day.holidayName
            }}</span></span
          >
          <span
            v-for="(item, n) in events(day).slice(0, 2)"
            :key="n"
            class="day-event"
            :class="[item.tone, { 'second-event': n === 1 }]"
            :title="item.label"
            >{{ item.label }}</span
          >
          <span v-if="events(day).length > 2" class="day-more regular-more"
            >+{{ events(day).length - 2 }}건</span
          >
          <span v-if="events(day).length > 1" class="day-more compact-more"
            >+{{ events(day).length - 1 }}건</span
          >
        </button>
        <div v-else class="calendar-day empty-day" aria-hidden="true"></div>
      </template>
    </div>
  </section>
  <el-drawer v-model="drawer" :title="selectedDate" size="min(460px, 92vw)" class="calendar-detail">
    <template v-if="selected && data">
      <p class="detail-person">
        {{ data.user.name }} · {{ selected.holidayName || (selected.business ? '평일' : '주말') }}
      </p>
      <section class="day-detail-section">
        <h3>근태</h3>
        <template v-if="selected.attendance"
          ><p class="detail-state">
            <span
              class="tag"
              :class="selected.attendanceState === 'MISSING_CHECKOUT' ? 'red' : 'green'"
              >{{ stateLabels[selected.attendanceState] }}</span
            ><span v-if="selected.attendance.late" class="tag orange">지각</span
            ><span v-if="selected.attendance.early" class="tag orange">조퇴</span
            ><span v-if="selected.attendance.manual" class="tag blue">직접 입력</span>
          </p>
          <dl class="calendar-record">
            <dt>출근</dt>
            <dd>{{ time(selected.attendance.checkIn) }}</dd>
            <dt>퇴근</dt>
            <dd>{{ time(selected.attendance.checkOut) }}</dd>
            <dt>근무시간</dt>
            <dd>
              {{
                selected.attendance.checkOut
                  ? hours(selected.attendance.workSeconds)
                  : '퇴근 후 확정'
              }}
            </dd>
          </dl>
          <RouterLink
            v-if="own && selected.attendanceState === 'MISSING_CHECKOUT'"
            to="/history"
            class="text-link"
            >미기록 퇴근 입력 →</RouterLink
          >
        </template>
        <p v-else class="detail-empty">등록된 근태가 없습니다.</p>
      </section>
      <section class="day-detail-section">
        <h3>신청 {{ selected.requests.length ? `(${selected.requests.length})` : '' }}</h3>
        <article v-for="item in selected.requests" :key="item.id" class="calendar-request">
          <div>
            <strong>{{ kindLabel[item.kind] }}</strong
            ><span
              class="tag"
              :class="
                item.status === 'PENDING' ? 'orange' : item.status === 'REJECTED' ? 'red' : 'blue'
              "
              >{{ requestStatusLabel[item.status] }}</span
            >
          </div>
          <p>{{ item.reason }}</p>
          <small v-if="item.startTime"
            >{{ item.ip }} · {{ item.startTime }}~{{ item.endTime }}</small
          ><small v-if="item.reviewedAt">{{ datetime(item.reviewedAt) }} 처리</small>
          <p v-if="item.reviewNote" class="review-note">{{ item.reviewNote }}</p>
        </article>
        <p v-if="!selected.requests.length" class="detail-empty">신청 내역이 없습니다.</p>
      </section>
    </template>
    <template v-if="selected && data" #footer>
      <section class="calendar-apply">
        <h3>새 신청</h3>
        <p class="deadline-text">마감 {{ datetime(selected.deadline) }}</p>
        <p v-if="!selected.canRequest.enabled" class="blocked-reason">
          {{ selected.canRequest.reason }}
        </p>
        <el-button
          type="primary"
          :disabled="!selected.canRequest.enabled || !own || loading"
          @click="apply"
          >이 날짜로 신청</el-button
        >
      </section>
    </template>
  </el-drawer>
</template>
<style scoped>
.calendar-heading {
  margin-bottom: 18px;
}
.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.month-navigation {
  display: flex;
  align-items: center;
  gap: 7px;
}
.month-navigation .el-button + .el-button {
  margin-left: 0;
}
.month-navigation input,
.person-filter select {
  border: 1px solid #dfe6f1;
  border-radius: 8px;
  background: white;
  color: #334155;
  padding: 7px 9px;
  height: 34px;
}
.month-navigation input {
  width: 151px;
  font-weight: 600;
}
.person-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #65748b;
}
.person-filter select {
  max-width: 166px;
}
.calendar-owner {
  font-size: 13px;
  color: #65748b;
}
.calendar-legend {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 11px;
  color: #65748b;
}
.calendar-legend span:before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: 50%;
  margin-right: 5px;
}
.calendar-panel {
  border: 1px solid #dde5ef;
  border-radius: 12px;
  background: white;
  overflow: hidden;
}
.calendar-weekdays,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.calendar-weekdays span {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: #68778d;
  background: #f8faff;
}
.calendar-day {
  height: clamp(60px, calc((100dvh - 295px) / 6), 98px);
  border: 0;
  border-top: 1px solid #e6ebf3;
  border-right: 1px solid #e6ebf3;
  padding: 6px 7px;
  background: white;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  color: #37465b;
}
.calendar-day:nth-child(7n) {
  border-right: 0;
}
.calendar-day.holiday {
  background: #fcfcfe;
}
.calendar-day.empty-day {
  background: #f7f9fc;
}
.calendar-day:hover:not(:disabled),
.calendar-day.selected {
  background: #f0f4ff;
}
.calendar-day:focus-visible {
  outline: 2px solid #526ae7;
  outline-offset: -2px;
}
.day-heading {
  display: flex;
  gap: 5px;
  align-items: center;
  min-height: 18px;
}
.day-number {
  font-size: 12px;
  font-weight: 600;
}
.today .day-number {
  background: #526ae7;
  color: white;
  border-radius: 50%;
  padding: 2px 5px;
}
.holiday-label {
  font-size: 9px;
  color: #bb6d73;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.day-event {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.work {
  color: #32816d;
}
.day-event.work {
  background: #edf8f3;
}
.approved {
  color: #5268bb;
}
.day-event.approved {
  background: #edf1ff;
}
.pending {
  color: #a46d20;
}
.day-event.pending {
  background: #fff5e5;
  border: 1px dashed #ecd3a4;
  line-height: 14px;
}
.rejected {
  color: #7b8797;
}
.day-event.rejected {
  background: #f0f2f5;
}
.problem {
  color: #b3525f;
}
.day-event.problem {
  background: #fff0f2;
}
.calendar-weekdays .sunday,
.sunday {
  color: #be6470;
}
.calendar-weekdays .saturday,
.saturday {
  color: #6283bd;
}
.day-more {
  font-size: 9px;
  color: #7c899b;
  line-height: 11px;
}
.compact-more {
  display: none;
}
.calendar-error {
  margin-bottom: 16px;
}
.detail-person {
  color: #66768d;
  font-size: 13px;
}
.day-detail-section {
  padding: 22px 0;
  border-bottom: 1px solid #e8edf3;
}
.day-detail-section h3 {
  margin-bottom: 14px;
}
.calendar-apply {
  border-top: 1px solid #e8edf3;
  padding-top: 16px;
  text-align: left;
}
.calendar-apply h3 {
  margin-bottom: 12px;
}
.detail-state {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.calendar-record {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 12px;
  font-size: 13px;
  margin: 18px 0;
}
.calendar-record dt,
.detail-empty {
  color: #78869b;
}
.calendar-record dd {
  margin: 0;
}
.calendar-request {
  padding: 14px;
  border: 1px solid #e4eaf3;
  border-radius: 9px;
  margin-top: 10px;
}
.calendar-request > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.calendar-request p {
  font-size: 13px;
  line-height: 1.7;
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.calendar-request small {
  display: block;
  font-size: 11px;
  color: #76859b;
  margin-top: 8px;
}
.review-note {
  color: #a36068;
}
.detail-empty,
.deadline-text,
.blocked-reason {
  font-size: 12px;
  line-height: 1.8;
}
.deadline-text {
  color: #65748b;
  margin-bottom: 12px;
}
.blocked-reason {
  color: #a36840;
  margin-bottom: 12px;
}
@media (max-height: 730px) {
  .second-event,
  .regular-more {
    display: none;
  }
  .compact-more {
    display: block;
  }
  .calendar-heading {
    margin-bottom: 12px;
  }
  .calendar-toolbar {
    margin-bottom: 10px;
  }
  .calendar-legend {
    margin-bottom: 10px;
  }
}
@media (max-width: 1050px) {
  .month-navigation input {
    width: 133px;
  }
  .person-filter {
    font-size: 11px;
    gap: 5px;
  }
  .person-filter select {
    max-width: 140px;
  }
  .calendar-toolbar {
    gap: 6px;
  }
  .calendar-day {
    padding: 5px 4px;
  }
  .calendar-legend {
    gap: 8px;
    font-size: 10px;
  }
}
</style>
