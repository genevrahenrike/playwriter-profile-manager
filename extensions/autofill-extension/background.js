/**
 * Background script for Smart Autofill Extension
 * Handles extension lifecycle and communication
 */

class AutofillBackground {
    constructor() {
        this.isEnabled = true;
        this.settings = {
            autoFillOnLoad: false,
            fillDelay: 100,
            showNotifications: true,
            keyboardShortcut: true
        };
        
        this.init();
    }
    
    init() {
        // Load settings from storage
        this.loadSettings();
        
        // Set up context menu
        this.setupContextMenu();
        
        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
        
        // Handle extension icon click
        chrome.action.onClicked.addListener((tab) => {
            this.toggleAutofill(tab);
        });
        
        // Handle keyboard shortcuts
        chrome.commands.onCommand.addListener((command) => {
            this.handleCommand(command);
        });
        
        console.log('Smart Autofill Background Script loaded');
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['autofillSettings', 'autofillEnabled']);
            this.settings = { ...this.settings, ...(result.autofillSettings || {}) };
            this.isEnabled = result.autofillEnabled !== false; // Default to true
            
            // Update icon based on enabled state
            this.updateIcon();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async saveSettings() {
        try {
            await chrome.storage.sync.set({
                autofillSettings: this.settings,
                autofillEnabled: this.isEnabled
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    setupContextMenu() {
        chrome.contextMenus.create({
            id: 'fillCurrentForm',
            title: 'Fill form with random data',
            contexts: ['page']
        });
        
        chrome.contextMenus.create({
            id: 'toggleAutofill',
            title: 'Toggle Smart Autofill',
            contexts: ['page']
        });
        
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenu(info, tab);
        });
    }
    
    async handleContextMenu(info, tab) {
        switch (info.menuItemId) {
            case 'fillCurrentForm':
                await this.fillFormInTab(tab);
                break;
            case 'toggleAutofill':
                await this.toggleAutofill(tab);
                break;
        }
    }
    
    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'getSettings':
                    sendResponse({
                        success: true,
                        settings: this.settings,
                        isEnabled: this.isEnabled
                    });
                    break;
                    
                case 'updateSettings':
                    this.settings = { ...this.settings, ...request.settings };
                    await this.saveSettings();
                    sendResponse({ success: true });
                    break;
                    
                case 'toggleEnabled':
                    this.isEnabled = !this.isEnabled;
                    await this.saveSettings();
                    this.updateIcon();
                    
                    // Notify all content scripts
                    this.broadcastToAllTabs({ 
                        action: 'toggleEnabled', 
                        enabled: this.isEnabled 
                    });
                    
                    sendResponse({ success: true, enabled: this.isEnabled });
                    break;
                    
                case 'fillForm':
                    if (sender.tab) {
                        await this.fillFormInTab(sender.tab);
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'No active tab' });
                    }
                    break;
                    
                case 'getFormInfo':
                    // Forward to content script
                    const response = await this.sendToTab(sender.tab.id, { action: 'getFormInfo' });
                    sendResponse(response);
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async handleCommand(command) {
        switch (command) {
            case 'fill-form':
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    await this.fillFormInTab(tab);
                }
                break;
        }
    }
    
    async fillFormInTab(tab) {
        if (!this.isEnabled) {
            console.log('Autofill is disabled');
            return;
        }
        
        try {
            await this.sendToTab(tab.id, { action: 'fillForm' });
        } catch (error) {
            console.error('Failed to fill form:', error);
        }
    }
    
    async toggleAutofill(tab) {
        this.isEnabled = !this.isEnabled;
        await this.saveSettings();
        this.updateIcon();
        
        // Notify content script in current tab
        try {
            await this.sendToTab(tab.id, { 
                action: 'toggleEnabled', 
                enabled: this.isEnabled 
            });
        } catch (error) {
            console.error('Failed to notify content script:', error);
        }
    }
    
    async sendToTab(tabId, message) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message to tab:', chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || { success: true });
                }
            });
        });
    }
    
    async broadcastToAllTabs(message) {
        try {
            const tabs = await chrome.tabs.query({});
            const promises = tabs.map(tab => this.sendToTab(tab.id, message));
            await Promise.allSettled(promises);
        } catch (error) {
            console.error('Failed to broadcast to all tabs:', error);
        }
    }
    
    updateIcon() {
        // Update title only since we don't have icons
        const title = this.isEnabled ?
            'Smart Autofill (Enabled)' :
            'Smart Autofill (Disabled)';
        chrome.action.setTitle({ title });
    }
    
    // Generate statistics about extension usage
    async getUsageStats() {
        try {
            const result = await chrome.storage.local.get(['usageStats']);
            return result.usageStats || {
                formsFilledCount: 0,
                fieldsFilledCount: 0,
                lastUsed: null,
                installDate: Date.now()
            };
        } catch (error) {
            console.error('Failed to get usage stats:', error);
            return null;
        }
    }
    
    async updateUsageStats(formsFilled = 0, fieldsFilled = 0) {
        try {
            const stats = await this.getUsageStats();
            stats.formsFilledCount += formsFilled;
            stats.fieldsFilledCount += fieldsFilled;
            stats.lastUsed = Date.now();
            
            await chrome.storage.local.set({ usageStats: stats });
        } catch (error) {
            console.error('Failed to update usage stats:', error);
        }
    }
}

// Initialize background script
new AutofillBackground();