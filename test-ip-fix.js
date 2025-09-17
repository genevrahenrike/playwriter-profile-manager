import fs from 'fs';
import { IPTracker } from './src/IPTracker.js';

const proxies = JSON.parse(fs.readFileSync('./proxies/http.proxies.v2.json', 'utf8'));
const testProxy = proxies.find(p => p.host === 'geo.floppydata.com');

if (!testProxy) {
    console.log('❌ Test proxy not found');
    process.exit(1);
}

const tracker = new IPTracker();
const proxyConfig = {
    server: `http://${testProxy.host}:${testProxy.port}`,
    username: testProxy.username,
    password: testProxy.password
};

console.log('🧪 Testing fixed proxy IP detection with correct credentials...');
try {
    const ip = await tracker.getCurrentIP(proxyConfig, { maxAttempts: 2 });
    console.log('✅ Success! IP detected:', ip);
} catch (error) {
    console.error('❌ Still failing:', error.message);
}