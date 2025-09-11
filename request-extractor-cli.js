#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { RequestExtractor } from './src/RequestExtractor.js';

const program = new Command();

program
    .name('request-extractor')
    .description('Reconstruct extension-compatible requests from captured webapp sessions')
    .version('1.0.0');

// Reconstruct command
program
    .command('reconstruct')
    .description('Reconstruct extension requests from a session')
    .argument('<sessionIdOrProfile>', 'Session ID or profile name')
    .option('--headers-only', 'Only output reconstructed minimal headers', true)
    .option('-o, --output <dir>', 'Output directory for reconstructed requests', './reconstructed-requests')
    .option('-v, --verbose', 'Verbose output')
    .option('--no-save', 'Don\'t save results to file')
    .action(async (sessionIdOrProfile, options) => {
        try {
            if (!options.headersOnly) {
                console.log(chalk.blue('🔧 Request Extractor'));
                console.log(chalk.blue('====================================\n'));
            }
            
            const extractor = new RequestExtractor({
                outputDir: options.output,
                quiet: options.headersOnly
            });
            
            const results = await extractor.reconstructSession(sessionIdOrProfile, options);
            
            if (options.headersOnly) {
                // Print a single JSON object with extensionHeaders from the first reconstructed request
                const first = results.reconstructedRequests[0];
                const out = { extensionHeaders: first.extensionHeaders };
                process.stdout.write(JSON.stringify(out, null, 2) + '\n');
                return;
            }

            // Display summary
            console.log(chalk.green('\n✅ Reconstruction Complete!'));
            console.log(chalk.blue('\n📊 Summary:'));
            console.log(`   Session ID: ${chalk.cyan(results.sessionId)}`);
            console.log(`   Requests reconstructed: ${chalk.cyan(results.reconstructedRequests.length)}`);
            if (!options.headersOnly && results.report) {
                console.log(`   Has authorization: ${results.report.summary.hasAuthorization ? chalk.green('✅') : chalk.red('❌')}`);
                console.log(`   Has device ID: ${results.report.summary.hasDeviceId ? chalk.green('✅') : chalk.red('❌')}`);
                console.log(`   Has user agent: ${results.report.summary.hasUserAgent ? chalk.green('✅') : chalk.red('❌')}`);
            }
            
            // Display core data (only when report is present)
            if (!options.headersOnly && results.report) {
                console.log(chalk.blue('\n🔑 Core Data Extracted:'));
                console.log(`   Authorization: ${chalk.dim(results.report.coreData.authorization)}`);
                console.log(`   Device ID: ${chalk.cyan(results.report.coreData.deviceId)}`);
                console.log(`   User Agent: ${chalk.dim(results.report.coreData.userAgent.substring(0, 50) + '...')}`);
                console.log(`   Timezone: ${chalk.cyan(results.report.coreData.timezone)}`);
            }
            
            // Display warnings if any
            if (!options.headersOnly && results.report && results.report.adaptationWarnings.length > 0) {
                console.log(chalk.yellow('\n⚠️  Adaptation Warnings:'));
                results.report.adaptationWarnings.forEach(warning => {
                    const severityColor = warning.severity === 'CRITICAL' ? chalk.red : 
                                         warning.severity === 'HIGH' ? chalk.yellow : chalk.blue;
                    console.log(`   ${severityColor(warning.severity)}: ${warning.issue}`);
                    console.log(`      Impact: ${chalk.dim(warning.impact)}`);
                    console.log(`      Solution: ${chalk.dim(warning.solution)}`);
                });
            }
            
            // Display some example curl commands
            if (results.reconstructedRequests.length > 0) {
                console.log(chalk.blue('\n🌐 Sample Reconstructed Requests:'));
                const sampleRequests = results.reconstructedRequests.slice(0, 3);
                sampleRequests.forEach((req, index) => {
                    const method = req.original && req.original.method ? req.original.method : 'UNKNOWN';
                    console.log(chalk.green(`\n${index + 1}. ${req.endpoint.toUpperCase()} (${method})`));
                    if (req.original && req.original.url) {
                        console.log(chalk.dim(`   URL: ${req.original.url}`));
                    }
                    if (options.headersOnly) {
                        console.log(chalk.dim('   Headers (minimal):'));
                        Object.entries(req.extensionHeaders).forEach(([k, v]) => {
                            console.log(chalk.gray(`     ${k}: ${v}`));
                        });
                    } else if (options.verbose && req.curlCommand) {
                        console.log(chalk.dim('   Curl command:'));
                        console.log(chalk.gray('   ' + req.curlCommand.split('\n').join('\n   ')));
                    } else {
                        console.log(chalk.dim(`   Headers: ${Object.keys(req.extensionHeaders).length} total`));
                    }
                });
                if (results.reconstructedRequests.length > 3) {
                    console.log(chalk.dim(`   ... and ${results.reconstructedRequests.length - 3} more requests`));
                }
            }
            
            // Display recommendations
            if (!options.headersOnly && results.report) {
                console.log(chalk.blue('\n💡 Recommendations:'));
                results.report.recommendations.forEach(rec => {
                    console.log(`   ${rec}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Headers command: outputs just one JSON object with extensionHeaders
program
    .command('headers')
    .description('Output a single JSON object with minimal extension headers')
    .argument('<sessionIdOrProfile>', 'Session ID or profile name')
    .option('--no-randomize', 'Do not randomize x-amplitude-device-id, use captured or fallback')
    .action(async (sessionIdOrProfile, options) => {
        try {
            const extractor = new RequestExtractor({ quiet: true });
            const obj = await extractor.generateHeadersObject(sessionIdOrProfile, {
                randomizeDeviceId: options.randomize !== false,
                includeContentType: true,
                quiet: true
            });
            process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Bulk headers command: outputs array of profile objects with extension headers
program
    .command('bulk-headers')
    .description('Output extension headers for all profiles matching a prefix')
    .argument('<prefix>', 'Profile name prefix (e.g., "viq" for viq1, viq2, etc.)')
    .option('--no-randomize', 'Do not randomize x-amplitude-device-id, use captured values')
    .action(async (prefix, options) => {
        try {
            const extractor = new RequestExtractor({ quiet: true });
            const results = await extractor.generateHeadersForProfiles(prefix, {
                randomizeDeviceId: options.randomize !== false,
                includeContentType: false,
                quiet: true
            });
            
            if (results.length === 0) {
                console.error(chalk.red(`❌ No profiles found with prefix: ${prefix}`));
                process.exit(1);
            }
            
            const jsonOutput = JSON.stringify(results, null, 2);
            
            // Ensure output directory exists
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const filename = `${prefix}.profiles.json`;
            const filepath = path.join(outputDir, filename);
            
            // Write to file
            fs.writeFileSync(filepath, jsonOutput + '\n');
            
            // Also output to stdout
            process.stdout.write(jsonOutput + '\n');
            
            // Log success message to stderr so it doesn't interfere with stdout
            console.error(chalk.green(`✅ Saved ${results.length} profiles to ${filepath}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Analysis command
program
    .command('analyze')
    .description('Analyze reconstruction capabilities and concerns')
    .action(async () => {
        try {
            console.log(chalk.blue('🔍 Extension Reconstruction Analysis'));
            console.log(chalk.blue('====================================\n'));
            
            const extractor = new RequestExtractor();
            const summary = extractor.getReconstructionSummary();
            
            // Adaptation Required
            console.log(chalk.yellow('⚠️  Adaptation Required:'));
            console.log(`   ${summary.adaptationRequired.description}`);
            console.log(`   Can be handled: ${summary.adaptationRequired.canBeHandled ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
            console.log(`   Impact: ${summary.adaptationRequired.impact}\n`);
            
            Object.entries(summary.adaptationRequired.headers).forEach(([header, info]) => {
                console.log(`   📝 ${chalk.bold(header)}:`);
                console.log(`      Webapp: ${chalk.dim(info.webapp)}`);
                console.log(`      Extension: ${chalk.cyan(info.extension)}`);
                console.log(`      Reason: ${chalk.dim(info.reason)}\n`);
            });
            
            // Extension Specific
            console.log(chalk.blue('🔧 Extension-Specific Headers:'));
            console.log(`   ${summary.extensionSpecific.description}`);
            console.log(`   Can be handled: ${summary.extensionSpecific.canBeHandled ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
            console.log(`   Impact: ${summary.extensionSpecific.impact}\n`);
            
            Object.entries(summary.extensionSpecific.headers).forEach(([header, value]) => {
                console.log(`   📝 ${chalk.bold(header)}: ${chalk.cyan(value)}`);
            });
            
            // Potential Concerns
            console.log(chalk.yellow('\n⚠️  Potential Concerns:'));
            summary.potentialConcerns.forEach(concern => {
                const severityColor = concern.severity === 'HIGH' ? chalk.red : 
                                     concern.severity === 'MEDIUM' ? chalk.yellow : chalk.blue;
                console.log(`   ${severityColor(concern.severity)}: ${chalk.bold(concern.concern)}`);
                console.log(`      ${chalk.dim(concern.description)}`);
                console.log(`      Mitigation: ${chalk.dim(concern.mitigation)}\n`);
            });
            
            // Confidence Levels
            console.log(chalk.green('🎯 Confidence Levels:'));
            Object.entries(summary.confidence).forEach(([aspect, level]) => {
                const confidenceColor = level === 'HIGH' ? chalk.green : 
                                       level === 'MEDIUM' ? chalk.yellow : chalk.red;
                console.log(`   ${aspect.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${confidenceColor(level)}`);
            });
            
            console.log(chalk.green('\n✅ Overall Assessment: Extension requests CAN be reliably reconstructed'));
            console.log(chalk.blue('💡 The main challenges are header adaptation and timing, both manageable'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// List sessions command
program
    .command('list-sessions')
    .description('List available sessions for reconstruction')
    .option('-p, --profile <name>', 'Filter by profile name')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📋 Available Sessions'));
            console.log(chalk.blue('===================\n'));
            
            const extractor = new RequestExtractor();
            const capturedDir = './captured-requests';
            const files = require('fs').readdirSync(capturedDir);
            
            const sessions = files
                .filter(file => file.endsWith('.jsonl'))
                .map(file => {
                    const match = file.match(/(\w+)-export-(\w+-\w+-\w+-\w+-\w+)-(.+)\.jsonl/);
                    if (match) {
                        const [, profile, sessionId, timestamp] = match;
                        const stats = require('fs').statSync(require('path').join(capturedDir, file));
                        return { profile, sessionId, timestamp, file, mtime: stats.mtime };
                    }
                    return null;
                })
                .filter(Boolean)
                .filter(session => !options.profile || session.profile.includes(options.profile))
                .sort((a, b) => b.mtime - a.mtime);
            
            if (sessions.length === 0) {
                console.log(chalk.yellow('⚠️  No sessions found'));
                if (options.profile) {
                    console.log(chalk.dim(`   (filtered by profile: ${options.profile})`));
                }
                return;
            }
            
            console.log(`Found ${chalk.cyan(sessions.length)} sessions:\n`);
            
            sessions.forEach((session, index) => {
                console.log(`${chalk.green(index + 1)}. ${chalk.bold(session.profile)} - ${chalk.cyan(session.sessionId.substring(0, 8))}...`);
                console.log(`   File: ${chalk.dim(session.file)}`);
                console.log(`   Modified: ${chalk.dim(session.mtime.toISOString())}`);
                console.log('');
            });
            
            console.log(chalk.blue('💡 Use "reconstruct <profile-name>" or "reconstruct <session-id>" to reconstruct'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

export { program };

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse();
}