import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./stats-tests',timeout:30000,workers:1,use:{baseURL:'http://127.0.0.1:5194',channel:'chrome',viewport:{width:1440,height:1000}},webServer:{command:'node apps/arcade/stats-tests/server.mjs',cwd:'../..',url:'http://127.0.0.1:5194',reuseExistingServer:false,timeout:15000}});
