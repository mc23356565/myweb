#!/usr/bin/env node
/**
 * 校验 data/journal.json 的结构是否健康。
 * 用法：node scripts/verify-journal.mjs [文件路径]
 *
 * 有任何问题都会打印出来并以退出码 1 结束，方便放在 GitHub Actions 里当守门员，
 * 也方便本地提交前一键体检。
 */
import { readFileSync } from 'node:fs';

const FILE = process.argv[2] || 'data/journal.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

const problems = [];
const warn = [];

function isRealDate(str) {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

let raw;
try {
  raw = readFileSync(FILE, 'utf8');
} catch (err) {
  console.error(`✗ 读不到文件：${FILE}（${err.message}）`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`✗ ${FILE} 不是合法 JSON：${err.message}`);
  process.exit(1);
}

if (data.version !== 1) warn.push(`version 字段是 ${JSON.stringify(data.version)}，预期 1`);
if (!Array.isArray(data.entries)) {
  console.error('✗ 缺少 entries 数组');
  process.exit(1);
}

const seen = new Set();
let chars = 0;
const dates = [];

data.entries.forEach((e, i) => {
  const at = `entries[${i}]`;
  if (!e || typeof e !== 'object') { problems.push(`${at} 不是对象`); return; }
  if (typeof e.id !== 'string' || !e.id.trim()) problems.push(`${at} 缺少 id`);
  else if (seen.has(e.id)) problems.push(`${at} id 重复：${e.id}`);
  else seen.add(e.id);

  if (typeof e.date !== 'string' || !isRealDate(e.date)) problems.push(`${at} 日期不合法：${JSON.stringify(e.date)}`);
  else dates.push(e.date);

  if (typeof e.mood !== 'string') problems.push(`${at} mood 必须是字符串（可以为空）`);
  if (typeof e.content !== 'string' || !e.content.trim()) problems.push(`${at} 正文为空`);
  else chars += e.content.length;
  if (e.content && e.content.length > 200000) warn.push(`${at} 正文特别长（${e.content.length} 字），注意单文件体积`);

  for (const key of ['createdAt', 'updatedAt']) {
    if (e[key] !== undefined && (typeof e[key] !== 'string' || !STAMP_RE.test(e[key]))) {
      warn.push(`${at} ${key} 格式看着不太对：${JSON.stringify(e[key])}`);
    }
  }
});

dates.sort();
console.log(`文件：${FILE}（${(raw.length / 1024).toFixed(1)} KB）`);
console.log(`条目：${data.entries.length} 条 · 正文合计 ${chars} 字`);
if (dates.length) console.log(`日期范围：${dates[0]} → ${dates[dates.length - 1]}`);
if (data.updatedAt) console.log(`updatedAt：${data.updatedAt}`);
warn.forEach(w => console.log(`! 提醒：${w}`));

if (problems.length) {
  console.error(`\n✗ 发现 ${problems.length} 个问题：`);
  problems.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('\n✓ 校验通过');
