#!/usr/bin/env node
/** 把 data/*.json 导出成方便阅读 / 存档的 Markdown（定时任务里生成备份用）。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TARGETS = [
  { json: 'data/journal.json', out: 'journal-export.md', title: '空曙 · 日常想法' },
  { json: 'data/philosophy.json', out: 'philosophy-export.md', title: '空曙 · 思辨话题' }
];

for (const t of TARGETS) {
  if (!existsSync(t.json)) {
    console.log(`- 跳过 ${t.json}（文件不存在）`);
    continue;
  }
  const data = JSON.parse(readFileSync(t.json, 'utf8'));
  const entries = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  const body = entries.map(e => {
    const head = `## ${e.date}${e.title ? '　' + e.title : ''}${e.mood ? '　' + e.mood : ''}`;
    return `${head}\n\n${e.content}`;
  }).join('\n\n---\n\n');
  const out = `# ${t.title}（导出备份）\n\n共 ${entries.length} 条，导出于 ${new Date().toISOString()}\n\n${body}\n`;
  writeFileSync(t.out, out);
  console.log(`✓ 已导出 ${t.out}（${entries.length} 条，${(out.length / 1024).toFixed(1)} KB）`);
}
