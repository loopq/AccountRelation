import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createAuth, equal } from './auth.js';
import { createPasskeys } from './passkey.js';
import * as v from './validation.js';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)),'../web');
const staticAliases = new Map([
  ['/', '/index.html'],
  ['/password-generator', '/password-generator.html'],
  ['/password-generator/', '/password-generator.html'],
]);
const staticPaths = new Set([
  ...staticAliases.keys(),
  '/index.html','/app.js','/api-client.js','/crypto.js','/theme.js','/sw.js','/manifest.webmanifest',
  '/password-generator.html','/password-generator.js',
  '/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon-180.png','/icons/icon.svg'
]);
export async function createApp(store, { origin = 'http://127.0.0.1:3000', production = false, loginLimit, sessionSeconds } = {}) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || (production && parsedOrigin.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; HTTPS required in production');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy',production ? 1 : false);
  const auth = await createAuth(store.db,{ production,loginLimit,sessionSeconds });
  const passkeys = createPasskeys(store.db,{ origin,auth });
  app.use((req,res,next) => {
    res.set({ 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" });
    if (req.path !== '/health' && req.get('host') !== parsedOrigin.host) return res.status(421).end();
    next();
  });
  app.get('/health',(_req,res) => {
    store.db.prepare('SELECT 1').get();
    res.set('Cache-Control','no-store').json({ ok:true });
  });
  app.use('/api',(req,res,next) => {
    res.set('Cache-Control','no-store');
    if (['GET','HEAD'].includes(req.method)) return next();
    if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') throw new v.HttpError(403,'请求来源不允许');
    if (!req.is('application/json')) throw new v.HttpError(415,'只接受 JSON 请求');
    next();
  },express.json({ limit:'4mb',strict:true }));
  app.get('/api/session',(req,res) => {
    const session = auth.session(req);
    res.json(session ? { authenticated:true,csrf:session.csrf,expiresAt:session.expires_at } : { authenticated:false });
  });
  app.post('/api/login',async (req,res) => res.json(await auth.login(req,res,v.parse(v.login,req.body))));
  app.post('/api/passkey/login/options',async (_req,res) => res.json(await passkeys.loginOptions()));
  app.post('/api/passkey/login',async (req,res) => res.json(await passkeys.login(req,res,req.body)));
  app.use('/api',(req,_res,next) => {
    const session = auth.session(req);
    if (!session) throw new v.HttpError(401,'请重新登录');
    if (!['GET','HEAD'].includes(req.method) && !equal(req.get('x-csrf-token'),session.csrf)) throw new v.HttpError(403,'请求校验失败');
    next();
  });
  app.post('/api/logout',(req,res) => { auth.revoke(req,res); res.json({ ok:true }); });
  app.get('/api/state',(_req,res) => res.json(store.snapshot()));
  app.post('/api/passkey/register/options',async (_req,res) => res.json(await passkeys.registerOptions()));
  app.post('/api/passkey/register',async (req,res) => res.json(await passkeys.register(req.body)));
  app.get('/api/passkeys',(_req,res) => res.json(passkeys.list()));
  app.delete('/api/passkeys/:id',(req,res) => res.json(passkeys.remove(req.params.id)));
  function mutation(schema, operation, initializing = false) {
    return (req,res) => {
      const body = v.parse(v.change.extend({ data:schema }),req.body);
      const result = store.mutate(body,() => operation(body.data,req),initializing);
      res.json(result);
    };
  }
  app.post('/api/vault/init',mutation(v.initVault,d => store.initVault(d),true));
  app.post('/api/vault/rotate',mutation(v.rotation,d => store.rotate(d)));
  app.post('/api/accounts',mutation(v.account,d => store.saveAccount(d)));
  app.post('/api/accounts/import',mutation(z.array(v.account).min(1).max(1000),rows => rows.map(row => store.saveAccount(row))));
  app.patch('/api/accounts/:id',mutation(v.account.partial(),(d,req) => store.saveAccount(d,v.parse(v.uuid,req.params.id))));
  app.delete('/api/accounts/:id',mutation(z.null(),(_d,req) => store.deleteAccount(v.parse(v.uuid,req.params.id))));
  for (const [table,schema] of [['platforms',v.platform],['countries',v.country],['devices',v.device]]) {
    app.post(`/api/${table}`,mutation(schema,d => store.saveLookup(table,d)));
    app.delete(`/api/${table}/:id`,mutation(z.null(),(_d,req) => store.deleteLookup(table,v.parse(v.uuid,req.params.id))));
  }
  app.use('/api',(_req,res) => res.status(404).json({ error:'接口不存在' }));
  app.get(/.*/,(req,res) => {
    if (!staticPaths.has(req.path)) return res.status(404).end();
    res.set('Cache-Control',req.path.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache');
    res.sendFile(resolve(webDir,'.'+(staticAliases.get(req.path) ?? req.path)));
  });
  app.use((error,_req,res,_next) => {
    const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error('request_failed',error.code || error.name);
    res.status(status).set('Cache-Control','no-store').json({ error:status>=500 ? '服务器处理失败' : error instanceof v.HttpError ? error.message : '请求格式不正确' });
  });
  return app;
}
