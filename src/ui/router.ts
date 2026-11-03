import { createRouter,createWebHashHistory } from 'vue-router';
import Login from './pages/Login.vue';
import Placeholder from './pages/Placeholder.vue';
export const router=createRouter({history:createWebHashHistory(),routes:[{path:'/login',component:Login},{path:'/',redirect:'/today'},{path:'/today',component:Placeholder,meta:{title:'오늘'}},{path:'/requests',component:Placeholder,meta:{title:'신청'}},{path:'/history',component:Placeholder,meta:{title:'내 근태'}},{path:'/team',component:Placeholder,meta:{title:'팀 현황',lead:true}}]});
