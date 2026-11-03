import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, ApiError } from './api';
import type { User, ClockInfo } from '../shared/contracts';
export const useSession = defineStore('session', () => {
  const user = ref<User | null>(null),
    clock = ref<ClockInfo | null>(null),
    ready = ref(false);
  async function login(login: string, password: string) {
    const result = await api<{ token: string; user: User }>('/auth/login', { login, password });
    sessionStorage.setItem('token', result.token);
    user.value = result.user;
    await refreshClock();
  }
  async function refreshClock() {
    clock.value = await api<ClockInfo>('/clock');
  }
  async function restore() {
    try {
      if (sessionStorage.getItem('token')) {
        user.value = await api<User>('/me');
        await refreshClock();
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHORIZED') clear();
      else throw error;
    } finally {
      ready.value = true;
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', {});
    } finally {
      sessionStorage.removeItem('token');
      user.value = null;
      clock.value = null;
    }
  }
  function clear() {
    user.value = null;
    clock.value = null;
  }
  return { user, clock, ready, login, logout, restore, clear, refreshClock };
});
