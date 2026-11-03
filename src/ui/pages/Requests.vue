<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { api } from '../api';
import type { WorkRequest, RequestKind, RequestOptions, Balances } from '../../shared/contracts';
import { kindLabel, datetime } from '../format';
import BalanceCards from '../components/BalanceCards.vue';
const rows = ref<WorkRequest[]>([]),
  balance = ref<Balances>(),
  loading = ref(false),
  error = ref(''),
  dialog = ref(false),
  busy = ref(false),
  formError = ref(''),
  opt = ref<RequestOptions>(),
  optLoading = ref(false),
  optError = ref('');
const form = reactive({
  kind: 'ANNUAL' as RequestKind,
  date: '',
  reason: '',
  ip: '127.0.0.1',
  startTime: '07:00',
  endTime: '20:00',
});
const types = [
  { kind: 'ANNUAL' as const, icon: '☀', hint: '연차 1일 사용' },
  { kind: 'REMOTE' as const, icon: '⌂', hint: '월 2회' },
  { kind: 'OFF' as const, icon: '◷', hint: '휴일 근무로 얻은 반일' },
  { kind: 'HOLIDAY' as const, icon: '▦', hint: '주말·공휴일 근무' },
];
async function load() {
  loading.value = true;
  error.value = '';
  try {
    [rows.value, balance.value] = await Promise.all([
      api<WorkRequest[]>('/requests'),
      api<Balances>('/balances'),
    ]);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
let seq = 0;
watch(
  () => form.date,
  async (date) => {
    const current = ++seq;
    opt.value = undefined;
    optError.value = '';
    if (!date) return;
    optLoading.value = true;
    try {
      const result = await api<RequestOptions>(`/request-options?date=${date}`);
      if (current === seq) opt.value = result;
    } catch (e) {
      if (current === seq) optError.value = (e as Error).message;
    } finally {
      if (current === seq) optLoading.value = false;
    }
  },
);
function open(kind: RequestKind = 'ANNUAL') {
  form.kind = kind;
  formError.value = '';
  dialog.value = true;
}
async function submit() {
  busy.value = true;
  formError.value = '';
  try {
    await api('/requests', form);
    dialog.value = false;
    form.reason = '';
    ElMessage.success('신청이 확정되었습니다.');
    await load();
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <h1 class="mt-small">신청</h1>
    </div>
    <el-button type="primary" :icon="Plus" @click="open()">새 신청</el-button>
  </div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" /><BalanceCards
    v-if="balance"
    :value="balance"
  />
  <div class="request-types">
    <button v-for="t in types" :key="t.kind" @click="open(t.kind)">
      <span>{{ t.icon }}</span
      ><strong>{{ kindLabel[t.kind] }}</strong
      ><small>{{ t.hint }}</small
      ><b>→</b>
    </button>
  </div>
  <section class="panel">
    <div class="panel-title">
      <h2>
        내 신청 내역 <span class="count">{{ rows.length }}</span>
      </h2>
      <el-button text :icon="Refresh" :loading="loading" @click="load">새로고침</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" empty-text="신청 내역이 없습니다."
      ><el-table-column label="사용일" prop="date" width="120" /><el-table-column
        label="종류"
        width="110"
        ><template #default="{ row }"
          ><span class="tag blue">{{ kindLabel[row.kind] }}</span></template
        ></el-table-column
      ><el-table-column
        label="사유"
        prop="reason"
        min-width="130"
        show-overflow-tooltip
      /><el-table-column label="장소 · 시간" min-width="160"
        ><template #default="{ row }"
          ><span v-if="row.ip"
            >{{ row.ip
            }}<small class="cell-sub">{{ row.startTime }} ~ {{ row.endTime }}</small></span
          ><span v-else class="muted">—</span></template
        ></el-table-column
      ><el-table-column label="상태" width="80"
        ><template #default><span class="tag green">확정</span></template></el-table-column
      ></el-table
    >
  </section>
  <div class="info-strip">
    <span>ⓘ</span>
    <p>
      모든 신청은 <strong>전 영업일 오후 5시</strong>까지 가능해요. 신청하면 잔여에서 바로 예약
      차감됩니다.
    </p>
  </div>
  <el-dialog v-model="dialog" title="새 신청" width="540px" :close-on-click-modal="!busy"
    ><form @submit.prevent="submit" class="request-form">
      <label>신청 종류</label
      ><el-select v-model="form.kind" style="width: 100%"
        ><el-option
          v-for="t in types"
          :key="t.kind"
          :label="kindLabel[t.kind]"
          :value="t.kind" /></el-select
      ><label for="request-date">사용일</label
      ><input
        id="request-date"
        v-model="form.date"
        type="date"
        required
        min="2026-01-01"
        max="2026-12-31"
      />
      <p v-if="optLoading" class="field-hint">신청 기한 확인 중…</p>
      <p v-else-if="opt" class="field-hint" :class="{ invalid: !opt.open }">
        {{ opt.business ? '영업일' : '주말·공휴일' }} · 마감 {{ datetime(opt.deadline) }}
        {{ opt.open ? '' : '(마감됨)' }}
      </p>
      <p v-if="optError" class="field-hint invalid">{{ optError }}</p>
      <template v-if="form.kind === 'REMOTE' || form.kind === 'HOLIDAY'"
        ><label for="request-ip">접속 IP</label
        ><el-input id="request-ip" v-model="form.ip" placeholder="예: 127.0.0.1" />
        <div class="time-fields">
          <div>
            <label for="start-time">시작 시각</label
            ><input id="start-time" v-model="form.startTime" type="time" required />
          </div>
          <div>
            <label for="end-time">종료 시각</label
            ><input id="end-time" v-model="form.endTime" type="time" required />
          </div>
        </div>
        <p class="field-hint">
          이 IP·시간대에서만 출퇴근할 수 있어요. 퇴근은 16:00부터 가능해요.
        </p></template
      ><label for="request-reason">사유</label
      ><el-input
        id="request-reason"
        v-model="form.reason"
        type="textarea"
        :rows="3"
        maxlength="500"
        show-word-limit
        placeholder="신청 사유를 적어 주세요"
      /><el-alert v-if="formError" :title="formError" type="error" :closable="false" class="mt" />
      <div class="dialog-actions">
        <el-button :disabled="busy" @click="dialog = false">닫기</el-button
        ><el-button
          type="primary"
          native-type="submit"
          :loading="busy"
          :disabled="!form.date || !form.reason.trim() || !opt?.open || optLoading"
          >신청 확정</el-button
        >
      </div>
    </form></el-dialog
  >
</template>
<style scoped>
.mt-small {
  margin-top: 10px;
}
.request-types {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin: 22px 0;
}
.request-types button {
  background: white;
  border: 1px solid #e7ecf3;
  border-radius: 12px;
  padding: 20px;
  text-align: left;
  position: relative;
  color: #526078;
}
.request-types button:hover {
  border-color: #98aaeb;
}
.request-types button > span {
  display: block;
  font-size: 23px;
  color: #8394cf;
  margin-bottom: 15px;
}
.request-types strong {
  display: block;
  font-size: 13px;
}
.request-types small {
  display: block;
  color: #a0aabd;
  font-size: 10px;
  margin-top: 8px;
}
.request-types b {
  position: absolute;
  right: 16px;
  top: 20px;
  color: #bdc7d9;
  font-weight: 400;
}
.count {
  font-size: 12px;
  color: #8a9ac0;
  margin-left: 8px;
}
.cell-sub {
  display: block;
  color: #97a4b9;
  margin-top: 5px;
  font-size: 10px;
}
.info-strip {
  display: flex;
  gap: 10px;
  font-size: 11px;
  line-height: 1.8;
  color: #8a97ac;
  background: #eff3fa;
  border-radius: 10px;
  padding: 16px 20px;
  margin-top: 18px;
}
.request-form label {
  display: block;
  font-size: 12px;
  margin: 18px 0 9px;
  font-weight: 600;
}
.request-form input {
  width: 100%;
  padding: 10px 12px;
  color: #475569;
  border: 1px solid #dce3ed;
  border-radius: 8px;
  background: white;
  min-height: 38px;
}
.time-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}
.field-hint {
  font-size: 11px;
  color: #8b98ae;
  margin-top: 9px;
  line-height: 1.7;
}
.field-hint.invalid {
  color: #d16e70;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 28px;
}
</style>
