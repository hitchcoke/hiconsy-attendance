import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const ref = process.argv[2] || 'main';
const head = git('rev-parse', ref);
const repository = git('remote', 'get-url', 'origin').replace(/\.git$/, '');
const commits = git(
  'log',
  '--reverse',
  '--topo-order',
  '--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s',
  head,
)
  .split('\n')
  .map((line) => {
    const [sha, parentText, author, date, subject] = line.split('\x1f');
    const parents = parentText ? parentText.split(' ') : [];
    return { sha, parents, author, date, subject, merge: parents.length > 1 };
  });
const branches = git(
  'for-each-ref',
  '--format=%(refname:short)%09%(objectname)',
  'refs/heads/task/',
)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [name, sha] = line.split('\t');
    return { name, sha };
  });
const tasks = [...new Set(branches.map((b) => b.name.match(/T\d\d/)?.[0]).filter(Boolean))]
  .sort()
  .map((id) => ({
    id,
    branches: branches.filter((b) => b.name.includes('/' + id + '-')),
    commits: commits
      .filter((c) => c.subject.includes('(' + id + ')') && !c.merge)
      .map((c) => c.sha),
    merges: commits.filter((c) => c.subject.includes('(' + id + ')') && c.merge).map((c) => c.sha),
  }));
const data = {
  generatedAt: new Date().toISOString(),
  repository,
  ref,
  head,
  tasks,
  branches,
  commits,
};
writeFileSync('docs/history.json', JSON.stringify(data, null, 2) + '\n');
const link = (sha) => `[${sha.slice(0, 7)}](${repository}/commit/${sha})`;
const lines = [
  '# Git 작업 이력',
  '',
  `기준: ${link(head)}. 실제 Git에서 생성한 스냅샷이며, 이 문서를 저장하는 후속 커밋은 다음 생성 때 포함된다.`,
  '',
  '`npm run history:export`로 main의 이력을 다시 추출한다. task 브랜치는 삭제하지 않고 유지한다.',
  '',
  '| Task | 브랜치 | 기능 커밋 | 병합 커밋 |',
  '|---|---|---|---|',
  ...tasks.map(
    (t) =>
      `| [${t.id}](tasks/${t.id}.md) | ${t.branches.map((b) => b.name).join(', ')} | ${t.commits.map(link).join(', ') || '—'} | ${t.merges.map(link).join(', ') || '—'} |`,
  ),
  '',
  '## 그래프',
  '',
  '```text',
  git('log', '--graph', '--format=%h %s', head),
  '```',
  '',
  '[원본 JSON](history.json)은 전체 SHA, 부모 커밋, 작성자, 날짜, 제목, 브랜치와 Task 연결을 포함한다.',
  '',
];
writeFileSync('docs/history.md', lines.join('\n'));
console.log(`Exported ${commits.length} commits, ${tasks.length} tasks at ${head.slice(0, 7)}`);
