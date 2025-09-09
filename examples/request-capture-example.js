#!/usr/bin/env node

/**
 * Example script demonstrating the request capture system
 * This shows how to use the ProfileLauncher with request capture enabled
 * to monitor and capture VidIQ API calls and authentication tokens.
 */

import { ProfileManager } from '../src/ProfileManager.js';
import { ProfileLauncher } from '../src/ProfileLauncher.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.join(__dirname, '..', 'profiles');

async function demonstrateRequestCapture() {
    console.log('🕸️  Request Capture System Demo');
    console.log('================================\n');

    const profileManager = new ProfileManager(baseDir);
    const profileLauncher = new ProfileLauncher(profileManager);

    try {
        // Get or create a profile for testing
        let profile;
        try {
            profile = await profileManager.getProfile('request-capture-demo');
        } catch (error) {
            console.log('📁 Creating new profile for demo...');
            profile = await profileManager.createProfile('request-capture-demo', {
                description: 'Profile for testing request capture system',
                browserType: 'chromium'
            });
        }

        console.log(`🚀 Launching profile: ${profile.name}`);
        
        // Launch browser with request capture enabled
        const launchResult = await profileLauncher.launchProfile(profile.id, {
            headless: false, // Keep visible for demo
            enableRequestCapture: true, // Enable request capture
            enableAutomation: true,
            maxStealth: true
        });

        const { sessionId, page, context } = launchResult;
        
        console.log(`✅ Browser launched with session ID: ${sessionId}`);
        console.log(`🕸️  Request capture: ${launchResult.requestCaptureEnabled ? 'ENABLED' : 'DISABLED'}`);
        
        // Display capture system status
        const captureStatus = profileLauncher.getRequestCaptureStatus();
        console.log(`\n📊 Request Capture Status:`);
        console.log(`   - Total hooks: ${captureStatus.totalHooks}`);
        console.log(`   - Active sessions: ${captureStatus.activeSessions}`);
        console.log(`   - Output directory: ${captureStatus.outputDirectory}`);
        
        if (captureStatus.hooks.length > 0) {
            console.log(`   - Loaded hooks:`);
            captureStatus.hooks.forEach(hook => {
                console.log(`     * ${hook.name}: ${hook.description}`);
            });
        }

        // Navigate to VidIQ to trigger request capture
        console.log('\n🌐 Navigating to VidIQ...');
        await page.goto('https://app.vidiq.com/', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });

        console.log('⏳ Waiting for page to load and requests to be captured...');
        await page.waitForTimeout(5000);

        // Check captured requests
        let capturedRequests = profileLauncher.getCapturedRequests(sessionId);
        console.log(`\n📡 Captured ${capturedRequests.length} requests so far`);

        // Navigate to YouTube to capture extension interactions
        console.log('\n🎬 Navigating to YouTube to capture extension interactions...');
        await page.goto('https://www.youtube.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        console.log('⏳ Waiting for YouTube to load and VidIQ extension to activate...');
        await page.waitForTimeout(8000);

        // Try to search for something to trigger more API calls
        try {
            const searchInput = page.locator('input[name="search_query"]');
            if (await searchInput.isVisible({ timeout: 5000 })) {
                console.log('🔍 Performing search to trigger more API calls...');
                await searchInput.click();
                await searchInput.fill('youtube marketing tutorial');
                await page.keyboard.press('Enter');
                
                console.log('⏳ Waiting for search results and API calls...');
                await page.waitForTimeout(5000);
            }
        } catch (error) {
            console.log('⚠️  Could not perform search, continuing...');
        }

        // Check final captured requests
        capturedRequests = profileLauncher.getCapturedRequests(sessionId);
        console.log(`\n📊 Final Results:`);
        console.log(`   - Total captured requests: ${capturedRequests.length}`);
        
        if (capturedRequests.length > 0) {
            // Show summary of captured requests
            const requestTypes = {};
            const hookNames = {};
            let authTokensFound = 0;
            
            capturedRequests.forEach(req => {
                requestTypes[req.type] = (requestTypes[req.type] || 0) + 1;
                hookNames[req.hookName] = (hookNames[req.hookName] || 0) + 1;
                
                if (req.custom && req.custom.tokens && Object.keys(req.custom.tokens).length > 0) {
                    authTokensFound++;
                }
            });
            
            console.log(`\n📈 Request Summary:`);
            console.log(`   - By type: ${JSON.stringify(requestTypes, null, 2)}`);
            console.log(`   - By hook: ${JSON.stringify(hookNames, null, 2)}`);
            console.log(`   - Requests with auth tokens: ${authTokensFound}`);
            
            // Show some example captured requests
            console.log(`\n🔍 Sample Captured Requests:`);
            capturedRequests.slice(0, 3).forEach((req, index) => {
                console.log(`   ${index + 1}. [${req.type.toUpperCase()}] ${req.url}`);
                console.log(`      Hook: ${req.hookName}`);
                console.log(`      Time: ${req.timestamp}`);
                if (req.custom && req.custom.tokens) {
                    const tokenCount = Object.keys(req.custom.tokens).length;
                    if (tokenCount > 0) {
                        console.log(`      🔑 Contains ${tokenCount} token(s)`);
                    }
                }
                console.log('');
            });
        }

        // Export captured requests
        if (capturedRequests.length > 0) {
            console.log('💾 Exporting captured requests...');
            try {
                const exportResult = await profileLauncher.exportCapturedRequests(sessionId, 'jsonl');
                if (exportResult) {
                    console.log(`✅ Exported to: ${exportResult.filePath}`);
                    console.log(`   - Format: ${exportResult.format}`);
                    console.log(`   - Count: ${exportResult.count} requests`);
                    console.log(`   - Size: ${Math.round(exportResult.size / 1024)}KB`);
                }
            } catch (error) {
                console.log(`⚠️  Export failed: ${error.message}`);
            }
        }

        // Keep browser open for manual inspection
        console.log('\n🔍 Browser will remain open for manual inspection...');
        console.log('💡 You can:');
        console.log('   - Navigate to different pages to capture more requests');
        console.log('   - Check the ./captured-requests directory for JSONL files');
        console.log('   - Press Ctrl+C to close the browser and exit');
        
        // Keep the process alive
        process.stdin.resume();
        
        // Handle cleanup on exit
        process.on('SIGINT', async () => {
            console.log('\n🧹 Cleaning up...');
            try {
                await profileLauncher.closeBrowser(sessionId);
                console.log('✅ Browser closed and data exported');
            } catch (error) {
                console.log(`⚠️  Cleanup error: ${error.message}`);
            }
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Demo failed:', error.message);
        process.exit(1);
    }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateRequestCapture().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}
