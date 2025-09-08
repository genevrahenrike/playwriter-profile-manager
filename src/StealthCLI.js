#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProfileManager } from './ProfileManager.js';
import { ProfileLauncher } from './ProfileLauncher.js';
import { StealthManager } from './StealthManager.js';
import { FingerprintTester } from './FingerprintTester.js';
import { AuthenticityAnalyzer } from './AuthenticityAnalyzer.js';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();
const profileManager = new ProfileManager();
const profileLauncher = new ProfileLauncher(profileManager);
const stealthManager = new StealthManager();
const fingerprintTester = new FingerprintTester();
const authenticityAnalyzer = new AuthenticityAnalyzer();

// Stealth Launch Command
program
    .command('stealth-launch <profile>')
    .description('Launch profile with enhanced stealth features')
    .option('-b, --browser <type>', 'Browser type (chromium, firefox, webkit)', 'chromium')
    .option('--headless', 'Run in headless mode')
    .option('--devtools', 'Open devtools')
    .option('-p, --preset <preset>', 'Stealth preset (minimal, balanced, maximum)', 'balanced')
    .option('--no-stealth', 'Disable stealth features')
    .option('--test-fingerprint', 'Run fingerprint test after launch')
    .option('--load-extensions <paths...>', 'Load specific extensions')
    .option('--no-auto-extensions', 'Disable automatic extension loading')
    .option('--save-config', 'Save stealth config to profile')
    .action(async (profileName, options) => {
        try {
            console.log(chalk.blue('🛡️  Launching profile with stealth features...'));
            console.log(chalk.dim(`Profile: ${profileName}`));
            console.log(chalk.dim(`Stealth Preset: ${options.preset}`));
            
            const launchOptions = {
                browserType: options.browser,
                headless: options.headless || false,
                devtools: options.devtools || false,
                stealth: options.stealth !== false,
                stealthPreset: options.preset,
                testFingerprint: options.testFingerprint || false,
                loadExtensions: options.loadExtensions || [],
                autoLoadExtensions: options.autoExtensions !== false
            };

            const result = await profileLauncher.launchProfile(profileName, launchOptions);
            
            console.log(chalk.green('✅ Profile launched successfully!'));
            console.log(chalk.dim(`Session ID: ${result.sessionId}`));
            
            if (result.stealthEnabled) {
                console.log(chalk.green('🛡️  Stealth features: ACTIVE'));
            }
            
            if (result.fingerprintTest) {
                console.log(chalk.blue('🧪 Fingerprint test completed'));
            }

            // Save stealth config if requested
            if (options.saveConfig && result.stealthConfig) {
                await profileLauncher.saveStealthConfig(result.profile.id, result.stealthConfig);
                console.log(chalk.green('💾 Stealth configuration saved to profile'));
            }

            console.log(chalk.yellow('\n⚠️  Browser will remain open. Use Ctrl+C to close or run "ppm sessions" to manage.'));
            
            // Keep the process alive
            process.stdin.resume();
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Test Fingerprint Command
program
    .command('test-fingerprint')
    .description('Test fingerprint of active browser sessions')
    .option('-s, --session <sessionId>', 'Test specific session ID')
    .option('-a, --all', 'Test all active sessions')
    .option('--comprehensive', 'Run comprehensive test including multiple sites')
    .option('--save', 'Save results to file')
    .action(async (options) => {
        try {
            const sessions = profileLauncher.getActiveSessions();
            
            if (sessions.length === 0) {
                console.log(chalk.yellow('⚠️  No active browser sessions found.'));
                console.log(chalk.dim('Launch a profile first with: ppm stealth-launch <profile>'));
                return;
            }

            let sessionsToTest = [];
            
            if (options.session) {
                const session = sessions.find(s => s.sessionId === options.session);
                if (!session) {
                    console.error(chalk.red('❌ Session not found:'), options.session);
                    return;
                }
                sessionsToTest = [session];
            } else if (options.all) {
                sessionsToTest = sessions;
            } else {
                // Interactive selection
                const choices = sessions.map(s => ({
                    name: `${s.profileName} (${s.browserType}) - ${s.sessionId}`,
                    value: s.sessionId,
                    short: s.sessionId
                }));
                
                const answer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'sessionId',
                        message: 'Select session to test:',
                        choices
                    }
                ]);
                
                sessionsToTest = [sessions.find(s => s.sessionId === answer.sessionId)];
            }

            for (const session of sessionsToTest) {
                console.log(chalk.blue(`\n🧪 Testing fingerprint for session: ${session.sessionId}`));
                console.log(chalk.dim(`Profile: ${session.profileName} (${session.browserType})`));
                
                const testOptions = {
                    includeMultipleSites: options.comprehensive || false,
                    saveResults: options.save || false
                };
                
                const results = await profileLauncher.testFingerprint(session.sessionId, testOptions);
                
                if (results.error) {
                    console.error(chalk.red('❌ Test failed:'), results.error);
                } else {
                    console.log(chalk.green('✅ Fingerprint test completed'));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Compare Fingerprints Command
program
    .command('compare-fingerprints')
    .description('Compare fingerprints between sessions or saved results')
    .option('-s1, --session1 <sessionId>', 'First session ID')
    .option('-s2, --session2 <sessionId>', 'Second session ID')
    .option('-f1, --file1 <path>', 'First fingerprint results file')
    .option('-f2, --file2 <path>', 'Second fingerprint results file')
    .action(async (options) => {
        try {
            let source1, source2;
            
            if (options.session1) {
                source1 = options.session1;
            } else if (options.file1) {
                source1 = await fingerprintTester.loadResults(options.file1);
            } else {
                console.error(chalk.red('❌ Please specify first source (--session1 or --file1)'));
                return;
            }
            
            if (options.session2) {
                source2 = options.session2;
            } else if (options.file2) {
                source2 = await fingerprintTester.loadResults(options.file2);
            } else {
                console.error(chalk.red('❌ Please specify second source (--session2 or --file2)'));
                return;
            }
            
            console.log(chalk.blue('🔍 Comparing fingerprints...'));
            
            const comparison = await profileLauncher.compareFingerprints(source1, source2);
            
            console.log(chalk.green('\n📊 Comparison Results:'));
            console.log(`Similarity Score: ${comparison.score}%`);
            
            if (comparison.similarities.length > 0) {
                console.log(chalk.green('\n✅ Similarities:'));
                comparison.similarities.forEach(prop => {
                    console.log(`  • ${prop}`);
                });
            }
            
            if (comparison.differences.length > 0) {
                console.log(chalk.red('\n❌ Differences:'));
                comparison.differences.forEach(diff => {
                    console.log(`  • ${diff.property}:`);
                    console.log(`    Source 1: ${JSON.stringify(diff.value1)}`);
                    console.log(`    Source 2: ${JSON.stringify(diff.value2)}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Stealth Config Command
program
    .command('stealth-config')
    .description('Manage stealth configurations')
    .option('-p, --profile <name>', 'Profile name')
    .option('--save <preset>', 'Save preset to profile (minimal, balanced, maximum)')
    .option('--load', 'Load config from profile')
    .option('--show', 'Show current config')
    .option('--custom', 'Create custom configuration interactively')
    .action(async (options) => {
        try {
            if (!options.profile) {
                console.error(chalk.red('❌ Please specify a profile with --profile'));
                return;
            }
            
            if (options.save) {
                const config = stealthManager.createPreset(options.save);
                await profileLauncher.saveStealthConfig(options.profile, config);
                console.log(chalk.green(`✅ Saved ${options.save} preset to profile: ${options.profile}`));
            } else if (options.load) {
                const config = await profileLauncher.loadStealthConfig(options.profile);
                console.log(chalk.blue('📋 Loaded stealth configuration:'));
                console.log(JSON.stringify(config, null, 2));
            } else if (options.show) {
                const config = await profileLauncher.loadStealthConfig(options.profile);
                console.log(chalk.blue('📋 Current stealth configuration:'));
                
                // Show key settings in a readable format
                console.log(`\nStealth Features:`);
                console.log(`  • WebGL Protection: ${config.webgl.enabled ? '✅' : '❌'}`);
                console.log(`  • Audio Protection: ${config.audio.enabled ? '✅' : '❌'}`);
                console.log(`  • Canvas Protection: ${config.canvas.enabled ? '✅' : '❌'}`);
                console.log(`  • Screen Spoofing: ${config.screen.enabled ? '✅' : '❌'}`);
                console.log(`  • Hardware Spoofing: ${config.hardwareConcurrency.enabled ? '✅' : '❌'}`);
                console.log(`  • Memory Spoofing: ${config.memory.enabled ? '✅' : '❌'}`);
                console.log(`  • Battery Spoofing: ${config.battery.enabled ? '✅' : '❌'}`);
                console.log(`  • Language Spoofing: ${config.languages.enabled ? '✅' : '❌'}`);
                console.log(`  • Timezone Spoofing: ${config.timezone.enabled ? '✅' : '❌'}`);
                
            } else if (options.custom) {
                console.log(chalk.blue('🔧 Creating custom stealth configuration...'));
                
                const answers = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'webgl',
                        message: 'Enable WebGL fingerprinting protection?',
                        default: true
                    },
                    {
                        type: 'confirm',
                        name: 'audio',
                        message: 'Enable audio fingerprinting protection?',
                        default: true
                    },
                    {
                        type: 'confirm',
                        name: 'canvas',
                        message: 'Enable canvas fingerprinting protection?',
                        default: true
                    },
                    {
                        type: 'confirm',
                        name: 'screen',
                        message: 'Enable screen spoofing?',
                        default: false
                    },
                    {
                        type: 'confirm',
                        name: 'hardware',
                        message: 'Enable hardware concurrency spoofing?',
                        default: false
                    },
                    {
                        type: 'input',
                        name: 'userAgent',
                        message: 'Custom user agent (leave empty for auto-generated):',
                        default: ''
                    }
                ]);
                
                const config = stealthManager.createPreset('balanced');
                config.webgl.enabled = answers.webgl;
                config.audio.enabled = answers.audio;
                config.canvas.enabled = answers.canvas;
                config.screen.enabled = answers.screen;
                config.hardwareConcurrency.enabled = answers.hardware;
                
                if (answers.userAgent) {
                    config.userAgent.userAgent = answers.userAgent;
                }
                
                await profileLauncher.saveStealthConfig(options.profile, config);
                console.log(chalk.green('✅ Custom stealth configuration saved!'));
            } else {
                console.log(chalk.blue('📋 Available stealth presets:'));
                const presets = profileLauncher.getStealthPresets();
                presets.forEach(preset => {
                    console.log(`  • ${preset.name}: ${preset.description}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Sessions Command (enhanced with stealth info)
program
    .command('sessions')
    .description('View active browser sessions with stealth information')
    .action(async () => {
        try {
            const sessions = profileLauncher.getActiveSessions();
            
            if (sessions.length === 0) {
                console.log(chalk.yellow('⚠️  No active browser sessions.'));
                return;
            }
            
            console.log(chalk.blue(`\n📱 Active Sessions (${sessions.length}):`));
            console.log('='.repeat(60));
            
            for (const session of sessions) {
                const info = await profileLauncher.getBrowserInfo(session.sessionId);
                const duration = Math.floor(session.duration / 1000 / 60);
                
                console.log(`\n🔗 ${chalk.bold(session.profileName)} (${session.browserType})`);
                console.log(`   Session ID: ${chalk.dim(session.sessionId)}`);
                console.log(`   Duration: ${duration} minutes`);
                console.log(`   Pages: ${info.pageCount || 'Unknown'}`);
                
                // Check if stealth config exists
                try {
                    const stealthConfig = await profileLauncher.loadStealthConfig(session.profileName);
                    console.log(`   🛡️  Stealth: ${chalk.green('ACTIVE')}`);
                } catch {
                    console.log(`   🛡️  Stealth: ${chalk.dim('Not configured')}`);
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Authenticity Testing Commands
program
    .command('test-authenticity')
    .description('Test authenticity and bot detection risk of active sessions')
    .option('-s, --session <sessionId>', 'Test specific session ID')
    .option('-a, --all', 'Test all active sessions')
    .option('--comprehensive', 'Run comprehensive analysis including multi-site tests')
    .option('--save', 'Save results to file')
    .action(async (options) => {
        try {
            const sessions = profileLauncher.getActiveSessions();
            
            if (sessions.length === 0) {
                console.log(chalk.yellow('⚠️  No active browser sessions found.'));
                console.log(chalk.dim('Launch a profile first with: ppm-stealth stealth-launch <profile>'));
                return;
            }

            let sessionsToTest = [];
            
            if (options.session) {
                const session = sessions.find(s => s.sessionId === options.session);
                if (!session) {
                    console.error(chalk.red('❌ Session not found:'), options.session);
                    return;
                }
                sessionsToTest = [session];
            } else if (options.all) {
                sessionsToTest = sessions;
            } else {
                // Interactive selection
                const choices = sessions.map(s => ({
                    name: `${s.profileName} (${s.browserType}) - ${s.sessionId}`,
                    value: s.sessionId,
                    short: s.sessionId
                }));
                
                const answer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'sessionId',
                        message: 'Select session to test authenticity:',
                        choices
                    }
                ]);
                
                sessionsToTest = [sessions.find(s => s.sessionId === answer.sessionId)];
            }

            for (const session of sessionsToTest) {
                console.log(chalk.blue(`\n🔍 Testing authenticity for session: ${session.sessionId}`));
                console.log(chalk.dim(`Profile: ${session.profileName} (${session.browserType})`));
                
                const testOptions = {
                    includeMultipleSites: options.comprehensive || false,
                    includeBehavioralAnalysis: true,
                    includeConsistencyCheck: true,
                    saveResults: options.save || false
                };
                
                try {
                    const results = await profileLauncher.testAuthenticity(session.sessionId, testOptions);
                    
                    const score = results.scores.overall;
                    const riskLevel = profileLauncher.calculateRiskLevel(score);
                    const riskEmoji = riskLevel === 'LOW' ? '🟢' : 
                                     riskLevel === 'MEDIUM' ? '🟡' : 
                                     riskLevel === 'HIGH' ? '🟠' : '🔴';
                    
                    console.log(chalk.green('✅ Authenticity test completed'));
                    console.log(`${riskEmoji} Overall Score: ${(score * 100).toFixed(1)}% (${riskLevel} RISK)`);
                    
                    if (results.scores.suspicion_flags.length > 0) {
                        console.log(chalk.red(`⚠️  ${results.scores.suspicion_flags.length} suspicion flag(s) detected`));
                    }
                    
                } catch (error) {
                    console.error(chalk.red('❌ Authenticity test failed:'), error.message);
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('preflight-check <profile>')
    .description('Run preflight authenticity check before launching profile')
    .option('-p, --preset <preset>', 'Stealth preset to test', 'balanced')
    .option('--comprehensive', 'Run comprehensive analysis')
    .action(async (profileName, options) => {
        try {
            console.log(chalk.blue(`🚀 Running preflight authenticity check for: ${profileName}`));
            console.log(chalk.dim(`Testing with preset: ${options.preset}`));
            
            const stealthConfig = stealthManager.createPreset(options.preset);
            const results = await profileLauncher.runPreflightAuthenticityCheck(profileName, stealthConfig);
            
            if (results.error) {
                console.error(chalk.red('❌ Preflight check failed:'), results.error);
                return;
            }
            
            const score = results.authenticityAnalysis.scores.overall;
            const passed = results.passed;
            const riskLevel = results.riskLevel;
            
            console.log(chalk.green('✅ Preflight check completed'));
            console.log(`📊 Authenticity Score: ${(score * 100).toFixed(1)}%`);
            console.log(`🎯 Test Result: ${passed ? chalk.green('PASSED') : chalk.red('FAILED')}`);
            console.log(`⚠️  Risk Level: ${riskLevel}`);
            
            if (results.recommendations.length > 0) {
                console.log(chalk.yellow('\n💡 Recommendations:'));
                results.recommendations.forEach(rec => {
                    const emoji = rec.priority === 'CRITICAL' ? '🔥' : 
                                 rec.priority === 'HIGH' ? '⚠️' : 
                                 rec.priority === 'MEDIUM' ? 'ℹ️' : '💭';
                    console.log(`   ${emoji} ${rec.priority}: ${rec.message}`);
                    console.log(`      Action: ${rec.action}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('compare-authenticity <profile>')
    .description('Compare authenticity across different stealth presets')
    .option('--presets <presets...>', 'Presets to compare', ['minimal', 'balanced', 'maximum'])
    .action(async (profileName, options) => {
        try {
            console.log(chalk.blue(`🔬 Comparing authenticity for profile: ${profileName}`));
            
            const results = await profileLauncher.compareStealthAuthenticity(profileName, options.presets);
            
            console.log(chalk.green('✅ Authenticity comparison completed'));
            console.log(`🏆 Best Preset: ${results.recommendations.best_preset} (${(results.recommendations.best_score * 100).toFixed(1)}%)`);
            
            console.log(chalk.blue('\n📊 Detailed Results:'));
            results.comparisons.forEach(comp => {
                const emoji = comp.passed ? '✅' : '❌';
                const riskEmoji = comp.risk_level === 'LOW' ? '🟢' : 
                                 comp.risk_level === 'MEDIUM' ? '🟡' : 
                                 comp.risk_level === 'HIGH' ? '🟠' : '🔴';
                
                console.log(`   ${emoji} ${comp.preset}: ${(comp.overall_score * 100).toFixed(1)}% ${riskEmoji}`);
                if (comp.suspicion_flags.length > 0) {
                    console.log(`      ⚠️  ${comp.suspicion_flags.length} suspicion flag(s)`);
                }
            });
            
            if (results.recommendations.analysis.length > 0) {
                console.log(chalk.yellow('\n💡 Analysis:'));
                results.recommendations.analysis.forEach(insight => {
                    console.log(`   ${insight}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Help Command
program
    .command('help-stealth')
    .description('Show detailed help for stealth features')
    .action(() => {
        console.log(chalk.blue('\n🛡️  STEALTH FEATURES HELP\n'));
        
        console.log(chalk.bold('Available Commands:'));
        console.log('  stealth-launch <profile>    Launch profile with stealth features');
        console.log('  test-fingerprint            Test browser fingerprint');
        console.log('  test-authenticity           Test authenticity and bot detection risk');
        console.log('  preflight-check <profile>   Run preflight authenticity check');
        console.log('  compare-authenticity <profile> Compare authenticity across presets');
        console.log('  compare-fingerprints        Compare two fingerprint results');
        console.log('  stealth-config              Manage stealth configurations');
        console.log('  sessions                     View active sessions with stealth info');
        
        console.log(chalk.bold('\nStealth Presets:'));
        console.log('  minimal     - Essential anti-bot protection only (WebGL spoofing, keeps everything else authentic)');
        console.log('  balanced    - Conservative protection (WebGL + minimal audio/canvas noise, keeps user agent authentic) [DEFAULT]');
        console.log('  maximum     - Aggressive protection (all features enabled, may break some sites or look suspicious)');
        
        console.log(chalk.bold('\nProtection Features:'));
        console.log('  • WebGL fingerprinting protection');
        console.log('  • Audio fingerprinting protection');
        console.log('  • Canvas fingerprinting protection');
        console.log('  • Screen resolution spoofing');
        console.log('  • Hardware concurrency spoofing');
        console.log('  • Memory information spoofing');
        console.log('  • Battery API spoofing');
        console.log('  • Language and timezone spoofing');
        console.log('  • User agent randomization');
        
        console.log(chalk.bold('\nFingerprint Testing:'));
        console.log('  • Integrated MixVisit fingerprinting analysis');
        console.log('  • Multiple fingerprinting site testing');
        console.log('  • Custom fingerprint analysis');
        console.log('  • Fingerprint comparison tools');
        
        console.log(chalk.bold('\nAuthenticity Testing:'));
        console.log('  • Professional bot detection via iphey.com (40% weight)');
        console.log('  • Comprehensive analysis via Pixelscan (30% weight)');
        console.log('  • Multi-site fingerprint consistency checks');
        console.log('  • Behavioral pattern analysis (15% weight)');
        console.log('  • Preflight authenticity validation');
        console.log('  • AmIUnique data for validation (data only)');

        console.log(chalk.bold('\nExamples:'));
        console.log('  ppm-stealth stealth-launch my-profile --preset maximum --test-fingerprint');
        console.log('  ppm-stealth preflight-check my-profile --preset balanced');
        console.log('  ppm-stealth compare-authenticity my-profile');
        console.log('  ppm-stealth test-authenticity --comprehensive --save');
        console.log('  ppm-stealth test-fingerprint --comprehensive --save');
        console.log('  ppm-stealth stealth-config --profile my-profile --save balanced');
    });

program.parse();

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('❌ Unhandled error:'), error.message);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Goodbye!'));
    process.exit(0);
});
