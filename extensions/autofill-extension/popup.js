/**
 * Popup script for Smart Autofill Extension
 * Handles popup UI interactions and communication with background script
 */

class AutofillPopup {
    constructor() {
        this.isEnabled = true;
        this.settings = {};
        this.currentFormInfo = null;
        
        this.init();
    }
    
    async init() {
        // Load current settings and status
        await this.loadSettings();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        // Load current page form info
        await this.loadFormInfo();
        
        console.log('Popup initialized');
    }
    
    async loadSettings() {
        try {
            const response = await this.sendMessage({ action: 'getSettings' });
            if (response.success) {
                this.settings = response.settings;
                this.isEnabled = response.isEnabled;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async loadFormInfo() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'getFormInfo' });
                if (response && response.formInfo) {
                    this.currentFormInfo = response.formInfo;
                    this.updateFormInfo();
                }
            }
        } catch (error) {
            console.error('Failed to load form info:', error);
            // Set default values if we can't get form info
            this.updateFormInfo({
                formsCount: 0,
                emailFields: 0,
                passwordFields: 0,
                passwordConfirmFields: 0
            });
        }
    }
    
    setupEventListeners() {
        // Fill form button
        document.getElementById('fillFormBtn').addEventListener('click', () => {
            this.fillCurrentForm();
        });
        
        // Toggle enable/disable button
        document.getElementById('toggleBtn').addEventListener('click', () => {
            this.toggleEnabled();
        });
        
        // Settings checkboxes
        document.getElementById('showNotifications').addEventListener('change', (e) => {
            this.updateSetting('showNotifications', e.target.checked);
        });
        
        document.getElementById('keyboardShortcut').addEventListener('change', (e) => {
            this.updateSetting('keyboardShortcut', e.target.checked);
        });
        
        // Copy buttons
        document.getElementById('copyEmailBtn').addEventListener('click', () => {
            this.copyToClipboard('generatedEmail');
        });
        
        document.getElementById('copyPasswordBtn').addEventListener('click', () => {
            this.copyToClipboard('generatedPassword');
        });
        
        // Toggle password visibility
        document.getElementById('togglePasswordBtn').addEventListener('click', () => {
            this.togglePasswordVisibility();
        });
    }
    
    updateUI() {
        // Update status indicator
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const toggleBtn = document.getElementById('toggleBtn');
        const toggleIcon = document.getElementById('toggleIcon');
        const toggleText = document.getElementById('toggleText');
        
        if (this.isEnabled) {
            statusDot.classList.remove('disabled');
            statusText.textContent = 'Enabled';
            toggleIcon.textContent = '⏸️';
            toggleText.textContent = 'Disable';
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-secondary');
        } else {
            statusDot.classList.add('disabled');
            statusText.textContent = 'Disabled';
            toggleIcon.textContent = '▶️';
            toggleText.textContent = 'Enable';
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-primary');
        }
        
        // Update settings checkboxes
        document.getElementById('showNotifications').checked = this.settings.showNotifications !== false;
        document.getElementById('keyboardShortcut').checked = this.settings.keyboardShortcut !== false;
        
        // Enable/disable fill button based on status
        document.getElementById('fillFormBtn').disabled = !this.isEnabled;
    }
    
    updateFormInfo(formInfo = null) {
        const info = formInfo || this.currentFormInfo || {};
        
        document.getElementById('formsCount').textContent = info.formsCount || 0;
        document.getElementById('emailFields').textContent = info.emailFields || 0;
        document.getElementById('passwordFields').textContent = (info.passwordFields || 0) + (info.passwordConfirmFields || 0);
        
        // Show generated data if available
        if (info.lastGeneratedData) {
            this.showGeneratedData(info.lastGeneratedData);
        }
    }
    
    showGeneratedData(data) {
        const section = document.getElementById('generatedDataSection');
        section.style.display = 'block';
        
        document.getElementById('generatedEmail').textContent = data.email || '-';
        document.getElementById('generatedPassword').textContent = data.password || '-';
        document.getElementById('generatedStyle').textContent = 
            `${data.usernameStyle || 'unknown'} (${data.usernamePattern || 'unknown'})`;
    }
    
    async fillCurrentForm() {
        try {
            const fillBtn = document.getElementById('fillFormBtn');
            fillBtn.disabled = true;
            fillBtn.innerHTML = '<span class="btn-icon">⏳</span>Filling...';
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
                if (response && response.success) {
                    // Reload form info to get updated data
                    setTimeout(() => {
                        this.loadFormInfo();
                    }, 500);
                }
            }
        } catch (error) {
            console.error('Failed to fill form:', error);
            this.showError('Failed to fill form. Make sure the page is loaded.');
        } finally {
            // Reset button
            setTimeout(() => {
                const fillBtn = document.getElementById('fillFormBtn');
                fillBtn.disabled = !this.isEnabled;
                fillBtn.innerHTML = '<span class="btn-icon">✨</span>Fill Current Form';
            }, 1000);
        }
    }
    
    async toggleEnabled() {
        try {
            const response = await this.sendMessage({ action: 'toggleEnabled' });
            if (response.success) {
                this.isEnabled = response.enabled;
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to toggle enabled state:', error);
        }
    }
    
    async updateSetting(key, value) {
        try {
            this.settings[key] = value;
            await this.sendMessage({
                action: 'updateSettings',
                settings: { [key]: value }
            });
        } catch (error) {
            console.error('Failed to update setting:', error);
        }
    }
    
    async copyToClipboard(elementId) {
        try {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            
            if (text && text !== '-') {
                await navigator.clipboard.writeText(text);
                this.showSuccess('Copied to clipboard!');
                
                // Visual feedback
                const copyBtn = elementId === 'generatedEmail' ? 
                    document.getElementById('copyEmailBtn') : 
                    document.getElementById('copyPasswordBtn');
                
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✓';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1000);
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showError('Failed to copy to clipboard');
        }
    }
    
    togglePasswordVisibility() {
        const passwordField = document.getElementById('generatedPassword');
        const toggleBtn = document.getElementById('togglePasswordBtn');
        
        if (passwordField.classList.contains('visible')) {
            passwordField.classList.remove('visible');
            toggleBtn.textContent = '👁️';
            toggleBtn.title = 'Show password';
        } else {
            passwordField.classList.add('visible');
            toggleBtn.textContent = '🙈';
            toggleBtn.title = 'Hide password';
        }
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            ${type === 'success' ? 'background: #4CAF50; color: white;' : ''}
            ${type === 'error' ? 'background: #f44336; color: white;' : ''}
            ${type === 'info' ? 'background: #2196F3; color: white;' : ''}
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    async sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error:', chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || { success: true });
                }
            });
        });
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AutofillPopup();
});

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);