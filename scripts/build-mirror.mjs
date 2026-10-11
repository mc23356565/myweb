#!/usr/bin/env node
/**
 * 用 data/*.json 生成离线镜像 data/*.js。
 *
 * 为什么要有镜像：网页用 <script src="../data/journal.js"> 读取数据，
 * 这样用 file:// 双击打开（或断网）时也能正常显示，不受 fetch 跨域限制。
 *
 * 用法：
 *   node scripts/build-mirror.mjs          生成 / 更新镜像
 *   node scripts/build-mirror.mjs --check   只检查是否一致（不一致则退出码 1），CI 用
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TARGETS = [
  { json: 'data/journal.json', js: 'data/journal.js', varName: '__JOURNAL_DATA__' },
  { json: 'data/philosophy.json', js: 'data/philosophy.js', varName: '__PHILOSOPHY_DATA__' }
];

const check = process.argv.includes('--check');
let failed = 0;

for (const t of TARGETS) {
  if (!existsSync(t.json)) {
    console.log(`- 跳过 ${t.json}（文件不存在）`);
    continue;
  }
  const body = readFileSync(t.json, 'utf8').trim();
  JSON.parse(body); // 先确认是合法 JSON，避免把坏数据写进镜像
  const out = `window.${t.varName} = ${body};\n`;

  if (check) {
    let current = '';
    try { current = readFileSync(t.js, 'utf8'); } catch { /* 文件不存在 */ }
    if (current === out) {
      console.log(`✓ ${t.js} 与 ${t.json} 一致`);
    } else {
      console.error(`✗ ${t.js} 与 ${t.json} 不一致，请运行：node scripts/build-mirror.mjs`);
      failed++;
    }
    continue;
  }
  writeFileSync(t.js, out);
  console.log(`✓ 已写入 ${t.js}（${(out.length / 1024).toFixed(1)} KB）`);
}

if (failed) process.exit(1);
