import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./test',testMatch:'browser.spec.js',workers:1,timeout:60000,
  use:{baseURL:'http://localhost:3107',headless:true,actionTimeout:10000,screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:[['list'],['json',{outputFile:'docs/agents/browser-test-results.json'}]],
  webServer:{command:'node test/browser-server.js',url:'http://127.0.0.1:3107/health',reuseExistingServer:false,timeout:30000},
});
