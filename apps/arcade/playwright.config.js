import {defineConfig} from '@playwright/test';
const baseURL=`http://127.0.0.1:${process.env.ARCADE_PORT||5191}`;
export default defineConfig({testDir:'./tests',timeout:45000,workers:1,use:{baseURL,channel:'chrome',viewport:{width:1440,height:1000}},webServer:{command:'npm run preview:arcade',cwd:'../..',url:baseURL,reuseExistingServer:false,timeout:15000}});
