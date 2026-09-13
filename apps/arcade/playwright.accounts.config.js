import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./account-tests', timeout:45000, workers:1, use:{baseURL:'http://127.0.0.1:5193',channel:'chrome',viewport:{width:1440,height:1000}}});
