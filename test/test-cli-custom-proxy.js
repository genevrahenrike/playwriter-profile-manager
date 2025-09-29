#!/usr/bin/env node
// Test the CLI with custom proxy file
import { spawn } from 'child_process';
import path from 'path';

async function testCLIWithCustomProxy() {
    console.log('🧪 Testing CLI with --proxy-file option...');
    
    const customProxyFile = './proxies/floppydata-https-proxies-US-100-res.txt';
    
    // Test the CLI command
    const child = spawn('npx', [
        'ppm', 'launch', 'proxy-clean',
        '--headless',
        '--proxy-strategy', 'random',
        '--proxy-file', customProxyFile,
        '--proxy-debug'
    ], {
        stdio: 'pipe',
        cwd: process.cwd()
    });
    
    let output = '';
    let hasCustomFileLog = false;
    
    child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(text);
        
        if (text.includes('Loaded') && text.includes('floppydata-https-proxies-US-100-res.txt')) {
            hasCustomFileLog = true;
        }
    });
    
    child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
    });
    
    child.on('close', (code) => {
        if (hasCustomFileLog) {
            console.log('✅ Custom proxy file option working in CLI');
        } else {
            console.log('❌ Custom proxy file not detected in output');
        }
        
        if (code === 0) {
            console.log('✅ CLI test completed successfully');
        } else {
            console.log(`❌ CLI test failed with code: ${code}`);
        }
    });
    
    // Kill after 30 seconds
    setTimeout(() => {
        child.kill('SIGINT');
    }, 30000);
}

testCLIWithCustomProxy().catch(console.error);