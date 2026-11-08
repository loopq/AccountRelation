import express from 'express';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { setAdmin } from '../server/auth.js';
const dir=mkdtempSync(join(tmpdir(),'account-browser-'));
const store=openStore(join(dir,'account.db'));
await setAdmin(store.db,'admin@example.test','Test-browser-admin-4792!');
const app=express();
// Only this isolated test server exposes a legacy worker fixture.
app.get('/legacy-sw.js',(_req,res)=>res.type('js').send(`
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/api/state')e.respondWith(caches.match('/api/state'));});
`));
app.use(await createApp(store,{origin:'http://127.0.0.1:3107'}));
const server=app.listen(3107,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>server.close(()=>{store.db.close();rmSync(dir,{recursive:true,force:true});process.exit(0);}));
