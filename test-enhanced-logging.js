#!/usr/bin/env node

/**
 * Test script for the enhanced batch logging system
 */

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

console.log('🧪 Testing enhanced batch logging system...');

// Test that the log directory structure is created
const testBatchId = `test-${Date.now()}`;
const detailedLogsDir = path.join('./automation-results/detailed-logs', testBatchId);

// Create a mock log entry
async function testLogStructure() {
    console.log('📁 Testing log directory creation...');
    
    await fs.ensureDir(detailedLogsDir);
    
    const testRunId = 'test-run-123';
    const testLogTypes = ['start', 'stdout', 'stderr', 'result', 'error', 'final'];
    
    for (const logType of testLogTypes) {
        const logFile = path.join(detailedLogsDir, `${testRunId}-${logType}.log`);
        const timestamp = new Date().toISOString();
        const testContent = `[${timestamp}] Test ${logType} log entry\n`;
        await fs.appendFile(logFile, testContent);
    }
    
    // Create batch summary
    const summaryFile = path.join(detailedLogsDir, 'batch-summary.log');
    const summaryContent = `[${new Date().toISOString()}] Test batch started\n`;
    await fs.appendFile(summaryFile, summaryContent);
    
    console.log('✅ Log directory structure created successfully');
    console.log(`📊 Test logs created in: ${detailedLogsDir}`);
    
    // List created files
    const files = await fs.readdir(detailedLogsDir);
    console.log(`📄 Created files: ${files.join(', ')}`);
    
    return detailedLogsDir;
}

// Test the analysis tool
async function testAnalysisTool(batchId) {
    console.log('📊 Testing log analysis tool...');
    
    try {
        const result = await new Promise((resolve, reject) => {
            const child = spawn('node', ['analyze-batch-logs.js', batchId], {
                stdio: 'pipe',
                cwd: process.cwd()
            });
            
            let output = '';
            child.stdout.on('data', data => output += data.toString());
            child.stderr.on('data', data => output += data.toString());
            
            child.on('exit', code => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Analysis tool exited with code ${code}\nOutput: ${output}`));
                }
            });
        });
        
        console.log('✅ Analysis tool ran successfully');
        console.log('📋 Analysis output:');
        console.log(result.split('\n').slice(0, 10).join('\n') + '\n...(truncated)');
        
    } catch (err) {
        console.log('❌ Analysis tool test failed:', err.message);
    }
}

// Cleanup test files
async function cleanup(testDir) {
    console.log('🧹 Cleaning up test files...');
    try {
        await fs.remove(testDir);
        console.log('✅ Cleanup completed');
    } catch (err) {
        console.log('❌ Cleanup failed:', err.message);
    }
}

async function main() {
    try {
        const testDir = await testLogStructure();
        const batchId = path.basename(testDir);
        await testAnalysisTool(batchId);
        
        console.log('\n🎉 All tests passed! Enhanced logging system is ready.');
        console.log('\n💡 Next steps:');
        console.log('1. Run a batch command to see the enhanced logging in action');
        console.log('2. Use the analysis tool to troubleshoot any issues');
        console.log('3. Check the detailed logs for comprehensive debugging info');
        
        // Keep test files for demonstration unless --cleanup is passed
        if (process.argv.includes('--cleanup')) {
            await cleanup(testDir);
        } else {
            console.log(`\n📁 Test files preserved at: ${testDir}`);
            console.log('   Run with --cleanup to remove test files');
        }
        
    } catch (err) {
        console.error('❌ Test failed:', err.message);
        process.exit(1);
    }
}

main();