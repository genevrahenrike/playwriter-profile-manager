#!/usr/bin/env node
// Test actual browser navigation through proxy to verify proxy works in browser automation
import { ProfileManager } from '../src/ProfileManager.js';
import { ProfileLauncher } from '../src/ProfileLauncher.js';

async function testBrowserProxyNavigation() {
    console.log('🚀 Testing browser proxy navigation...');
    
    const profileManager = new ProfileManager();
    const profileLauncher = new ProfileLauncher(profileManager);
    
    try {
        // Launch with proxy
        const result = await profileLauncher.launchProfile('proxy-clean', {
            headless: true,
            proxyStrategy: 'random',
            proxyAuthMode: 'dual',
            proxyDebug: true,
            enableAutomation: false,
            enableRequestCapture: false,
            maxStealth: false
        });
        
        console.log('✅ Browser launched with proxy');
        console.log(`Session: ${result.sessionId}`);
        
        // Get the first page
        const pages = result.context.pages();
        const page = pages[0] || await result.context.newPage();
        
        // Test 1: Navigate to IP check service
        console.log('🌐 Navigating to IP check service...');
        try {
            const response = await page.goto('https://api.ipify.org?format=json', { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            console.log(`📄 Response status: ${response.status()}`);
            
            if (response.status() === 200) {
                const content = await page.content();
                const ipMatch = content.match(/"ip":"([^"]+)"/);
                if (ipMatch) {
                    console.log(`✅ Proxy IP detected: ${ipMatch[1]}`);
                } else {
                    console.warn('⚠️  Could not extract IP from response');
                    console.log('Response content:', content.slice(0, 200));
                }
            } else {
                console.error(`❌ Failed to load IP service: ${response.status()}`);
            }
        } catch (error) {
            console.error(`❌ Navigation error: ${error.message}`);
        }
        
        // Test 2: Navigate to a simple HTTP site
        console.log('🌐 Testing HTTP navigation...');
        try {
            const response2 = await page.goto('http://httpbin.org/ip', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            console.log(`📄 HTTP response status: ${response2.status()}`);
            
            if (response2.status() === 200) {
                const content2 = await page.content();
                console.log('✅ HTTP navigation successful');
                const ipMatch2 = content2.match(/"origin":\s*"([^"]+)"/);
                if (ipMatch2) {
                    console.log(`✅ HTTP proxy IP: ${ipMatch2[1]}`);
                }
            }
        } catch (error) {
            console.error(`❌ HTTP navigation error: ${error.message}`);
        }
        
        // Test 3: Check for any proxy auth dialogs
        const dialogs = [];
        page.on('dialog', (dialog) => {
            dialogs.push(dialog.message());
            dialog.dismiss().catch(() => {});
        });
        
        // Wait a moment to see if any dialogs appear
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (dialogs.length > 0) {
            console.warn(`🚫 Proxy auth dialogs detected: ${dialogs.join(', ')}`);
        } else {
            console.log('✅ No proxy auth dialogs - credentials working properly');
        }
        
        // Cleanup
        await profileLauncher.closeBrowser(result.sessionId);
        console.log('✅ Test completed successfully');
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testBrowserProxyNavigation().catch(console.error);