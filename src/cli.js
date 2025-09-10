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

// Register autocomplete plugin
inquirer.registerPrompt('autocomplete', autocomplete);

const program = new Command();
const profileManager = new ProfileManager();
const chromiumImporter = new ChromiumImporter();
// Create default ProfileLauncher (will be recreated with specific options in commands that need it)
let profileLauncher = new ProfileLauncher(profileManager);

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

// Create profile command
program
    .command('create')
    .description('Create a new browser profile')
    .option('-n, --name <name>', 'Profile name')
    .option('-d, --description <description>', 'Profile description')
    .option('-b, --browser <type>', 'Browser type (chromium, firefox, webkit)', 'chromium')
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
                browserType: options.browser
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
    .option('--no-capture', 'Disable request capture (enabled by default)')
    .option('--capture-format <format>', 'Request capture output format (jsonl, json, csv)', 'jsonl')
    .option('--capture-dir <dir>', 'Request capture output directory', './captured-requests')
    .option('--no-autofill-stop-on-success', 'Disable stopping autofill after success (default: enabled)')
    .option('--autofill-enforce-mode', 'Continue autofill monitoring even after success for race condition protection')
    .option('--autofill-min-fields <number>', 'Minimum fields required for autofill success', '2')
    .option('--autofill-cooldown <ms>', 'Cooldown period before re-enabling autofill after success (ms)', '30000')
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

            // Prepare launch options
            const launchOptions = {
                browserType: options.browser,
                headless: options.headless,
                devtools: options.devtools,
                loadExtensions: options.loadExtensions || [],
                autoLoadExtensions: options.autoExtensions !== false, // True by default, disable with --no-auto-extensions
                enableAutomation: options.automation !== false, // True by default, disable with --no-automation
                enableRequestCapture: options.capture !== false, // True by default, disable with --no-capture
                maxStealth: options.maxStealth !== false, // True by default, disable with --no-max-stealth
                automationTasks: options.automationTasks || []
            };

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
    .option('--no-automation', 'Disable automation features')
    .option('--no-capture', 'Disable request capture')
    .option('--no-autofill-stop-on-success', 'Disable stopping autofill after success (default: enabled)')
    .option('--autofill-enforce-mode', 'Continue autofill monitoring even after success for race condition protection')
    .option('--autofill-min-fields <number>', 'Minimum fields required for autofill success', '2')
    .option('--autofill-cooldown <ms>', 'Cooldown period before re-enabling autofill after success (ms)', '30000')
    .action(async (template, instanceName, options) => {
        try {
            // Create ProfileLauncher with autofill options
            const templateLauncherOptions = {
                autofillStopOnSuccess: options.autofillStopOnSuccess !== false, // true by default, false only with --no-autofill-stop-on-success
                autofillEnforceMode: options.autofillEnforceMode || false,
                autofillMinFields: parseInt(options.autofillMinFields) || 2,
                autofillCooldown: parseInt(options.autofillCooldown) || 30000
            };
            
            const templateProfileLauncher = new ProfileLauncher(profileManager, templateLauncherOptions);            // Show autofill configuration if non-default
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
            
            profileLauncher = new ProfileLauncher(profileManager, launcherOptions);
            console.log(chalk.blue(`🎭 Launching template instance: ${instanceName}`));
            console.log(chalk.dim(`Template: ${template}`));
            console.log(chalk.dim(`Profile type: ${options.temp ? 'TEMPORARY (will be deleted)' : 'PERMANENT (will be saved)'}`));
            console.log(chalk.dim(`Fingerprint randomization: ${options.randomizeFingerprint !== false ? 'ENABLED' : 'DISABLED'}`));
            if (options.varyScreenResolution) {
                console.log(chalk.dim(`Screen resolution variation: ENABLED`));
            }
            
            const launchOptions = {
                browserType: options.browser,
                headless: options.headless,
                devtools: options.devtools,
                randomizeFingerprint: options.randomizeFingerprint !== false,
                varyScreenResolution: options.varyScreenResolution || false,
                stealthPreset: options.stealthPreset,
                loadExtensions: options.loadExtensions || [],
                autoLoadExtensions: options.autoExtensions !== false,
                enableAutomation: options.automation !== false,
                enableRequestCapture: options.capture !== false,
                isTemporary: options.temp || false // Only temporary if --temp flag is used
            };

            const result = await templateProfileLauncher.launchFromTemplate(template, instanceName, launchOptions);
            
            console.log(chalk.green('✅ Template instance launched successfully!'));
            console.log(chalk.dim(`Session ID: ${result.sessionId}`));
            console.log(chalk.dim(`Template: ${result.templateProfile}`));
            console.log(chalk.dim(`Instance: ${result.instanceName}`));
            console.log(chalk.dim(`Profile type: ${options.temp ? 'TEMPORARY' : 'PERMANENT'}`));
            
            if (result.fingerprintRandomized) {
                console.log(chalk.blue('🎲 Fingerprint randomized for uniqueness'));
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

// Clone profile command
program
    .command('clone')
    .description('Clone an existing profile')
    .argument('[source]', 'Source profile name or ID (optional - will show selection if not provided)')
    .argument('[name]', 'New profile name (optional - will prompt if not provided)')
    .option('-d, --description <description>', 'Description for cloned profile')
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
                options.description
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
            const sessions = profileLauncher.getActiveSessions();
            
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
        await profileLauncher.closeAllBrowsers();
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
                const captureStatus = profileLauncher.getRequestCaptureStatus();
                
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
                const capturedRequests = profileLauncher.getCapturedRequests(options.list);
                
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
                const capturedRequests = profileLauncher.getCapturedRequests(options.export);
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

program.parse();
