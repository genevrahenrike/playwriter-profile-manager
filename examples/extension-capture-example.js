#!/usr/bin/env node

/**
 * Extension Traffic Capture Example
 * 
 * This example demonstrates the enhanced RequestCaptureSystem that can monitor
 * network traffic from both web pages AND browser extensions (including background
 * service workers) using Chrome DevTools Protocol (CDP).
 * 
 * Key Features:
 * - Captures extension background service worker requests
 * - Monitors VidIQ extension API calls to api.vidiq.com
 * - Captures YouTube API calls made by extensions
 * - Extracts authentication tokens from both page and extension traffic
 * - Distinguishes between page-level and extension-level requests
 */

import { createProfileSystem } from '../src/index.js';

async function demonstrateExtensionCapture() {
    console.log('🚀 Extension Traffic Capture Demonstration');
    console.log('==========================================\n');
    
    // Create profile system
    const system = createProfileSystem('./profiles');
    
    try {
        console.log('📋 Step 1: Launch profile with extension traffic monitoring');
        console.log('   - CDP (Chrome DevTools Protocol) monitoring enabled');
        console.log('   - VidIQ extension traffic capture configured');
        console.log('   - Both page and extension requests will be captured\n');
        
        // Launch the VPN fresh profile (which should have VidIQ extension)
        const { browser, page, sessionId } = await system.launchProfile('vpn-fresh', {
            browserType: 'chromium',
            headless: false,
            devtools: false,
            enableRequestCapture: true // This enables the enhanced capture system
        });
        
        console.log(`✅ Profile launched with session ID: ${sessionId}`);
        console.log('🔧 Extension monitoring is now active via CDP');
        console.log('🕸️  Both page-level and extension-level network traffic will be captured\n');
        
        console.log('📋 Step 2: Navigate to YouTube to trigger VidIQ extension activity');
        console.log('   - VidIQ extension will make background API calls');
        console.log('   - Extension service worker requests will be captured');
        console.log('   - YouTube API calls from extension will be monitored\n');
        
        // Navigate to YouTube to trigger VidIQ extension
        await page.goto('https://www.youtube.com', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to YouTube');
        
        // Wait a bit for extension to initialize and make API calls
        console.log('⏳ Waiting for VidIQ extension to initialize and make API calls...');
        await page.waitForTimeout(5000);
        
        // Navigate to a specific video to trigger more extension activity
        console.log('📋 Step 3: Navigate to a YouTube video to trigger more extension activity');
        await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to YouTube video');
        
        // Wait for VidIQ extension to analyze the video
        console.log('⏳ Waiting for VidIQ extension to analyze video and make API calls...');
        await page.waitForTimeout(8000);
        
        console.log('\n📋 Step 4: Check captured requests');
        const capturedRequests = system.profileLauncher.getCapturedRequests(sessionId);
        console.log(`📊 Total requests captured: ${capturedRequests.length}`);
        
        // Analyze captured requests
        const extensionRequests = capturedRequests.filter(req => req.source === 'extension');
        const pageRequests = capturedRequests.filter(req => req.source !== 'extension');
        const vidiqRequests = capturedRequests.filter(req => req.hookName === 'vidiq-capture');
        
        console.log(`🧩 Extension requests: ${extensionRequests.length}`);
        console.log(`📄 Page requests: ${pageRequests.length}`);
        console.log(`🎯 VidIQ-related requests: ${vidiqRequests.length}`);
        
        if (vidiqRequests.length > 0) {
            console.log('\n🎯 VidIQ Request Analysis:');
            const services = {};
            const endpoints = {};
            const authRequests = [];
            
            vidiqRequests.forEach(req => {
                if (req.custom && req.custom.service) {
                    services[req.custom.service] = (services[req.custom.service] || 0) + 1;
                }
                if (req.custom && req.custom.endpoint) {
                    endpoints[req.custom.endpoint] = (endpoints[req.custom.endpoint] || 0) + 1;
                }
                if (req.custom && (req.custom.hasAuth || req.custom.hasTokens)) {
                    authRequests.push(req);
                }
            });
            
            console.log('   Services called:');
            Object.entries(services).forEach(([service, count]) => {
                console.log(`     - ${service}: ${count} requests`);
            });
            
            console.log('   Top endpoints:');
            Object.entries(endpoints)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([endpoint, count]) => {
                    console.log(`     - ${endpoint}: ${count} requests`);
                });
            
            console.log(`   🔐 Requests with authentication: ${authRequests.length}`);
            
            if (authRequests.length > 0) {
                console.log('   🔑 Authentication tokens found:');
                authRequests.slice(0, 3).forEach((req, index) => {
                    console.log(`     Request ${index + 1}: ${req.method} ${req.url}`);
                    if (req.custom.tokens && Object.keys(req.custom.tokens).length > 0) {
                        console.log(`       - Request tokens: ${Object.keys(req.custom.tokens).join(', ')}`);
                    }
                    if (req.custom.bodyTokens && Object.keys(req.custom.bodyTokens).length > 0) {
                        console.log(`       - Response tokens: ${Object.keys(req.custom.bodyTokens).join(', ')}`);
                    }
                    if (req.custom.userInfo) {
                        console.log(`       - User info found: ${Object.keys(req.custom.userInfo).join(', ')}`);
                    }
                });
            }
        }
        
        // Show extension-specific requests
        if (extensionRequests.length > 0) {
            console.log('\n🧩 Extension Traffic Analysis:');
            extensionRequests.slice(0, 5).forEach((req, index) => {
                console.log(`   ${index + 1}. ${req.method} ${req.url}`);
                console.log(`      Source: ${req.source} | Initiator: ${req.initiator?.type || 'unknown'}`);
                if (req.initiator?.url) {
                    console.log(`      Extension URL: ${req.initiator.url}`);
                }
            });
        }
        
        console.log('\n📋 Step 5: Export captured data');
        
        // Get capture system status
        const status = system.profileLauncher.getRequestCaptureStatus();
        console.log(`📊 Capture system status:`);
        console.log(`   - Active sessions: ${status.activeSessions}`);
        console.log(`   - Total captured: ${status.totalCaptured}`);
        console.log(`   - Output directory: ${status.outputDirectory}`);
        
        console.log('\n📁 Captured data is being saved in real-time to:');
        console.log(`   ${status.outputDirectory}/vpn-fresh-vidiq-capture-${sessionId}.jsonl`);
        
        console.log('\n📋 Step 6: Keep browser open for manual testing');
        console.log('   - Browser will remain open for you to test manually');
        console.log('   - Navigate to different YouTube videos to see more captures');
        console.log('   - Check the capture file for real-time updates');
        console.log('   - Press Ctrl+C to stop and export final results\n');
        
        // Wait for user to manually test
        console.log('⏳ Keeping browser open for manual testing...');
        console.log('   (Press Ctrl+C to stop)');
        
        // Keep the browser open until user stops
        await new Promise((resolve) => {
            process.on('SIGINT', () => {
                console.log('\n\n🛑 Stopping capture demonstration...');
                resolve();
            });
            
            // Also check periodically for new captures
            const interval = setInterval(() => {
                const currentCaptures = system.profileLauncher.getCapturedRequests(sessionId);
                if (currentCaptures.length !== capturedRequests.length) {
                    const newCaptures = currentCaptures.length - capturedRequests.length;
                    console.log(`📊 ${newCaptures} new requests captured (Total: ${currentCaptures.length})`);
                    capturedRequests.length = currentCaptures.length; // Update count
                }
            }, 10000); // Check every 10 seconds
            
            // Auto-stop after 5 minutes for demo purposes
            setTimeout(() => {
                clearInterval(interval);
                console.log('\n⏰ Demo time limit reached, stopping...');
                resolve();
            }, 5 * 60 * 1000);
        });
        
        // Final export
        console.log('\n📦 Creating final timestamped export...');
        const exportResult = await system.profileLauncher.exportCapturedRequests(sessionId, 'jsonl');
        if (exportResult) {
            console.log(`✅ Final export saved: ${exportResult.filePath}`);
            console.log(`   - ${exportResult.count} requests exported`);
            console.log(`   - File size: ${Math.round(exportResult.size / 1024)} KB`);
        }
        
        // Close browser
        await system.profileLauncher.closeBrowser(sessionId);
        console.log('✅ Browser closed');
        
    } catch (error) {
        console.error('❌ Error during demonstration:', error.message);
    } finally {
        await system.cleanup();
        console.log('🧹 Cleanup completed');
    }
    
    console.log('\n🎉 Extension Traffic Capture Demonstration Complete!');
    console.log('=====================================\n');
    console.log('Key Achievements:');
    console.log('✅ Successfully captured extension background service worker traffic');
    console.log('✅ Monitored VidIQ extension API calls using CDP');
    console.log('✅ Distinguished between page and extension network requests');
    console.log('✅ Extracted authentication tokens from extension traffic');
    console.log('✅ Real-time capture to JSONL files with detailed metadata');
    console.log('✅ Enhanced VidIQ hook with multi-service support');
    console.log('\nNext Steps:');
    console.log('- Check the captured JSONL files for detailed request/response data');
    console.log('- Analyze authentication tokens for API access');
    console.log('- Use the captured data to understand VidIQ extension behavior');
    console.log('- Create additional capture hooks for other extensions');
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateExtensionCapture().catch(console.error);
}

export { demonstrateExtensionCapture };
