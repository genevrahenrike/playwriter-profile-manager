#!/usr/bin/env node

/**
 * Simple test to verify automation system initialization
 */

import { AutomationHookSystem } from './src/AutomationHookSystem.js';

async function testAutomationSystem() {
    console.log('🧪 Testing automation system initialization...');
    
    try {
        // Initialize automation system
        const automationSystem = new AutomationHookSystem();
        
        // Load hooks
        await automationSystem.loadHooks('./automation-hooks');
        
        // Get status
        const status = automationSystem.getStatus();
        
        console.log('✅ Automation system initialized successfully!');
        console.log(`📋 Hooks loaded: ${status.hooksLoaded}`);
        console.log(`📄 Active automations: ${status.activeAutomations}`);
        console.log(`✅ Completed automations: ${status.completedAutomations}`);
        
        console.log('\n🎯 Available automation hooks:');
        status.hooks.forEach(hook => {
            console.log(`  - ${hook.name}: ${hook.urlPatterns.join(', ')}`);
        });
        
        console.log('\n✅ Automation system test passed!');
        
    } catch (error) {
        console.error('❌ Automation system test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testAutomationSystem();