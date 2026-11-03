<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import type { ApprovalItem, RequestStatus } from '../../shared/contracts';
import { api } from '../api';
import { useSession } from '../store';
import { datetime, kindLabel, requestStatusLabel } from '../format';
const session = useSession();
const rows = ref<ApprovalItem[]>([]),
  loading = ref(false),
  error = ref(''),
  filter = ref('PENDING');
const selected = ref<ApprovalItem>(),
  dialog = ref(false),
  reason = ref(''),
  busy = ref(false),
  formError = ref('');
const filters = [
  { value: 'PENDING', label: '승인 대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
  { value: 'ALL', label: '전체' },
];
const visible = computed(() =>
  rows.value.filter((r) => filter.value === 'ALL' || r.status === filter.value),
);
const reviewable = computed(
  () => selected.value?.status === 'PENDING' && selected.value.userId !== session.user?.id,
);
async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api<ApprovalItem[]>('/approvals');
    if (selected.value) selected.value = rows.value.find((r) => r.id === selected.value!.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
function open(row: ApprovalItem) {
  selected.value = row;
  reason.value = '';
  formError.value = '';
  dialog.value = true;
}
async function review(decision: Exclude<RequestStatus, 'PENDING'>) {
  if (!selected.value || busy.value) return;
  formError.value = '';
  if (decision === 'REJECTED' && !reason.value.trim()) {
    formError.value = '반려 사유를 입력해 주세요.';
    return;
  }
  const label = decision === 'APPROVED' ? '승인' : '반려';
  try {
    await ElMessageBox.confirm(
      `${selected.value.applicant.name} · ${selected.value.date} · ${kindLabel[selected.value.kind]} 신청을 ${label}하시겠어요?`,
      `휴가 ${label}`,
      {
        confirmButtonText: `${label} 처리`,
        cancelButtonText: '돌아가기',
        type: decision === 'REJECTED' ? 'warning' : 'info',
      },
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    await api(`/requests/${selected.value.id}/review`, { decision, reason: reason.value.trim() });
    dialog.value = false;
    ElMessage.success(`${label}했습니다.`);
    await load();
  } catch (e) {
    await load();
    formError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <h1>휴가 승인</h1>
    <el-button :icon="Refresh" :loading="loading" @click="load">새로고침</el-button>
  </div>
  <p class="approval-guide">팀원 연차·반차를 검토합니다. 반려하면 예약한 잔여가 반환됩니다.</p>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb" />
  <section class="panel" v-loading="loading">
    <el-tabs v-model="filter"
      ><el-tab-pane
        v-for="item in filters"
        :key="item.value"
        :name="item.value"
        :label="`${item.label} (${rows.filter((r) => item.value === 'ALL' || r.status === item.value).length})`"
    /></el-tabs>
    <el-table :data="visible" empty-text="해당 상태의 휴가 신청이 없습니다.">
      <el-table-column label="신청자" min-width="85"
        ><template #default="{ row }"
          >{{ row.applicant.name
          }}<small v-if="row.applicant.role === 'LEAD'" class="cell-note"
            >리드 · 자동 확정</small
          ></template
        ></el-table-column
      >
      <el-table-column prop="date" label="사용일" width="100" />
      <el-table-column label="종류" width="90"
        ><template #default="{ row }">{{ kindLabel[row.kind] }}</template></el-table-column
      >
      <el-table-column prop="reason" label="사유" min-width="100" show-overflow-tooltip />
      <el-table-column label="상태" width="90"
        ><template #default="{ row }"
          ><span
            class="tag"
            :class="{
              orange: row.status === 'PENDING',
              green: row.status === 'APPROVED',
              red: row.status === 'REJECTED',
            }"
            >{{ requestStatusLabel[row.status] }}</span
          ></template
        ></el-table-column
      >
      <el-table-column label="처리" width="76"
        ><template #default="{ row }"
          ><el-button
            size="small"
            :type="row.status === 'PENDING' ? 'primary' : 'default'"
            @click="open(row)"
            >{{ row.status === 'PENDING' ? '검토' : '상세' }}</el-button
          ></template
        ></el-table-column
      >
    </el-table>
  </section>
  <el-dialog
    v-model="dialog"
    title="휴가 신청 검토"
    align-center
    width="520px"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <template v-if="selected">
      <dl class="review-summary">
        <dt>신청자</dt>
        <dd>{{ selected.applicant.name }}</dd>
        <dt>사용일</dt>
        <dd>{{ selected.date }} · {{ kindLabel[selected.kind] }}</dd>
        <dt>신청 사유</dt>
        <dd class="review-reason">{{ selected.reason }}</dd>
        <dt>접수</dt>
        <dd>{{ datetime(selected.createdAt) }}</dd>
        <dt>상태</dt>
        <dd>{{ requestStatusLabel[selected.status] }}</dd>
      </dl>
      <template v-if="reviewable">
        <el-alert
          v-if="!selected.canApprove"
          :title="selected.approvalBlockedReason"
          type="warning"
          :closable="false"
          class="mb"
        />
        <label for="review-note" class="review-label"
          >처리 사유 <span class="muted">반려 시 필수</span></label
        >
        <el-input
          id="review-note"
          v-model="reason"
          @input="formError = ''"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          :disabled="busy"
          placeholder="신청자에게 전달할 사유"
        />
      </template>
      <div v-else-if="selected.reviewedAt" class="review-result">
        <p>{{ datetime(selected.reviewedAt) }} 처리</p>
        <p>{{ selected.reviewNote || '처리 사유 없음' }}</p>
      </div>
      <el-alert v-if="formError" :title="formError" type="error" :closable="false" class="mt" />
    </template>
    <template #footer
      ><el-button :disabled="busy" @click="dialog = false">닫기</el-button
      ><template v-if="reviewable"
        ><el-button type="danger" plain :disabled="busy" @click="review('REJECTED')">반려</el-button
        ><el-button
          type="primary"
          :loading="busy"
          :disabled="!selected?.canApprove || busy"
          @click="review('APPROVED')"
          >승인</el-button
        ></template
      ></template
    >
  </el-dialog>
</template>
<style scoped>
.approval-guide {
  margin: -8px 0 24px;
  color: #65748b;
  font-size: 13px;
  line-height: 1.7;
}
.mb {
  margin-bottom: 18px;
}
.cell-note {
  display: block;
  margin-top: 4px;
  color: #75839a;
  font-size: 10px;
}
.review-summary {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 16px;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 24px;
}
.review-summary dt {
  color: #718096;
}
.review-summary dd {
  margin: 0;
  color: #334155;
  min-width: 0;
  overflow-wrap: anywhere;
}
.review-reason,
.review-result {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.review-label {
  display: block;
  font-size: 12px;
  margin-bottom: 10px;
}
.review-label span {
  margin-left: 8px;
}
.review-result {
  padding: 14px;
  background: #f5f7fb;
  border-radius: 8px;
  color: #526078;
}
</style>
