<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../api';
import { useSession } from '../store';
import { time, hours, datetime, kindLabel } from '../format';
import type { Attendance, Today, AttendanceDetail } from '../../shared/contracts';
const session = useSession(),
  rows = ref<Attendance[]>([]),
  missing = ref<Attendance[]>([]),
  error = ref(''),
  loading = ref(false),
  from = ref(''),
  to = ref(''),
  selected = ref<Attendance>(),
  checkout = ref('18:00'),
  correcting = ref(false),
  saving = ref(false),
  formError = ref(''),
  drawer = ref(false),
  info = ref<AttendanceDetail>(),
  detailError = ref('');
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const t = await api<Today>('/today');
    if (!from.value) {
      from.value = t.date.slice(0, 7) + '-01';
      to.value = t.date;
    }
    missing.value = t.missing;
    rows.value = await api<Attendance[]>(`/attendance?from=${from.value}&to=${to.value}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function show(row: Attendance) {
  drawer.value = true;
  info.value = undefined;
  detailError.value = '';
  try {
    info.value = await api<AttendanceDetail>(`/attendance/${row.id}`);
  } catch (e) {
    detailError.value = (e as Error).message;
  }
}
function openCorrection(row: Attendance) {
  selected.value = row;
  checkout.value = '18:00';
  formError.value = '';
  correcting.value = true;
}
async function save() {
  if (!selected.value) return;
  saving.value = true;
  formError.value = '';
  try {
    await api(`/attendance/${selected.value.id}/correct`, {
      checkOut: `${selected.value.workDate}T${checkout.value}:00+09:00`,
    });
    correcting.value = false;
    ElMessage.success('퇴근 시각을 직접 입력으로 기록했습니다.');
    await load();
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <h1 class="mt-small">내 근태</h1>
    </div>
    <el-button :icon="Refresh" :loading="loading" @click="load">새로고침</el-button>
  </div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb" />
  <section v-if="missing.length" class="missing-panel">
    <div>
      <h3>퇴근 시각을 입력해 주세요</h3>
      <p>미기록 {{ missing.length }}건 · 입력을 완료해야 다음 출근이 가능해요.</p>
    </div>
    <div v-for="row in missing" :key="row.id" class="missing-item">
      <span
        >{{ row.workDate }} <small>출근 {{ time(row.checkIn) }}</small></span
      ><el-button size="small" @click="openCorrection(row)">퇴근 시각 입력</el-button>
    </div>
  </section>
  <section class="panel">
    <div class="panel-title">
      <h2>근무 기록</h2>
      <span>{{ rows.length }}일의 기록</span>
    </div>
    <div class="filter-row">
      <label for="from">기간</label
      ><input id="from" v-model="from" type="date" aria-label="조회 시작일" /><span>—</span
      ><input v-model="to" type="date" aria-label="조회 종료일" /><el-button @click="load"
        >조회</el-button
      >
    </div>
    <el-table
      :data="rows"
      v-loading="loading"
      empty-text="선택한 기간에 근무 기록이 없어요."
      @row-click="show"
      row-class-name="clickable"
      ><el-table-column prop="workDate" label="근무일" width="116" /><el-table-column
        label="근무 형태"
        width="105"
        ><template #default="{ row }">{{ kindLabel[row.mode] }}</template></el-table-column
      ><el-table-column label="출근" width="85"
        ><template #default="{ row }">{{ time(row.checkIn) }}</template></el-table-column
      ><el-table-column label="퇴근" width="85"
        ><template #default="{ row }">{{ time(row.checkOut) }}</template></el-table-column
      ><el-table-column label="근무시간" min-width="115"
        ><template #default="{ row }">{{
          row.checkOut ? hours(row.workSeconds) : '미기록'
        }}</template></el-table-column
      ><el-table-column label="상태" min-width="160"
        ><template #default="{ row }"
          ><span v-if="row.late" class="tag orange">지각</span>
          <span v-if="row.early" class="tag orange">조퇴</span>
          <span v-if="row.manual" class="tag blue">직접 입력</span
          ><span v-if="!row.checkOut" class="tag">퇴근 미기록</span
          ><span v-if="row.checkOut && !row.late && !row.early" class="tag green"
            >정상</span
          ></template
        ></el-table-column
      ></el-table
    >
  </section>
  <p class="table-hint">
    기록을 누르면 상세 내용과 변경 이력을 볼 수 있어요. 시간은 한국 시각 기준입니다.
  </p>
  <el-dialog
    v-model="correcting"
    title="미기록 퇴근 입력"
    width="440px"
    :close-on-click-modal="!saving"
    ><p class="muted">{{ selected?.workDate }} · 출근 {{ time(selected?.checkIn || null) }}</p>
    <label for="correction-time" class="form-label">실제 퇴근 시각</label
    ><input id="correction-time" v-model="checkout" type="time" class="native-input" />
    <p class="field-hint">저장하면 ‘직접 입력’으로 표시되며 변경 이력이 남습니다.</p>
    <el-alert
      v-if="formError"
      :title="formError"
      type="error"
      class="mt"
      :closable="false"
    /><template #footer
      ><el-button :disabled="saving" @click="correcting = false">닫기</el-button
      ><el-button type="primary" :loading="saving" @click="save">기록 저장</el-button></template
    ></el-dialog
  ><el-drawer v-model="drawer" title="근태 상세" size="460px"
    ><el-alert v-if="detailError" :title="detailError" type="error" /><template v-if="info"
      ><h2>{{ info.attendance.workDate }}</h2>
      <div class="detail-grid">
        <div>
          <small>출근</small><strong>{{ time(info.attendance.checkIn) }}</strong>
        </div>
        <div>
          <small>퇴근</small><strong>{{ time(info.attendance.checkOut) }}</strong>
        </div>
        <div>
          <small>근무시간</small><strong>{{ hours(info.attendance.workSeconds) }}</strong>
        </div>
        <div>
          <small>기록 방법</small
          ><strong>{{ info.attendance.manual ? '직접 입력' : '버튼 등록' }}</strong>
        </div>
      </div>
      <h3>변경 이력</h3>
      <el-timeline class="mt"
        ><el-timeline-item v-for="log in info.logs" :key="log.id" :timestamp="datetime(log.at)"
          >{{
            log.action === 'ATTENDANCE_CHECK_IN'
              ? '출근 등록'
              : log.action === 'ATTENDANCE_CORRECT'
                ? '퇴근 직접 입력'
                : '퇴근 등록'
          }}<small class="log-sub"
            >{{ log.ip }} · {{ log.result === 'SUCCESS' ? '완료' : '실패' }}</small
          ></el-timeline-item
        ></el-timeline
      ></template
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
.missing-panel {
  background: #fff9ee;
  border: 1px solid #f4e4c7;
  border-radius: 13px;
  padding: 23px;
  margin-bottom: 22px;
}
.missing-panel h3 {
  color: #ae884d;
  font-size: 14px;
}
.missing-panel p {
  font-size: 11px;
  color: #b19b77;
  margin-top: 8px;
}
.missing-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 12px;
  color: #967d57;
}
.missing-item small {
  margin-left: 12px;
  color: #b6a588;
}
.filter-row {
  font-size: 11px;
  color: #99a5b8;
}
.filter-row input,
.native-input {
  border: 1px solid #dfe5ef;
  border-radius: 7px;
  background: white;
  color: #6c7c94;
  padding: 8px 10px;
}
.form-label {
  display: block;
  font-size: 12px;
  margin: 24px 0 10px;
}
.native-input {
  width: 100%;
}
.field-hint,
.table-hint {
  font-size: 11px;
  color: #a1adbf;
  margin-top: 16px;
  line-height: 1.8;
}
.log-sub {
  display: block;
  font-size: 10px;
  color: #a2afc1;
  margin-top: 5px;
}
:deep(.clickable) {
  cursor: pointer;
}
</style>
