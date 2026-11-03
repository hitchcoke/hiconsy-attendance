<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../api';
import { useSession } from '../store';
import { time, hours, kindLabel, datetime, actionLabel } from '../format';
import type { TeamData, TeamRow, MemberDetail, ClockInfo } from '../../shared/contracts';
const session = useSession(),
  date = ref(''),
  data = ref<TeamData>(),
  error = ref(''),
  loading = ref(false),
  tab = ref('team'),
  drawer = ref(false),
  detail = ref<MemberDetail>(),
  detailError = ref('');
const working = computed(
    () => data.value?.rows.filter((r) => r.attendance && !r.attendance.checkOut).length || 0,
  ),
  late = computed(() => data.value?.rows.filter((r) => r.attendance?.late).length || 0);
let loadSequence = 0;
async function load() {
  const current = ++loadSequence;
  loading.value = true;
  error.value = '';
  try {
    if (!date.value) {
      const c = await api<ClockInfo>('/clock');
      date.value = new Date(new Date(c.now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    }
    const result = await api<TeamData>(`/team?date=${date.value}`);
    if (current === loadSequence) data.value = result;
  } catch (e) {
    if (current === loadSequence) error.value = (e as Error).message;
  } finally {
    if (current === loadSequence) loading.value = false;
  }
}
async function show(id: number) {
  drawer.value = true;
  detail.value = undefined;
  detailError.value = '';
  try {
    detail.value = await api<MemberDetail>(
      `/team/${id}?from=${date.value.slice(0, 7)}-01&to=${date.value}`,
    );
  } catch (e) {
    detailError.value = (e as Error).message;
  }
}
function showRow(row: TeamRow) {
  show(row.user.id);
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <h1 class="mt-small">팀 현황</h1>
    </div>
    <div class="filter-row" style="margin: 0">
      <RouterLink to="/approvals" class="text-link">휴가 승인 →</RouterLink>
      <input v-model="date" type="date" aria-label="팀 현황 날짜" @change="load" /><el-button
        :icon="Refresh"
        :loading="loading"
        @click="load"
        >새로고침</el-button
      >
    </div>
  </div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb" />
  <div v-if="data" class="team-stats">
    <div>
      <span>전체 팀원</span><strong>{{ data.rows.length }}<small>명</small></strong>
    </div>
    <div>
      <span>선택일 근무 중</span><strong class="green-text">{{ working }}<small>명</small></strong>
    </div>
    <div>
      <span>선택일 지각</span><strong class="amber-text">{{ late }}<small>명</small></strong>
    </div>
    <div>
      <span>퇴근 미기록</span><strong>{{ data.missing.length }}<small>건</small></strong>
    </div>
  </div>
  <section v-if="data" class="panel" v-loading="loading">
    <el-tabs v-model="tab"
      ><el-tab-pane label="팀 보드" name="team"
        ><el-table :data="data.rows" @row-click="showRow" row-class-name="clickable"
          ><el-table-column label="팀원" min-width="150"
            ><template #default="{ row }"
              ><div class="member-cell">
                <span class="avatar">{{ row.user.name[0] }}</span>
                <div>
                  <strong>{{ row.user.name }}</strong
                  ><small>{{ row.user.role === 'LEAD' ? '팀 리드' : '팀원' }}</small>
                </div>
              </div></template
            ></el-table-column
          ><el-table-column label="상태" min-width="100"
            ><template #default="{ row }"
              ><span
                class="tag"
                :class="{
                  green: !!row.attendance && !row.attendance.checkOut,
                  blue: !!row.request,
                }"
                >{{ row.status }}</span
              ></template
            ></el-table-column
          ><el-table-column label="출근" width="80"
            ><template #default="{ row }">{{
              time(row.attendance?.checkIn || null)
            }}</template></el-table-column
          ><el-table-column label="퇴근" width="80"
            ><template #default="{ row }">{{
              time(row.attendance?.checkOut || null)
            }}</template></el-table-column
          ><el-table-column label="기록" min-width="140"
            ><template #default="{ row }"
              ><span v-if="row.attendance?.late" class="tag orange">지각</span>
              <span v-if="row.attendance?.early" class="tag orange">조퇴</span>
              <span v-if="row.attendance?.manual" class="tag blue">직접 입력</span
              ><span v-if="row.missing" class="tag red">미기록 {{ row.missing }}</span></template
            ></el-table-column
          ><el-table-column width="50"
            ><template #default><span class="muted">→</span></template></el-table-column
          ></el-table
        ></el-tab-pane
      ><el-tab-pane label="신청 현황" name="requests"
        ><el-table
          :data="data.rows.filter((r) => r.request)"
          empty-text="선택한 날짜에 확정된 신청이 없어요"
          ><el-table-column label="팀원"
            ><template #default="{ row }">{{ row.user.name }}</template></el-table-column
          ><el-table-column label="종류"
            ><template #default="{ row }">{{
              kindLabel[row.request.kind]
            }}</template></el-table-column
          ><el-table-column label="사유"
            ><template #default="{ row }">{{ row.request.reason }}</template></el-table-column
          ><el-table-column label="시간"
            ><template #default="{ row }">{{
              row.request.startTime ? `${row.request.startTime} ~ ${row.request.endTime}` : '—'
            }}</template></el-table-column
          ></el-table
        ></el-tab-pane
      ><el-tab-pane
        :label="`미기록 · 직접 입력 ${data.missing.length + data.manual.length}`"
        name="missing"
        ><h3 class="tab-title">퇴근 미기록</h3>
        <el-table :data="data.missing" empty-text="미기록 건이 없어요"
          ><el-table-column prop="name" label="팀원" /><el-table-column
            prop="workDate"
            label="근무일"
          /><el-table-column label="출근"
            ><template #default="{ row }">{{ time(row.checkIn) }}</template></el-table-column
          ></el-table
        >
        <h3 class="tab-title">직접 입력</h3>
        <el-table :data="data.manual" empty-text="선택한 날짜에 직접 입력한 기록이 없어요"
          ><el-table-column prop="name" label="팀원" /><el-table-column
            prop="workDate"
            label="근무일"
          /><el-table-column label="퇴근"
            ><template #default="{ row }">{{ time(row.checkOut) }}</template></el-table-column
          ></el-table
        ></el-tab-pane
      ></el-tabs
    >
  </section>
  <el-drawer v-model="drawer" title="팀원 상세" size="540px"
    ><el-alert v-if="detailError" :title="detailError" type="error" /><template v-if="detail"
      ><div class="member-cell">
        <span class="avatar">{{ detail.user.name[0] }}</span>
        <div>
          <h2>{{ detail.user.name }}</h2>
          <p class="muted">입사일 {{ detail.user.hireDate }}</p>
        </div>
      </div>
      <h3 class="tab-title">선택한 월의 근태</h3>
      <el-table :data="detail.attendances" empty-text="근태 기록이 없어요"
        ><el-table-column prop="workDate" label="근무일" width="118" /><el-table-column label="출근"
          ><template #default="{ row }">{{ time(row.checkIn) }}</template></el-table-column
        ><el-table-column label="퇴근"
          ><template #default="{ row }">{{ time(row.checkOut) }}</template></el-table-column
        ><el-table-column label="시간"
          ><template #default="{ row }">{{
            row.checkOut ? hours(row.workSeconds) : '미기록'
          }}</template></el-table-column
        ></el-table
      >
      <h3 class="tab-title">신청 내역</h3>
      <el-table :data="detail.requests" empty-text="신청 내역이 없어요"
        ><el-table-column prop="date" label="사용일" /><el-table-column label="종류"
          ><template #default="{ row }">{{ kindLabel[row.kind] }}</template></el-table-column
        ><el-table-column prop="reason" label="사유"
      /></el-table>
      <h3 class="tab-title">최근 활동</h3>
      <div v-for="log in detail.logs" :key="log.id" class="activity-row">
        <span>{{ actionLabel[log.action] || log.action }}</span
        ><small>{{ datetime(log.at) }} · {{ log.result === 'SUCCESS' ? '완료' : '실패' }}</small>
      </div></template
    ></el-drawer
  >
</template>
<style scoped>
.mt-small {
  margin-top: 10px;
}
.mb {
  margin-bottom: 20px;
}
.filter-row input {
  border: 1px solid #dfe6f1;
  background: white;
  color: #6f7f98;
  border-radius: 8px;
  padding: 8px 10px;
}
.team-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 24px 0;
}
.team-stats > div {
  background: white;
  border: 1px solid #e7ecf3;
  padding: 22px;
  border-radius: 13px;
}
.team-stats span {
  font-size: 11px;
  color: #91a0b6;
}
.team-stats strong {
  display: block;
  font-size: 29px;
  font-weight: 600;
  margin-top: 18px;
}
.team-stats small {
  font-size: 12px;
  color: #a5b0c2;
  margin-left: 7px;
  font-weight: 400;
}
.green-text {
  color: #4da790;
}
.amber-text {
  color: #ca9a60;
}
.member-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}
.member-cell strong {
  font-size: 12px;
  font-weight: 600;
}
.member-cell small {
  display: block;
  font-size: 10px;
  color: #9da9bc;
  margin-top: 5px;
}
.tab-title {
  font-size: 13px;
  margin: 24px 0 14px;
}
.activity-row {
  padding: 13px 0;
  border-bottom: 1px solid #edf1f7;
  font-size: 11px;
  color: #71829d;
}
.activity-row small {
  display: block;
  color: #a6b1c3;
  margin-top: 6px;
}
:deep(.clickable) {
  cursor: pointer;
}
:deep(.el-tabs__item) {
  font-size: 12px;
}
</style>
