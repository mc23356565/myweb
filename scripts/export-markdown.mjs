#!/usr/bin/env node
/** 把 data/journal.json 导出成方便阅读/存档的 Markdown（定时任务里生成备份用）。 */
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('data/journal.json', 'utf8'));
const entries = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));

const body = entries.map(e => {
  const head = `## ${e.date}${e.mood ? '　' + e.mood : ''}`;
  return `${head}\n\n${e.content}`;
}).join('\n\n---\n\n');

const out = `# 空曙 · 日常想法（导出备份）\n\n共 ${entries.length} 条，导出于 ${new Date().toISOString()}\n\n${body}\n`;
writeFileSync('journal-export.md', out);
console.log(`✓ 已导出 journal-export.md（${entries.length} 条，${(out.length / 1024).toFixed(1)} KB）`);
