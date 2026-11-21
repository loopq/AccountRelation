import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['server','web','scripts','test']) {
  for (const entry of readdirSync(dir)) {
    if (!/\.m?js$/.test(entry)) continue;
    const result=spawnSync(process.execPath,['--check',`${dir}/${entry}`],{ stdio:'inherit' });
    if (result.status) process.exit(result.status);
  }
}
for (const file of ['web/index.html','web/password-generator.html']) {
  const html=readFileSync(file,'utf8');
  if (/<script(?![^>]*src=)[^>]*>/.test(html)) throw new Error(`Inline scripts violate CSP in ${file}`);
  if (/supabase|publishable/i.test(html)) throw new Error(`Legacy backend remains in ${file}`);
}
console.log('JavaScript syntax and production entrypoint checks passed.');
