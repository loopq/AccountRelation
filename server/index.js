import { openStore } from './store.js';
import { createApp } from './app.js';
process.umask(0o077);
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const store = openStore(process.env.DATABASE_PATH || './data/account.db');
const app = await createApp(store,{ origin:process.env.APP_ORIGIN || `http://127.0.0.1:${port}`,production });
const server = app.listen(port,process.env.HOST || '127.0.0.1',() => console.log(`account-relation listening on ${port}`));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
for (const signal of ['SIGTERM','SIGINT']) process.once(signal,() => {
  server.close(() => { store.db.close(); process.exit(0); });
  setTimeout(() => process.exit(1),10000).unref();
});
