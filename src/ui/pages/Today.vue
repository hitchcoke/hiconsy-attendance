<script setup lang="ts">
import { onMounted,ref } from 'vue';import { api } from '../api';import type { Balances } from '../../shared/contracts';import BalanceCards from '../components/BalanceCards.vue';
const value=ref<Balances>(),error=ref('');async function load(){try{value.value=await api<Balances>('/balances');}catch(e){error.value=(e as Error).message;}}onMounted(load);
</script>
<template><div class="page-heading"><div><h1>오늘의 워크스페이스</h1><p class="muted">나의 근무와 휴식을 한눈에 확인하세요.</p></div></div><el-alert v-if="error" :title="error" type="error"/><BalanceCards v-if="value" :value="value"/><el-skeleton v-else :rows="3" animated/></template>
