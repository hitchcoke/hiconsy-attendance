import { readFileSync,writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [id,change,validation]=process.argv.slice(2);
if(!/^T\d\d$/.test(id||'')||!change||!validation) throw new Error('Usage: node scripts/finish-task.mjs Txx change validation');
const file=`docs/tasks/${id}.md`;
let s=readFileSync(file,'utf8').replace('상태: 대기','상태: 완료').replace('- 변경: 미진행',`- 변경: ${change}`).replace('- 검증: 미진행',`- 검증: ${validation}`).replace('- 남은 문제: 구현 및 검증 필요','- 남은 문제: 통합 화면·패키징 검증은 T12/T13에서 추적');
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
s+=`\n## Git\n브랜치: ${branch}\n커밋·병합 SHA는 docs/history.json에서 실제 Git 이력으로 생성한다.\n`;
writeFileSync(file,s);
