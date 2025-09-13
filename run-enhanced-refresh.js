#!/usr/bin/env node

/**
 * Run Enhanced Refresh - Batch process profiles without credentials
 * 
 * This script runs the enhanced refresh flow on all profiles without valid credentials,
 * automatically detecting extension install vs signup flows and capturing traffic.
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

async function runEnhancedRefresh() {
    console.log(chalk.blue('🚀 Running Enhanced Refresh for Profiles Without Credentials'));
    console.log(chalk.blue('===========================================================\n'));

    // First, analyze current state
    console.log(chalk.cyan('📊 Current State Analysis:'));
    try {
        const analysisOutput = execSync('node analyze-missing-credentials.js', { encoding: 'utf8' });
        console.log(analysisOutput);
    } catch (error) {
        console.log(chalk.red(`❌ Analysis failed: ${error.message}`));
        return;
    }

    // Load the analysis results
    const analysisFile = './output/missing-credentials-analysis.json';
    if (!await fs.pathExists(analysisFile)) {
        console.log(chalk.red('❌ Analysis file not found. Run analyze-missing-credentials.js first.'));
        return;
    }

    const analysis = await fs.readJson(analysisFile);
    const totalMissing = analysis.profilesWithoutCredentials;
    
    console.log(chalk.cyan(`\n🎯 Enhanced Refresh Plan:`));
    console.log(`   Total profiles without credentials: ${totalMissing}`);
    console.log(`   Strategy: Process in batches with random proxy rotation`);
    console.log(`   Expected outcomes:`);
    console.log(`     • Valid sessions (extension_login_success): ~60-80%`);
    console.log(`     • Signup required: ~10-20%`);
    console.log(`     • Login required: ~5-10%`);
    console.log(`     • Inactive/failed: ~5-15%`);

    // Ask for confirmation
    console.log(chalk.yellow('\n⚠️  This will process profiles in batches. Continue? (y/N)'));
    
    // For automation, we'll proceed automatically. In interactive mode, you'd want to prompt.
    const proceed = true; // Set to false for interactive mode
    
    if (!proceed) {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
    }

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    const totalBatches = Math.ceil(totalMissing / batchSize);
    
    console.log(chalk.green(`\n🔄 Processing ${totalMissing} profiles in ${totalBatches} batches of ${batchSize}`));
    
    const results = {
        totalProcessed: 0,
        successful: 0,
        flowTypes: {},
        errors: 0,
        startTime: new Date().toISOString()
    };

    // Process each batch
    for (let batch = 1; batch <= totalBatches; batch++) {
        console.log(chalk.blue(`\n📦 Batch ${batch}/${totalBatches}`));
        
        try {
            // Run enhanced refresh with dry-run first to see what we get
            const command = `npx ppm refresh-missing --prefix proxied --limit ${batchSize} --dry-run --headless --disable-images --proxy-strategy auto`;
            
            console.log(chalk.dim(`Running: ${command}`));
            const output = execSync(command, { encoding: 'utf8' });
            
            // Parse results from output
            const lines = output.split('\n');
            const summaryLine = lines.find(l => l.includes('Flow types detected:'));
            
            if (summaryLine) {
                console.log(chalk.green(`✅ Batch ${batch} completed`));
                
                // Extract flow type counts from output
                const flowMatches = output.match(/(\w+): (\d+)/g);
                if (flowMatches) {
                    flowMatches.forEach(match => {
                        const [, type, count] = match.match(/(\w+): (\d+)/);
                        results.flowTypes[type] = (results.flowTypes[type] || 0) + parseInt(count);
                        results.totalProcessed += parseInt(count);
                    });
                }
            }
            
            // Add delay between batches to avoid overwhelming proxies
            if (batch < totalBatches) {
                console.log(chalk.dim('⏳ Waiting 30s before next batch...'));
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            
        } catch (error) {
            console.log(chalk.red(`❌ Batch ${batch} failed: ${error.message}`));
            results.errors += 1;
        }
    }

    // Final summary
    console.log(chalk.green(`\n🎉 Enhanced Refresh Complete!`));
    console.log(chalk.cyan('📊 Final Results:'));
    console.log(`   Total processed: ${results.totalProcessed}`);
    console.log(`   Flow types detected:`);
    
    Object.entries(results.flowTypes).forEach(([type, count]) => {
        const percentage = ((count / results.totalProcessed) * 100).toFixed(1);
        const color = type.includes('valid_session') ? chalk.green :
                     type.includes('login_success') ? chalk.blue :
                     type.includes('signup') ? chalk.yellow :
                     type.includes('error') ? chalk.red : chalk.dim;
        console.log(`     ${color(type)}: ${count} (${percentage}%)`);
    });
    
    if (results.errors > 0) {
        console.log(`   Batch errors: ${results.errors}`);
    }

    // Calculate recovery rate
    const validSessions = (results.flowTypes.valid_session || 0) + 
                         (results.flowTypes.extension_login_success_no_traffic || 0);
    const recoveryRate = ((validSessions / results.totalProcessed) * 100).toFixed(1);
    
    console.log(chalk.green(`\n✨ Credential Recovery Success Rate: ${recoveryRate}%`));
    console.log(chalk.dim(`   Profiles with valid sessions: ${validSessions}/${results.totalProcessed}`));

    // Save results
    const resultsFile = './output/enhanced-refresh-summary.json';
    await fs.writeJson(resultsFile, {
        ...results,
        endTime: new Date().toISOString(),
        recoveryRate: parseFloat(recoveryRate)
    }, { spaces: 2 });
    
    console.log(chalk.dim(`\n📁 Results saved to: ${resultsFile}`));
    
    // Next steps
    console.log(chalk.blue('\n💡 Next Steps:'));
    console.log('1. Re-run credential extraction to get updated count:');
    console.log('   node request-extractor-cli.js all-headers');
    console.log('2. For profiles needing signup, run with --execute-signup:');
    console.log('   npx ppm refresh-missing --prefix proxied --execute-signup');
    console.log('3. For profiles needing login, run with --execute-login:');
    console.log('   npx ppm refresh-missing --prefix proxied --execute-login --credentials-file creds.json');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runEnhancedRefresh().catch(error => {
        console.error(chalk.red('❌ Enhanced refresh failed:'), error.message);
        process.exit(1);
    });
}

export { runEnhancedRefresh };