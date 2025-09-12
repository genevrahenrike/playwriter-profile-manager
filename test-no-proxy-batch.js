#!/usr/bin/env node

// Simple test to verify batch command doesn't enter proxy mode without proxy options
import { spawn } from 'child_process';

console.log('🧪 Testing batch command without proxy options...\n');

const child = spawn('node', [
    'src/cli.js', 
    'batch', 
    '--template', 'direct-clean',
    '--count', '1',
    '--prefix', 'test-no-proxy',
    '--timeout', '5000',
    '--delete-on-failure'
], {
    stdio: 'pipe',
    cwd: process.cwd()
});

let output = '';
let hasProxyMessage = false;

child.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.log(text);
    
    // Check for proxy-related messages
    if (text.includes('Proxy rotation enabled') || text.includes('🌐')) {
        hasProxyMessage = true;
    }
});

child.stderr.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.error(text);
});

// Kill the process after 10 seconds to avoid hanging
const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    console.log('\n⏰ Test timeout - killing process');
}, 10000);

child.on('close', (code) => {
    clearTimeout(timeout);
    
    console.log('\n📋 Test Results:');
    console.log(`Exit code: ${code}`);
    
    if (output.includes('Proxy rotation disabled')) {
        console.log('✅ SUCCESS: Proxy rotation correctly disabled when no proxy options specified');
    } else if (hasProxyMessage) {
        console.log('❌ FAILURE: Proxy mode was enabled even without proxy options');
    } else {
        console.log('⚠️  UNCLEAR: No clear proxy status message found');
    }
    
    console.log('\nOutput contained:');
    if (output.includes('🌐')) {
        console.log('  - Proxy-related messages found');
    } else {
        console.log('  - No proxy-related messages found');
    }
});

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('❌ Process error:', error.message);
});