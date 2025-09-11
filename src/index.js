// Main exports for the Playwright Profile Manager
export { ProfileManager } from './ProfileManager.js';
export { ChromiumImporter } from './ChromiumImporter.js';
export { ProfileLauncher } from './ProfileLauncher.js';
export { RequestCaptureSystem } from './RequestCaptureSystem.js';
export { AutofillHookSystem } from './AutofillHookSystem.js';
export { ProxyManager } from './ProxyManager.js';
export { ProxyRotator } from './ProxyRotator.js';
export { IPTracker } from './IPTracker.js';

// Re-export for programmatic usage
import { ProfileManager } from './ProfileManager.js';
import { ChromiumImporter } from './ChromiumImporter.js';
import { ProfileLauncher } from './ProfileLauncher.js';

/**
 * Create a complete profile management system
 * @param {string} baseDir - Base directory for profiles
 * @returns {Object} Profile management system
 */
export function createProfileSystem(baseDir) {
    const profileManager = new ProfileManager(baseDir);
    const chromiumImporter = new ChromiumImporter();
    const profileLauncher = new ProfileLauncher(profileManager);
    
    return {
        profileManager,
        chromiumImporter,
        profileLauncher,
        
        // Convenience methods
        async createProfile(name, options) {
            return await profileManager.createProfile(name, options);
        },
        
        async launchProfile(nameOrId, options) {
            return await profileLauncher.launchProfile(nameOrId, options);
        },
        
        async importFromChromium(sourcePath, profileName) {
            const profile = await profileManager.createProfile(profileName, {
                description: 'Imported from Chromium',
                browserType: 'chromium',
                importFrom: sourcePath
            });
            
            const importResults = await chromiumImporter.importProfile(
                sourcePath,
                profile.userDataDir
            );
            
            return { profile, importResults };
        },
        
        async cleanup() {
            await profileLauncher.closeAllBrowsers();
            await profileManager.close();
        }
    };
}

export default createProfileSystem;

