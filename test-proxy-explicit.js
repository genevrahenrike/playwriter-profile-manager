#!/usr/bin/env node

// Test that proxy functionality works when explicitly requested
import { spawn } from 'child_process';

console.log('🧪 Testing batch command WITH explicit proxy options...\n');

const child = spawn('node', [
    'src/cli.js', 
    'batch', 
    '--template', 'direct-clean',
    '--count', '1',
    '--prefix', 'test-with-proxy',
    '--timeout', '5000',
    '--delete-on-failure',
    '--proxy-strategy', 'round-robin',
    '--proxy-start', 'US2'
], {
    stdio: 'pipe',
    cwd: process.cwd()
});

let output = '';
let hasProxyEnabled = false;
let hasProxyStart = false;

child.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.log(text);
    
    // Check for proxy-related messages
    if (text.includes('Proxy rotation enabled')) {
        hasProxyEnabled = true;
    }
    if (text.includes('starting from US2')) {
        hasProxyStart = true;
    }
});

child.stderr.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.error(text);
});

// Kill the process after 15 seconds to avoid hanging
const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    console.log('\n⏰ Test timeout - killing process');
}, 15000);

child.on('close', (code) => {
    clearTimeout(timeout);
    
    console.log('\n📋 Test Results:');
    console.log(`Exit code: ${code}`);
    
    if (hasProxyEnabled && hasProxyStart) {
        console.log('✅ SUCCESS: Proxy rotation correctly enabled with start position when explicitly requested');
    } else if (hasProxyEnabled) {
        console.log('⚠️  PARTIAL: Proxy rotation enabled but start position not detected');
    } else {
        console.log('❌ FAILURE: Proxy rotation was not enabled even with explicit options');
    }
    
    console.log('\nProxy-related messages found:');
    if (hasProxyEnabled) {
        console.log('  ✅ Proxy rotation enabled message found');
    }
    if (hasProxyStart) {
        console.log('  ✅ Proxy start position message found');
    }
    if (!hasProxyEnabled && !hasProxyStart) {
        console.log('  ❌ No proxy-related messages found');
    }
});

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('❌ Process error:', error.message);
});