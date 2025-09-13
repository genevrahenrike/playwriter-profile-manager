/**
 * Content script for Smart Autofill Extension
 * Detects and fills form fields with intelligent matching
 */

class SmartAutofill {
    constructor() {
        this.dataGenerator = null;
        this.isEnabled = true;
        this.lastGeneratedData = null;
        this.fillDelay = 100; // ms delay between field fills
        
        this.init();
    }
    
    async init() {
        // Load the data generator
        await this.loadDataGenerator();
        
        // Listen for messages from popup/background
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
        });
        
        // Add keyboard shortcut listener
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+F to trigger autofill
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.fillCurrentForm();
            }
        });
        
        // Add visual indicator when extension is active
        this.addExtensionIndicator();
        
        console.log('Smart Autofill Extension loaded');
    }
    
    async loadDataGenerator() {
        try {
            // Inject the data generator script
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('data-generator.js');
            script.onload = () => {
                this.dataGenerator = new window.ExtensionDataGenerator();
                console.log('Data generator loaded');
            };
            document.head.appendChild(script);
        } catch (error) {
            console.error('Failed to load data generator:', error);
        }
    }
    
    handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'fillForm':
                this.fillCurrentForm();
                sendResponse({ success: true });
                break;
            case 'toggleEnabled':
                this.isEnabled = request.enabled;
                this.updateIndicator();
                sendResponse({ success: true });
                break;
            case 'getFormInfo':
                const formInfo = this.analyzeCurrentForms();
                sendResponse({ formInfo });
                break;
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }
    
    /**
     * Wildcard field matching patterns for email fields
     */
    getEmailFieldPatterns() {
        return [
            // Direct matches
            /^email$/i,
            /^e-mail$/i,
            /^emailaddress$/i,
            /^email_address$/i,
            /^user_email$/i,
            /^useremail$/i,
            
            // Partial matches
            /email/i,
            /e-mail/i,
            /mail/i,
            
            // Placeholder text patterns
            /enter.*email/i,
            /your.*email/i,
            /email.*address/i,
            
            // Common variations
            /login/i,
            /username/i,
            /user/i,
            /account/i
        ];
    }
    
    /**
     * Wildcard field matching patterns for password fields
     */
    getPasswordFieldPatterns() {
        return [
            // Direct matches
            /^password$/i,
            /^pass$/i,
            /^pwd$/i,
            /^passwd$/i,
            /^user_password$/i,
            /^userpassword$/i,
            
            // Partial matches
            /password/i,
            /pass/i,
            /pwd/i,
            
            // Placeholder text patterns
            /enter.*password/i,
            /your.*password/i,
            /create.*password/i,
            
            // Confirmation patterns
            /confirm/i,
            /repeat/i,
            /verify/i,
            /retype/i
        ];
    }
    
    /**
     * Check if a field matches email patterns
     */
    isEmailField(field) {
        if (field.type === 'email') return true;
        
        const patterns = this.getEmailFieldPatterns();
        const fieldName = field.name || '';
        const fieldId = field.id || '';
        const fieldPlaceholder = field.placeholder || '';
        const fieldClass = field.className || '';
        
        const textToCheck = `${fieldName} ${fieldId} ${fieldPlaceholder} ${fieldClass}`.toLowerCase();
        
        return patterns.some(pattern => pattern.test(textToCheck));
    }
    
    /**
     * Check if a field matches password patterns
     */
    isPasswordField(field) {
        if (field.type === 'password') return true;
        
        const patterns = this.getPasswordFieldPatterns();
        const fieldName = field.name || '';
        const fieldId = field.id || '';
        const fieldPlaceholder = field.placeholder || '';
        const fieldClass = field.className || '';
        
        const textToCheck = `${fieldName} ${fieldId} ${fieldPlaceholder} ${fieldClass}`.toLowerCase();
        
        return patterns.some(pattern => pattern.test(textToCheck));
    }
    
    /**
     * Check if a field is a password confirmation field
     */
    isPasswordConfirmField(field) {
        if (field.type !== 'password') return false;
        
        const confirmPatterns = [
            /confirm/i,
            /repeat/i,
            /verify/i,
            /retype/i,
            /again/i,
            /second/i
        ];
        
        const fieldName = field.name || '';
        const fieldId = field.id || '';
        const fieldPlaceholder = field.placeholder || '';
        const fieldClass = field.className || '';
        
        const textToCheck = `${fieldName} ${fieldId} ${fieldPlaceholder} ${fieldClass}`.toLowerCase();
        
        return confirmPatterns.some(pattern => pattern.test(textToCheck));
    }
    
    /**
     * Find all relevant form fields on the page
     */
    findFormFields() {
        const fields = {
            email: [],
            password: [],
            passwordConfirm: []
        };
        
        // Get all input fields
        const inputs = document.querySelectorAll('input');
        
        inputs.forEach(input => {
            if (this.isEmailField(input)) {
                fields.email.push(input);
            } else if (this.isPasswordConfirmField(input)) {
                fields.passwordConfirm.push(input);
            } else if (this.isPasswordField(input)) {
                fields.password.push(input);
            }
        });
        
        return fields;
    }
    
    /**
     * Fill a field with animation and proper events
     */
    async fillField(field, value) {
        if (!field || !value) return;
        
        // Focus the field
        field.focus();
        
        // Clear existing value
        field.value = '';
        
        // Trigger input events for better compatibility
        field.dispatchEvent(new Event('focus', { bubbles: true }));
        
        // Type the value character by character for more realistic filling
        for (let i = 0; i < value.length; i++) {
            field.value = value.substring(0, i + 1);
            field.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 20)); // Small delay between characters
        }
        
        // Trigger change and blur events
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Add visual feedback
        this.addFieldFeedback(field);
    }
    
    /**
     * Add visual feedback to filled fields
     */
    addFieldFeedback(field) {
        const originalBorder = field.style.border;
        field.style.border = '2px solid #4CAF50';
        field.style.transition = 'border 0.3s ease';
        
        setTimeout(() => {
            field.style.border = originalBorder;
        }, 1000);
    }
    
    /**
     * Fill the current form with generated data
     */
    async fillCurrentForm() {
        if (!this.isEnabled || !this.dataGenerator) {
            console.log('Autofill is disabled or data generator not loaded');
            return;
        }
        
        const fields = this.findFormFields();
        
        if (fields.email.length === 0 && fields.password.length === 0) {
            console.log('No relevant form fields found');
            this.showNotification('No email or password fields found on this page');
            return;
        }
        
        // Generate new data
        this.lastGeneratedData = this.dataGenerator.generateUserData();
        console.log('Generated data:', this.lastGeneratedData);
        
        // Fill email fields
        for (const emailField of fields.email) {
            await this.fillField(emailField, this.lastGeneratedData.email);
            await new Promise(resolve => setTimeout(resolve, this.fillDelay));
        }
        
        // Fill password fields
        for (const passwordField of fields.password) {
            await this.fillField(passwordField, this.lastGeneratedData.password);
            await new Promise(resolve => setTimeout(resolve, this.fillDelay));
        }
        
        // Fill password confirmation fields with the same password
        for (const confirmField of fields.passwordConfirm) {
            await this.fillField(confirmField, this.lastGeneratedData.password);
            await new Promise(resolve => setTimeout(resolve, this.fillDelay));
        }
        
        const filledCount = fields.email.length + fields.password.length + fields.passwordConfirm.length;
        this.showNotification(`Filled ${filledCount} fields with generated data`);
    }
    
    /**
     * Analyze current forms on the page
     */
    analyzeCurrentForms() {
        const fields = this.findFormFields();
        const forms = document.querySelectorAll('form');
        
        return {
            formsCount: forms.length,
            emailFields: fields.email.length,
            passwordFields: fields.password.length,
            passwordConfirmFields: fields.passwordConfirm.length,
            lastGeneratedData: this.lastGeneratedData
        };
    }
    
    /**
     * Add extension indicator to page
     */
    addExtensionIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'smart-autofill-indicator';
        indicator.innerHTML = '🤖';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 30px;
            height: 30px;
            background: #4CAF50;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            z-index: 10000;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        indicator.addEventListener('click', () => {
            this.fillCurrentForm();
        });
        
        indicator.title = 'Smart Autofill (Click to fill forms or use Ctrl+Shift+F)';
        
        document.body.appendChild(indicator);
        this.indicator = indicator;
    }
    
    /**
     * Update indicator based on enabled state
     */
    updateIndicator() {
        if (this.indicator) {
            this.indicator.style.background = this.isEnabled ? '#4CAF50' : '#f44336';
            this.indicator.style.opacity = this.isEnabled ? '1' : '0.5';
        }
    }
    
    /**
     * Show notification to user
     */
    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            background: #333;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10001;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        
        // Add CSS animation
        if (!document.getElementById('autofill-styles')) {
            const style = document.createElement('style');
            style.id = 'autofill-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize the autofill system when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SmartAutofill();
    });
} else {
    new SmartAutofill();
}