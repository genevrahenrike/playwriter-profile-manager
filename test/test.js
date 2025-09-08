import { createProfileSystem } from '../src/index.js';
import fs from 'fs-extra';
import path from 'path';

async function runTests() {
    console.log('🧪 Running Playwright Profile Manager Tests...\n');
    
    const testDir = './test-profiles';
    
    // Clean up any existing test data
    await fs.remove(testDir);
    
    try {
        // Create profile system
        console.log('1. Creating profile system...');
        const system = createProfileSystem(testDir);
        
        // Test 1: Create profiles
        console.log('2. Creating test profiles...');
        const profile1 = await system.createProfile('test-profile-1', {
            description: 'First test profile',
            browserType: 'chromium'
        });
        
        const profile2 = await system.createProfile('test-profile-2', {
            description: 'Second test profile',
            browserType: 'chromium'
        });
        
        console.log(`   ✅ Created profile: ${profile1.name}`);
        console.log(`   ✅ Created profile: ${profile2.name}`);
        
        // Test 2: List profiles
        console.log('3. Listing profiles...');
        const profiles = await system.profileManager.listProfiles();
        console.log(`   ✅ Found ${profiles.length} profiles`);
        
        // Test 3: Clone profile
        console.log('4. Cloning profile...');
        const clonedProfile = await system.profileManager.cloneProfile('test-profile-1', 'cloned-profile');
        console.log(`   ✅ Cloned profile: ${clonedProfile.name}`);
        
        // Test 4: Rename profile
        console.log('5. Renaming profile...');
        await system.profileManager.renameProfile('test-profile-2', 'renamed-profile');
        console.log('   ✅ Profile renamed successfully');
        
        // Test 5: Launch profile (headless for testing)
        console.log('6. Launching profile...');
        const { browser, page, sessionId } = await system.launchProfile('test-profile-1', {
            headless: true
        });
        
        // Test basic functionality
        await page.goto('https://example.com');
        const title = await page.title();
        console.log(`   ✅ Launched profile and navigated to: ${title}`);
        
        // Close browser
        await system.profileLauncher.closeBrowser(sessionId);
        console.log('   ✅ Browser closed successfully');
        
        // Test 6: Check sessions
        console.log('7. Checking sessions...');
        const activeSessions = system.profileLauncher.getActiveSessions();
        console.log(`   ✅ Active sessions: ${activeSessions.length}`);
        
        // Test 7: Delete profile
        console.log('8. Deleting profile...');
        await system.profileManager.deleteProfile('cloned-profile');
        console.log('   ✅ Profile deleted successfully');
        
        // Test 8: Find Chromium profiles (if available)
        console.log('9. Scanning for Chromium profiles...');
        const chromiumProfiles = await system.chromiumImporter.findChromiumProfiles();
        console.log(`   ✅ Found ${chromiumProfiles.length} Chromium profiles`);
        
        console.log('\n🎉 All tests passed!');
        
        // Show final profile list
        const finalProfiles = await system.profileManager.listProfiles();
        console.log(`\n📊 Final profile count: ${finalProfiles.length}`);
        
        for (const profile of finalProfiles) {
            console.log(`   • ${profile.name} (${profile.browserType})`);
        }
        
        // Cleanup
        await system.cleanup();
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Clean up test data
        await fs.remove(testDir);
        console.log('\n🧹 Test cleanup completed');
    }
}

// Run tests
runTests().catch(console.error);
