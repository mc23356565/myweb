#!/usr/bin/env node
/**
 * 用 data/journal.json 生成离线镜像 data/journal.js。
 *
 * 为什么要有镜像：网页用 <script src="../data/journal.js"> 读取数据，
 * 这样用 file:// 双击打开（或断网）时也能正常显示，不受 fetch 跨域限制。
 *
 * 用法：
 *   node scripts/build-mirror.mjs          生成/更新镜像
 *   node scripts/build-mirror.mjs --check  只检查是否一致（不一致则退出码 1），CI 用
 */
import { readFileSync, writeFileSync } from 'node:fs';

const JSON_FILE = 'data/journal.json';
const JS_FILE = 'data/journal.js';

const body = readFileSync(JSON_FILE, 'utf8').trim();
JSON.parse(body); // 先确认它是合法 JSON，避免把坏数据写进镜像

const out = `window.__JOURNAL_DATA__ = ${body};\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(JS_FILE, 'utf8'); } catch { /* 文件不存在 */ }
  if (current === out) {
    console.log('✓ 镜像 data/journal.js 与 data/journal.json 一致');
    process.exit(0);
  }
  console.error('✗ 镜像 data/journal.js 与 data/journal.json 不一致，请运行：node scripts/build-mirror.mjs');
  process.exit(1);
}

writeFileSync(JS_FILE, out);
console.log(`✓ 已写入 ${JS_FILE}（${(out.length / 1024).toFixed(1)} KB）`);
