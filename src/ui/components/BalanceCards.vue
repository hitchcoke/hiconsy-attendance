<script setup lang="ts">
import { ref } from 'vue';
import type { Balances } from '../../shared/contracts';
defineProps<{ value: Balances }>();
const detail = ref(false);
</script>
<template>
  <div class="balance-grid">
    <button class="balance-card" @click="detail = true">
      <span class="balance-icon purple">☀</span>
      <div>
        <small>남은 연차</small><strong>{{ value.annual }}<em>일</em></strong>
        <p>예약 {{ value.reservedAnnual }}일 · 입사일 기준 적립</p>
      </div>
      <span class="card-arrow">↗</span></button
    ><button class="balance-card" @click="detail = true">
      <span class="balance-icon blue">⌂</span>
      <div>
        <small>이번 달 재택</small><strong>{{ value.remote }}<em>회</em></strong>
        <p>월 2회 · 다음 달로 이월되지 않아요</p>
      </div>
      <span class="card-arrow">↗</span></button
    ><button class="balance-card" @click="detail = true">
      <span class="balance-icon peach">◷</span>
      <div>
        <small>사용 가능한 OFF</small><strong>{{ value.off }}<em>개</em></strong>
        <p>
          {{
            value.expiring.length
              ? `${value.expiring[0].date} 만료 예정`
              : '휴일 근무 후 반일 OFF가 지급돼요'
          }}
        </p>
      </div>
      <span class="card-arrow">↗</span>
    </button>
  </div>
  <el-drawer v-model="detail" title="지급·사용 내역" size="480px"
    ><p class="muted">신청 시 잔여에서 예약 차감됩니다. OFF는 사용일까지 유효해야 합니다.</p>
    <el-table :data="value.entries" class="mt" empty-text="아직 지급·사용 내역이 없어요"
      ><el-table-column prop="grantedDate" label="발생일" width="112" /><el-table-column
        label="종류"
        width="70"
        ><template #default="{ row }">{{
          row.kind === 'ANNUAL' ? '연차' : 'OFF'
        }}</template></el-table-column
      ><el-table-column label="수량" width="65"
        ><template #default="{ row }"
          >{{ row.amount > 0 ? '+' : '' }}{{ row.amount }}</template
        ></el-table-column
      ><el-table-column prop="expiresDate" label="만료일" /></el-table
  ></el-drawer>
</template>
<style scoped>
.balance-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 17px;
  margin: 22px 0;
}
.balance-card {
  display: flex;
  gap: 15px;
  background: white;
  border: 1px solid #e7ecf3;
  border-radius: 14px;
  padding: 22px;
  text-align: left;
  position: relative;
  color: inherit;
  transition: border-color 0.2s;
}
.balance-card:hover {
  border-color: #aab8ed;
}
.balance-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 12px;
  font-size: 22px;
}
.purple {
  background: #f2efff;
  color: #9a87d5;
}
.blue {
  background: #edf3ff;
  color: #6b91db;
}
.peach {
  background: #fff3e8;
  color: #d29e6a;
}
.balance-card small {
  font-size: 11px;
  color: #929cb0;
}
.balance-card strong {
  display: block;
  font-size: 27px;
  font-weight: 650;
  line-height: 1.8;
}
.balance-card em {
  font-size: 12px;
  font-weight: 400;
  font-style: normal;
  color: #929eb2;
  margin-left: 5px;
}
.balance-card p {
  font-size: 9px;
  color: #9aa5b7;
  line-height: 1.6;
}
.card-arrow {
  color: #c4cdde;
  margin-left: auto;
  font-size: 15px;
}
@media (max-width: 1080px) {
  .balance-card {
    padding: 17px;
    gap: 10px;
  }
  .balance-icon {
    width: 28px;
    height: 28px;
    font-size: 18px;
  }
  .balance-card p {
    font-size: 9px;
  }
}
@media (max-width: 900px) {
  .balance-grid {
    gap: 10px;
  }
  .balance-card {
    padding: 14px;
  }
  .balance-icon {
    display: none;
  }
}
</style>
