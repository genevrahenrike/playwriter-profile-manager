import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class ChromiumImporter {
    constructor() {
        this.chromiumPaths = this.getChromiumPaths();
    }

    getChromiumPaths() {
        const platform = os.platform();
        const homeDir = os.homedir();
        
        const paths = {
            darwin: [
                // Google Chrome (all channels)
                { path: path.join(homeDir, 'Library/Application Support/Google/Chrome'), name: 'Chrome', channel: 'Stable' },
                { path: path.join(homeDir, 'Library/Application Support/Google/Chrome Beta'), name: 'Chrome', channel: 'Beta' },
                { path: path.join(homeDir, 'Library/Application Support/Google/Chrome Dev'), name: 'Chrome', channel: 'Dev' },
                { path: path.join(homeDir, 'Library/Application Support/Google/Chrome Canary'), name: 'Chrome', channel: 'Canary' },
                
                // Microsoft Edge (all channels)
                { path: path.join(homeDir, 'Library/Application Support/Microsoft Edge'), name: 'Edge', channel: 'Stable' },
                { path: path.join(homeDir, 'Library/Application Support/Microsoft Edge Beta'), name: 'Edge', channel: 'Beta' },
                { path: path.join(homeDir, 'Library/Application Support/Microsoft Edge Dev'), name: 'Edge', channel: 'Dev' },
                { path: path.join(homeDir, 'Library/Application Support/Microsoft Edge Canary'), name: 'Edge', channel: 'Canary' },
                
                // Brave Browser
                { path: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser'), name: 'Brave', channel: 'Stable' },
                { path: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser-Beta'), name: 'Brave', channel: 'Beta' },
                { path: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser-Dev'), name: 'Brave', channel: 'Dev' },
                { path: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser-Nightly'), name: 'Brave', channel: 'Nightly' },
                
                // Opera (all versions)
                { path: path.join(homeDir, 'Library/Application Support/com.operasoftware.Opera'), name: 'Opera', channel: 'Stable' },
                { path: path.join(homeDir, 'Library/Application Support/com.operasoftware.OperaNext'), name: 'Opera', channel: 'Beta' },
                { path: path.join(homeDir, 'Library/Application Support/com.operasoftware.OperaDeveloper'), name: 'Opera', channel: 'Developer' },
                { path: path.join(homeDir, 'Library/Application Support/com.operasoftware.OperaGX'), name: 'Opera GX', channel: 'Stable' },
                
                // Chromium
                { path: path.join(homeDir, 'Library/Application Support/Chromium'), name: 'Chromium', channel: 'Open Source' },
                
                // Arc Browser
                { path: path.join(homeDir, 'Library/Application Support/Arc/User Data'), name: 'Arc', channel: 'Stable' },
                
                // Vivaldi
                { path: path.join(homeDir, 'Library/Application Support/Vivaldi'), name: 'Vivaldi', channel: 'Stable' }
            ],
            win32: [
                // Google Chrome (all channels)
                { path: path.join(homeDir, 'AppData/Local/Google/Chrome/User Data'), name: 'Chrome', channel: 'Stable' },
                { path: path.join(homeDir, 'AppData/Local/Google/Chrome Beta/User Data'), name: 'Chrome', channel: 'Beta' },
                { path: path.join(homeDir, 'AppData/Local/Google/Chrome Dev/User Data'), name: 'Chrome', channel: 'Dev' },
                { path: path.join(homeDir, 'AppData/Local/Google/Chrome SxS/User Data'), name: 'Chrome', channel: 'Canary' },
                
                // Microsoft Edge (all channels)
                { path: path.join(homeDir, 'AppData/Local/Microsoft/Edge/User Data'), name: 'Edge', channel: 'Stable' },
                { path: path.join(homeDir, 'AppData/Local/Microsoft/Edge Beta/User Data'), name: 'Edge', channel: 'Beta' },
                { path: path.join(homeDir, 'AppData/Local/Microsoft/Edge Dev/User Data'), name: 'Edge', channel: 'Dev' },
                { path: path.join(homeDir, 'AppData/Local/Microsoft/Edge SxS/User Data'), name: 'Edge', channel: 'Canary' },
                
                // Brave Browser
                { path: path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser/User Data'), name: 'Brave', channel: 'Stable' },
                { path: path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser-Beta/User Data'), name: 'Brave', channel: 'Beta' },
                { path: path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser-Dev/User Data'), name: 'Brave', channel: 'Dev' },
                { path: path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser-Nightly/User Data'), name: 'Brave', channel: 'Nightly' },
                
                // Opera
                { path: path.join(homeDir, 'AppData/Roaming/Opera Software/Opera Stable'), name: 'Opera', channel: 'Stable' },
                { path: path.join(homeDir, 'AppData/Roaming/Opera Software/Opera Next'), name: 'Opera', channel: 'Beta' },
                { path: path.join(homeDir, 'AppData/Roaming/Opera Software/Opera Developer'), name: 'Opera', channel: 'Developer' },
                { path: path.join(homeDir, 'AppData/Roaming/Opera Software/Opera GX Stable'), name: 'Opera GX', channel: 'Stable' },
                
                // Chromium
                { path: path.join(homeDir, 'AppData/Local/Chromium/User Data'), name: 'Chromium', channel: 'Open Source' },
                
                // Vivaldi
                { path: path.join(homeDir, 'AppData/Local/Vivaldi/User Data'), name: 'Vivaldi', channel: 'Stable' }
            ],
            linux: [
                // Google Chrome
                { path: path.join(homeDir, '.config/google-chrome'), name: 'Chrome', channel: 'Stable' },
                { path: path.join(homeDir, '.config/google-chrome-beta'), name: 'Chrome', channel: 'Beta' },
                { path: path.join(homeDir, '.config/google-chrome-unstable'), name: 'Chrome', channel: 'Dev' },
                
                // Microsoft Edge
                { path: path.join(homeDir, '.config/microsoft-edge'), name: 'Edge', channel: 'Stable' },
                { path: path.join(homeDir, '.config/microsoft-edge-beta'), name: 'Edge', channel: 'Beta' },
                { path: path.join(homeDir, '.config/microsoft-edge-dev'), name: 'Edge', channel: 'Dev' },
                
                // Brave Browser
                { path: path.join(homeDir, '.config/BraveSoftware/Brave-Browser'), name: 'Brave', channel: 'Stable' },
                { path: path.join(homeDir, '.config/BraveSoftware/Brave-Browser-Beta'), name: 'Brave', channel: 'Beta' },
                { path: path.join(homeDir, '.config/BraveSoftware/Brave-Browser-Dev'), name: 'Brave', channel: 'Dev' },
                { path: path.join(homeDir, '.config/BraveSoftware/Brave-Browser-Nightly'), name: 'Brave', channel: 'Nightly' },
                
                // Opera
                { path: path.join(homeDir, '.config/opera'), name: 'Opera', channel: 'Stable' },
                { path: path.join(homeDir, '.config/opera-beta'), name: 'Opera', channel: 'Beta' },
                { path: path.join(homeDir, '.config/opera-developer'), name: 'Opera', channel: 'Developer' },
                
                // Chromium
                { path: path.join(homeDir, '.config/chromium'), name: 'Chromium', channel: 'Open Source' },
                
                // Vivaldi
                { path: path.join(homeDir, '.config/vivaldi'), name: 'Vivaldi', channel: 'Stable' }
            ]
        };
        
        return paths[platform] || paths.linux;
    }

    async findChromiumProfiles() {
        const profiles = [];
        
        for (const browserInfo of this.chromiumPaths) {
            if (await fs.pathExists(browserInfo.path)) {
                const localStatePath = path.join(browserInfo.path, 'Local State');
                
                if (await fs.pathExists(localStatePath)) {
                    try {
                        const localState = await fs.readJson(localStatePath);
                        const profileInfo = localState.profile?.info_cache || {};
                        
                        for (const [profileDir, info] of Object.entries(profileInfo)) {
                            const profilePath = path.join(browserInfo.path, profileDir);
                            if (await fs.pathExists(profilePath)) {
                                profiles.push({
                                    browser: browserInfo.name,
                                    channel: browserInfo.channel,
                                    name: info.name || profileDir,
                                    path: profilePath,
                                    profileDir,
                                    isDefault: profileDir === 'Default',
                                    browserPath: browserInfo.path
                                });
                            }
                        }
                    } catch (error) {
                        console.warn(`Failed to read Local State from ${browserInfo.path}:`, error.message);
                    }
                }
                
                // Also check for Default profile if not found in Local State
                const defaultProfilePath = path.join(browserInfo.path, 'Default');
                if (await fs.pathExists(defaultProfilePath) && 
                    !profiles.some(p => p.path === defaultProfilePath)) {
                    profiles.push({
                        browser: browserInfo.name,
                        channel: browserInfo.channel,
                        name: 'Default',
                        path: defaultProfilePath,
                        profileDir: 'Default',
                        isDefault: true,
                        browserPath: browserInfo.path
                    });
                }
            }
        }
        
        return profiles;
    }

    groupProfilesByBrowser(profiles) {
        const grouped = {};
        
        for (const profile of profiles) {
            const browserKey = `${profile.browser} ${profile.channel}`;
            if (!grouped[browserKey]) {
                grouped[browserKey] = {
                    browser: profile.browser,
                    channel: profile.channel,
                    profiles: []
                };
            }
            grouped[browserKey].profiles.push(profile);
        }
        
        // Sort browsers and profiles
        const sortedBrowsers = Object.keys(grouped).sort();
        const result = {};
        
        for (const browserKey of sortedBrowsers) {
            const browserData = grouped[browserKey];
            browserData.profiles.sort((a, b) => {
                // Put Default profile first, then sort by name
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return a.name.localeCompare(b.name);
            });
            result[browserKey] = browserData;
        }
        
        return result;
    }

    async importProfile(sourcePath, destinationPath, options = {}) {
        // Focus on core three: cookies, extensions, bookmarks
        const {
            cookies = true,
            extensions = true,
            bookmarks = true
        } = options;

        const importResults = {
            cookies: false,
            extensions: false,
            bookmarks: false
        };

        try {
            // Ensure destination exists
            await fs.ensureDir(destinationPath);

            // 1. Import cookies as JSON (clean approach)
            if (cookies) {
                const cookiesPath = path.join(sourcePath, 'Cookies');
                if (await fs.pathExists(cookiesPath)) {
                    try {
                        const cookiesJson = await this.extractCookiesAsJson(cookiesPath);
                        await this.importCookiesFromJson(cookiesJson, destinationPath);
                        importResults.cookies = true;
                        console.log(`   📍 Extracted ${cookiesJson.length} cookies as JSON`);
                    } catch (error) {
                        console.warn(`   ⚠️ Could not extract cookies: ${error.message}`);
                    }
                }
            }

            // 2. Import extensions (get info for Playwright loading)
            if (extensions) {
                const extensionsPath = path.join(sourcePath, 'Extensions');
                if (await fs.pathExists(extensionsPath)) {
                    try {
                        const extensionInfo = await this.getExtensionInfo(extensionsPath);
                        if (extensionInfo.length > 0) {
                            // Copy extension directories
                            await fs.copy(extensionsPath, path.join(destinationPath, 'Extensions'));
                            
                            // Create extension metadata for Playwright
                            const extensionMeta = {
                                extensions: extensionInfo,
                                extensionPaths: extensionInfo.map(ext => ext.path)
                            };
                            await fs.writeJson(path.join(destinationPath, 'extension-info.json'), extensionMeta, { spaces: 2 });
                            
                            importResults.extensions = true;
                            console.log(`   🧩 Found ${extensionInfo.length} extensions:`);
                            extensionInfo.forEach(ext => console.log(`      - ${ext.name} (${ext.id})`));
                        }
                    } catch (error) {
                        console.warn(`   ⚠️ Could not process extensions: ${error.message}`);
                    }
                }
            }

            // 3. Import bookmarks as JSON (clean approach)
            if (bookmarks) {
                const bookmarksPath = path.join(sourcePath, 'Bookmarks');
                if (await fs.pathExists(bookmarksPath)) {
                    try {
                        const bookmarksData = await fs.readJson(bookmarksPath);
                        await fs.writeJson(path.join(destinationPath, 'bookmarks.json'), bookmarksData, { spaces: 2 });
                        
                        // Also copy original for compatibility
                        await fs.copy(bookmarksPath, path.join(destinationPath, 'Bookmarks'));
                        
                        importResults.bookmarks = true;
                        
                        // Count bookmarks
                        const bookmarkCount = this.countBookmarks(bookmarksData);
                        console.log(`   🔖 Imported ${bookmarkCount} bookmarks`);
                    } catch (error) {
                        console.warn(`   ⚠️ Could not import bookmarks: ${error.message}`);
                    }
                }
            }

            return importResults;
        } catch (error) {
            throw new Error(`Failed to import profile: ${error.message}`);
        }
    }

    sanitizePreferences(preferences) {
        // Remove potentially problematic settings for Playwright
        if (preferences.profile) {
            delete preferences.profile.exit_type;
            delete preferences.profile.exited_cleanly;
            delete preferences.profile.last_engagement_time;
        }
        
        // Remove session data that might cause conflicts
        delete preferences.session;
        delete preferences.browser;
        
        // Remove hardware acceleration settings that might cause issues
        if (preferences.hardware_acceleration_mode) {
            delete preferences.hardware_acceleration_mode;
        }
        
        // Remove GPU blacklist settings
        if (preferences.gpu) {
            delete preferences.gpu;
        }
        
        // Remove potentially problematic extension settings
        if (preferences.extensions && preferences.extensions.chrome_url_overrides) {
            delete preferences.extensions.chrome_url_overrides;
        }
        
        return preferences;
    }

    async extractCookiesAsJson(cookiesDbPath) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(cookiesDbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    reject(new Error(`Cannot open cookies database: ${err.message}`));
                    return;
                }
            });

            const query = `
                SELECT 
                    host_key as domain,
                    name,
                    value,
                    path,
                    expires_utc,
                    is_secure as secure,
                    is_httponly as httpOnly,
                    samesite,
                    creation_utc
                FROM cookies 
                WHERE expires_utc > ? OR expires_utc = 0
                ORDER BY host_key, name
            `;

            const currentTime = Date.now() * 1000; // Convert to microseconds (Chrome format)
            
            db.all(query, [currentTime], (err, rows) => {
                db.close();
                
                if (err) {
                    reject(new Error(`Failed to read cookies: ${err.message}`));
                    return;
                }

                const cookies = rows.map(row => {
                    const cookie = {
                        name: row.name,
                        value: row.value,
                        domain: row.domain.startsWith('.') ? row.domain : `.${row.domain}`,
                        path: row.path,
                        secure: Boolean(row.secure),
                        httpOnly: Boolean(row.httpOnly)
                    };

                    // Handle expiration (Chrome uses microseconds since epoch)
                    if (row.expires_utc && row.expires_utc > 0) {
                        cookie.expires = Math.floor(row.expires_utc / 1000000); // Convert to seconds
                    }

                    // Handle SameSite - map to Playwright-compatible values
                    if (row.samesite !== undefined) {
                        const sameSiteMap = {
                            0: 'None',     // Unspecified -> None for Playwright
                            1: 'None',
                            2: 'Lax',
                            3: 'Strict'
                        };
                        const mappedValue = sameSiteMap[row.samesite];
                        if (mappedValue && ['Strict', 'Lax', 'None'].includes(mappedValue)) {
                            cookie.sameSite = mappedValue;
                        }
                    }

                    return cookie;
                });

                resolve(cookies);
            });
        });
    }

    async importCookiesFromJson(cookiesJson, destinationPath) {
        const cookiesFile = path.join(destinationPath, 'imported-cookies.json');
        await fs.writeJson(cookiesFile, cookiesJson, { spaces: 2 });
        return cookiesFile;
    }

    async getExtensionInfo(extensionsPath) {
        const extensions = [];
        
        if (!await fs.pathExists(extensionsPath)) {
            return extensions;
        }

        const extensionDirs = await fs.readdir(extensionsPath);
        
        for (const extensionId of extensionDirs) {
            const extensionPath = path.join(extensionsPath, extensionId);
            const stat = await fs.stat(extensionPath);
            
            if (stat.isDirectory()) {
                try {
                    // Look for manifest files in version directories
                    const versionDirs = await fs.readdir(extensionPath);
                    for (const version of versionDirs) {
                        const versionPath = path.join(extensionPath, version);
                        const manifestPath = path.join(versionPath, 'manifest.json');
                        
                        if (await fs.pathExists(manifestPath)) {
                            const manifest = await fs.readJson(manifestPath);
                            extensions.push({
                                id: extensionId,
                                version,
                                name: manifest.name || 'Unknown Extension',
                                description: manifest.description || '',
                                path: versionPath,
                                manifest
                            });
                            break; // Use first valid version found
                        }
                    }
                } catch (error) {
                    console.warn(`Could not read extension ${extensionId}:`, error.message);
                }
            }
        }
        
        return extensions;
    }

    countBookmarks(bookmarksData) {
        let count = 0;
        
        const countInNode = (node) => {
            if (node.type === 'url') {
                count++;
            } else if (node.children) {
                node.children.forEach(countInNode);
            }
        };
        
        if (bookmarksData.roots) {
            Object.values(bookmarksData.roots).forEach(countInNode);
        }
        
        return count;
    }

    async importFromCustomPath(customPath, destinationPath, options = {}) {
        // Validate that the custom path looks like a valid Chromium profile
        const requiredFiles = ['Cookies', 'Preferences', 'History'];
        const hasValidFiles = requiredFiles.some(file => 
            fs.pathExistsSync(path.join(customPath, file))
        );
        
        if (!hasValidFiles) {
            throw new Error(`Path does not appear to be a valid Chromium profile directory: ${customPath}`);
        }
        
        return await this.importProfile(customPath, destinationPath, options);
    }

    getImportableDataTypes() {
        return {
            cookies: {
                name: 'Cookies',
                description: 'Login sessions, website preferences (exported as JSON)',
                essential: true,
                playwrightSupported: true
            },
            extensions: {
                name: 'Extensions',
                description: 'Browser extensions (with metadata for Playwright loading)',
                essential: false,
                playwrightSupported: true
            },
            bookmarks: {
                name: 'Bookmarks',
                description: 'Saved bookmarks and bookmark bar (exported as JSON)',
                essential: false,
                playwrightSupported: false
            }
        };
    }

    async getProfileSize(profilePath) {
        try {
            const stats = await this.getFolderSize(profilePath);
            return this.formatBytes(stats);
        } catch (error) {
            return 'Unknown';
        }
    }

    async getFolderSize(folderPath) {
        let totalSize = 0;
        const files = await fs.readdir(folderPath);
        
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isDirectory()) {
                totalSize += await this.getFolderSize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
        
        return totalSize;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
