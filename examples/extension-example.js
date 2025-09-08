#!/usr/bin/env node

/**
 * Example: Launching profiles with extension support
 * 
 * This example demonstrates different ways to handle extensions:
 * 1. Enable manual extension installation
 * 2. Load specific extensions programmatically
 * 3. Launch with imported extensions
 */

import { createProfileSystem } from '../src/index.js';
import path from 'path';

async function main() {
    const system = createProfileSystem('./profiles');

    try {
        // Example 1: Launch with manual extension installation (enabled by default)
        console.log('=== Example 1: Manual Extension Installation ===');
        const { sessionId: session1 } = await system.launchProfile('my-profile', {
            devtools: true
            // Note: enableExtensionInstall is true by default
        });
        
        console.log('Browser launched with extension installation enabled.');
        console.log('You can now:');
        console.log('1. Navigate to chrome://extensions/');
        console.log('2. Enable Developer Mode');
        console.log('3. Install extensions manually');
        console.log('Press Enter to continue to next example...');
        
        // Wait for user input (in real usage, you'd do your automation here)
        process.stdin.once('data', async () => {
            await system.profileLauncher.closeBrowser(session1);
            
            // Example 2: Load specific extensions
            console.log('\n=== Example 2: Load Specific Extensions ===');
            
            // Replace these paths with actual extension directories
            const extensionPaths = [
                // path.resolve('./extensions/my-extension'),
                // path.resolve('./extensions/another-extension')
            ];
            
            if (extensionPaths.length > 0) {
                const { sessionId: session2 } = await system.launchProfile('my-profile', {
                    loadExtensions: extensionPaths
                });
                
                console.log(`Loaded ${extensionPaths.length} extensions programmatically`);
                
                // Close after demonstration
                setTimeout(async () => {
                    await system.profileLauncher.closeBrowser(session2);
                    await system.cleanup();
                }, 5000);
            } else {
                console.log('No extension paths provided - skipping programmatic loading example');
                await system.cleanup();
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        await system.cleanup();
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log('\nCleaning up...');
    process.exit(0);
});

main();
