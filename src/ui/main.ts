import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import ko from 'element-plus/es/locale/lang/ko';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { router } from './router';
import './style.css';
createApp(App).use(createPinia()).use(router).use(ElementPlus,{locale:ko}).mount('#app');
