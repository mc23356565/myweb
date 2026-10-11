#!/usr/bin/env node
/**
 * 校验 data/ 下的数据文件是否健康。
 *
 * 用法：
 *   node scripts/verify-journal.mjs                    校验全部已知数据文件
 *   node scripts/verify-journal.mjs data/journal.json  只校验一个文件（按文件名自动匹配规则）
 *
 * 任何问题都会打印出来并以退出码 1 结束，方便在 GitHub Actions 里当守门员，
 * 也方便本地提交前一键体检。
 */
import { readFileSync, existsSync } from 'node:fs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

// 每种数据文件自己声明的额外字段
const SCHEMAS = {
  'data/journal.json': {
    label: '日记',
    fields: [{ key: 'mood', type: 'string', required: false }]
  },
  'data/philosophy.json': {
    label: '思辨话题',
    fields: [{ key: 'title', type: 'string', required: true }]
  }
};

function isRealDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function verify(file, schema) {
  const problems = [];
  const warns = [];
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    return { file, hard: `读不到文件（${err.message}）` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { file, hard: `不是合法 JSON：${err.message}` };
  }
  if (data.version !== 1) warns.push(`version 字段是 ${JSON.stringify(data.version)}，预期 1`);
  if (!Array.isArray(data.entries)) return { file, hard: '缺少 entries 数组' };

  const seen = new Set();
  let chars = 0;
  const dates = [];

  data.entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (!e || typeof e !== 'object') { problems.push(`${at} 不是对象`); return; }
    if (typeof e.id !== 'string' || !e.id.trim()) problems.push(`${at} 缺少 id`);
    else if (seen.has(e.id)) problems.push(`${at} id 重复：${e.id}`);
    else seen.add(e.id);

    if (!isRealDate(e.date)) problems.push(`${at} 日期不合法：${JSON.stringify(e.date)}`);
    else dates.push(e.date);

    for (const f of schema.fields) {
      const v = e[f.key];
      if (v === undefined || v === null) {
        if (f.required) problems.push(`${at} 缺少字段 ${f.key}`);
        continue;
      }
      if (typeof v !== f.type) problems.push(`${at} 字段 ${f.key} 类型应为 ${f.type}`);
      else if (f.required && !v.trim()) problems.push(`${at} 字段 ${f.key} 为空`);
    }
    if (typeof e.content !== 'string' || !e.content.trim()) problems.push(`${at} 正文为空`);
    else chars += e.content.length;

    for (const key of ['createdAt', 'updatedAt']) {
      if (e[key] !== undefined && (typeof e[key] !== 'string' || !STAMP_RE.test(e[key]))) {
        warns.push(`${at} ${key} 格式看着不太对：${JSON.stringify(e[key])}`);
      }
    }
  });

  dates.sort();
  return {
    file, schema, problems, warns,
    summary: [
      `${(raw.length / 1024).toFixed(1)} KB`,
      `${data.entries.length} 条`,
      `正文合计 ${chars} 字`,
      dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '无日期'
    ].join(' · ')
  };
}

const arg = process.argv[2];
const targets = arg ? [arg] : Object.keys(SCHEMAS);

let failed = 0;
for (const file of targets) {
  const schema = SCHEMAS[file] || { label: '未知', fields: [] };
  if (!arg && !existsSync(file)) {
    console.log(`- 跳过 ${file}（文件不存在）`);
    continue;
  }
  const r = verify(file, schema);
  console.log(`\n[${schema.label}] ${file}`);
  if (r.hard) {
    console.error(`✗ ${r.hard}`);
    failed++;
    continue;
  }
  console.log(`  ${r.summary}`);
  r.warns.forEach(w => console.log(`  ! 提醒：${w}`));
  if (r.problems.length) {
    console.error(`  ✗ 发现 ${r.problems.length} 个问题：`);
    r.problems.forEach(p => console.error(`    - ${p}`));
    failed++;
  } else {
    console.log('  ✓ 校验通过');
  }
}

if (failed) {
  console.error(`\n共 ${failed} 个文件未通过校验`);
  process.exit(1);
}
console.log('\n全部数据文件校验通过 ✓');
