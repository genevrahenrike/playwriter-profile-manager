#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import { ProfileManager } from './ProfileManager.js';
import { ChromiumImporter } from './ChromiumImporter.js';
import { ProfileLauncher } from './ProfileLauncher.js';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import LoginAnalyzer from './LoginAnalyzer.js';
import LoginAutomation from './LoginAutomation.js';
import CredentialsResolver from './CredentialsResolver.js';

// Register autocomplete plugin
inquirer.registerPrompt('autocomplete', autocomplete);

const program = new Command();
const profileManager = new ProfileManager();
const chromiumImporter = new ChromiumImporter();
// ProfileLauncher will be created only when needed to avoid loading all systems
let profileLauncher = null;

// Global defensive error handlers to ensure we never quit without diagnostics
process.on('unhandledRejection', (reason, promise) => {
    const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    console.error(chalk.red('[UnhandledRejection]'), msg);
    console.error(chalk.yellow('Context: This may happen during proxy IP checks. Review recent logs above (e.g., "Trying IP service ...").'));
});

process.on('uncaughtException', (err) => {
    const msg = err && err.stack ? err.stack : (err && err.message ? err.message : String(err));
    console.error(chalk.red('[UncaughtException]'), msg);
    console.error(chalk.yellow('Context: A fatal error occurred, likely during network/proxy requests. The process will exit with code 1.'));
    // Prefer setting exitCode so upstream can decide when to exit; Node will still terminate after an uncaught exception.
    process.exitCode = 1;
});

process.on('multipleResolves', (type, promise, reason) => {
    // Only log meaningful errors, not benign promise resolution races
    if (reason && typeof reason === 'object' && reason.message) {
        // Filter out benign CDP/Playwright internal promise races during context closure
        const message = reason.message || '';
        const stack = reason.stack || '';
        
        // Skip logging for known benign cases
        if (message.includes('Target page, context or browser has been closed') ||
            message.includes('FrameSession.dispose') ||
            message.includes('crPage.js') ||
            stack.includes('chromium/crPage.js')) {
            return; // Skip logging these benign cases
        }
        
        // Only log actual errors that might need attention
        if (message.includes('Error') || message.includes('Failed') || message.includes('Timeout')) {
            console.error(chalk.yellow('[MultipleResolves]'), type, reason.message);
        }
    }
});

// Helper function to get ProfileLauncher instance
function getProfileLauncher(options = {}) {
    if (!profileLauncher) {
        profileLauncher = new ProfileLauncher(profileManager, options);
    }
    return profileLauncher;
}

// Profile selector utility function
async function selectProfile(message = 'Select a profile:', allowCancel = false) {
    const profiles = await profileManager.listProfiles();
    
    if (profiles.length === 0) {
        throw new Error('No profiles found. Create one with: ppm create');
    }
    
    const choices = profiles.map(profile => {
        const lastUsedText = profile.lastUsed 
            ? ` (last used: ${new Date(profile.lastUsed).toLocaleDateString()})`
            : '';
        const description = profile.description ? ` - ${profile.description}` : '';
        return {
            name: `${profile.name}${description}${lastUsedText}`,
            value: profile.name,
            short: profile.name
        };
    });
    
    if (allowCancel) {
        choices.unshift({
            name: chalk.dim('Cancel'),
            value: null,
            short: 'Cancel'
        });
    }
    
    const answer = await inquirer.prompt([
        {
            type: 'autocomplete',
            name: 'profile',
            message: message,
            source: async (answersSoFar, input) => {
                // Always return a fresh copy of filtered choices
                const inputLower = input ? input.toLowerCase() : '';
                
                if (!input || input.trim() === '') {
                    return [...choices]; // Return copy of all choices
                }
                
                const filtered = choices.filter(choice => {
                    if (!choice || !choice.name || !choice.value) return false;
                    return choice.name.toLowerCase().includes(inputLower) ||
                           (choice.value && choice.value.toLowerCase().includes(inputLower));
                });
                
                return filtered.length > 0 ? filtered : [...choices]; // Return original if no matches
            },
            pageSize: 10
        }
    ]);
    
    if (answer.profile === null) {
        return null;
    }
    
    return answer.profile;
}

program
    .name('ppm')
    .description('Playwright Profile Manager - Manage browser profiles for automation')
    .version('1.0.0');

// Internal single-run command used by batch orchestrator (do not document publicly)
program
    .command('internal-batch-run')
    .description('(internal) Execute a single batch run in an isolated process')
    .requiredOption('-t, --template <name>', 'Template profile name')
    .requiredOption('-n, --name <instance>', 'Instance/profile name to create')
    .option('--run-id <id>', 'Run identifier for logging')
    .option('--headless', 'Run headless')
    .option('--timeout <ms>', 'Per-run success timeout', '120000')
    .option('--captcha-grace <ms>', 'Extra grace when CAPTCHA detected', '45000')
    .option('--disable-images', 'Disable image loading')
    .option('--disable-proxy-wait-increase', 'Disable proxy wait time increases')
    .option('--proxy-label <label>', 'Specific proxy label to use')
    .option('--proxy-type <type>', 'Proxy type (http)')
    .action(async (opts) => {
        // Enhanced logging for troubleshooting
        const logPrefix = `[${opts.name}]`;
        const log = (level, message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} ${logPrefix} [${level.toUpperCase()}] ${message}`;
            if (level === 'error') {
                console.error(logMessage);
            } else {
                console.log(logMessage);
            }
        };
        
        log('info', `Starting batch run with options: ${JSON.stringify(opts, null, 2)}`);
        
        // Minimal logging; emit final result as a tagged JSON line for the orchestrator
        const out = (obj) => {
            try { 
                console.log(`::RUN_RESULT::${JSON.stringify(obj)}`);
                log('info', `Emitted result: ${JSON.stringify(obj, null, 2)}`);
            } catch (err) {
                log('error', `Failed to emit result: ${err.message}`);
            }
        };
        const template = opts.template;
        const instance = opts.name;
        const runId = opts.runId || instance;
        const perRunTimeout = parseInt(opts.timeout, 10) || 120000;
        const captchaGrace = parseInt(opts.captchaGrace, 10) || 45000;
        
        log('info', `Initializing: template=${template}, instance=${instance}, runId=${runId}`);
        log('info', `Timeouts: perRun=${perRunTimeout}ms, captchaGrace=${captchaGrace}ms`);
        
        const pm = new ProfileManager();
        const launcher = new ProfileLauncher(pm, {});
        
        log('info', 'ProfileManager and ProfileLauncher initialized');
        
        const waitForOutcome = async (sessionId, context) => {
            log('info', `Starting outcome monitoring for session ${sessionId}`);
            const start = Date.now();
            const poll = 1000;
            let pollCount = 0;
            
            while (true) {
                pollCount++;
                if (pollCount % 10 === 0) {
                    log('info', `Outcome polling cycle ${pollCount}, elapsed: ${Date.now() - start}ms`);
                }
                
                try {
                    const comps = Array.from(launcher.automationSystem?.completedAutomations?.values?.() || [])
                        .filter(c => c.sessionId === sessionId && c.status === 'success');
                    if (comps.length > 0) {
                        log('info', `Automation success detected: ${comps.length} completions`);
                        return { success: true, reason: 'automation_success' };
                    }
                } catch (err) {
                    log('error', `Error checking automation completions: ${err.message}`);
                }

                try {
                    const captured = launcher.requestCaptureSystem.getCapturedRequests(sessionId) || [];
                    const ok = captured.some(r => r.type === 'response' && [200,201].includes(r.status) && (
                        (typeof r.url === 'string' && r.url.includes('api.vidiq.com/subscriptions/active')) ||
                        (typeof r.url === 'string' && r.url.includes('api.vidiq.com/subscriptions/stripe/next-subscription'))
                    ));
                    if (ok) {
                        log('info', `Capture success detected from ${captured.length} captured requests`);
                        return { success: true, reason: 'capture_success' };
                    }
                    
                    // Log capture progress periodically
                    if (pollCount % 30 === 0 && captured.length > 0) {
                        log('info', `Captured ${captured.length} requests so far`);
                    }
                } catch (err) {
                    log('error', `Error checking captured requests: ${err.message}`);
                }

                // CAPTCHA heuristic extends timeout
                let captchaLikely = false;
                try {
                    const pages = context?.pages?.() || [];
                    for (const p of pages) {
                        const a = await p.locator('iframe[src*="recaptcha"], div.g-recaptcha').count().catch(() => 0);
                        const b = await p.locator('iframe[src*="hcaptcha"], div.h-captcha').count().catch(() => 0);
                        if (a > 0 || b > 0) { 
                            captchaLikely = true;
                            log('info', `CAPTCHA detected: reCAPTCHA=${a}, hCAPTCHA=${b}`);
                            break;
                        }
                    }
                    if (pollCount % 15 === 0) {
                        log('info', `CAPTCHA check: ${captchaLikely ? 'detected' : 'none'}, ${pages.length} pages`);
                    }
                } catch (err) {
                    log('error', `Error during CAPTCHA detection: ${err.message}`);
                }

                const elapsed = Date.now() - start;
                const effective = captchaLikely ? (perRunTimeout + captchaGrace) : perRunTimeout;
                if (perRunTimeout > 0 && elapsed >= effective) {
                    log('info', `Timeout reached: elapsed=${elapsed}ms, effective=${effective}ms, captcha=${captchaLikely}`);
                    
                    // Best-effort screenshot
                    try {
                        const pages = context?.pages?.() || [];
                        const p = pages.find(pg => {
                            const u = pg.url();
                            return u && u !== 'about:blank' && !u.startsWith('chrome://');
                        }) || pages[0];
                        if (p) {
                            const resultsDir = path.resolve('./automation-results');
                            await fs.ensureDir(resultsDir);
                            const outBase = `${sessionId}-timeout-${new Date().toISOString().replace(/[:.]/g,'-')}`;
                            const png = path.join(resultsDir, `${outBase}.png`);
                            await p.screenshot({ path: png, fullPage: true }).catch((screenshotErr) => {
                                log('error', `Screenshot failed: ${screenshotErr.message}`);
                            });
                            log('info', `Screenshot saved: ${png}`);
                        } else {
                            log('warning', 'No suitable page found for screenshot');
                        }
                    } catch (err) {
                        log('error', `Screenshot capture error: ${err.message}`);
                    }
                    return { success: false, reason: captchaLikely ? 'timeout_with_captcha' : 'timeout' };
                }
                await new Promise(r => setTimeout(r, poll));
            }
        };

        try {
            const launchOptions = {
                browserType: 'chromium',
                headless: !!opts.headless,
                enableAutomation: true,
                headlessAutomation: true,
                enableRequestCapture: true,
                autoCloseOnSuccess: false,
                autoCloseOnFailure: false,
                autoCloseTimeout: 0,
                isTemporary: false,
                stealth: true,
                stealthPreset: 'balanced',
                disableCompression: false,
                disableImages: !!opts.disableImages,
                disableProxyWaitIncrease: !!opts.disableProxyWaitIncrease
            };
            if (opts.proxyLabel && opts.proxyType) {
                launchOptions.proxy = opts.proxyLabel;
                launchOptions.proxyType = opts.proxyType;
                log('info', `Using proxy: ${opts.proxyLabel} (${opts.proxyType})`);
            }
            
            log('info', `Launch options: ${JSON.stringify(launchOptions, null, 2)}`);
            log('info', 'Launching profile from template...');

            const res = await launcher.launchFromTemplate(template, instance, launchOptions);
            const profile = res.profile;
            
            log('info', `Profile launched successfully: ${profile?.name} (${profile?.id})`);
            log('info', `Session ID: ${res.sessionId}`);
            log('info', 'Starting outcome monitoring...');
            
            const outcome = await waitForOutcome(res.sessionId, res.context);
            
            log('info', `Outcome received: ${JSON.stringify(outcome, null, 2)}`);
            log('info', 'Attempting to close browser...');

            // Try to close within a bounded time; if it hangs, we exit anyway
            const closePromise = launcher.closeBrowser(res.sessionId, { clearCache: false }).catch((err) => {
                log('error', `Browser close error: ${err.message}`);
            });
            await Promise.race([
                closePromise,
                new Promise(r => setTimeout(r, 10000))
            ]);
            
            log('info', 'Browser cleanup completed');

            const result = {
                runId,
                success: !!outcome.success,
                reason: outcome.reason || null,
                profileId: profile?.id || null,
                profileName: profile?.name || instance,
                proxy: opts.proxyLabel ? { label: opts.proxyLabel, type: opts.proxyType || null } : null
            };
            
            log('info', `Final result prepared: ${JSON.stringify(result, null, 2)}`);
            out(result);
            
            log('info', `Process exiting with code: ${outcome.success ? 0 : 1}`);
            process.exit(outcome.success ? 0 : 1);
        } catch (err) {
            log('error', `Unhandled error in batch run: ${err.message}`);
            log('error', `Stack trace: ${err.stack}`);
            
            const errorResult = { runId, success: false, reason: 'error', error: err?.message || String(err) };
            out(errorResult);
            
            log('info', 'Process exiting with code: 1 (error)');
            process.exit(1);
        } finally {
            try { 
                log('info', 'Final cleanup: closing all browsers');
                await profileLauncher?.closeAllBrowsers({});
            } catch (cleanupErr) {
                log('error', `Cleanup error: ${cleanupErr.message}`);
            }
        }
    });

// Create profile command
program
    .command('create')
    .description('Create a new browser profile')
    .option('-n, --name <name>', 'Profile name')
    .option('-d, --description <description>', 'Profile description')
    .option('-b, --browser <type>', 'Browser type (chromium, firefox, webkit)', 'chromium')
    .option('--no-compress', 'Disable on-close compression for this profile')
    .action(async (options) => {
        try {
            let name = options.name;
            let description = options.description || '';
            
            if (!name) {
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Profile name:',
                        validate: (input) => input.trim() ? true : 'Profile name is required'
                    },
                    {
                        type: 'input',
                        name: 'description',
                        message: 'Profile description (optional):'
                    }
                ]);
                name = answers.name;
                description = answers.description;
            }
            
            const profile = await profileManager.createProfile(name, {
                description,
                browserType: options.browser,
                disableCompression: options.compress === false
            });
            
            console.log(chalk.green('✓ Profile created successfully!'));
            console.log(chalk.blue(`  ID: ${profile.id}`));
            console.log(chalk.blue(`  Name: ${profile.name}`));
            console.log(chalk.blue(`  Browser: ${profile.browserType}`));
            console.log(chalk.blue(`  Path: ${profile.userDataDir}`));
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// List profiles command
program
    .command('list')
    .alias('ls')
    .description('List all browser profiles')
    .option('-v, --verbose', 'Show detailed information')
    .option('-s, --sort <field>', 'Sort by field (name, created, used, sessions)', 'name')
    .option('--desc', 'Sort in descending order (default: ascending)')
    .action(async (options) => {
        try {
            const profiles = await profileManager.listProfiles();
            
            if (profiles.length === 0) {
                console.log(chalk.yellow('No profiles found. Create one with: ppm create'));
                return;
            }
            // Sort profiles based on options
            const sortField = options.sort.toLowerCase();
            const isDescending = options.desc;
            
            profiles.sort((a, b) => {
                let comparison = 0;
                
                switch (sortField) {
                    case 'name':
                    case 'n':
                        comparison = a.name.localeCompare(b.name);
                        break;
                    case 'created':
                    case 'c':
                        comparison = new Date(a.createdAt) - new Date(b.createdAt);
                        break;
                    case 'used':
                    case 'u':
                    case 'last':
                        // Handle null/undefined lastUsed (never used profiles go to end)
                        if (!a.lastUsed && !b.lastUsed) comparison = 0;
                        else if (!a.lastUsed) comparison = 1;
                        else if (!b.lastUsed) comparison = -1;
                        else comparison = new Date(a.lastUsed) - new Date(b.lastUsed);
                        break;
                    case 'sessions':
                    case 's':
                        comparison = (a.sessionCount || 0) - (b.sessionCount || 0);
                        break;
                    default:
                        console.log(chalk.yellow(`Warning: Unknown sort field '${options.sort}', using 'name' instead`));
                        comparison = a.name.localeCompare(b.name);
                }
                
        return isDescending ? -comparison : comparison;
            });

            const sortDisplay = {
                name: 'name',
                created: 'creation date', 
                used: 'last used',
                sessions: 'session count'
            };
            
            const sortFieldDisplay = sortDisplay[sortField] || sortField;
            const orderDisplay = isDescending ? 'descending' : 'ascending';
            
            console.log(chalk.blue(`Found ${profiles.length} profile(s) (sorted by ${sortFieldDisplay}, ${orderDisplay}):\n`));
            
            for (const profile of profiles) {
                if (options.verbose) {
                    // Verbose mode: detailed multi-line format
                    console.log(chalk.green(`● ${profile.name}`));
                    console.log(`  ID: ${chalk.dim(profile.id)}`);
                    console.log(`  Browser: ${profile.browserType}`);
                    console.log(`  Created: ${new Date(profile.createdAt).toLocaleString()}`);
                    
                    if (profile.lastUsed) {
                        console.log(`  Last used: ${new Date(profile.lastUsed).toLocaleString()}`);
                    }
                    
                    if (profile.sessionCount > 0) {
                        console.log(`  Sessions: ${profile.sessionCount}`);
                    }
                    
                    if (profile.importedFrom) {
                        console.log(`  Imported from: ${profile.importedFrom}`);
                    }
                    
                    if (profile.description) {
                        console.log(`  Description: ${profile.description}`);
                    }
                    
                    console.log('');
                } else {
                    // Compact mode: clean single-line format with proper spacing + ID line
                    const lastUsedText = profile.lastUsed 
                        ? new Date(profile.lastUsed).toLocaleDateString()
                        : chalk.dim('never');
                    
                    const sessionsText = profile.sessionCount > 0 
                        ? chalk.yellow(`${profile.sessionCount} sessions`)
                        : chalk.dim('0 sessions');
                    
                    const statusIndicators = [];
                    if (profile.importedFrom) statusIndicators.push(chalk.cyan('[imported]'));
                    if (profile.description && profile.description.includes('Template instance:')) {
                        // Extract template name from description like "Template instance: test-permanent (from vidiq-clean)"
                        const templateMatch = profile.description.match(/Template instance: .+ \(from (.+)\)/);
                        const templateName = templateMatch ? templateMatch[1] : 'unknown';
                        statusIndicators.push(chalk.magenta(`[template: ${templateName}]`));
                    }
                    
                    // Clean, consistent single-line format
                    const name = chalk.green(`● ${profile.name}`);
                    const browser = chalk.dim(profile.browserType);
                    const lastUsed = `${chalk.dim('last:')} ${lastUsedText}`;
                    const sessions = `${chalk.dim('sessions:')} ${sessionsText}`;
                    const status = statusIndicators.length > 0 ? statusIndicators.join(' ') : '';
                    
                    console.log(`${name.padEnd(35)} ${browser.padEnd(12)} ${lastUsed.padEnd(20)} ${sessions.padEnd(18)} ${status}`);
                    console.log(chalk.dim(`  ID: ${profile.id}`));
                }
            }
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Import profile command
program
    .command('import')
    .description('Import a profile from existing Chromium-based browser')
    .option('-n, --name <name>', 'Name for the imported profile')
    .option('-p, --path <path>', 'Custom path to Chromium profile directory')
    .option('--selective', 'Choose what data to import')
    .option('--playwright-only', 'Import only Playwright-supported data')
    .action(async (options) => {
        try {
            let selectedProfile;
            let profilePath;
            
            // Handle custom path import
            if (options.path) {
                profilePath = path.resolve(options.path);
                console.log(chalk.blue(`Importing from custom path: ${profilePath}`));
                
                // Validate the path
                if (!await fs.pathExists(profilePath)) {
                    console.error(chalk.red('✗ Error: Path does not exist'));
                    process.exit(1);
                }
                
                selectedProfile = {
                    browser: 'Custom Path',
                    name: path.basename(profilePath),
                    path: profilePath
                };
            } else {
                // Scan for existing profiles
                console.log(chalk.blue('Scanning for Chromium-based browsers...'));
                const availableProfiles = await chromiumImporter.findChromiumProfiles();
                
                if (availableProfiles.length === 0) {
                    console.log(chalk.yellow('No Chromium-based browser profiles found.'));
                    console.log(chalk.blue('Use --path to specify a custom profile directory.'));
                    return;
                }
                
                const groupedProfiles = chromiumImporter.groupProfilesByBrowser(availableProfiles);
                const browserKeys = Object.keys(groupedProfiles);
                
                console.log(chalk.green(`Found ${availableProfiles.length} profile(s) across ${browserKeys.length} browser(s):\n`));
                
                // Step 1: Select browser
                const browserChoices = browserKeys.map(browserKey => {
                    const browserData = groupedProfiles[browserKey];
                    const profileCount = browserData.profiles.length;
                    return {
                        name: `${browserData.browser} ${browserData.channel} (${profileCount} profile${profileCount > 1 ? 's' : ''})`,
                        value: browserKey,
                        short: `${browserData.browser} ${browserData.channel}`
                    };
                });
                
                const browserAnswer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'browserKey',
                        message: 'Select browser:',
                        choices: browserChoices,
                        pageSize: 15
                    }
                ]);
                
                const selectedBrowserData = groupedProfiles[browserAnswer.browserKey];
                
                // Step 2: Select profile from chosen browser
                console.log(chalk.blue(`\nProfiles in ${selectedBrowserData.browser} ${selectedBrowserData.channel}:`));
                
                const profileChoices = [];
                for (const profile of selectedBrowserData.profiles) {
                    const size = await chromiumImporter.getProfileSize(profile.path);
                    const defaultBadge = profile.isDefault ? chalk.yellow(' [Default]') : '';
                    profileChoices.push({
                        name: `${profile.name} (${size})${defaultBadge}`,
                        value: profile,
                        short: profile.name
                    });
                }
                
                const profileAnswer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'profile',
                        message: 'Select profile to import:',
                        choices: profileChoices,
                        pageSize: 10
                    }
                ]);
                
                selectedProfile = profileAnswer.profile;
                profilePath = selectedProfile.path;
            }
            
            // Get profile name with smart suggestions
            let profileName = options.name;
            if (!profileName) {
                const suggestedName = selectedProfile.channel && selectedProfile.channel !== 'Stable' 
                    ? `${selectedProfile.name} (${selectedProfile.browser} ${selectedProfile.channel})`
                    : `${selectedProfile.name} (${selectedProfile.browser})`;
                
                const nameAnswer = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Name for imported profile:',
                        default: suggestedName,
                        validate: (input) => input.trim() ? true : 'Profile name is required',
                        transformer: (input) => {
                            // Show auto-suggestion in dim text
                            return input || chalk.dim(suggestedName);
                        }
                    }
                ]);
                profileName = nameAnswer.name || suggestedName;
            }
            
            // Handle selective import
            let importOptions = {};
            
            if (options.playwrightOnly) {
                // Import only Playwright-supported data
                const dataTypes = chromiumImporter.getImportableDataTypes();
                importOptions = Object.keys(dataTypes).reduce((opts, key) => {
                    opts[key] = dataTypes[key].playwrightSupported;
                    return opts;
                }, {});
                
                console.log(chalk.blue('Importing only Playwright-supported data...'));
            } else if (options.selective) {
                // Interactive selection
                const dataTypes = chromiumImporter.getImportableDataTypes();
                const selectiveAnswers = await inquirer.prompt([
                    {
                        type: 'checkbox',
                        name: 'dataToImport',
                        message: 'Select data to import:',
                        choices: Object.entries(dataTypes).map(([key, info]) => ({
                            name: `${info.name} - ${info.description}${info.playwrightSupported ? ' (Playwright supported)' : ''}`,
                            value: key,
                            checked: info.essential
                        })),
                        validate: (answer) => {
                            if (answer.length === 0) {
                                return 'You must select at least one data type to import.';
                            }
                            return true;
                        }
                    }
                ]);
                
                // Set import options based on selection
                importOptions = Object.keys(dataTypes).reduce((opts, key) => {
                    opts[key] = selectiveAnswers.dataToImport.includes(key);
                    return opts;
                }, {});
            }
            // If no selective options, use defaults (import everything)
            
            console.log(chalk.blue('Creating new profile...'));
            const newProfile = await profileManager.createProfile(profileName, {
                description: `Imported from ${selectedProfile.browser}`,
                browserType: 'chromium',
                importFrom: profilePath
            });
            
            console.log(chalk.blue('Importing data...'));
            const importResults = await chromiumImporter.importProfile(
                profilePath,
                newProfile.userDataDir,
                importOptions
            );
            
            console.log(chalk.green('✓ Profile imported successfully!'));
            console.log(chalk.blue(`  Name: ${newProfile.name}`));
            const sourceInfo = selectedProfile.channel 
                ? `${selectedProfile.browser} ${selectedProfile.channel} - ${selectedProfile.name}`
                : `${selectedProfile.browser} - ${selectedProfile.name}`;
            console.log(chalk.blue(`  Source: ${sourceInfo}`));
            console.log(chalk.blue('  Imported data:'));
            
            const dataTypes = chromiumImporter.getImportableDataTypes();
            Object.entries(importResults).forEach(([key, success]) => {
                const status = success ? chalk.green('✓') : chalk.red('✗');
                const info = dataTypes[key];
                const playwrightNote = info?.playwrightSupported ? chalk.dim(' (Playwright)') : '';
                console.log(`    ${status} ${info?.name || key}${playwrightNote}`);
            });
            
            // Show summary
            const successCount = Object.values(importResults).filter(Boolean).length;
            const totalCount = Object.keys(importResults).length;
            console.log(chalk.blue(`\n  Summary: ${successCount}/${totalCount} data types imported`));
            
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Launch profile command
program
    .command('launch')
    .description('Launch a browser with specified profile')
    .argument('[profile]', 'Profile name or ID (optional - will show selection if not provided)')
    .option('-b, --browser <type>', 'Browser type (chromium, firefox, webkit)', 'chromium')
    .option('--headless', 'Run in headless mode')
    .option('--devtools', 'Open with devtools')
    .option('-f, --fresh', 'Launch with a fresh temporary profile')
    .option('--load-extensions <paths...>', 'Inject extensions from specified paths')
    .option('--no-auto-extensions', 'Disable automatic injection of extensions from ./extensions folder')
    .option('--clear-cache-on-exit', 'Clear cache when browser is closed to reduce disk usage')
    .option('--no-automation', 'Disable automation capabilities (enabled by default)')
    .option('--no-max-stealth', 'Disable maximum stealth mode (enabled by default)')
    .option('--automation-tasks <tasks...>', 'Specify custom automation tasks')
    .option('--headless-automation', 'Enable headless automation mode (autofill + submit + monitor success)')
    .option('--automation-autofill-only', 'Disable AutofillHookSystem; automation fills email/password')
    .option('--auto-close-on-success', 'Automatically close browser when success is detected (headed or headless)')
    .option('--auto-close-on-failure', 'Automatically close browser on timeout/failure (headed or headless)')
    .option('--auto-close-timeout <ms>', 'Timeout before treating as failure (ms)', '120000')
    .option('--captcha-grace <ms>', 'Extra grace time if CAPTCHA is detected (ms)', '45000')
    .option('--no-capture', 'Disable request capture (enabled by default)')
    .option('--capture-format <format>', 'Request capture output format (jsonl, json, csv)', 'jsonl')
    .option('--capture-dir <dir>', 'Request capture output directory', './captured-requests')
    .option('--no-autofill-stop-on-success', 'Disable stopping autofill after success (default: enabled)')
    .option('--autofill-enforce-mode', 'Continue autofill monitoring even after success for race condition protection')
    .option('--autofill-min-fields <number>', 'Minimum fields required for autofill success', '2')
    .option('--no-compress', 'Disable compress-on-close for this instance')
    .option('--autofill-cooldown <ms>', 'Cooldown period before re-enabling autofill after success (ms)', '30000')
    .option('--proxy-strategy <strategy>', 'Proxy selection strategy: auto, random, fastest, round-robin, geographic')
    .option('--proxy-start <label>', 'Proxy label to start rotation from (useful to skip already used proxies)')
    .option('--proxy-type <type>', 'Proxy type filter: http (socks5 not supported by Playwright)')
    .option('--proxy-connection-type <type>', 'Proxy connection type filter: resident, datacenter, mobile')
    .option('--proxy-country <country>', 'Proxy country filter (ISO code like US, GB, DE or name like Germany)')
    .option('--geographic-ratio <ratio>', 'Geographic distribution ratio (e.g., "US:45,Other:55" or "US:40,EU:35,Other:25")')
    .option('--disable-images', 'Disable image loading for faster proxy performance')
    .option('--disable-proxy-wait-increase', 'Disable proxy mode wait time increases (use normal timeouts even with proxies)')
    .option('--list-proxies', 'List all available proxies and exit')
    .option('--skip-ip-check', 'Skip proxy IP resolution/uniqueness checks (fastest, may allow duplicate IPs)')
    .option('--ip-check-timeout <ms>', 'Per-attempt IP check timeout (ms)', '10000')
    .option('--ip-check-retries <n>', 'Max attempts across IP endpoints', '3')
    .action(async (profileName, options) => {
        try {
            // Create ProfileLauncher with autofill options
            const launcherOptions = {
                autofillStopOnSuccess: options.autofillStopOnSuccess || false,
                autofillEnforceMode: options.autofillEnforceMode || false,
                autofillMinFields: parseInt(options.autofillMinFields) || 2,
                autofillCooldown: parseInt(options.autofillCooldown) || 30000
            };
            
            profileLauncher = new ProfileLauncher(profileManager, launcherOptions);
            
            // Handle proxy listing
            if (options.listProxies) {
                await profileLauncher.ensureProxiesLoaded();
                profileLauncher.proxyManager.listProxies();
                return;
            }
            
            // Show autofill configuration
            if (options.autofillStopOnSuccess === false || options.autofillEnforceMode) {
                console.log(chalk.blue('🎯 Autofill Configuration:'));
                console.log(chalk.blue(`   Stop on Success: ${options.autofillStopOnSuccess !== false ? 'enabled (default)' : 'disabled'}`));
                console.log(chalk.blue(`   Enforce Mode: ${options.autofillEnforceMode ? 'enabled' : 'disabled'}`));
                console.log(chalk.blue(`   Min Fields for Success: ${parseInt(options.autofillMinFields) || 2}`));
                console.log(chalk.blue(`   Success Cooldown: ${parseInt(options.autofillCooldown) || 30000}ms`));
            }
            
            let result;
            
            // If no profile name provided, show selector
            if (!profileName && !options.fresh) {
                profileName = await selectProfile('Select profile to launch:');
            }
            
            // Configure request capture system if needed
            if (options.captureDir !== './captured-requests' || options.captureFormat !== 'jsonl') {
                profileLauncher.requestCaptureSystem.outputDirectory = options.captureDir;
                profileLauncher.requestCaptureSystem.outputFormat = options.captureFormat;
                await profileLauncher.requestCaptureSystem.ensureOutputDirectory();
            }

            // Adjust timeouts for proxy mode
            const hasProxyOptions = options.proxyStrategy || options.proxyStart || options.proxy;
            const baseAutoCloseTimeout = hasProxyOptions ? 180000 : 120000; // 3 minutes vs 2 minutes
            const baseCaptchaGrace = hasProxyOptions ? 60000 : 45000; // 1 minute vs 45 seconds
            
            // Prepare launch options
            const launchOptions = {
                browserType: options.browser,
                headless: options.headless, // Enable headless for headless automation
                devtools: options.devtools,
                loadExtensions: options.loadExtensions || [],
                autoLoadExtensions: options.autoExtensions !== false, // True by default, disable with --no-auto-extensions
                enableAutomation: !!options.automation, // Default OFF; enable with --automation
                enableRequestCapture: options.capture !== false, // True by default, disable with --no-capture
                maxStealth: options.maxStealth !== false, // True by default, disable with --no-max-stealth
                automationTasks: options.automationTasks || [],
                headlessAutomation: options.headlessAutomation || false,
                autoCloseOnSuccess: options.autoCloseOnSuccess || false,
                autoCloseOnFailure: options.autoCloseOnFailure || false,
                autoCloseTimeout: parseInt(options.autoCloseTimeout) || baseAutoCloseTimeout,
                captchaGraceMs: parseInt(options.captchaGrace) || baseCaptchaGrace,
                disableCompression: options.compress === false,
                proxyStrategy: options.proxyStrategy,
                proxyStart: options.proxyStart,
                proxyType: options.proxyType,
                proxyConnectionType: options.proxyConnectionType,
                proxyCountry: options.proxyCountry,
                disableImages: options.disableImages,
                disableProxyWaitIncrease: options.disableProxyWaitIncrease,
                automationAutofillOnly: !!options.automationAutofillOnly,
                // IP check controls (affects round-robin rotation path)
                skipIpCheck: !!options.skipIpCheck,
                ipCheckTimeout: parseInt(options.ipCheckTimeout) || 10000,
                ipCheckRetries: parseInt(options.ipCheckRetries) || 3
            };
            
            if (hasProxyOptions) {
                console.log(`🌐 Proxy mode detected - using extended timeouts:`);
                console.log(`   Auto-close timeout: ${launchOptions.autoCloseTimeout/1000}s`);
                console.log(`   CAPTCHA grace: ${launchOptions.captchaGraceMs/1000}s`);
            }

            // Show extension-related info
            if (options.loadExtensions && options.loadExtensions.length > 0) {
                console.log(chalk.blue(`📁 Injecting ${options.loadExtensions.length} manual extension(s)...`));
            }

            if (launchOptions.autoLoadExtensions) {
                console.log(chalk.blue('🔍 Scanning ./extensions folder for extensions to auto-inject...'));
            }

            // Show automation and stealth status
            if (launchOptions.enableAutomation) {
                console.log(chalk.green('🤖 Automation enabled - Browser will be connected to automation API'));
                if (launchOptions.headlessAutomation) {
                    console.log(chalk.cyan('🔄 Headless automation mode - Will auto-fill, submit, and monitor for success'));
                }
                if (launchOptions.autoCloseOnSuccess) {
                    console.log(chalk.cyan('🚪 Auto-close enabled - Browser will close automatically on success'));
                }
            } else {
                console.log(chalk.yellow('⚠️  Automation disabled - Running in manual mode only'));
            }

            if (launchOptions.maxStealth) {
                console.log(chalk.green('🛡️  Maximum stealth mode enabled - Full anti-detection active'));
            } else {
                console.log(chalk.yellow('⚠️  Standard stealth mode - Some detection vectors may be exposed'));
            }

            if (options.fresh) {
                console.log(chalk.blue('Launching fresh profile...'));
                result = await profileLauncher.launchFreshProfile(profileName, launchOptions);
            } else {
                console.log(chalk.blue(`Launching profile: ${profileName}`));
                result = await profileLauncher.launchProfile(profileName, launchOptions);
            }
            
            console.log(chalk.green('✓ Browser launched successfully!'));
            console.log(chalk.blue(`  Profile: ${result.profile.name}`));
            console.log(chalk.blue(`  Session ID: ${result.sessionId}`));
            console.log(chalk.blue(`  Browser: ${options.browser}`));
            if (result.automationEnabled) {
                console.log(chalk.green(`  🤖 Automation: Active (monitoring for VidIQ tabs)`));
            } else {
                console.log(chalk.gray(`  🤖 Automation: Disabled`));
            }
            
            if (result.requestCaptureEnabled) {
                console.log(chalk.green(`  🕸️  Request Capture: Active`));
                const captureStatus = profileLauncher.getRequestCaptureStatus();
                console.log(chalk.dim(`    Output: ${captureStatus.outputDirectory} (${captureStatus.outputFormat})`));
                console.log(chalk.dim(`    Hooks: ${captureStatus.totalHooks} loaded`));
            } else {
                console.log(chalk.gray(`  🕸️  Request Capture: Disabled`));
            }
            
            if (!options.headless) {
                console.log(chalk.yellow('\nPress Ctrl+C to close the browser and end the session.'));
                
                // Keep the process alive and handle graceful shutdown
                const cleanup = async () => {
                    console.log(chalk.blue('\nClosing browser...'));
                    try {
                        const closeOptions = { clearCache: options.clearCacheOnExit };
                        const closeResult = await profileLauncher.closeBrowser(result.sessionId, closeOptions);
                        console.log(chalk.green('✓ Browser closed successfully!'));
                        
                        if (closeResult.cacheCleared) {
                            if (closeResult.cacheCleared.success) {
                                console.log(chalk.green(`✓ Cache cleared: ${closeResult.cacheCleared.sizeCleared} freed`));
                            } else {
                                console.log(chalk.yellow(`⚠️  Could not clear cache: ${closeResult.cacheCleared.error}`));
                            }
                        }
                    } catch (error) {
                        console.error(chalk.red('✗ Error closing browser:'), error.message);
                    }
                    process.exit(0);
                };
                
                process.on('SIGINT', cleanup);
                process.on('SIGTERM', cleanup);
                
                // Keep process alive
                await new Promise(() => {});
            }
            
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Template launch command
program
    .command('launch-template')
    .description('Launch from template profile with randomized fingerprint')
    .argument('<template>', 'Template profile name or ID')
    .argument('<instance-name>', 'Name for this instance')
    .option('-b, --browser <type>', 'Browser type (chromium, firefox, webkit)', 'chromium')
    .option('--headless', 'Run in headless mode')
    .option('--devtools', 'Open devtools')
    .option('--temp', 'Create temporary profile that will be deleted when browser closes')
    .option('--no-randomize-fingerprint', 'Disable fingerprint randomization')
    .option('--vary-screen-resolution', 'Enable Mac-authentic screen resolution variation')
    .option('--stealth-preset <preset>', 'Stealth preset (minimal, balanced, maximum)', 'balanced')
    .option('--load-extensions <paths...>', 'Load additional extensions')
    .option('--no-auto-extensions', 'Disable automatic extension loading')
    .option('--automation', 'Enable automation features (default: off)')
    .option('--headless-automation', 'Enable headless automation mode (autofill + submit + monitor success)')
    .option('--automation-autofill-only', 'Disable AutofillHookSystem; automation fills email/password')
    .option('--auto-close-on-success', 'Automatically close browser when success is detected (headed or headless)')
    .option('--auto-close-on-failure', 'Automatically close browser on timeout/failure (headed or headless)')
    .option('--auto-close-timeout <ms>', 'Timeout before treating as failure (ms)', '120000')
    .option('--captcha-grace <ms>', 'Extra grace time if CAPTCHA is detected (ms)', '45000')
    .option('--no-capture', 'Disable request capture')
    .option('--no-autofill-stop-on-success', 'Disable stopping autofill after success (default: enabled)')
    .option('--autofill-enforce-mode', 'Continue autofill monitoring even after success for race condition protection')
    .option('--autofill-min-fields <number>', 'Minimum fields required for autofill success', '2')
    .option('--autofill-cooldown <ms>', 'Cooldown period before re-enabling autofill after success (ms)', '30000')
    .option('--no-compress', 'Disable compress-on-close for this instance')
    .option('--proxy-strategy <strategy>', 'Proxy selection strategy: auto, random, fastest, round-robin, geographic')
    .option('--proxy-start <label>', 'Proxy label to start rotation from (useful to skip already used proxies)')
    .option('--proxy-type <type>', 'Proxy type filter: http (socks5 not supported by Playwright)')
    .option('--proxy-connection-type <type>', 'Proxy connection type filter: resident, datacenter, mobile')
    .option('--proxy-country <country>', 'Proxy country filter (ISO code like US, GB, DE or name like Germany)')
    .option('--geographic-ratio <ratio>', 'Geographic distribution ratio (e.g., "US:45,Other:55" or "US:40,EU:35,Other:25")')
    .option('--disable-images', 'Disable image loading for faster proxy performance')
    .option('--disable-proxy-wait-increase', 'Disable proxy mode wait time increases (use normal timeouts even with proxies)')
    .option('--skip-ip-check', 'Skip proxy IP resolution/uniqueness checks (fastest, may allow duplicate IPs)')
    .option('--ip-check-timeout <ms>', 'Per-attempt IP check timeout (ms)', '10000')
    .option('--ip-check-retries <n>', 'Max attempts across IP endpoints', '3')
    .action(async (template, instanceName, options) => {
        try {
            // Create ProfileLauncher with autofill options
            const templateLauncherOptions = {
                autofillStopOnSuccess: options.autofillStopOnSuccess !== false, // true by default, false only with --no-autofill-stop-on-success
                autofillEnforceMode: options.autofillEnforceMode || false,
                autofillMinFields: parseInt(options.autofillMinFields) || 2,
                autofillCooldown: parseInt(options.autofillCooldown) || 30000
            };
            
            const templateProfileLauncher = getProfileLauncher(templateLauncherOptions);            // Show autofill configuration if non-default
            if (options.autofillStopOnSuccess === false || options.autofillEnforceMode) {
                console.log(chalk.blue('🎯 Autofill Configuration:'));
                console.log(chalk.blue(`   Stop on Success: ${options.autofillStopOnSuccess !== false ? 'enabled (default)' : 'disabled'}`));
                console.log(chalk.blue(`   Enforce Mode: ${options.autofillEnforceMode ? 'enabled' : 'disabled'}`));
                console.log(chalk.blue(`   Min Fields for Success: ${parseInt(options.autofillMinFields) || 2}`));
                console.log(chalk.blue(`   Success Cooldown: ${parseInt(options.autofillCooldown) || 30000}ms`));
            }
            // Create ProfileLauncher with autofill options
            const launcherOptions = {
                autofillStopOnSuccess: options.autofillStopOnSuccess || false,
                autofillEnforceMode: options.autofillEnforceMode || false,
                autofillMinFields: parseInt(options.autofillMinFields) || 2,
                autofillCooldown: parseInt(options.autofillCooldown) || 30000
            };
            
            const profileLauncher = getProfileLauncher(launcherOptions);
            console.log(chalk.blue(`🎭 Launching template instance: ${instanceName}`));
            console.log(chalk.dim(`Template: ${template}`));
            console.log(chalk.dim(`Profile type: ${options.temp ? 'TEMPORARY (will be deleted)' : 'PERMANENT (will be saved)'}`));
            console.log(chalk.dim(`Fingerprint randomization: ${options.randomizeFingerprint !== false ? 'ENABLED' : 'DISABLED'}`));
            if (options.varyScreenResolution) {
                console.log(chalk.dim(`Screen resolution variation: ENABLED`));
            }
            
            // Adjust timeouts for proxy mode
            const hasProxyOptions = options.proxyStrategy || options.proxyStart || options.proxy;
            const baseAutoCloseTimeout = hasProxyOptions ? 180000 : 120000; // 3 minutes vs 2 minutes
            const baseCaptchaGrace = hasProxyOptions ? 60000 : 45000; // 1 minute vs 45 seconds
            
            const launchOptions = {
                browserType: options.browser,
                headless: options.headless, // Enable headless for headless automation
                devtools: options.devtools,
                randomizeFingerprint: options.randomizeFingerprint !== false,
                varyScreenResolution: options.varyScreenResolution || false,
                stealthPreset: options.stealthPreset,
                loadExtensions: options.loadExtensions || [],
                autoLoadExtensions: options.autoExtensions !== false,
                enableAutomation: !!options.automation,
                enableRequestCapture: options.capture !== false,
                isTemporary: options.temp || false, // Only temporary if --temp flag is used
                headlessAutomation: options.headlessAutomation || false,
                autoCloseOnSuccess: options.autoCloseOnSuccess || false,
                autoCloseOnFailure: options.autoCloseOnFailure || false,
                autoCloseTimeout: parseInt(options.autoCloseTimeout) || baseAutoCloseTimeout,
                captchaGraceMs: parseInt(options.captchaGrace) || baseCaptchaGrace,
                disableCompression: options.compress === false,
                proxyStrategy: options.proxyStrategy,
                proxyStart: options.proxyStart,
                proxyType: options.proxyType,
                proxyConnectionType: options.proxyConnectionType,
                proxyCountry: options.proxyCountry,
                disableImages: options.disableImages,
                disableProxyWaitIncrease: options.disableProxyWaitIncrease,
                automationAutofillOnly: !!options.automationAutofillOnly,
                // IP check controls (affects round-robin rotation path)
                skipIpCheck: !!options.skipIpCheck,
                ipCheckTimeout: parseInt(options.ipCheckTimeout) || 10000,
                ipCheckRetries: parseInt(options.ipCheckRetries) || 3
            };
            
            if (hasProxyOptions) {
                console.log(`🌐 Proxy mode detected - using extended timeouts:`);
                console.log(`   Auto-close timeout: ${launchOptions.autoCloseTimeout/1000}s`);
                console.log(`   CAPTCHA grace: ${launchOptions.captchaGraceMs/1000}s`);
            }

            const result = await templateProfileLauncher.launchFromTemplate(template, instanceName, launchOptions);
            
            console.log(chalk.green('✅ Template instance launched successfully!'));
            console.log(chalk.dim(`Session ID: ${result.sessionId}`));
            console.log(chalk.dim(`Template: ${result.templateProfile}`));
            console.log(chalk.dim(`Instance: ${result.instanceName}`));
            console.log(chalk.dim(`Profile type: ${options.temp ? 'TEMPORARY' : 'PERMANENT'}`));
            
            if (result.fingerprintRandomized) {
                console.log(chalk.blue('🎲 Fingerprint randomized for uniqueness'));
            }
            
            // Show automation status
            if (launchOptions.enableAutomation) {
                console.log(chalk.green('🤖 Automation enabled'));
                if (launchOptions.headlessAutomation) {
                    console.log(chalk.cyan('🔄 Headless automation mode active'));
                }
                if (launchOptions.autoCloseOnSuccess) {
                    console.log(chalk.cyan('🚪 Auto-close enabled'));
                }
            }
            
            if (options.temp) {
                console.log(chalk.yellow('\n⚠️  TEMPORARY PROFILE: This profile will be deleted when the browser closes.'));
            } else {
                console.log(chalk.green('\n💾 PERMANENT PROFILE: This profile will be saved and can be launched again later.'));
            }
            
            console.log(chalk.yellow('\n⚠️  Browser will remain open. Use Ctrl+C to close.'));
            
            // Cleanup handling based on temporary flag
            if (options.temp) {
                process.on('SIGINT', async () => {
                    console.log(chalk.blue('\nClosing browser and cleaning up temporary profile...'));
                    try {
                        await profileLauncher.closeBrowser(result.sessionId);
                        console.log(chalk.green('✅ Temporary profile cleaned up'));
                    } catch (error) {
                        console.error(chalk.red('❌ Cleanup error:'), error.message);
                    }
                    process.exit(0);
                });
            } else {
                process.on('SIGINT', async () => {
                    console.log(chalk.blue('\nClosing browser (profile will be preserved)...'));
                    try {
                        await profileLauncher.closeBrowser(result.sessionId);
                        console.log(chalk.green('✅ Browser closed, profile saved'));
                    } catch (error) {
                        console.error(chalk.red('❌ Error:'), error.message);
                    }
                    process.exit(0);
                });
            }
            
            // Keep process alive
            await new Promise(() => {});
            
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Batch automation command (process-isolated orchestrator)
program
    .command('batch')
    .description('Run continuous automated signups with retry and profile management')
    .requiredOption('-t, --template <name>', 'Template profile to clone from (e.g., vidiq-clean)')
    .option('-c, --count <number>', 'Number of profiles to create', '1')
    .option('-p, --prefix <prefix>', 'Profile name prefix', 'auto')
    .option('--resume', 'Continue numbering from existing profiles with the same prefix')
    .option('--timeout <ms>', 'Per-run success timeout (ms)', '120000')
    .option('--captcha-grace <ms>', 'Extra grace if CAPTCHA detected (ms)', '45000')
    .option('--headless', 'Run in headless mode (default: headed)')
    .option('--delete-on-failure', 'Delete the profile if the run fails')
    .option('--no-clear-cache', 'Disable cache clearing for successful profiles (cache cleanup enabled by default)')
    .option('--delay <seconds>', 'Delay between successful runs (seconds)', '60')
    .option('--failure-delay <seconds>', 'Delay after failed runs (seconds)', '300')
    .option('--proxy-strategy <strategy>', 'Proxy selection strategy: auto, random, fastest, round-robin, geographic')
    .option('--proxy-start <label>', 'Proxy label to start rotation from (useful to skip already used proxies)')
    .option('--proxy-type <type>', 'Proxy type filter: http (socks5 not supported by Playwright)')
    .option('--proxy-connection-type <type>', 'Proxy connection type filter: resident (default), datacenter, mobile')
    .option('--proxy-country <country>', 'Proxy country filter (ISO code like US, GB, DE or name like Germany)')
    .option('--geographic-ratio <ratio>', 'Geographic distribution ratio (e.g., "US:45,Other:55" or "US:40,EU:35,Other:25")')
    .option('--disable-images', 'Disable image loading for faster proxy performance')
    .option('--disable-proxy-wait-increase', 'Disable proxy mode wait time increases (use normal timeouts even with proxies)')
    .option('--skip-ip-check', 'Skip proxy IP resolution/uniqueness checks (fastest, may allow duplicate IPs)')
    .option('--ip-check-timeout <ms>', 'Per-attempt IP check timeout (ms)', '10000')
    .option('--ip-check-retries <n>', 'Max attempts across IP endpoints', '3')
    .option('--max-profiles-per-ip <number>', 'Maximum profiles per IP address before rotating proxy', '5')
    .action(async (options) => {
        const pathMod = (await import('path')).default;
        const fsx = (await import('fs-extra')).default;
        const { v4: uuidv4 } = await import('uuid');
        const nodePath = process.execPath;
        const __filename = fileURLToPath(import.meta.url);

        const template = options.template;
        const total = parseInt(options.count, 10) || 1;
        const prefix = options.prefix || 'auto';
        // Increase default timeouts when proxy is being used
        const hasProxyOptions = options.proxyStrategy || options.proxyStart || options.proxy;
        const baseTimeout = hasProxyOptions ? 180000 : 120000; // 3 minutes vs 2 minutes default
        const baseCaptchaGrace = hasProxyOptions ? 60000 : 45000; // 1 minute vs 45 seconds default
        
        const perRunTimeout = parseInt(options.timeout, 10) || baseTimeout;
        const captchaGrace = parseInt(options.captchaGrace, 10) || baseCaptchaGrace;
        
        if (hasProxyOptions) {
            console.log(`🌐 Proxy mode detected - using extended default timeouts:`);
            console.log(`   Per-run timeout: ${perRunTimeout/1000}s (default: ${baseTimeout/1000}s)`);
            console.log(`   CAPTCHA grace: ${captchaGrace/1000}s (default: ${baseCaptchaGrace/1000}s)`);
        }
    const runHeadless = !!options.headless;
    const deleteOnFailure = !!options.deleteOnFailure;
    const resume = !!options.resume;
        // Clear cache on success by default for space efficiency (can be disabled with --no-clear-cache)
        const clearCacheOnSuccess = !options.noClearCache;
        
        // Delay options for cooldown between runs
        const delayBetweenRuns = parseInt(options.delay, 10) || 60; // 60 seconds default
        const failureDelay = parseInt(options.failureDelay, 10) || 300; // 5 minutes default
        const maxProfilesPerIP = parseInt(options.maxProfilesPerIp, 10) || 5;

        const resultsDir = pathMod.resolve('./automation-results');
        await fsx.ensureDir(resultsDir);
        const batchId = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = pathMod.join(resultsDir, `batch-${prefix}-${batchId}.jsonl`);

        const writeResult = async (obj) => {
            const line = JSON.stringify({ timestamp: new Date().toISOString(), ...obj });
            await fsx.appendFile(resultsFile, line + '\n');
        };

        const generateName = (idx) => {
            return `${prefix}${idx}`;
        };

        // Orchestrator helper: spawn a single-run child process with a hard watchdog
        // Setup detailed logging directory
        const detailedLogsDir = pathMod.join(resultsDir, 'detailed-logs', batchId);
        await fsx.ensureDir(detailedLogsDir);
        
        // Helper function to write detailed logs to disk
        const writeDetailedLog = async (runId, logType, data) => {
            try {
                const logFile = pathMod.join(detailedLogsDir, `${runId}-${logType}.log`);
                const timestamp = new Date().toISOString();
                const logEntry = `[${timestamp}] ${data}\n`;
                await fsx.appendFile(logFile, logEntry);
            } catch (err) {
                // Don't fail the batch if logging fails, but try to report it
                console.error(`Failed to write ${logType} log for ${runId}:`, err.message);
            }
        };

        const runSingleIsolated = ({ instanceName, proxy }) => new Promise((resolve) => {
            const runId = uuidv4();
            const args = [__filename, 'internal-batch-run', '--template', template, '--name', instanceName, '--run-id', runId, '--timeout', String(perRunTimeout), '--captcha-grace', String(captchaGrace)];
            if (runHeadless) args.push('--headless');
            if (options.disableImages) args.push('--disable-images');
            if (options.disableProxyWaitIncrease) args.push('--disable-proxy-wait-increase');
            if (proxy && proxy.label && proxy.type) {
                args.push('--proxy-label', proxy.label, '--proxy-type', proxy.type);
            }

            const child = spawn(nodePath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
            let parsed = null;
            let sawSuccessSignal = false;
            
            // Log process start details
            writeDetailedLog(runId, 'start', `Starting process: ${instanceName} with proxy: ${proxy?.label || 'none'}\nCommand: ${nodePath} ${args.join(' ')}`);

            const onLine = (line, source) => {
                // Log all output to detailed logs
                writeDetailedLog(runId, source, line);
                
                // Capture our tagged line
                if (line.startsWith('::RUN_RESULT::')) {
                    const json = line.slice('::RUN_RESULT::'.length).trim();
                    try {
                        parsed = JSON.parse(json);
                        if (parsed && parsed.success) sawSuccessSignal = true;
                        writeDetailedLog(runId, 'result', `Parsed result: ${JSON.stringify(parsed, null, 2)}`);
                    } catch (err) {
                        writeDetailedLog(runId, 'error', `Failed to parse result JSON: ${err.message}\nRaw: ${json}`);
                    }
                }
                // Observe known success prints in child logs as a heuristic
                if (/VidIQ API Response:\s+200/i.test(line) || /Captured RESPONSE: 200 .*subscriptions\/(active|stripe\/next-subscription)/i.test(line)) {
                    sawSuccessSignal = true;
                    writeDetailedLog(runId, 'success-signal', `Detected success signal: ${line}`);
                }
                
                // Log important error patterns
                if (/error|failed|timeout|exception/i.test(line)) {
                    writeDetailedLog(runId, 'error', `Error detected: ${line}`);
                }
                
                // Log proxy-related information
                if (/proxy|ip|connection/i.test(line)) {
                    writeDetailedLog(runId, 'network', `Network info: ${line}`);
                }
                
                // Log automation steps
                if (/autofill|submit|form|click|navigation/i.test(line)) {
                    writeDetailedLog(runId, 'automation', `Automation step: ${line}`);
                }
            };

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', data => data.toString().split(/\r?\n/).forEach(l => l && onLine(l, 'stdout')));
            child.stderr.on('data', data => data.toString().split(/\r?\n/).forEach(l => l && onLine(l, 'stderr')));

            const hardKill = () => {
                try { child.kill('SIGKILL'); } catch (_) {}
            };
            const softKill = () => {
                try { child.kill('SIGTERM'); } catch (_) {}
            };

            // Watchdog: perRunTimeout + captchaGrace + 15s buffer for cleanup
            const watchdogMs = perRunTimeout + captchaGrace + 15000;
            const watchdog = setTimeout(() => {
                // If we saw success signals but the child is hung, treat as success and hard-kill
                const assumed = sawSuccessSignal ? { success: true, reason: 'assumed_success_post_signin_hang' } : { success: false, reason: 'orchestrator_timeout' };
                if (!parsed) parsed = { runId, profileId: null, profileName: instanceName, ...assumed };
                softKill();
                setTimeout(hardKill, 5000);
            }, watchdogMs);

            child.on('exit', (code, signal) => {
                clearTimeout(watchdog);
                
                // Log process exit details
                const exitInfo = {
                    code,
                    signal,
                    sawSuccessSignal,
                    parsed: parsed ? 'yes' : 'no',
                    duration: Date.now() - child.startTime || 'unknown'
                };
                writeDetailedLog(runId, 'exit', `Process exited: ${JSON.stringify(exitInfo, null, 2)}`);
                
                // If no structured result, synthesize one from signals
                if (!parsed) {
                    const reason = code === 0 ? 'ok' : (sawSuccessSignal ? 'assumed_success_post_signin_hang' : (signal ? `killed_${signal}` : 'nonzero_exit'));
                    parsed = { runId, profileId: null, profileName: instanceName, success: code === 0 || sawSuccessSignal, reason };
                    writeDetailedLog(runId, 'synthesized', `No structured result received, synthesized: ${JSON.stringify(parsed, null, 2)}`);
                } else if (!parsed.success && sawSuccessSignal) {
                    // Upgrade to success if we observed strong success signals
                    const oldReason = parsed.reason;
                    parsed.success = true;
                    parsed.reason = parsed.reason || 'assumed_success_post_signin_hang';
                    writeDetailedLog(runId, 'upgrade', `Upgraded to success due to signals. Old reason: ${oldReason}, New reason: ${parsed.reason}`);
                }
                
                writeDetailedLog(runId, 'final', `Final result: ${JSON.stringify(parsed, null, 2)}`);
                resolve(parsed);
            });
            
            // Track start time for duration calculation
            child.startTime = Date.now();
        });

        const pmLocal = new ProfileManager();
        // Ensure the template stays uncompressed to avoid missing data dirs
        try {
            await pmLocal.ensureProfileUncompressedAndSticky(template);
            console.log(chalk.dim(`📌 Template '${template}' set to stay uncompressed for cloning`));
        } catch (e) {
            console.log(chalk.yellow(`⚠️  Could not prepare template '${template}': ${e.message}`));
        }
        // Preflight: verify template storage exists after attempt to uncompress
        try {
            const t = await pmLocal.getProfile(template);
            const { dirPath: tDir, archivePath: tArch } = pmLocal.getProfileStoragePaths(t);
            const fsx = (await import('fs-extra')).default;
            const hasDir = await fsx.pathExists(tDir);
            const hasArc = await fsx.pathExists(tArch);
            if (!hasDir && !hasArc) {
                console.log(chalk.red(`✗ Template storage missing for '${t.name}' (${t.id}).`));
                console.log(chalk.red(`  Expected directory: ${tDir}`));
                console.log(chalk.red(`  Expected archive:   ${tArch}`));
                console.log(chalk.yellow(`Tip: Restore the template (e.g., re-import or copy back its data), then rerun.`));
                process.exit(1);
            }
        } catch (_) { /* ignore */ }

        // Initialize proxy rotation ONLY if proxy options are explicitly provided
        let proxyRotator = null;
        let useProxyRotation = false;
        
        if (options.proxyStrategy || options.proxyStart || options.geographicRatio) {
            const launcher = new ProfileLauncher(pmLocal, {});
            
            // Use GeographicProxyRotator if geographic strategy or geographic ratio is specified
            if (options.proxyStrategy === 'geographic' || options.geographicRatio) {
                const { GeographicProxyRotator } = await import('./GeographicProxyRotator.js');
                
                proxyRotator = new GeographicProxyRotator(launcher.proxyManager, {
                    geographicRatio: options.geographicRatio || 'US:45,Other:55', // Default to 45% US, 55% Other
                    maxProfilesPerIP: maxProfilesPerIP,
                    skipIPCheck: !!options.skipIpCheck,
                    ipCheckTimeoutMs: parseInt(options.ipCheckTimeout) || 10000,
                    ipCheckMaxAttempts: parseInt(options.ipCheckRetries) || 3
                });
                
                const hasProxies = await proxyRotator.initialize();
                if (hasProxies) {
                    useProxyRotation = true;
                    const geoRatio = options.geographicRatio || 'US:45,Other:55';
                    const ipCheckInfo = options.skipIpCheck ? ' (IP check: SKIPPED)' : '';
                    console.log(chalk.green(`🌍 Geographic proxy rotation enabled: ${geoRatio}${ipCheckInfo}, max ${maxProfilesPerIP} profiles per IP`));
                } else {
                    console.log(chalk.yellow('⚠️  No proxies available for geographic rotation, running without proxy rotation'));
                }
            } else {
                // Use regular ProxyRotator for other strategies
                const { ProxyRotator } = await import('./ProxyRotator.js');
                
                proxyRotator = new ProxyRotator(launcher.proxyManager, {
                    maxProfilesPerIP: maxProfilesPerIP,
                    strategy: options.proxyStrategy || 'round-robin',
                    startProxyLabel: options.proxyStart,
                    proxyType: options.proxyType,
                    connectionType: options.proxyConnectionType || 'resident', // Default to residential proxies
                    country: options.proxyCountry,
                    skipIPCheck: !!options.skipIpCheck,
                    ipCheckTimeoutMs: parseInt(options.ipCheckTimeout) || 10000,
                    ipCheckMaxAttempts: parseInt(options.ipCheckRetries) || 3
                });
                
                const hasProxies = await proxyRotator.initialize();
                if (hasProxies) {
                    useProxyRotation = true;
                    const strategyInfo = options.proxyStrategy || 'round-robin';
                    const startInfo = options.proxyStart ? ` starting from ${options.proxyStart}` : '';
                    const ipCheckInfo = options.skipIpCheck ? ' (IP check: SKIPPED)' : '';
                    const connectionTypeInfo = options.proxyConnectionType || 'resident';
                    console.log(chalk.green(`🌐 Proxy rotation enabled: ${strategyInfo} strategy${startInfo}${ipCheckInfo}, ${connectionTypeInfo} proxies, max ${maxProfilesPerIP} profiles per IP`));
                } else {
                    console.log(chalk.yellow('⚠️  No proxies available, running without proxy rotation'));
                }
            }
        } else {
            console.log(chalk.dim('🌐 Proxy rotation disabled (no proxy options specified)'));
        }

        // Determine starting index when resuming: find highest existing numeric suffix for this prefix
        let startIndex = 1;
        if (resume) {
            try {
                const existing = await pmLocal.listProfiles();
                const indices = existing
                    .filter(p => typeof p.name === 'string' && p.name.startsWith(prefix))
                    .map(p => {
                        // Extract number after prefix (e.g., "auto1" -> 1, "auto42" -> 42)
                        const m = p.name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`));
                        return m ? parseInt(m[1], 10) : null;
                    })
                    .filter(n => Number.isInteger(n));
                if (indices.length > 0) {
                    startIndex = Math.max(...indices) + 1;
                }
            } catch (_) {
                // ignore and default to 1
            }
        }

        console.log(chalk.cyan(`🚀 Starting batch: template=${template}, count=${total}, prefix=${prefix}`));
        console.log(chalk.dim(`Results JSONL: ${resultsFile}`));
        console.log(chalk.dim(`Detailed logs: ${detailedLogsDir}`));
        console.log(chalk.dim(`⏱️  Delays: ${delayBetweenRuns}s between runs, ${failureDelay}s after failures`));
        if (useProxyRotation) {
            console.log(chalk.dim(`🌐 Proxy rotation: max ${maxProfilesPerIP} profiles per IP, then rotate`));
        }
        if (clearCacheOnSuccess) {
            console.log(chalk.dim(`🧹 Cache cleanup enabled for successful profiles (saves disk space)`));
        }
        
        // Create batch summary log
        const batchSummaryFile = pathMod.join(detailedLogsDir, 'batch-summary.log');
        const writeBatchLog = async (message) => {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}\n`;
            await fsx.appendFile(batchSummaryFile, logEntry);
        };
        
        await writeBatchLog(`Batch started: template=${template}, count=${total}, prefix=${prefix}`);
        await writeBatchLog(`Configuration: timeout=${perRunTimeout}ms, captcha=${captchaGrace}ms, headless=${runHeadless}`);
        await writeBatchLog(`Proxy rotation: ${useProxyRotation ? 'enabled' : 'disabled'}`);
        await writeBatchLog(`Results will be written to: ${resultsFile}`);
        
    let created = 0;
    let successes = 0;

        let scheduled = 0;
        for (let idx = startIndex; scheduled < total; idx++) {
            const name = generateName(idx);
            const runNo = scheduled + 1;
            const runId = uuidv4();
            let profileRecord = null;
            let currentProxy = null;
            let proxyConfig = null;

            // Get next proxy if rotation is enabled
            if (useProxyRotation) {
                try {
                    const proxyResult = await proxyRotator.getNextProxy();
                    if (!proxyResult) {
                        console.log(chalk.yellow('🛑 All proxies exhausted (no new IPs available), stopping batch'));
                        
                        // Show final statistics
                        const finalStats = proxyRotator.getStats();
                        console.log('\n📊 Final Proxy Statistics:');
                        console.log(`   Proxy cycles completed: ${finalStats.proxyCycle}`);
                        console.log(`   Total unique IPs used: ${finalStats.totalUniqueIPs}`);
                        console.log(`   Global IPs at limit: ${finalStats.globalIPsAtLimit}/${finalStats.totalGlobalIPs}`);
                        
                        // Show per-proxy stats
                        for (const [label, stats] of Object.entries(finalStats.proxyStats)) {
                            console.log(`   ${label}: ${stats.uniqueIPs} unique IPs, current usage: ${stats.currentUsage}/${finalStats.maxProfilesPerIP}`);
                        }
                        
                        // Show global IP usage details
                        if (finalStats.globalIPStats && Object.keys(finalStats.globalIPStats).length > 0) {
                            console.log('\n🌐 Global IP Usage:');
                            for (const [ip, stats] of Object.entries(finalStats.globalIPStats)) {
                                const status = stats.atLimit ? '🔴 AT LIMIT' : '🟢 Available';
                                console.log(`   ${ip}: ${stats.usage}/${finalStats.maxProfilesPerIP} profiles (${stats.proxies.join(', ')}) ${status}`);
                            }
                        }
                        break;
                    }
                    currentProxy = proxyResult.proxy;
                    proxyConfig = proxyResult.proxyConfig;
                    console.log(chalk.blue(`🌐 Using proxy: ${currentProxy.label} (${currentProxy.type})`));
                } catch (error) {
                    console.log(chalk.red(`❌ Proxy error: ${error.message}`));
                    console.log(chalk.yellow('⚠️  Continuing without proxy for this run'));
                }
            }

            console.log(chalk.blue(`\n▶️  Run ${runNo}/${total}: ${name}`));
            await writeBatchLog(`Starting run ${runNo}/${total}: ${name} with proxy: ${currentProxy?.label || 'none'}`);
            
            // Process-isolated single run
            try {
                const runStartTime = Date.now();
                
                // Kick off child run
                const childResult = await runSingleIsolated({
                    instanceName: name,
                    proxy: useProxyRotation && currentProxy ? { label: currentProxy.label, type: currentProxy.type } : null
                });
                
                const runDuration = Date.now() - runStartTime;

                // Track created count if we have a profile name (assume created)
                created++;
                profileRecord = { id: childResult.profileId || null, name };

                const success = !!childResult.success;
                const reason = childResult.reason || (success ? 'ok' : 'unknown');
                
                await writeBatchLog(`Run ${runNo} completed: success=${success}, reason=${reason}, duration=${runDuration}ms, profileId=${childResult.profileId || 'null'}`);

                await writeResult({
                    run: runNo,
                    batchId,
                    runId,
                    profileId: childResult.profileId || null,
                    profileName: childResult.profileName || name,
                    attempt: 1,
                    headless: runHeadless,
                    success,
                    reason,
                    proxy: currentProxy ? {
                        label: currentProxy.label,
                        type: currentProxy.type,
                        host: currentProxy.host,
                        port: currentProxy.port
                    } : null
                });

                if (success) {
                    successes++;
                    console.log(chalk.green(`✅ Success: ${name} (${reason})`));
                    // IMPORTANT: Do not delete profile; optionally clear cache
                    if (clearCacheOnSuccess && childResult.profileId) {
                        try {
                            await pmLocal.clearProfileCache(childResult.profileId);
                            console.log(chalk.dim(`🧹 Cache cleared for successful profile: ${name}`));
                        } catch (e) {
                            console.log(chalk.yellow(`⚠️  Cache clear failed for ${name}: ${e.message}`));
                        }
                    }
                } else {
                    console.log(chalk.red(`❌ Failed: ${name} (${reason})`));
                    // SAFETY: Do not delete if reason indicates a post-sign-in hang
                    const safeToDelete = deleteOnFailure && childResult.profileId && !(reason && /assumed_success_post_signin_hang/i.test(reason));
                    if (safeToDelete) {
                        try { await pmLocal.deleteProfile(childResult.profileId); console.log(chalk.dim(`🧹 Deleted failed profile: ${name}`)); } catch (_) {}
                    }
                }

                scheduled++;
                if (scheduled < total) {
                    const delayToUse = success ? delayBetweenRuns : failureDelay;
                    const delayReason = success ? 'cooldown' : 'failure recovery';
                    console.log(chalk.dim(`⏳ Waiting ${delayToUse}s (${delayReason}) before next run...`));
                    await new Promise(resolve => setTimeout(resolve, delayToUse * 1000));
                }
            } catch (err) {
                console.error(chalk.red(`💥 Batch run error: ${err.message}`));
                if (profileRecord?.id && deleteOnFailure) {
                    try { await pmLocal.deleteProfile(profileRecord.id); } catch (_) {}
                }
                await writeResult({ run: runNo, batchId, runId, error: err.message });
                scheduled++;
                if (scheduled < total) {
                    console.log(chalk.dim(`⏳ Waiting ${failureDelay}s (error recovery) before next run...`));
                    await new Promise(resolve => setTimeout(resolve, failureDelay * 1000));
                }
            }
        }

        const summary = { batchId, template, totalRequested: total, created, successes, resultsFile };
        console.log(chalk.cyan(`\n📊 Batch summary: ${JSON.stringify(summary)}`));
        
        // Write detailed batch completion summary
        await writeBatchLog(`Batch completed: ${successes}/${created} successful runs out of ${total} requested`);
        await writeBatchLog(`Success rate: ${created > 0 ? ((successes/created)*100).toFixed(1) : 0}%`);
        await writeBatchLog(`Final summary: ${JSON.stringify(summary, null, 2)}`);
        
        // Provide troubleshooting information
        console.log(chalk.cyan('\n🔍 Troubleshooting Information:'));
        console.log(chalk.dim(`  - Detailed logs: ${detailedLogsDir}`));
        console.log(chalk.dim(`  - Each run has separate log files: {runId}-{type}.log`));
        console.log(chalk.dim(`  - Log types: start, stdout, stderr, result, error, network, automation, exit, final`));
        console.log(chalk.dim(`  - Batch summary: ${batchSummaryFile}`));
        console.log(chalk.dim(`  - Screenshots saved in: ./automation-results/`));
        
        if (successes < created) {
            console.log(chalk.yellow('\n⚠️  Some runs failed. Check detailed logs for troubleshooting:'));
            console.log(chalk.yellow(`     cat ${detailedLogsDir}/*-error.log`));
            console.log(chalk.yellow(`     cat ${detailedLogsDir}/*-stderr.log`));
        }
        
        // Show proxy rotation statistics if proxy rotation was used
        if (useProxyRotation && proxyRotator) {
            const finalStats = proxyRotator.getStats();
            console.log(chalk.cyan('\n🌐 Proxy Rotation Statistics:'));
            console.log(chalk.dim(`   Cycles completed: ${finalStats.proxyCycle}`));
            console.log(chalk.dim(`   Total unique IPs: ${finalStats.totalUniqueIPs}`));
            console.log(chalk.dim(`   Max profiles per IP: ${finalStats.maxProfilesPerIP}`));
            console.log(chalk.dim(`   Global IPs at limit: ${finalStats.globalIPsAtLimit}/${finalStats.totalGlobalIPs}`));
            
            // Show per-proxy stats
            console.log(chalk.cyan('\n📊 Per-Proxy Statistics:'));
            for (const [label, stats] of Object.entries(finalStats.proxyStats)) {
                const ips = stats.ips.join(', ');
                console.log(chalk.dim(`   ${label}: ${stats.uniqueIPs} unique IP(s) [${ips}], usage: ${stats.currentUsage}/${finalStats.maxProfilesPerIP}`));
            }
            
            // Show global IP usage details
            if (finalStats.globalIPStats && Object.keys(finalStats.globalIPStats).length > 0) {
                console.log(chalk.cyan('\n🌐 Global IP Usage Details:'));
                for (const [ip, stats] of Object.entries(finalStats.globalIPStats)) {
                    const status = stats.atLimit ? chalk.red('AT LIMIT') : chalk.green('Available');
                    const proxiesList = stats.proxies.join(', ');
                    console.log(chalk.dim(`   ${ip}: ${stats.usage}/${finalStats.maxProfilesPerIP} profiles (used by: ${proxiesList}) - ${status}`));
                }
            }
        }
    });

// Batch account refresh for existing profiles (VidIQ app session/state check)
program
    .command('refresh')
    .description('Batch refresh existing profiles by opening VidIQ app, detecting token refresh or login-required state, and exporting captured requests')
    .option('--all', 'Process all profiles')
    .option('--prefix <prefix>', 'Filter profiles by name prefix')
    .option('--limit <n>', 'Maximum number of profiles to process (0 = no limit)', '0')
    .option('--earliest', 'Process the earliest-used profile only')
    .option('--latest', 'Process the latest-used profile only')
    .option('--headless', 'Run in headless mode')
    .option('--timeout <ms>', 'Per-profile timeout window (ms)', '120000')
    .option('--captcha-grace <ms>', 'Extra grace if CAPTCHA is present (ms)', '45000')
    .option('--disable-images', 'Disable image loading for faster proxy performance')
    .option('--disable-proxy-wait-increase', 'Disable proxy-mode wait time increases (use normal timeouts with proxies)')
    // Proxy options (re-use same flags as other commands)
    .option('--proxy-strategy <strategy>', 'Proxy selection strategy: auto, random, fastest, round-robin')
    .option('--proxy-start <label>', 'Proxy label to start rotation from (skip already-used proxies)')
    .option('--proxy-type <type>', 'Proxy type filter: http')
    .option('--proxy-connection-type <type>', 'Proxy connection type filter: resident, datacenter, mobile')
    .option('--proxy-country <country>', 'Proxy country filter (ISO code like US, GB, DE or name like Germany)')
    .option('--skip-ip-check', 'Skip proxy IP resolution/uniqueness checks (fast but may allow duplicate IPs)')
    .option('--ip-check-timeout <ms>', 'Per-attempt IP check timeout (ms)', '10000')
    .option('--ip-check-retries <n>', 'Max attempts across IP endpoints', '3')
    // Autologin options
    .option('--autologin', 'Attempt credentials-based login when login is required')
    .option('--credentials-file <path>', 'Path to JSON mapping profileName -> { email, password } (supports "default" key)')
    .option('--email <email>', 'Email to use for autologin (overrides credentials-file)')
    .option('--password <password>', 'Password to use for autologin (overrides credentials-file)')
    .action(async (options) => {
        const resultsDir = path.resolve('./automation-results');
        await fs.ensureDir(resultsDir);
        const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(resultsDir, `refresh-${runStamp}.jsonl`);

        const writeResult = async (obj) => {
            const line = JSON.stringify({ timestamp: new Date().toISOString(), ...obj });
            await fs.appendFile(resultsFile, line + '\n');
        };

        // Autologin configuration
        const autologinEnabled = !!options.autologin;
        let credentialsMap = {};
        const credentialsPath = options.credentialsFile ? path.resolve(options.credentialsFile) : null;

        // Initialize resolver to read from existing DBs (profiles.db + generated_names.db)
        const credResolver = autologinEnabled ? new CredentialsResolver('./profiles') : null;

        if (autologinEnabled) {
            if (credentialsPath) {
                try {
                    const loaded = await fs.readJson(credentialsPath);
                    if (loaded && typeof loaded === 'object') {
                        credentialsMap = loaded;
                    }
                    console.log(chalk.dim(`🔐 Loaded credentials file: ${credentialsPath} (keys: ${Object.keys(credentialsMap).length})`));
                } catch (e) {
                    console.log(chalk.yellow(`⚠️  Could not read credentials file: ${e.message}`));
                }
            }
        }

        const getCredentials = async (profileNameOrId) => {
            // 1) CLI overrides take precedence for quick testing
            if (options.email && options.password) {
                return { email: options.email, password: options.password };
            }
            // 2) Credentials file explicit mapping
            const byName = credentialsMap && credentialsMap[profileNameOrId];
            if (byName && byName.email && byName.password) return byName;

            // 3) Credentials file default fallback
            const def = (credentialsMap && (credentialsMap.default || credentialsMap['*'])) || null;
            if (def && def.email && def.password) return def;

            // 4) Automatic resolution from existing DBs
            if (credResolver) {
                try {
                    const resolved = await credResolver.getCredentialsForProfile(profileNameOrId);
                    if (resolved && resolved.email && resolved.password) {
                        console.log(chalk.dim('🔎 Resolved credentials from profile/session databases'));
                        return resolved;
                    }
                } catch (e) {
                    console.log(chalk.yellow(`⚠️  Credentials resolver error: ${e.message}`));
                }
            }

            return null;
        };
        
        // Resolve target profiles
        const pm = new ProfileManager();
        let allProfiles = await pm.listProfiles();

        const pickEarliest = () => {
            const arr = [...allProfiles];
            arr.sort((a, b) => {
                const au = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
                const bu = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
                if (au !== bu) return au - bu;
                const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return ac - bc;
            });
            return arr[0] || null;
        };

        const pickLatest = () => {
            const arr = [...allProfiles];
            arr.sort((a, b) => {
                const au = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
                const bu = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
                if (au !== bu) return bu - au;
                const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bc - ac;
            });
            return arr[0] || null;
        };

        let targets = [];

        if (options.earliest) {
            const p = pickEarliest();
            if (p) targets.push(p);
        } else if (options.latest) {
            const p = pickLatest();
            if (p) targets.push(p);
        } else if (options.all || options.prefix) {
            let filtered = allProfiles;
            if (options.prefix) {
                filtered = filtered.filter(p => typeof p.name === 'string' && p.name.startsWith(options.prefix));
            }
            // Stable order: sort by name
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            targets = filtered;
        } else {
            // Default: spot-check earliest and latest if no selector given
            const e = pickEarliest();
            const l = pickLatest();
            if (e) targets.push(e);
            if (l && (!e || l.id !== e.id)) targets.push(l);
            console.log(chalk.dim('No --all or --prefix specified; defaulting to spot-check earliest and latest profiles.'));
        }

        // Apply limit if provided
        const limit = parseInt(options.limit, 10) || 0;
        if (limit > 0 && targets.length > limit) {
            targets = targets.slice(0, limit);
        }

        if (targets.length === 0) {
            console.log(chalk.yellow('No profiles selected for refresh.'));
            return;
        }

        // Proxy-aware defaults
        const hasProxyOptions = options.proxyStrategy || options.proxyStart || options.proxy;
        const perRunTimeout = parseInt(options.timeout, 10) || (hasProxyOptions ? 180000 : 120000);
        const captchaGrace = parseInt(options.captchaGrace, 10) || (hasProxyOptions ? 60000 : 45000);

        if (hasProxyOptions) {
            console.log(`🌐 Proxy mode detected - using extended timeouts:`);
            console.log(`   Per-profile timeout: ${perRunTimeout/1000}s`);
            console.log(`   CAPTCHA grace: ${captchaGrace/1000}s`);
        }

        const analyzeCaptured = (captured) => {
            const result = {
                success: false,
                reason: null,
                signals: [],
                api2xxCount: 0
            };

            if (!Array.isArray(captured) || captured.length === 0) return result;

            // Count api.vidiq.com 2xx responses
            result.api2xxCount = captured.filter(r =>
                r.type === 'response' &&
                [200, 201].includes(r.status) &&
                typeof r.url === 'string' &&
                r.url.includes('api.vidiq.com/')
            ).length;

            // Look for app-auth capture signals
            for (const r of captured) {
                if (r.type === 'response' && (r.hookName === 'vidiq-app-capture' || r.hookName === 'vidiq-capture')) {
                    const url = r.url || '';
                    const sigs = (r.custom && Array.isArray(r.custom.signals)) ? r.custom.signals : [];
                    if (sigs.includes('token_refresh_success') && [200, 201].includes(r.status)) {
                        result.success = true;
                        result.reason = 'token_refresh';
                        result.signals = sigs;
                        return result;
                    }
                    if (sigs.includes('signin_success') && [200, 201].includes(r.status)) {
                        result.success = true;
                        result.reason = 'signin_success';
                        result.signals = sigs;
                        return result;
                    }
                    if (sigs.includes('session_validated') && [200, 201].includes(r.status)) {
                        result.success = true;
                        result.reason = 'session_valid';
                        result.signals = sigs;
                        return result;
                    }
                    // Fallback: explicit API endpoints
                    if ([200, 201].includes(r.status) && typeof url === 'string') {
                        if (url.includes('/users/me')) {
                            result.success = true;
                            result.reason = 'session_valid';
                            return result;
                        }
                        if (url.includes('/token') || url.includes('/auth')) {
                            result.success = true;
                            result.reason = 'token_refresh';
                            return result;
                        }
                        if (url.includes('/signin') || url.includes('/login')) {
                            result.success = true;
                            result.reason = 'signin_success';
                            return result;
                        }
                    }
                }
            }

            // Soft success: plenty of API activity (e.g., dashboard streaming)
            if (result.api2xxCount >= 5) {
                result.success = true;
                result.reason = 'api_activity_detected';
            }

            return result;
        };

        const detectLoginPage = async (page) => {
            try {
                // Quick wait to allow client-side router to mount
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
                const url = page.url();

                const emailSel = 'input[type="email"], input[name="email"], input[data-testid="form-input-email"]';
                const passwordSel = 'input[type="password"], input[name="password"], input[data-testid="form-input-password"]';
                const continueSel = 'button:has-text("Continue"), a:has-text("Continue"), button:has-text("Next"), [data-testid*="continue"]';

                const emailCount = await page.locator(emailSel).count().catch(() => 0);
                const pwCount = await page.locator(passwordSel).count().catch(() => 0);
                const contCount = await page.locator(continueSel).count().catch(() => 0);

                let loginRequired = false;
                let flow = 'unknown';

                // Only consider login on app/auth domains
                if (/\.vidiq\.com/i.test(url)) {
                    if (emailCount > 0 || pwCount > 0) {
                        loginRequired = true;
                        if (emailCount > 0 && pwCount === 0 && contCount > 0) {
                            flow = 'email_first';
                        } else if (emailCount > 0 && pwCount > 0) {
                            flow = 'email_password_same_page';
                        } else if (pwCount > 0) {
                            flow = 'password_only_visible';
                        }
                    }
                }

                return { loginRequired, flow, url };
            } catch (_) {
                return { loginRequired: false, flow: 'unknown', url: '' };
            }
        };

        console.log(chalk.cyan(`🔄 Refreshing ${targets.length} profile(s)`));
        console.log(chalk.dim(`Results JSONL: ${resultsFile}`));

        let processed = 0;
        let successes = 0;

        for (const profile of targets) {
            processed += 1;
            console.log(chalk.blue(`\n▶️  Refresh ${processed}/${targets.length}: ${profile.name}`));

            const launcher = new ProfileLauncher(pm, {});
            let sessionId = null;
            let exportedPath = null;

            try {
                const launchOptions = {
                    browserType: 'chromium',
                    headless: !!options.headless,
                    // Disable autofill monitoring for refresh flows to avoid interacting with login pages
                    enableAutofillMonitoring: false,
                    enableAutomation: false,
                    enableRequestCapture: true,
                    autoCloseOnSuccess: false,
                    autoCloseOnFailure: false,
                    autoCloseTimeout: 0,
                    disableImages: options.disableImages,
                    disableProxyWaitIncrease: options.disableProxyWaitIncrease,
                    // Proxy options
                    proxyStrategy: options.proxyStrategy,
                    proxyStart: options.proxyStart,
                    proxyType: options.proxyType,
                    proxyConnectionType: options.proxyConnectionType,
                    proxyCountry: options.proxyCountry,
                    skipIpCheck: !!options.skipIpCheck,
                    ipCheckTimeout: parseInt(options.ipCheckTimeout) || 10000,
                    ipCheckRetries: parseInt(options.ipCheckRetries) || 3
                };

                const res = await launcher.launchProfile(profile.id, launchOptions);
                sessionId = res.sessionId;

                // Navigate to VidIQ dashboard
                const page = res.page;
                console.log(chalk.dim('↪️  Navigating to https://app.vidiq.com/dashboard ...'));
                try {
                    await page.goto('https://app.vidiq.com/dashboard', { waitUntil: 'domcontentloaded', timeout: Math.min(perRunTimeout, 45000) });
                } catch (navErr) {
                    console.log(chalk.yellow(`⚠️  Navigation warning: ${navErr.message}`));
                }

                // Monitor for success or login-required
                const start = Date.now();
                let outcome = { success: false, reason: null, signals: [], api2xxCount: 0 };
                let loginProbeSaved = false;
                let loginFlow = 'unknown';
                let loginDetected = false;

                const probeAndSnapshotLogin = async () => {
                    const probe = await detectLoginPage(page);
                    loginDetected = probe.loginRequired;
                    loginFlow = probe.flow;
                    if (loginDetected && !loginProbeSaved) {
                        // Save HTML and screenshot sample for later analysis
                        try {
                            const samplesDir = path.join(resultsDir, 'login-samples');
                            await fs.ensureDir(samplesDir);
                            const ts = new Date().toISOString().replace(/[:.]/g, '-');
                            const base = `${profile.name}-${ts}`;
                            const htmlPath = path.join(samplesDir, `${base}.html`);
                            const pngPath = path.join(samplesDir, `${base}.png`);
                            let html = '';
                            try { html = await page.content(); } catch (_) {}
                            await fs.writeFile(htmlPath, `<!-- URL: ${probe.url} -->\n${html}`);
                            try { await page.screenshot({ path: pngPath, fullPage: true }); } catch (_) {}
                            console.log(chalk.yellow(`📝 Saved login sample: ${htmlPath}`));
                            console.log(chalk.yellow(`📸 Saved login screenshot: ${pngPath}`));
                        } catch (e) {
                            console.log(chalk.yellow(`⚠️  Could not save login sample: ${e.message}`));
                        }
                        loginProbeSaved = true;
                    }
                };

                // Initial quick probe after navigation
                await probeAndSnapshotLogin();

                while (true) {
                    const captured = launcher.requestCaptureSystem.getCapturedRequests(sessionId) || [];
                    outcome = analyzeCaptured(captured);
                    if (outcome.success) break;

                    const elapsed = Date.now() - start;

                    // If likely on login page and no success yet, optionally attempt autologin
                    if (!outcome.success && elapsed > 3000) {
                        await probeAndSnapshotLogin();
                        if (loginDetected) {
                            if (autologinEnabled) {
                                try {
                                    // Analyze current login UI and attempt guarded autologin
                                    const analysis = await LoginAnalyzer.detect(page);
                                    LoginAnalyzer.logSummary(analysis);

                                    const creds = await getCredentials(profile.id || profile.name);
                                    if (creds && creds.email && creds.password) {
                                        console.log(chalk.cyan(`🔐 Autologin starting for ${profile.name}...`));
                                        const autoRes = await LoginAutomation.performAutologin(page, creds, {
                                            analysis,
                                            getCaptured: (sid) => launcher.requestCaptureSystem.getCapturedRequests(sid) || [],
                                            sessionId,
                                            timeoutMs: perRunTimeout,
                                            captchaGraceMs: captchaGrace
                                        });

                                        if (autoRes.success) {
                                            // Confirm via capture analysis
                                            const capPost = launcher.requestCaptureSystem.getCapturedRequests(sessionId) || [];
                                            const postOutcome = analyzeCaptured(capPost);
                                            outcome = postOutcome.success
                                                ? postOutcome
                                                : { success: true, reason: autoRes.reason || 'signin_success', signals: [], api2xxCount: 0 };
                                            break;
                                        } else {
                                            console.log(chalk.yellow(`⚠️ Autologin failed: ${autoRes.reason || 'unknown'}`));
                                            outcome.success = false;
                                            outcome.reason = autoRes.reason || 'login_required';
                                            break;
                                        }
                                    } else {
                                        console.log(chalk.yellow('⚠️ No credentials found for autologin; leaving as login_required'));
                                        outcome.success = false;
                                        outcome.reason = 'login_required';
                                        break;
                                    }
                                } catch (e) {
                                    console.log(chalk.yellow(`⚠️ Autologin exception: ${e.message || e}`));
                                    outcome.success = false;
                                    outcome.reason = 'login_required';
                                    break;
                                }
                            } else {
                                // If autologin not enabled, mark as login_required and save page sample
                                outcome.success = false;
                                outcome.reason = 'login_required';
                                break;
                            }
                        }
                    }

                    // CAPTCHA grace handling (heuristic)
                    let captchaLikely = false;
                    try {
                        const pages = res.context.pages();
                        for (const p of pages) {
                            const a = await p.locator('iframe[src*="recaptcha"], div.g-recaptcha').count().catch(() => 0);
                            const b = await p.locator('iframe[src*="hcaptcha"], div.h-captcha').count().catch(() => 0);
                            if (a > 0 || b > 0) { captchaLikely = true; break; }
                        }
                    } catch (_) {}

                    const effective = captchaLikely ? (perRunTimeout + captchaGrace) : perRunTimeout;
                    if (perRunTimeout > 0 && elapsed >= effective) {
                        outcome.success = false;
                        outcome.reason = captchaLikely ? 'timeout_with_captcha' : 'timeout';
                        break;
                    }

                    await new Promise(r => setTimeout(r, 1000));
                }

                // Export captured requests (best-effort)
                try {
                    const exp = await launcher.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                    exportedPath = exp?.filePath || null;
                } catch (_) {}

                // Close
                await launcher.closeBrowser(sessionId, { clearCache: false }).catch(() => {});

                const resultLine = {
                    runId: `${profile.id}-${runStamp}`,
                    profileId: profile.id,
                    profileName: profile.name,
                    success: outcome.success,
                    reason: outcome.reason,
                    signals: outcome.signals || [],
                    api2xxCount: outcome.api2xxCount || 0,
                    loginRequired: outcome.reason === 'login_required',
                    loginFlow: outcome.reason === 'login_required' ? loginFlow : undefined,
                    captureExport: exportedPath || undefined
                };

                await writeResult(resultLine);

                if (outcome.success) {
                    successes += 1;
                    const label = outcome.reason === 'token_refresh' ? 'Token refreshed' :
                                  outcome.reason === 'signin_success' ? 'Signin OK' :
                                  outcome.reason === 'session_valid' ? 'Session valid' :
                                  outcome.reason === 'api_activity_detected' ? 'API active' : 'Success';
                    console.log(chalk.green(`✅ ${label} for ${profile.name} (api2xx=${resultLine.api2xxCount})`));
                } else if (outcome.reason === 'login_required') {
                    console.log(chalk.yellow(`🔐 Login required for ${profile.name} (${loginFlow})`));
                    console.log(chalk.dim('Saved login page sample for analysis. Credentials-based autofill can be added later.'));
                } else {
                    console.log(chalk.red(`❌ Refresh failed for ${profile.name}: ${outcome.reason}`));
                }
            } catch (err) {
                console.error(chalk.red(`💥 Refresh error for ${profile.name}: ${err.message}`));
                if (sessionId) {
                    try { await launcher.closeBrowser(sessionId, { clearCache: false }); } catch (_) {}
                }
                await writeResult({
                    runId: `${profile.id}-${runStamp}`,
                    profileId: profile.id,
                    profileName: profile.name,
                    success: false,
                    reason: 'error',
                    error: err.message
                });
            } finally {
                try { await profileLauncher?.closeAllBrowsers({}); } catch (_) {}
            }
        }

        console.log(chalk.cyan(`\n📊 Refresh summary: processed=${processed}, successes=${successes}`));
        console.log(chalk.dim(`Results file: ${resultsFile}`));
        console.log(chalk.dim('Success criteria: token refresh/signin/session validation or significant API activity.'));
        console.log(chalk.dim('Login-required profiles saved with HTML/screenshot for flow analysis (email-first vs email+password).'));
    });

// Enhanced refresh for profiles without credentials (extension install detection + signup flow)
program
    .command('refresh-missing')
    .description('Enhanced refresh for profiles without valid credentials - detects extension install vs signup flow and executes appropriate action')
    .option('--all-missing', 'Process all profiles without valid credentials')
    .option('--prefix <prefix>', 'Filter profiles by name prefix (e.g., "proxied")')
    .option('--limit <n>', 'Maximum number of profiles to process (0 = no limit)', '10')
    .option('--headless', 'Run in headless mode')
    .option('--timeout <ms>', 'Per-profile timeout window (ms)', '120000')
    .option('--captcha-grace <ms>', 'Extra grace if CAPTCHA is present (ms)', '45000')
    .option('--disable-images', 'Disable image loading for faster proxy performance')
    .option('--disable-proxy-wait-increase', 'Disable proxy-mode wait time increases')
    // Proxy options (same as other commands)
    .option('--proxy-strategy <strategy>', 'Proxy selection strategy: auto, random, fastest, round-robin', 'auto')
    .option('--proxy-start <label>', 'Proxy label to start rotation from')
    .option('--proxy-type <type>', 'Proxy type filter: http')
    .option('--proxy-connection-type <type>', 'Proxy connection type filter: resident, datacenter, mobile')
    .option('--proxy-country <country>', 'Proxy country filter (ISO code like US, GB, DE or name like Germany)')
    .option('--skip-ip-check', 'Skip proxy IP resolution/uniqueness checks')
    .option('--ip-check-timeout <ms>', 'Per-attempt IP check timeout (ms)', '10000')
    .option('--ip-check-retries <n>', 'Max attempts across IP endpoints', '3')
    // Flow control options
    .option('--dry-run', 'Analyze flows without executing signup/login actions')
    .option('--execute-signup', 'Execute signup flow when detected (default: false)')
    .option('--execute-login', 'Execute login flow when detected (default: false)')
    .option('--credentials-file <path>', 'Path to JSON credentials file for login flows')
    .option('--email <email>', 'Email for login flows (overrides credentials file)')
    .option('--password <password>', 'Password for login flows (overrides credentials file)')
    .action(async (options) => {
        const { ExtensionFlowDetector } = await import('./ExtensionFlowDetector.js');
        const { analyzeProfiles } = await import('../analyze-missing-credentials.js');
        
        const resultsDir = path.resolve('./automation-results');
        await fs.ensureDir(resultsDir);
        const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(resultsDir, `refresh-missing-${runStamp}.jsonl`);

        const writeResult = async (obj) => {
            const line = JSON.stringify({ timestamp: new Date().toISOString(), ...obj });
            await fs.appendFile(resultsFile, line + '\n');
        };

        // Helper functions for executing flows
        const executeSignupFlow = async (page, context, launcher, sessionId, options) => {
            try {
                console.log(chalk.cyan('🚀 Starting signup automation...'));
                
                // Enable automation for signup
                launcher.automationSystem = launcher.automationSystem || await launcher.createAutomationSystem();
                launcher.autofillSystem = launcher.autofillSystem || await launcher.createAutofillSystem();
                
                // Navigate to signup if not already there
                const currentUrl = page.url();
                if (!currentUrl.includes('/signup')) {
                    console.log(chalk.dim('↪️  Navigating to signup page...'));
                    await page.goto('https://vidiq.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
                }
                
                // Start automation systems
                await launcher.automationSystem.startMonitoring(sessionId, context, { profileName: 'temp' });
                await launcher.autofillSystem.startMonitoring(sessionId, context, { profileName: 'temp' });
                
                // Wait for automation completion or timeout
                const start = Date.now();
                while (Date.now() - start < options.timeout) {
                    // Check for automation success
                    const completions = Array.from(launcher.automationSystem.completedAutomations.values())
                        .filter(c => c.sessionId === sessionId && c.status === 'success');
                    
                    if (completions.length > 0) {
                        return { executed: true, success: true, reason: 'signup_automation_success' };
                    }
                    
                    // Check for capture success
                    const captured = launcher.requestCaptureSystem.getCapturedRequests(sessionId) || [];
                    const successDetected = captured.some(r =>
                        r.type === 'response' && [200, 201].includes(r.status) &&
                        r.url && (r.url.includes('/subscriptions/active') || r.url.includes('/auth/signup'))
                    );
                    
                    if (successDetected) {
                        return { executed: true, success: true, reason: 'signup_capture_success' };
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                return { executed: true, success: false, reason: 'signup_timeout' };
                
            } catch (error) {
                return { executed: true, success: false, reason: `signup_error: ${error.message}` };
            }
        };

        const executeLoginFlow = async (page, context, launcher, sessionId, options) => {
            try {
                console.log(chalk.cyan('🔐 Starting login automation...'));
                
                // Get credentials
                let credentials = null;
                if (options.email && options.password) {
                    credentials = { email: options.email, password: options.password };
                } else if (options.credentialsFile) {
                    try {
                        const credMap = await fs.readJson(options.credentialsFile);
                        credentials = credMap.default || credMap['*'] || Object.values(credMap)[0];
                    } catch (e) {
                        console.log(chalk.yellow(`⚠️  Could not load credentials: ${e.message}`));
                    }
                }
                
                if (!credentials) {
                    return { executed: false, success: false, reason: 'no_credentials' };
                }
                
                // Use existing login automation
                const analysis = await LoginAnalyzer.detect(page);
                const autoRes = await LoginAutomation.performAutologin(page, credentials, {
                    analysis,
                    getCaptured: (sid) => launcher.requestCaptureSystem.getCapturedRequests(sid) || [],
                    sessionId,
                    timeoutMs: options.timeout,
                    captchaGraceMs: options.captchaGrace
                });
                
                return {
                    executed: true,
                    success: autoRes.success,
                    reason: autoRes.success ? 'login_success' : `login_failed: ${autoRes.reason}`
                };
                
            } catch (error) {
                return { executed: true, success: false, reason: `login_error: ${error.message}` };
            }
        };

        // Get profiles without credentials
        console.log(chalk.blue('🔍 Loading profiles without valid credentials...'));
        
        let targetProfiles = [];
        
        // Load analysis or generate it
        const analysisFile = './output/missing-credentials-analysis.json';
        let missingProfiles = [];
        
        if (await fs.pathExists(analysisFile)) {
            const analysis = await fs.readJson(analysisFile);
            missingProfiles = analysis.profilesNeedingRefresh || [];
            console.log(chalk.dim(`📋 Loaded ${missingProfiles.length} profiles from analysis file`));
        } else {
            console.log(chalk.yellow('⚠️  No analysis file found, generating fresh analysis...'));
            const analysis = await analyzeProfiles();
            missingProfiles = analysis.profilesNeedingRefresh || [];
        }

        // Filter by prefix if specified
        if (options.prefix) {
            missingProfiles = missingProfiles.filter(p => p.name.startsWith(options.prefix));
            console.log(chalk.dim(`🔍 Filtered to ${missingProfiles.length} profiles with prefix: ${options.prefix}`));
        }

        // Apply limit
        const limit = parseInt(options.limit, 10) || 10;
        if (limit > 0 && missingProfiles.length > limit) {
            missingProfiles = missingProfiles.slice(0, limit);
            console.log(chalk.dim(`📏 Limited to first ${limit} profiles`));
        }

        if (missingProfiles.length === 0) {
            console.log(chalk.yellow('No profiles found matching criteria.'));
            return;
        }

        // Proxy-aware defaults
        const hasProxyOptions = options.proxyStrategy || options.proxyStart;
        const perRunTimeout = parseInt(options.timeout, 10) || (hasProxyOptions ? 180000 : 120000);
        const captchaGrace = parseInt(options.captchaGrace, 10) || (hasProxyOptions ? 60000 : 45000);

        if (hasProxyOptions) {
            console.log(`🌐 Proxy mode detected - using extended timeouts:`);
            console.log(`   Per-profile timeout: ${perRunTimeout/1000}s`);
            console.log(`   CAPTCHA grace: ${captchaGrace/1000}s`);
        }

        console.log(chalk.cyan(`🔄 Enhanced refresh for ${missingProfiles.length} profile(s) without credentials`));
        console.log(chalk.dim(`Results JSONL: ${resultsFile}`));
        console.log(chalk.dim(`Mode: ${options.dryRun ? 'DRY RUN (analysis only)' : 'ACTIVE (will execute flows)'}`));

        let processed = 0;
        let flowsDetected = { signup_required: 0, login_required: 0, valid_session: 0, unclear_state: 0, error: 0 };
        let actionsExecuted = { signup: 0, login: 0, capture_only: 0 };

        for (const profileInfo of missingProfiles) {
            processed += 1;
            console.log(chalk.blue(`\n▶️  Enhanced refresh ${processed}/${missingProfiles.length}: ${profileInfo.name}`));

            const pm = new ProfileManager();
            const launcher = new ProfileLauncher(pm, {});
            const detector = new ExtensionFlowDetector({
                timeout: perRunTimeout,
                captchaGrace: captchaGrace,
                quiet: false
            });
            
            let sessionId = null;
            let exportedPath = null;
            let flowResult = null;

            try {
                const launchOptions = {
                    browserType: 'chromium',
                    headless: !!options.headless,
                    enableAutofillMonitoring: false, // Start disabled, enable based on flow detection
                    enableAutomation: false, // Start disabled, enable based on flow detection
                    enableRequestCapture: true,
                    autoCloseOnSuccess: false,
                    autoCloseOnFailure: false,
                    autoCloseTimeout: 0,
                    disableImages: options.disableImages,
                    disableProxyWaitIncrease: options.disableProxyWaitIncrease,
                    // Random proxy selection to avoid burning first IP
                    proxyStrategy: options.proxyStrategy || 'auto',
                    proxyStart: options.proxyStart,
                    proxyType: options.proxyType,
                    proxyConnectionType: options.proxyConnectionType,
                    proxyCountry: options.proxyCountry,
                    skipIpCheck: !!options.skipIpCheck,
                    ipCheckTimeout: parseInt(options.ipCheckTimeout) || 10000,
                    ipCheckRetries: parseInt(options.ipCheckRetries) || 3
                };

                // Launch profile
                const res = await launcher.launchProfile(profileInfo.id, launchOptions);
                sessionId = res.sessionId;
                const page = res.page;
                const context = res.context;

                console.log(chalk.dim('🧩 Waiting for extension popup and analyzing flow...'));
                
                // Use ExtensionFlowDetector to analyze what happens
                flowResult = await detector.waitForExtensionPopupAndAnalyze(
                    page, context, launcher.requestCaptureSystem, sessionId
                );

                flowsDetected[flowResult.flowType] = (flowsDetected[flowResult.flowType] || 0) + 1;

                console.log(chalk.cyan(`🎯 Flow detected: ${flowResult.flowType}`));
                console.log(chalk.dim(`   ${flowResult.reason}`));

                // Execute appropriate action based on detection
                let actionResult = { executed: false, success: false, reason: 'no_action' };

                if (!options.dryRun) {
                    if (flowResult.needsSignup && options.executeSignup) {
                        console.log(chalk.green('🚀 Executing signup flow...'));
                        actionResult = await executeSignupFlow(page, context, launcher, sessionId, {
                            timeout: perRunTimeout,
                            captchaGrace: captchaGrace
                        });
                        actionsExecuted.signup += 1;
                    } else if (flowResult.needsLogin && options.executeLogin) {
                        console.log(chalk.green('🔐 Executing login flow...'));
                        actionResult = await executeLoginFlow(page, context, launcher, sessionId, {
                            timeout: perRunTimeout,
                            captchaGrace: captchaGrace,
                            credentialsFile: options.credentialsFile,
                            email: options.email,
                            password: options.password
                        });
                        actionsExecuted.login += 1;
                    } else if (flowResult.hasValidSession) {
                        console.log(chalk.green('✅ Valid session - capturing traffic only'));
                        // Just wait a bit more to capture additional traffic
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        actionsExecuted.capture_only += 1;
                        actionResult = { executed: true, success: true, reason: 'valid_session_captured' };
                    }
                }

                // Export captured requests
                try {
                    const exp = await launcher.requestCaptureSystem.exportCapturedRequests(sessionId, 'jsonl');
                    exportedPath = exp?.filePath || null;
                } catch (_) {}

                // Close browser
                await launcher.closeBrowser(sessionId, { clearCache: false }).catch(() => {});

                // Write result
                const resultLine = {
                    runId: `${profileInfo.id}-${runStamp}`,
                    profileId: profileInfo.id,
                    profileName: profileInfo.name,
                    flowType: flowResult.flowType,
                    flowReason: flowResult.reason,
                    needsSignup: flowResult.needsSignup,
                    needsLogin: flowResult.needsLogin,
                    hasValidSession: flowResult.hasValidSession,
                    capturedRequests: flowResult.capturedRequests,
                    actionExecuted: actionResult.executed,
                    actionSuccess: actionResult.success,
                    actionReason: actionResult.reason,
                    captureExport: exportedPath || undefined,
                    dryRun: !!options.dryRun
                };

                await writeResult(resultLine);

                // Display result
                if (actionResult.executed) {
                    const status = actionResult.success ? chalk.green('✅ SUCCESS') : chalk.red('❌ FAILED');
                    console.log(`${status}: ${profileInfo.name} - ${actionResult.reason}`);
                } else {
                    console.log(chalk.yellow(`📋 ANALYZED: ${profileInfo.name} - ${flowResult.flowType}`));
                }

            } catch (err) {
                console.error(chalk.red(`💥 Enhanced refresh error for ${profileInfo.name}: ${err.message}`));
                flowsDetected.error = (flowsDetected.error || 0) + 1;
                
                if (sessionId) {
                    try { await launcher.closeBrowser(sessionId, { clearCache: false }); } catch (_) {}
                }
                
                await writeResult({
                    runId: `${profileInfo.id}-${runStamp}`,
                    profileId: profileInfo.id,
                    profileName: profileInfo.name,
                    flowType: 'error',
                    error: err.message,
                    dryRun: !!options.dryRun
                });
            } finally {
                try { await launcher?.closeAllBrowsers({}); } catch (_) {}
            }
        }

        // Display summary
        console.log(chalk.cyan(`\n📊 Enhanced refresh summary:`));
        console.log(`   Processed: ${processed} profiles`);
        console.log(`   Flow types detected:`);
        Object.entries(flowsDetected).forEach(([type, count]) => {
            if (count > 0) {
                const color = type === 'error' ? chalk.red :
                             type === 'valid_session' ? chalk.green :
                             type === 'signup_required' ? chalk.yellow :
                             type === 'login_required' ? chalk.blue : chalk.dim;
                console.log(`     ${color(type)}: ${count}`);
            }
        });
        
        if (!options.dryRun) {
            console.log(`   Actions executed:`);
            Object.entries(actionsExecuted).forEach(([action, count]) => {
                if (count > 0) {
                    console.log(`     ${action}: ${count}`);
                }
            });
        }
        
        console.log(chalk.dim(`   Results file: ${resultsFile}`));
        
        if (options.dryRun) {
            console.log(chalk.yellow('\n💡 This was a dry run. Use --execute-signup and/or --execute-login to perform actions.'));
        }
    });
// Clone profile command
program
    .command('clone')
    .description('Clone an existing profile')
    .argument('[source]', 'Source profile name or ID (optional - will show selection if not provided)')
    .argument('[name]', 'New profile name (optional - will prompt if not provided)')
    .option('-d, --description <description>', 'Description for cloned profile')
    .option('--no-compress', 'Disable compress-on-close for cloned profile')
    .action(async (source, name, options) => {
        try {
            // If no source profile provided, show selector
            if (!source) {
                source = await selectProfile('Select profile to clone:');
            }
            
            // If no name provided, prompt for it
            if (!name) {
                const nameAnswer = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Name for cloned profile:',
                        validate: (input) => input.trim() ? true : 'Profile name is required'
                    }
                ]);
                name = nameAnswer.name;
            }
            
            console.log(chalk.blue(`Cloning profile: ${source} → ${name}`));
            const clonedProfile = await profileManager.cloneProfile(
                source, 
                name, 
                options.description,
                { disableCompression: options.compress === false }
            );
            
            console.log(chalk.green('✓ Profile cloned successfully!'));
            console.log(chalk.blue(`  Original: ${source}`));
            console.log(chalk.blue(`  Clone: ${clonedProfile.name}`));
            console.log(chalk.blue(`  ID: ${clonedProfile.id}`));
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Rename profile command
program
    .command('rename')
    .description('Rename a profile')
    .argument('[profile]', 'Profile name or ID (optional - will show selection if not provided)')
    .argument('[newName]', 'New profile name (optional - will prompt if not provided)')
    .action(async (profile, newName) => {
        try {
            // If no profile provided, show selector
            if (!profile) {
                profile = await selectProfile('Select profile to rename:');
            }
            
            // If no new name provided, prompt for it
            if (!newName) {
                const nameAnswer = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'newName',
                        message: 'New profile name:',
                        validate: (input) => input.trim() ? true : 'Profile name is required'
                    }
                ]);
                newName = nameAnswer.newName;
            }
            
            console.log(chalk.blue(`Renaming profile: ${profile} → ${newName}`));
            const renamedProfile = await profileManager.renameProfile(profile, newName);
            
            console.log(chalk.green('✓ Profile renamed successfully!'));
            console.log(chalk.blue(`  New name: ${renamedProfile.name}`));
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Delete profile command
program
    .command('delete')
    .alias('rm')
    .description('Delete a profile')
    .argument('[profile]', 'Profile name or ID (optional - will show selection if not provided)')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (profileName, options) => {
        try {
            // If no profile provided, show selector with cancel option
            if (!profileName) {
                profileName = await selectProfile('Select profile to delete:', true);
                if (profileName === null) {
                    console.log(chalk.yellow('Deletion cancelled.'));
                    return;
                }
            }
            
            const profile = await profileManager.getProfile(profileName);
            
            if (!options.force) {
                const answer = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: `Are you sure you want to delete profile "${profile.name}"?`,
                        default: false
                    }
                ]);
                
                if (!answer.confirm) {
                    console.log(chalk.yellow('Deletion cancelled.'));
                    return;
                }
            }
            
            console.log(chalk.blue(`Deleting profile: ${profile.name}`));
            await profileManager.deleteProfile(profile.id);
            
            console.log(chalk.green('✓ Profile deleted successfully!'));
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Sessions command
program
    .command('sessions')
    .description('Show active browser sessions')
    .action(async () => {
        try {
            const sessions = getProfileLauncher().getActiveSessions();
            
            if (sessions.length === 0) {
                console.log(chalk.yellow('No active sessions.'));
                return;
            }
            
            console.log(chalk.blue(`Active sessions (${sessions.length}):\n`));
            
            for (const session of sessions) {
                console.log(chalk.green(`● ${session.profileName}`));
                console.log(`  Session ID: ${chalk.dim(session.sessionId)}`);
                console.log(`  Browser: ${session.browserType}`);
                console.log(`  Started: ${session.startTime.toLocaleString()}`);
                console.log(`  Duration: ${Math.floor(session.duration / 1000)}s`);
                console.log('');
            }
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Debug profile command
program
    .command('debug-profile')
    .description('Debug profile session state and preferences')
    .argument('[profile]', 'Profile name or ID (optional - will show selection if not provided)')
    .action(async (profileName) => {
        try {
            // If no profile name provided, show selector
            if (!profileName) {
                profileName = await selectProfile('Select profile to debug:');
            }
            
            const profile = await profileManager.getProfile(profileName);
            console.log(chalk.blue(`\n🔍 Debugging profile: ${profile.name}\n`));
            
            // Check main preferences
            const preferencesPath = path.join(profile.userDataDir, 'Preferences');
            if (await fs.pathExists(preferencesPath)) {
                const preferences = await fs.readJson(preferencesPath);
                console.log(chalk.green('📄 Main Preferences:'));
                if (preferences.profile) {
                    console.log(`  Exit Type: ${preferences.profile.exit_type || 'Not set'}`);
                    console.log(`  Exited Cleanly: ${preferences.profile.exited_cleanly || false}`);
                    console.log(`  Profile Name: ${preferences.profile.name || 'Not set'}`);
                } else {
                    console.log('  No profile section found');
                }
                console.log('');
            } else {
                console.log(chalk.yellow('📄 Main Preferences: File not found\n'));
            }
            
            // Check default preferences
            const defaultPreferencesPath = path.join(profile.userDataDir, 'Default', 'Preferences');
            if (await fs.pathExists(defaultPreferencesPath)) {
                const defaultPreferences = await fs.readJson(defaultPreferencesPath);
                console.log(chalk.green('📋 Default Preferences:'));
                if (defaultPreferences.profile) {
                    console.log(`  Exit Type: ${defaultPreferences.profile.exit_type || 'Not set'}`);
                    console.log(`  Exited Cleanly: ${defaultPreferences.profile.exited_cleanly || false}`);
                }
                
                if (defaultPreferences.session) {
                    console.log(`  Restore on Startup: ${defaultPreferences.session.restore_on_startup || 'Not set'}`);
                    console.log(`  Startup URLs: ${defaultPreferences.session.startup_urls ? defaultPreferences.session.startup_urls.length : 0} URL(s)`);
                }
                
                if (defaultPreferences.sessions && defaultPreferences.sessions.event_log) {
                    const eventLog = defaultPreferences.sessions.event_log;
                    console.log(`  Session Events: ${eventLog.length} event(s)`);
                    
                    // Show last few events
                    const recentEvents = eventLog.slice(-3);
                    recentEvents.forEach((event, index) => {
                        const eventType = event.type === 0 ? 'Exit' : 
                                         event.type === 1 ? 'Restore' : 
                                         event.type === 2 ? 'Update' : 
                                         event.type === 5 ? 'Restore Browser' : 
                                         `Type ${event.type}`;
                        const crashed = event.crashed ? ' (CRASHED)' : '';
                        console.log(`    ${index + 1}. ${eventType}${crashed} - ${new Date(parseInt(event.time) / 1000 - 11644473600).toLocaleString()}`);
                    });
                }
                console.log('');
            } else {
                console.log(chalk.yellow('📋 Default Preferences: File not found\n'));
            }
            
            // Check for session backup
            const sessionBackupPath = path.join(profile.userDataDir, 'last-session-backup.json');
            if (await fs.pathExists(sessionBackupPath)) {
                const sessionBackup = await fs.readJson(sessionBackupPath);
                console.log(chalk.green('💾 Session Backup:'));
                console.log(`  Timestamp: ${sessionBackup.timestamp}`);
                console.log(`  URLs: ${sessionBackup.urls ? sessionBackup.urls.length : 0} URL(s)`);
                if (sessionBackup.urls && sessionBackup.urls.length > 0) {
                    sessionBackup.urls.slice(0, 3).forEach((url, index) => {
                        console.log(`    ${index + 1}. ${url}`);
                    });
                    if (sessionBackup.urls.length > 3) {
                        console.log(`    ... and ${sessionBackup.urls.length - 3} more`);
                    }
                }
                console.log('');
            } else {
                console.log(chalk.yellow('💾 Session Backup: Not found\n'));
            }
            
            // Show recommendations
            console.log(chalk.blue('💡 Recommendations:'));
            console.log('  • Use "Quit" (Cmd+Q) instead of closing individual windows');
            console.log('  • Ensure Chrome has time to save session data before shutdown');
            console.log('  • Check that the profile has proper exit state configuration');
            console.log('  • If issues persist, try clearing the session event log');
            
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Clear cache command
program
    .command('clear-cache')
    .description('Clear cache for profiles to reduce disk usage')
    .option('-a, --all', 'Clear cache for all profiles')
    .option('-p, --profile <name>', 'Clear cache for specific profile')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options) => {
        try {
            if (!options.all && !options.profile) {
                console.log(chalk.yellow('Please specify either --all to clear cache for all profiles or --profile <name> for a specific profile.'));
                console.log(chalk.dim('Examples:'));
                console.log(chalk.dim('  ppm clear-cache --all'));
                console.log(chalk.dim('  ppm clear-cache --profile "My Profile"'));
                return;
            }

            let profilesToClean = [];
            
            if (options.all) {
                profilesToClean = await profileManager.listProfiles();
                if (profilesToClean.length === 0) {
                    console.log(chalk.yellow('No profiles found to clear cache for.'));
                    return;
                }
            } else {
                try {
                    const profile = await profileManager.getProfile(options.profile);
                    profilesToClean = [profile];
                } catch (error) {
                    console.error(chalk.red(`Profile not found: ${options.profile}`));
                    return;
                }
            }

            // Show what will be cleared
            console.log(chalk.blue('\n🧹 Cache Clearing Operation'));
            console.log(`Profiles to clean: ${profilesToClean.length}`);
            profilesToClean.forEach((profile, index) => {
                console.log(`  ${index + 1}. ${profile.name} ${profile.description ? `(${profile.description})` : ''}`);
            });
            
            console.log(chalk.dim('\nCache directories that will be cleared:'));
            console.log(chalk.dim('  • Browser cache (Cache, Code Cache, GPU Cache)'));
            console.log(chalk.dim('  • Graphics caches (GraphiteDawnCache, ShaderCache)'));
            console.log(chalk.dim('  • Extension caches (component_crx_cache, extensions_crx_cache)'));
            console.log(chalk.dim('  • Temporary files and blob storage'));
            console.log(chalk.dim('  • Various database cache files'));

            // Confirmation prompt unless --yes is specified
            if (!options.yes) {
                const confirm = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'proceed',
                        message: `Are you sure you want to clear cache for ${profilesToClean.length} profile(s)?`,
                        default: false
                    }
                ]);

                if (!confirm.proceed) {
                    console.log(chalk.yellow('Operation cancelled.'));
                    return;
                }
            }

            // Clear cache for profiles
            console.log(chalk.blue('\n🚀 Starting cache clearing...'));
            let totalSizeCleared = 0;
            let successCount = 0;
            let errorCount = 0;

            for (const profile of profilesToClean) {
                try {
                    console.log(`\n🧹 Clearing cache for: ${chalk.cyan(profile.name)}`);
                    const results = await profileManager.clearCacheDirectories(profile.userDataDir);
                    
                    const sizeCleared = profileManager.formatBytes(results.totalSizeCleared);
                    console.log(`  ✅ Cache cleared: ${chalk.green(sizeCleared)} freed`);
                    
                    if (results.directoriesCleared.length > 0) {
                        console.log(`  📁 Directories: ${results.directoriesCleared.length} cleared`);
                    }
                    if (results.filesRemoved.length > 0) {
                        console.log(`  📄 Files: ${results.filesRemoved.length} removed`);
                    }
                    if (results.errors.length > 0) {
                        console.log(`  ⚠️  Errors: ${results.errors.length} (non-critical)`);
                    }
                    
                    totalSizeCleared += results.totalSizeCleared;
                    successCount++;
                } catch (error) {
                    console.log(`  ❌ Error clearing cache: ${chalk.red(error.message)}`);
                    errorCount++;
                }
            }

            // Summary
            console.log(chalk.blue('\n📊 Cache Clearing Summary:'));
            console.log(`✅ Profiles cleared: ${chalk.green(successCount)}`);
            if (errorCount > 0) {
                console.log(`❌ Profiles with errors: ${chalk.red(errorCount)}`);
            }
            console.log(`💾 Total space freed: ${chalk.green(profileManager.formatBytes(totalSizeCleared))}`);
            
            if (successCount > 0) {
                console.log(chalk.green('\n🎉 Cache clearing completed successfully!'));
            }

        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

// Handle cleanup on exit
process.on('SIGINT', async () => {
    console.log(chalk.blue('\nShutting down...'));
    try {
        if (profileLauncher && typeof profileLauncher.closeAllBrowsers === 'function') {
            await profileLauncher.closeAllBrowsers();
        }
        await profileManager.close();
    } catch (error) {
        console.error(chalk.red('Error during cleanup:'), error.message);
    }
    process.exit(0);
});

// Request capture management commands
program
    .command('capture')
    .description('Request capture management commands')
    .option('-s, --status', 'Show request capture system status')
    .option('-l, --list <sessionId>', 'List captured requests for a session')
    .option('-e, --export <sessionId>', 'Export captured requests for a session')
    .option('--format <format>', 'Export format (json, jsonl, csv)', 'jsonl')
    .option('--output <path>', 'Output file path for export')
    .option('--reload', 'Reload request capture hooks')
    .option('--cleanup [sessionId]', 'Clean up captured data (optionally for specific session)')
    .action(async (options) => {
        try {
            if (options.status) {
                const captureStatus = getProfileLauncher().getRequestCaptureStatus();
                
                console.log(chalk.blue('🕸️  Request Capture System Status'));
                console.log(chalk.blue('===================================\n'));
                
                console.log(`Total hooks loaded: ${chalk.green(captureStatus.totalHooks)}`);
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
                return;
            }
            
            if (options.list) {
                const capturedRequests = getProfileLauncher().getCapturedRequests(options.list);
                
                if (capturedRequests.length === 0) {
                    console.log(chalk.yellow('⚠️  No captured requests found for this session'));
                    return;
                }
                
                console.log(chalk.blue(`🕸️  Captured Requests for Session: ${options.list}`));
                console.log(chalk.blue('='.repeat(50)));
                console.log(chalk.dim(`Total: ${capturedRequests.length}\n`));
                
                capturedRequests.slice(0, 10).forEach((req, index) => {
                    const typeColor = req.type === 'request' ? 'cyan' : req.type === 'response' ? 'green' : 'yellow';
                    console.log(`${chalk.bold(`${index + 1}.`)} [${chalk[typeColor](req.type.toUpperCase())}] ${chalk.dim(req.timestamp)}`);
                    console.log(`   URL: ${req.url}`);
                    console.log(`   Hook: ${chalk.blue(req.hookName)}`);
                    
                    if (req.custom && req.custom.tokens) {
                        const tokenCount = Object.keys(req.custom.tokens).length;
                        if (tokenCount > 0) {
                            console.log(`   🔑 Tokens: ${chalk.green(tokenCount)} found`);
                        }
                    }
                    console.log('');
                });
                
                if (capturedRequests.length > 10) {
                    console.log(chalk.dim(`... and ${capturedRequests.length - 10} more requests`));
                }
                return;
            }
            
            if (options.export) {
                const capturedRequests = getProfileLauncher().getCapturedRequests(options.export);
                if (capturedRequests.length === 0) {
                    console.log(chalk.yellow('⚠️  No captured requests found for this session'));
                    return;
                }
                return;
            }
            
            if (options.reload) {
                console.log(chalk.blue('🔄 Reloading request capture hooks...'));
                await profileLauncher.reloadRequestCaptureHooks();
                
                const captureStatus = profileLauncher.getRequestCaptureStatus();
                console.log(chalk.green(`✅ Reloaded ${captureStatus.totalHooks} hooks`));
                return;
            }
            
            if (options.cleanup !== undefined) {
                console.log(chalk.blue('🧹 Cleaning up captured request data...'));
                
                if (options.cleanup) {
                    // Clean up specific session
                    await profileLauncher.requestCaptureSystem.cleanup(options.cleanup);
                    console.log(chalk.green(`✅ Cleaned up session: ${options.cleanup}`));
                } else {
                    // Clean up all sessions
                    await profileLauncher.requestCaptureSystem.cleanupAll();
                    console.log(chalk.green('✅ Cleaned up all captured request data'));
                }
                return;
            }
            
            // If no specific option, show help
            console.log(chalk.blue('🕸️  Request Capture Management'));
            console.log(chalk.blue('==============================\n'));
            console.log('Available options:');
            console.log('  --status           Show system status');
            console.log('  --list <sessionId> List captured requests');
            console.log('  --export <sessionId> Export captured requests');
            console.log('  --reload           Reload capture hooks');
            console.log('  --cleanup [sessionId] Clean up data');
            console.log('\nExample: ppm capture --status');
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// Compression management command
program
    .command('compress')
    .description('Manage profile compression')
    .option('-p, --profile <name>', 'Profile name or ID to process (omit to process ALL profiles)')
    .option('--enable', 'Enable compress-on-close for profile')
    .option('--disable', 'Disable compress-on-close for profile')
    .option('--run', 'Compress now (ALL profiles if no --profile specified)')
    .option('--decompress', 'Decompress now (ALL profiles if no --profile specified)')
    .option('-y, --yes', 'Skip confirmation prompts for batch operations')
    .action(async (options) => {
        try {
            if (options.enable && options.disable) {
                throw new Error('Use either --enable or --disable, not both');
            }
            if (options.run && options.decompress) {
                throw new Error('Use either --run or --decompress, not both');
            }

            // Handle preference changes
            if (options.profile && (options.enable || options.disable)) {
                const updated = await profileManager.setCompressionPreference(options.profile, !options.disable);
                console.log(chalk.green(`✓ Compression preference updated for ${updated.name}: ${updated.metadata.compressOnClose ? 'ENABLED' : 'DISABLED'}`));
                return;
            }

            // Handle compression operations
            if (options.run) {
                if (options.profile) {
                    const p = await profileManager.getProfile(options.profile);
                    if (await profileManager.isCompressed(p)) {
                        console.log(chalk.yellow(`Profile ${p.name} is already compressed`));
                        return;
                    }
                    console.log(chalk.blue(`Compressing profile: ${p.name}...`));
                    const res = await profileManager.compressProfile(p);
                    if (res.skipped) {
                        console.log(chalk.yellow(`⚠ Skipped: ${res.reason}`));
                    } else {
                        console.log(chalk.green(`✓ Compressed ${p.name}`));
                    }
                } else {
                    if (!options.yes) {
                        const confirm = await inquirer.prompt([{
                            type: 'confirm',
                            name: 'proceed',
                            message: 'Compress all uncompressed profiles?',
                            default: false
                        }]);
                        if (!confirm.proceed) {
                            console.log(chalk.yellow('Operation cancelled'));
                            return;
                        }
                    }
                    console.log(chalk.blue('Compressing all profiles...'));
                    const results = await profileManager.compressAllProfiles();
                    const successful = results.filter(r => r.success);
                    const skipped = results.filter(r => r.skipped);
                    const failed = results.filter(r => r.success === false);
                    
                    console.log(chalk.green(`✓ Compressed: ${successful.length} profile(s)`));
                    if (skipped.length > 0) {
                        console.log(chalk.yellow(`⚠ Skipped: ${skipped.length} profile(s)`));
                    }
                    if (failed.length > 0) {
                        console.log(chalk.red(`✗ Failed: ${failed.length} profile(s)`));
                        failed.forEach(f => console.log(chalk.red(`  ${f.profileName}: ${f.error}`)));
                    }
                }
            } else if (options.decompress) {
                if (options.profile) {
                    const p = await profileManager.getProfile(options.profile);
                    if (!(await profileManager.isCompressed(p))) {
                        console.log(chalk.yellow(`Profile ${p.name} is not compressed`));
                        return;
                    }
                    console.log(chalk.blue(`Decompressing profile: ${p.name}...`));
                    const res = await profileManager.decompressProfile(p);
                    if (res.skipped) {
                        console.log(chalk.yellow(`⚠ Skipped: ${res.reason}`));
                    } else {
                        console.log(chalk.green(`✓ Decompressed ${p.name}`));
                    }
                } else {
                    if (!options.yes) {
                        const confirm = await inquirer.prompt([{
                            type: 'confirm',
                            name: 'proceed',
                            message: 'Decompress all compressed profiles?',
                            default: false
                        }]);
                        if (!confirm.proceed) {
                            console.log(chalk.yellow('Operation cancelled'));
                            return;
                        }
                    }
                    console.log(chalk.blue('Decompressing all profiles...'));
                    const results = await profileManager.decompressAllProfiles();
                    const successful = results.filter(r => r.success);
                    const skipped = results.filter(r => r.skipped);
                    const failed = results.filter(r => r.success === false);
                    
                    console.log(chalk.green(`✓ Decompressed: ${successful.length} profile(s)`));
                    if (skipped.length > 0) {
                        console.log(chalk.yellow(`⚠ Skipped: ${skipped.length} profile(s)`));
                    }
                    if (failed.length > 0) {
                        console.log(chalk.red(`✗ Failed: ${failed.length} profile(s)`));
                        failed.forEach(f => console.log(chalk.red(`  ${f.profileName}: ${f.error}`)));
                    }
                }
            } else if (!options.profile && !options.enable && !options.disable && !options.run && !options.decompress) {
                // Show compression status summary
                const profiles = await profileManager.listProfiles();
                let compressed = 0, total = profiles.length;
                let totalSize = 0, compressedSize = 0;
                
                console.log(chalk.blue('\n📦 Profile Compression Status:\n'));
                
                for (const p of profiles) {
                    const isComp = await profileManager.isCompressed(p);
                    if (isComp) compressed++;
                    
                    // Calculate sizes
                    const { dirPath, archivePath } = profileManager.getProfileStoragePaths(p);
                    try {
                        if (isComp && await fs.pathExists(archivePath)) {
                            const stats = await fs.stat(archivePath);
                            compressedSize += stats.size;
                        } else if (await fs.pathExists(dirPath)) {
                            const size = await profileManager.getDirectorySize(dirPath);
                            totalSize += size;
                        }
                    } catch (e) {
                        // Ignore size calculation errors
                    }
                }
                
                console.log(`Total profiles: ${total}`);
                console.log(`Compressed: ${compressed}`);
                console.log(`Uncompressed: ${total - compressed}`);
                if (compressedSize > 0) {
                    console.log(`Compressed size: ${profileManager.formatBytes(compressedSize)}`);
                }
                if (totalSize > 0) {
                    console.log(`Uncompressed size: ${profileManager.formatBytes(totalSize)}`);
                }
                
                console.log(chalk.gray('\nUse --run to compress uncompressed profiles'));
                console.log(chalk.gray('Use --decompress to decompress compressed profiles'));
                console.log(chalk.gray('Use --profile <name> to target a specific profile'));
            }
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
            process.exit(1);
        }
    });

// Profile name migration command
program
    .command('migrate-names')
    .description('Migrate timestamp-based profile names to autoincremental numbering (auto-2025-...01 -> auto1)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options) => {
        try {
            const { migrateProfileNames } = await import('../migrate-profile-names.js');
            
            if (!options.yes) {
                const inquirer = await import('inquirer');
                const { confirm } = await inquirer.default.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: 'This will rename timestamp-based profiles to autoincremental numbering. Continue?',
                        default: false
                    }
                ]);
                
                if (!confirm) {
                    console.log('Migration cancelled.');
                    return;
                }
            }
            
            await migrateProfileNames();
        } catch (error) {
            console.error(chalk.red(`❌ Migration failed: ${error.message}`));
            process.exit(1);
        }
    });

// Proxy management command
program
    .command('proxy')
    .description('Manage proxy configurations')
    .option('-l, --list', 'List all available proxies')
    .option('-t, --test <selection>', 'Test proxy connectivity (selection: auto, fastest, proxy-label)')
    .option('--type <type>', 'Filter by proxy type: http or socks5')
    .option('--connection-type <type>', 'Filter by connection type: resident, datacenter, mobile')
    .option('--country <country>', 'Filter by country (ISO code like US, GB, DE or name like Germany)')
    .option('-s, --stats', 'Show proxy statistics and performance')
    .action(async (options) => {
        const launcher = getProfileLauncher();
        
        // Ensure proxies are loaded for all operations
        await launcher.ensureProxiesLoaded();
        
        if (options.list) {
            launcher.proxyManager.listProxies();
            return;
        }
        
        if (options.test) {
            console.log(`🔍 Testing proxy: ${options.test}${options.type ? ` (type: ${options.type})` : ''}`);
            
            try {
                const proxyConfig = await launcher.proxyManager.getProxyConfig(options.test, options.type, {
                    connectionType: options.connectionType,
                    country: options.country
                });
                if (proxyConfig) {
                    console.log(chalk.green('✅ Proxy configuration is valid'));
                    console.log(chalk.dim(`   Server: ${proxyConfig.server}`));
                    if (proxyConfig.username) {
                        console.log(chalk.dim(`   Username: ${proxyConfig.username}`));
                    }
                } else {
                    console.log(chalk.red('❌ Could not configure proxy'));
                }
            } catch (error) {
                console.log(chalk.red(`❌ Proxy test failed: ${error.message}`));
            }
            return;
        }
        
        if (options.stats) {
            const allProxies = launcher.proxyManager.getAllProxies();
            console.log(`\n📊 Proxy Statistics:`);
            console.log(`Total proxies: ${allProxies.total}`);
            console.log(`HTTP proxies: ${allProxies.http.length}`);
            console.log(`SOCKS5 proxies: ${allProxies.socks5.length}`);
            
            // Show fastest proxies
            const fastestHttp = launcher.proxyManager.getFastestProxy('http');
            const fastestSocks5 = launcher.proxyManager.getFastestProxy('socks5');
            
            if (fastestHttp) {
                console.log(`Fastest HTTP: ${fastestHttp.label} (${fastestHttp.avgLatencyMs}ms)`);
            }
            if (fastestSocks5) {
                console.log(`Fastest SOCKS5: ${fastestSocks5.label} (${fastestSocks5.avgLatencyMs}ms)`);
            }
            return;
        }
        
        // Default: show help
        console.log(chalk.yellow('Use --list to see available proxies or --help for more options'));
    });

program.parse();
