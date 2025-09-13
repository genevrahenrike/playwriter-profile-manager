#!/usr/bin/env node

import { Command } from 'commander';
import { SessionStatusScanner } from './src/SessionStatusScanner.js';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
    .name('session-status-cli')
    .description('Comprehensive session status scanner for captured requests')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan all captured sessions and analyze their status')
    .option('-o, --output <file>', 'Output file for results (JSON format)')
    .option('-q, --quiet', 'Suppress console output')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--automation-dir <dir>', 'Directory containing automation results', './automation-results')
    .option('--profiles-dir <dir>', 'Directory containing profiles', './profiles')
    .option('--cross-reference', 'Cross-reference with automation results')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                automationResultsDir: options.automationDir,
                profilesDir: options.profilesDir,
                quiet: options.quiet
            });

            console.log('🔍 Starting comprehensive session status scan...\n');

            const results = await scanner.scanAllSessions();

            // Cross-reference with automation results if requested
            let crossReference = null;
            if (options.crossReference) {
                console.log('🔄 Cross-referencing with automation results...');
                crossReference = await scanner.crossReferenceAutomationResults(results);
                results.crossReference = crossReference;
            }

            // Display summary
            displaySummary(results);

            // Export results if output file specified
            if (options.output) {
                await scanner.exportResults(results, options.output);
            }

        } catch (error) {
            console.error('❌ Error during scan:', error.message);
            process.exit(1);
        }
    });

program
    .command('update-database')
    .description('Scan sessions and update database with status information')
    .option('-o, --output <file>', 'Output file for results (JSON format)')
    .option('-q, --quiet', 'Suppress console output')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--automation-dir <dir>', 'Directory containing automation results', './automation-results')
    .option('--profiles-dir <dir>', 'Directory containing profiles', './profiles')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                automationResultsDir: options.automationDir,
                profilesDir: options.profilesDir,
                quiet: options.quiet
            });

            console.log('🔍 Starting database update with session status...\n');

            const results = await scanner.scanAndUpdateDatabase();

            // Display summary
            displayDatabaseUpdateSummary(results);

            // Export results if output file specified
            if (options.output) {
                await scanner.exportResults(results, options.output);
            }

        } catch (error) {
            console.error('❌ Error during database update:', error.message);
            process.exit(1);
        }
    });

program
    .command('scan-database')
    .description('Scan all profiles from database and analyze their sessions')
    .option('-o, --output <file>', 'Output file for results (JSON format)')
    .option('-q, --quiet', 'Suppress console output')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--automation-dir <dir>', 'Directory containing automation results', './automation-results')
    .option('--profiles-dir <dir>', 'Directory containing profiles', './profiles')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                automationResultsDir: options.automationDir,
                profilesDir: options.profilesDir,
                quiet: options.quiet
            });

            console.log('🔍 Starting database-driven profile scan...\n');

            const results = await scanner.scanDatabaseProfiles();

            // Display summary
            displayDatabaseScanSummary(results);

            // Export results if output file specified
            if (options.output) {
                await scanner.exportResults(results, options.output);
            }

        } catch (error) {
            console.error('❌ Error during database scan:', error.message);
            process.exit(1);
        }
    });

program
    .command('analyze-profile <profileName>')
    .description('Analyze sessions for a specific profile')
    .option('-q, --quiet', 'Suppress console output')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .action(async (profileName, options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                quiet: options.quiet
            });

            console.log(`🔍 Analyzing sessions for profile: ${profileName}\n`);

            const allFiles = await scanner.getCapturedRequestFiles();
            const profileFiles = allFiles.filter(file => file.profileName === profileName);

            if (profileFiles.length === 0) {
                console.log(`❌ No captured sessions found for profile: ${profileName}`);
                return;
            }

            console.log(`📊 Found ${profileFiles.length} sessions for ${profileName}:`);

            for (const file of profileFiles) {
                const analysis = await scanner.analyzeSession(file);
                displaySessionAnalysis(analysis);
            }

        } catch (error) {
            console.error('❌ Error analyzing profile:', error.message);
            process.exit(1);
        }
    });

program
    .command('status-breakdown')
    .description('Show breakdown of session statuses')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--filter <status>', 'Filter by specific status')
    .option('--limit <n>', 'Limit number of results', '50')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                quiet: true
            });

            const results = await scanner.scanAllSessions();
            
            console.log('📊 Session Status Breakdown:\n');

            // Display status counts
            const sortedStatuses = Object.entries(results.statusCounts)
                .sort(([,a], [,b]) => b - a);

            for (const [status, count] of sortedStatuses) {
                const percentage = ((count / results.totalSessions) * 100).toFixed(1);
                console.log(`${getStatusEmoji(status)} ${status.padEnd(25)} ${count.toString().padStart(4)} (${percentage}%)`);
            }

            // Show filtered results if requested
            if (options.filter) {
                console.log(`\n🔍 Sessions with status "${options.filter}":\n`);
                const filteredSessions = results.sessions
                    .filter(s => s.finalStatus === options.filter)
                    .slice(0, parseInt(options.limit));

                for (const session of filteredSessions) {
                    console.log(`📄 ${session.profileName} (${session.sessionId?.substring(0, 8)}...)`);
                    console.log(`   Status: ${session.finalStatus}`);
                    console.log(`   Reason: ${session.statusReason || 'N/A'}`);
                    console.log(`   Requests: ${session.requestCount}, Responses: ${session.responseCount}`);
                    if (session.duration) {
                        console.log(`   Duration: ${Math.round(session.duration / 1000)}s`);
                    }
                    console.log('');
                }
            }

        } catch (error) {
            console.error('❌ Error generating breakdown:', error.message);
            process.exit(1);
        }
    });

program
    .command('find-failures')
    .description('Find and analyze failed sessions')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--type <type>', 'Filter by failure type (400_error, captcha, network, proxy, timeout)')
    .option('--details', 'Show detailed failure information')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                quiet: true
            });

            const results = await scanner.scanAllSessions();
            
            // Filter for failure statuses
            const failureStatuses = ['auth_failure_400', 'captcha_blocked', 'network_error', 'proxy_error', 'timeout_likely'];
            let failedSessions = results.sessions.filter(s => failureStatuses.includes(s.finalStatus));

            if (options.type) {
                const typeMap = {
                    '400_error': 'auth_failure_400',
                    'captcha': 'captcha_blocked',
                    'network': 'network_error',
                    'proxy': 'proxy_error',
                    'timeout': 'timeout_likely'
                };
                const targetStatus = typeMap[options.type];
                if (targetStatus) {
                    failedSessions = failedSessions.filter(s => s.finalStatus === targetStatus);
                }
            }

            console.log(`🚨 Found ${failedSessions.length} failed sessions:\n`);

            for (const session of failedSessions) {
                console.log(`❌ ${session.profileName} - ${session.finalStatus}`);
                console.log(`   File: ${session.fileName}`);
                console.log(`   Reason: ${session.statusReason || 'N/A'}`);
                
                if (options.details && session.failureIndicators.length > 0) {
                    console.log('   Failure Details:');
                    for (const failure of session.failureIndicators.slice(0, 3)) {
                        if (failure.message) {
                            console.log(`     - ${failure.message}`);
                        }
                        if (failure.details && Array.isArray(failure.details)) {
                            for (const detail of failure.details) {
                                console.log(`     - ${detail}`);
                            }
                        }
                    }
                }
                console.log('');
            }

        } catch (error) {
            console.error('❌ Error finding failures:', error.message);
            process.exit(1);
        }
    });

program
    .command('db-mismatches')
    .description('Find potential database mismatches')
    .option('--captured-dir <dir>', 'Directory containing captured requests', './captured-requests')
    .option('--profiles-dir <dir>', 'Directory containing profiles', './profiles')
    .action(async (options) => {
        try {
            const scanner = new SessionStatusScanner({
                capturedRequestsDir: options.capturedDir,
                profilesDir: options.profilesDir,
                quiet: true
            });

            const results = await scanner.scanAllSessions();
            
            console.log(`🔍 Database Mismatch Analysis:\n`);
            console.log(`Total sessions scanned: ${results.totalSessions}`);
            console.log(`Potential mismatches found: ${results.dbMismatches.length}\n`);

            if (results.dbMismatches.length > 0) {
                for (const mismatch of results.dbMismatches) {
                    console.log(`⚠️  ${mismatch.type}: ${mismatch.profileName}`);
                    console.log(`   Issue: ${mismatch.issue}`);
                    if (mismatch.sessionStatus) {
                        console.log(`   Session Status: ${mismatch.sessionStatus}`);
                    }
                    if (mismatch.successIndicators) {
                        console.log(`   Success Indicators: ${mismatch.successIndicators}`);
                    }
                    console.log('');
                }
            } else {
                console.log('✅ No obvious database mismatches detected');
            }

        } catch (error) {
            console.error('❌ Error checking database mismatches:', error.message);
            process.exit(1);
        }
    });

function displaySummary(results) {
    console.log('📊 SCAN SUMMARY');
    console.log('================\n');
    
    console.log(`Total Sessions Analyzed: ${results.totalSessions}`);
    console.log(`Success Rate: ${results.summary.successRate}%`);
    console.log(`Failure Rate: ${results.summary.failureRate}%`);
    console.log(`Unknown/Unclear Rate: ${results.summary.unknownRate}%`);
    console.log(`Database Mismatches: ${results.summary.dbMismatchCount}\n`);

    console.log('Status Breakdown:');
    const sortedStatuses = Object.entries(results.statusCounts)
        .sort(([,a], [,b]) => b - a);

    for (const [status, count] of sortedStatuses) {
        const percentage = ((count / results.totalSessions) * 100).toFixed(1);
        console.log(`  ${getStatusEmoji(status)} ${status.padEnd(25)} ${count.toString().padStart(4)} (${percentage}%)`);
    }

    if (results.summary.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        for (const rec of results.summary.recommendations) {
            console.log(`  • ${rec}`);
        }
    }

    if (results.crossReference) {
        console.log('\n🔄 CROSS-REFERENCE ANALYSIS:');
        const agreements = results.crossReference.filter(cr => cr.agreement).length;
        const disagreements = results.crossReference.filter(cr => !cr.agreement).length;
        console.log(`  Agreement with automation results: ${agreements}/${results.crossReference.length}`);
        console.log(`  Disagreements: ${disagreements}`);
    }

    console.log('\n');
}

function displayDatabaseScanSummary(results) {
    console.log('📊 DATABASE SCAN SUMMARY');
    console.log('=========================\n');
    
    console.log(`Total Profiles in Database: ${results.summary.totalProfiles}`);
    console.log(`Profiles with Sessions: ${results.summary.profilesWithSessions}`);
    console.log(`Profiles without Sessions: ${results.summary.profilesWithoutSessions}`);
    console.log(`Total Sessions Found: ${results.summary.totalSessions}`);
    console.log(`Database Mismatches: ${results.summary.dbMismatchCount}\n`);

    console.log('Profile Data Status:');
    for (const [status, count] of Object.entries(results.summary.profileDataStatus)) {
        const emoji = status === 'compressed' ? '📦' : status === 'uncompressed' ? '📁' : '❌';
        console.log(`  ${emoji} ${status.padEnd(15)} ${count.toString().padStart(4)}`);
    }

    if (results.summary.totalSessions > 0) {
        console.log(`\nSession Success Rate: ${results.summary.successRate}%`);
        console.log(`Session Failure Rate: ${results.summary.failureRate}%\n`);

        console.log('Session Status Breakdown:');
        const sortedStatuses = Object.entries(results.summary.sessionStatusCounts || {})
            .sort(([,a], [,b]) => b - a);

        for (const [status, count] of sortedStatuses) {
            const percentage = ((count / results.summary.totalSessions) * 100).toFixed(1);
            console.log(`  ${getStatusEmoji(status)} ${status.padEnd(25)} ${count.toString().padStart(4)} (${percentage}%)`);
        }
    }

    if (results.summary.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        for (const rec of results.summary.recommendations) {
            console.log(`  • ${rec}`);
        }
    }

    console.log('\n');
}

function displayDatabaseUpdateSummary(results) {
    console.log('📊 DATABASE UPDATE SUMMARY');
    console.log('===========================\n');
    
    console.log(`Total Profiles in Database: ${results.summary.totalProfiles}`);
    console.log(`Profiles with Sessions: ${results.summary.profilesWithSessions}`);
    console.log(`Total Sessions Analyzed: ${results.summary.totalSessions}`);
    
    if (results.databaseUpdates) {
        console.log(`\n🔄 Database Updates:`);
        console.log(`   Profiles Updated: ${results.databaseUpdates.updatedProfiles}`);
        console.log(`   Update Errors: ${results.databaseUpdates.updateErrors}`);
        console.log(`   Total Processed: ${results.databaseUpdates.totalProcessed}`);
    }

    console.log('\nProfile Data Status:');
    for (const [status, count] of Object.entries(results.summary.profileDataStatus)) {
        const emoji = status === 'compressed' ? '📦' : status === 'uncompressed' ? '📁' : '❌';
        console.log(`  ${emoji} ${status.padEnd(15)} ${count.toString().padStart(4)}`);
    }

    if (results.summary.totalSessions > 0) {
        console.log(`\nSession Success Rate: ${results.summary.successRate}%`);
        console.log(`Session Failure Rate: ${results.summary.failureRate}%\n`);

        console.log('Session Status Breakdown:');
        const sortedStatuses = Object.entries(results.summary.sessionStatusCounts || {})
            .sort(([,a], [,b]) => b - a);

        for (const [status, count] of sortedStatuses) {
            const percentage = ((count / results.summary.totalSessions) * 100).toFixed(1);
            console.log(`  ${getStatusEmoji(status)} ${status.padEnd(25)} ${count.toString().padStart(4)} (${percentage}%)`);
        }
    }

    if (results.summary.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        for (const rec of results.summary.recommendations) {
            console.log(`  • ${rec}`);
        }
    }

    console.log('\n');
}

function displaySessionAnalysis(analysis) {
    console.log(`📄 ${analysis.fileName}`);
    console.log(`   Profile: ${analysis.profileName}`);
    console.log(`   Session ID: ${analysis.sessionId || 'N/A'}`);
    console.log(`   Status: ${getStatusEmoji(analysis.finalStatus)} ${analysis.finalStatus}`);
    console.log(`   Reason: ${analysis.statusReason || 'N/A'}`);
    console.log(`   Requests: ${analysis.requestCount}, Responses: ${analysis.responseCount}`);
    console.log(`   Auth Attempts: ${analysis.authAttempts.length}`);
    console.log(`   Success Indicators: ${analysis.successIndicators.length}`);
    console.log(`   Failure Indicators: ${analysis.failureIndicators.length}`);
    
    if (analysis.captchaDetected) console.log(`   🤖 CAPTCHA Detected`);
    if (analysis.networkIssues) console.log(`   🌐 Network Issues`);
    if (analysis.proxyIssues) console.log(`   🔗 Proxy Issues`);
    
    if (analysis.duration) {
        console.log(`   Duration: ${Math.round(analysis.duration / 1000)}s`);
    }
    console.log('');
}

function getStatusEmoji(status) {
    const emojiMap = {
        'success': '✅',
        'auth_failure_400': '❌',
        'captcha_blocked': '🤖',
        'network_error': '🌐',
        'proxy_error': '🔗',
        'timeout_likely': '⏰',
        'auth_success_unclear': '❓',
        'auth_failure_unclear': '❓',
        'no_activity': '💤',
        'no_auth_attempt': '🚫',
        'unknown': '❓',
        'file_error': '📁'
    };
    return emojiMap[status] || '❓';
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

program.parse();