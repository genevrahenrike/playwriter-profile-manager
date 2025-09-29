#!/usr/bin/env node
// Test custom proxy file option functionality
import { ProfileLauncher } from '../src/ProfileLauncher.js';
import { ProfileManager } from '../src/ProfileManager.js';
import path from 'path';

async function testCustomProxyFile() {
    console.log('🧪 Testing custom proxy file option...');
    
    const customProxyPath = './proxies/floppydata-https-proxies-US-100-res.txt';
    
    try {
        const profileManager = new ProfileManager();
        const profileLauncher = new ProfileLauncher(profileManager, {
            customProxyFile: customProxyPath
        });
        
        await profileLauncher.ensureProxiesLoaded();
        
        const allProxies = profileLauncher.proxyManager.getAllProxies();
        console.log(`✅ Loaded ${allProxies.total} proxies from custom file`);
        console.log(`   HTTP: ${allProxies.http.length}, SOCKS5: ${allProxies.socks5.length}`);
        
        if (allProxies.total > 0) {
            const proxy = profileLauncher.proxyManager.getRandomProxy();
            console.log(`🎯 Sample proxy: ${proxy.label} - ${proxy.host}:${proxy.port}`);
        }
        
        console.log('✅ Custom proxy file test successful');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testCustomProxyFile().catch(console.error);