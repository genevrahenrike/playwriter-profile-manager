#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ProfileManager } from './ProfileManager.js';
import { ProfileLauncher } from './ProfileLauncher.js';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();
const profileManager = new ProfileManager('./profiles');
const profileLauncher = new ProfileLauncher(profileManager);

program
    .name('ppm-capture')
    .description('Profile Manager Request Capture CLI')
    .version('1.0.0');

// Launch profile with request capture
program
    .command('launch')
    .description('Launch a profile with request capture enabled')
    .argument('<profile>', 'Profile name or ID')
    .option('-h, --headless', 'Run in headless mode', false)
    .option('-d, --devtools', 'Open DevTools', false)
    .option('--no-capture', 'Disable request capture')
    .option('--no-autofill', 'Disable autofill system')
    .option('--format <format>', 'Output format for captured requests', 'jsonl')
    .option('--output-dir <dir>', 'Output directory for captured requests', './captured-requests')
    .action(async (profileName, options) => {
        try {
            console.log(chalk.blue('🕸️  Launching profile with request capture...'));
            console.log(chalk.dim(`Profile: ${profileName}`));
            console.log(chalk.dim(`Request Capture: ${options.capture ? 'ENABLED' : 'DISABLED'}`));
            
            // Configure request capture system
            if (options.outputDir !== './captured-requests') {
                profileLauncher.requestCaptureSystem.outputDirectory = options.outputDir;
                profileLauncher.requestCaptureSystem.outputFormat = options.format;
            }
            
            const launchOptions = {
                headless: options.headless,
                devtools: options.devtools,
                enableRequestCapture: options.capture,
                enableAutomation: options.autofill,
                maxStealth: true
            };

            const result = await profileLauncher.launchProfile(profileName, launchOptions);
            
            console.log(chalk.green('✅ Profile launched successfully!'));
            console.log(chalk.dim(`Session ID: ${result.sessionId}`));
            console.log(chalk.dim(`Request Capture: ${result.requestCaptureEnabled ? 'ACTIVE' : 'INACTIVE'}`));
            
            // Show capture system status
            if (result.requestCaptureEnabled) {
                const captureStatus = profileLauncher.getRequestCaptureStatus();
                console.log(chalk.blue(`\n🕸️  Request Capture Status:`));
                console.log(chalk.dim(`   Hooks loaded: ${captureStatus.totalHooks}`));
                console.log(chalk.dim(`   Output directory: ${captureStatus.outputDirectory}`));
                console.log(chalk.dim(`   Output format: ${captureStatus.outputFormat}`));
                
                if (captureStatus.hooks.length > 0) {
                    console.log(chalk.blue('   Active hooks:'));
                    captureStatus.hooks.forEach(hook => {
                        console.log(chalk.dim(`     • ${hook.name}: ${hook.description}`));
                    });
                }
            }

            console.log(chalk.yellow('\n⚠️  Browser will remain open. Use Ctrl+C to close or run "ppm sessions" to manage.'));
            console.log(chalk.yellow('💡 Navigate to VidIQ or other monitored sites to capture requests.'));
            
            // Keep the process alive
            process.stdin.resume();
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Show capture status
program
    .command('status')
    .description('Show request capture system status')
    .action(async () => {
        try {
            const captureStatus = profileLauncher.getRequestCaptureStatus();
            
            console.log(chalk.blue('🕸️  Request Capture System Status'));
            console.log(chalk.blue('===================================\n'));
            
            console.log(`Total hooks loaded: ${chalk.green(captureStatus.totalHooks)}`);
            console.log(`Total patterns: ${chalk.green(captureStatus.totalPatterns)}`);
            console.log(`Active sessions: ${chalk.green(captureStatus.activeSessions)}`);
            console.log(`Total captured: ${chalk.green(captureStatus.totalCaptured)}`);
            console.log(`Output format: ${chalk.cyan(captureStatus.outputFormat)}`);
            console.log(`Output directory: ${chalk.cyan(captureStatus.outputDirectory)}`);
            
            if (captureStatus.hooks.length > 0) {
                console.log(chalk.blue('\n📋 Loaded Hooks:'));
                captureStatus.hooks.forEach(hook => {
                    console.log(`  ${chalk.green('•')} ${chalk.bold(hook.name)}`);
                    console.log(`    ${chalk.dim(hook.description)}`);
                    console.log(`    Patterns: ${chalk.cyan(hook.patterns.length)}`);
                    console.log(`    Status: ${hook.enabled ? chalk.green('ENABLED') : chalk.red('DISABLED')}`);
                    console.log('');
                });
            }
            
            if (captureStatus.sessionStats.length > 0) {
                console.log(chalk.blue('📊 Session Statistics:'));
                captureStatus.sessionStats.forEach(stat => {
                    console.log(`  ${chalk.green('•')} Session ${stat.sessionId}: ${chalk.cyan(stat.capturedCount)} requests`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// List captured requests for a session
program
    .command('list')
    .description('List captured requests for a session')
    .argument('<sessionId>', 'Session ID')
    .option('-l, --limit <number>', 'Limit number of results', '10')
    .option('--show-tokens', 'Show extracted tokens')
    .option('--filter <type>', 'Filter by request type (request, response, page)')
    .action(async (sessionId, options) => {
        try {
            const capturedRequests = profileLauncher.getCapturedRequests(sessionId);
            
            if (capturedRequests.length === 0) {
                console.log(chalk.yellow('⚠️  No captured requests found for this session'));
                return;
            }
            
            // Apply filters
            let filteredRequests = capturedRequests;
            if (options.filter) {
                filteredRequests = capturedRequests.filter(req => req.type === options.filter);
            }
            
            // Apply limit
            const limit = parseInt(options.limit);
            const displayRequests = filteredRequests.slice(0, limit);
            
            console.log(chalk.blue(`🕸️  Captured Requests for Session: ${sessionId}`));
            console.log(chalk.blue('=' .repeat(50)));
            console.log(chalk.dim(`Total: ${capturedRequests.length}, Filtered: ${filteredRequests.length}, Showing: ${displayRequests.length}\n`));
            
            displayRequests.forEach((req, index) => {
                const typeColor = req.type === 'request' ? 'cyan' : req.type === 'response' ? 'green' : 'yellow';
                console.log(`${chalk.bold(`${index + 1}.`)} [${chalk[typeColor](req.type.toUpperCase())}] ${chalk.dim(req.timestamp)}`);
                console.log(`   URL: ${req.url}`);
                console.log(`   Hook: ${chalk.blue(req.hookName)}`);
                
                if (req.method) {
                    console.log(`   Method: ${chalk.cyan(req.method)}`);
                }
                
                if (req.status) {
                    const statusColor = req.status < 300 ? 'green' : req.status < 400 ? 'yellow' : 'red';
                    console.log(`   Status: ${chalk[statusColor](req.status)}`);
                }
                
                if (options.showTokens && req.custom && req.custom.tokens) {
                    const tokenCount = Object.keys(req.custom.tokens).length;
                    if (tokenCount > 0) {
                        console.log(`   🔑 Tokens: ${chalk.green(tokenCount)} found`);
                        Object.entries(req.custom.tokens).forEach(([key, value]) => {
                            const preview = typeof value === 'string' && value.length > 30 
                                ? value.substring(0, 30) + '...' 
                                : value;
                            console.log(`      ${key}: ${chalk.dim(preview)}`);
                        });
                    }
                }
                
                console.log('');
            });
            
            if (filteredRequests.length > limit) {
                console.log(chalk.dim(`... and ${filteredRequests.length - limit} more requests`));
                console.log(chalk.dim(`Use --limit to show more results`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Reload capture hooks
program
    .command('reload')
    .description('Reload request capture hooks from configuration')
    .action(async () => {
        try {
            console.log(chalk.blue('🔄 Reloading request capture hooks...'));
            
            await profileLauncher.reloadRequestCaptureHooks();
            
            const captureStatus = profileLauncher.getRequestCaptureStatus();
            console.log(chalk.green(`✅ Reloaded ${captureStatus.totalHooks} hooks`));
            
            if (captureStatus.hooks.length > 0) {
                console.log(chalk.blue('\nLoaded hooks:'));
                captureStatus.hooks.forEach(hook => {
                    console.log(`  ${chalk.green('•')} ${hook.name}: ${hook.description}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Clean up captured data
program
    .command('cleanup')
    .description('Clean up captured request data')
    .option('--session <sessionId>', 'Clean up specific session')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🧹 Cleaning up captured request data...'));
            
            if (options.session) {
                // Clean up specific session
                await profileLauncher.requestCaptureSystem.cleanup(options.session);
                
                console.log(chalk.green(`✅ Cleaned up session: ${options.session}`));
            } else {
                // Clean up all sessions
                await profileLauncher.requestCaptureSystem.cleanupAll();
                console.log(chalk.green('✅ Cleaned up all captured request data'));
            }
            
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
