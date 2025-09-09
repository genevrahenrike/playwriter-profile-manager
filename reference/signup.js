const { chromium, chrome } = require('playwright');
const StealthUtils = require('./utils/stealth');
const Logger = require('./utils/logger');
const ProfileManager = require('./utils/profile-manager');
const CredentialsGenerator = require('./utils/credentials');
const NordVPNHelper = require('./utils/nordvpn-helper');
const config = require('./config');

class VidIQSignup {
  constructor() {
    this.logger = new Logger(config);
    this.profileManager = new ProfileManager(config, this.logger);
    this.browser = null;
    this.context = null;
    this.page = null;
    this.profilePath = null;
    this.credentials = null;
    this.nordVpnHelper = null;
  }

  async initialize() {
    this.logger.info('🚀 Initializing VidIQ Auto Signup...');
    
    try {
      // Generate unique credentials
      this.credentials = CredentialsGenerator.generateUniqueCredentials(config);
      this.logger.info(`📧 Generated email: ${this.credentials.email}`);
      this.logger.info(`🔒 Generated password: ${this.credentials.password.substring(0, 4)}****`);

      // Create clean profile with just VidIQ extension
      this.profilePath = await this.setupCleanProfileWithVidIQ();
      this.logger.info(`🧹 Using clean profile with VidIQ extension only: ${this.profilePath}`);

      // Get extension-enabled browser args for VidIQ
      const extensionArgs = this.getVidIQExtensionArgs(this.profilePath);
      
      // Launch browser with stealth settings and extensions
      const launchOptions = {
        headless: config.browser.headless,
        slowMo: config.browser.slowMo,
        args: extensionArgs
      };
      
      const viewport = config.stealth.randomViewport ? 
        StealthUtils.getRandomViewport() : 
        config.browser.viewport;

      const userAgent = config.stealth.randomUserAgent ? 
        StealthUtils.getRandomUserAgent() : 
        undefined;

      // Use Playwright's Chromium for webapp automation (focus on JWT token)
      this.context = await chromium.launchPersistentContext(this.profilePath, {
        ...launchOptions,
        viewport,
        userAgent,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation']
      });

      // Get the first page or create a new one
      this.page = this.context.pages()[0] || await this.context.newPage();

      // Initialize NordVPN helper
      this.nordVpnHelper = new NordVPNHelper(this.page, this.logger);

      // Setup stealth mode
      await StealthUtils.setupStealthMode(this.context, config);
      
      // Set timeout
      this.page.setDefaultTimeout(config.browser.timeout);

      // Setup network request monitoring for JWT token capture
      await this.setupNetworkMonitoring();

      // Skip VPN setup for clean profile test
      this.logger.info('🚫 Skipping VPN setup for clean profile test');

      this.logger.success('Browser initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize browser', error.message);
      await this.cleanup();
      throw error;
    }
  }

  async setupCleanProfileWithVidIQ() {
    this.logger.info('🧹 Setting up clean profile with VidIQ extension only...');
    
    const fs = require('fs');
    const path = require('path');
    const cleanProfilePath = config.browser.workingProfileDir;
    
    // Remove existing profile if it exists
    if (fs.existsSync(cleanProfilePath)) {
      this.logger.info('🗑️ Cleaning existing profile...');
      fs.rmSync(cleanProfilePath, { recursive: true, force: true });
    }
    
    // Create clean profile structure
    fs.mkdirSync(cleanProfilePath, { recursive: true });
    fs.mkdirSync(path.join(cleanProfilePath, 'Default'), { recursive: true });
    fs.mkdirSync(path.join(cleanProfilePath, 'Default', 'Extensions'), { recursive: true });
    
    // Copy ONLY the VidIQ extension (no auth data)
    const sourceVidIQPath = '/Users/markzhu/Documents/Chromium-profiles/default/Clean/Default/Extensions/nmmhkkegccagdldgiimedpiccmgmieda';
    const targetVidIQPath = path.join(cleanProfilePath, 'Default', 'Extensions', 'nmmhkkegccagdldgiimedpiccmgmieda');
    
    if (fs.existsSync(sourceVidIQPath)) {
      this.logger.info('📦 Copying VidIQ extension only (no auth data)...');
      await this.profileManager.copyDirectory(sourceVidIQPath, targetVidIQPath);
      this.logger.success('✅ VidIQ extension copied to clean profile');
    } else {
      this.logger.warn('⚠️ VidIQ extension not found in source profile');
    }
    
    // Create minimal preferences to enable extensions
    const preferences = {
      "extensions": {
        "settings": {
          "nmmhkkegccagdldgiimedpiccmgmieda": {
            "state": 1,
            "location": 1,
            "from_webstore": true
          }
        }
      }
    };
    
    fs.writeFileSync(
      path.join(cleanProfilePath, 'Default', 'Preferences'), 
      JSON.stringify(preferences, null, 2)
    );
    
    this.logger.success('✅ Clean profile with VidIQ extension ready');
    return cleanProfilePath;
  }

  getVidIQExtensionArgs(profilePath) {
    const path = require('path');
    const fs = require('fs');
    
    // Find VidIQ extension path
    const extensionPath = path.join(profilePath, 'Default', 'Extensions', 'nmmhkkegccagdldgiimedpiccmgmieda');
    
    let versionDir = null;
    if (fs.existsSync(extensionPath)) {
      const versions = fs.readdirSync(extensionPath).filter(dir => 
        fs.statSync(path.join(extensionPath, dir)).isDirectory()
      );
      if (versions.length > 0) {
        versionDir = path.join(extensionPath, versions[0]);
      }
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-client-side-phishing-detection',
      '--disable-hang-monitor',
      // Enable extensions
      '--enable-extensions',
      '--disable-extensions-file-access-check',
      '--disable-extensions-http-throttling',
      // Allow running in automation mode with extensions
      '--disable-blink-features=AutomationControlled',
      '--allow-running-insecure-content'
    ];

    // Add load-extension if we found the version directory
    if (versionDir && fs.existsSync(versionDir)) {
      args.push('--load-extension=' + versionDir);
      this.logger.info(`🔗 Loading VidIQ extension from: ${versionDir}`);
    } else {
      this.logger.warn('⚠️ VidIQ extension version directory not found');
    }

    return args;
  }

  async setupVPN() {
    this.logger.info('🛡️ Setting up NordVPN...');
    
    try {
      if (this.nordVpnHelper) {
        await this.nordVpnHelper.setupVPN();
      } else {
        this.logger.warn('⚠️ NordVPN helper not initialized');
      }
    } catch (error) {
      this.logger.warn('VPN setup failed:', error.message);
      this.logger.info('💡 Continuing without VPN - you can manually activate it if needed');
    }
  }

  async navigateToSignup() {
    this.logger.info('🌐 Navigating to signup page...');
    
    try {
      await this.page.goto(config.signupUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: config.browser.timeout 
      });

      this.logger.info('Page loaded, waiting for stability...');
      
      // Shorter wait for faster processing
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (networkIdleError) {
        this.logger.info('Network idle timeout, continuing...');
      }
      
      // Wait for the signup form to be present
      try {
        await this.page.waitForSelector('form', { timeout: 5000 });
        this.logger.info('Signup form detected');
      } catch (formError) {
        this.logger.warn('Form not immediately visible, taking screenshot...');
        await this.logger.takeScreenshot(this.page, 'form-detection');
      }

      await StealthUtils.randomDelay(500, 1000);

      this.logger.success('Successfully navigated to signup page');
      return true;
    } catch (error) {
      this.logger.error('Failed to navigate to signup page', error.message);
      await this.logger.takeScreenshot(this.page, 'navigation-error');
      throw error;
    }
  }

  async checkForCaptcha() {
    this.logger.info('🔍 Checking for captcha...');
    
    // Check for various captcha indicators
    const captchaSelectors = [
      // Google reCAPTCHA
      'iframe[src*="recaptcha"]',
      'iframe[title*="recaptcha"]',
      '.g-recaptcha',
      '#recaptcha',
      '[data-sitekey]',
      'div[data-callback]',
      // hCaptcha
      'iframe[src*="hcaptcha"]',
      '.h-captcha',
      '#hcaptcha',
      // Generic captcha elements
      '[class*="captcha"]',
      '[id*="captcha"]',
      // Bot detection messages
      'text="Please verify you are human"',
      'text="Bot detection"',
      'text="Security check"',
      'text="Captcha failed"',
      'text="I\'m not a robot"',
      '[data-testid="authentication-error"]',
      'p:has-text("Captcha failed")',
      'p:has-text("Please verify")',
      '.error:has-text("captcha")',
      '.error:has-text("bot")',
      '.error:has-text("security")',
      '.error:has-text("verify")'
    ];

    for (const selector of captchaSelectors) {
      try {
        if (await this.page.locator(selector).isVisible({ timeout: 1000 })) {
          this.logger.warn('🤖 Captcha or bot detection found!');
          this.logger.warn('⏸️ PAUSING FOR MANUAL INTERVENTION...');
          this.logger.warn('🔧 Please solve the captcha manually or check the page');
          
          // Take screenshot for debugging
          await this.logger.takeScreenshot(this.page, 'captcha-detected');
          
          // Get and log the raw HTML for manual inspection
          try {
            const pageContent = await this.page.content();
            this.logger.warn('📄 RAW HTML CONTENT:');
            console.log('='.repeat(80));
            console.log(pageContent);
            console.log('='.repeat(80));
          } catch (htmlError) {
            this.logger.warn('Could not capture HTML content:', htmlError.message);
          }
          
          // Longer pause for manual intervention
          this.logger.warn('⏳ Waiting 120 seconds for manual solution...');
          this.logger.warn('💡 You can now inspect the page and provide guidance');
          await StealthUtils.randomDelay(120000, 120000);
          
          return true;
        }
      } catch {
        // Continue checking other selectors
      }
    }
    
    this.logger.info('No captcha detected');
    return false;
  }

  async detectSignupForm() {
    this.logger.info('🔍 Detecting signup form...');
    
    // Quick check for email field first (most reliable)
    try {
      await this.page.waitForSelector('input[id="email"]', { timeout: 3000 });
      this.logger.success('✅ Email field found');
      return true;
    } catch {
      // Continue to other checks
    }

    // Check for any form
    try {
      await this.page.waitForSelector('form', { timeout: 2000 });
      this.logger.success('✅ Form found');
      return true;
    } catch {
      // Continue
    }

    this.logger.warn('⚠️ No signup form detected');
    return false;
  }

  async handleFormNotFound() {
    this.logger.error('❌ Signup form not found after reload');
    
    // Save raw HTML for debugging
    const rawHTML = await this.page.content();
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const htmlFile = `./debug-raw-html-${timestamp}.html`;
    fs.writeFileSync(htmlFile, rawHTML);
    this.logger.info(`📄 Raw HTML saved to: ${htmlFile}`);
    
    // Take screenshot
    await this.logger.takeScreenshot(this.page, 'no-form-found');
    
    // Log current URL and title for debugging
    this.logger.info(`📍 Current URL: ${this.page.url()}`);
    this.logger.info(`📝 Page title: ${await this.page.title()}`);
    
    throw new Error('Signup form not found - check debug files');
  }

  async clearValidationErrors() {
    this.logger.debug('Clearing any existing validation errors...');
    
    // Clear email field if it has validation errors
    const emailError = this.page.locator('#email-error');
    if (await emailError.isVisible()) {
      this.logger.debug('Found email validation error, clearing field');
      await this.page.locator('#email').clear();
    }
  }

  async checkValidationErrors() {
    this.logger.info('Checking for validation errors...');
    
    const emailError = this.page.locator('#email-error');
    if (await emailError.isVisible()) {
      const errorText = await emailError.textContent();
      this.logger.warn(`Email validation error: ${errorText}`);
      return true;
    }
    
    return false;
  }

  async handleFormType() {
    this.logger.info('🔍 Detecting form type...');
    
    // Check if password field is immediately visible AND clickable (classic form)
    const passwordSelector = 'input[id="password"]';
    const passwordVisible = await this.page.locator(passwordSelector).isVisible();
    
    // Also check if it's actually interactable (not hidden behind other elements)
    // AND check if the submit button indicates a two-step form
    let passwordClickable = false;
    let isTwoStepForm = false;
    
    if (passwordVisible) {
      try {
        // Test if we can actually click it without timeout
        await this.page.locator(passwordSelector).click({ timeout: 2000, trial: true });
        passwordClickable = true;
      } catch {
        // If trial click fails, it's not really clickable
        passwordClickable = false;
      }
    }
    
    // Check if submit button indicates two-step form
    try {
      const submitButton = this.page.locator('button[type="submit"]').first();
      const submitText = await submitButton.textContent({ timeout: 2000 });
      if (submitText && (submitText.includes('Continue with email') || submitText.includes('Continue'))) {
        isTwoStepForm = true;
        this.logger.info(`🔍 Submit button text: "${submitText}" - indicates two-step form`);
      }
    } catch {
      // Continue with other checks
    }
    
    if (passwordVisible && passwordClickable && !isTwoStepForm) {
      this.logger.info('📋 Classic form detected - password field visible and clickable');
      
      // Click password field first
      await this.page.locator(passwordSelector).click();
      await StealthUtils.randomDelay(300, 500);
      
      // Fill password directly
      await StealthUtils.humanLikeTyping(this.page, passwordSelector, this.credentials.password);
      await StealthUtils.randomDelay(500, 1000);
    } else {
      this.logger.info('📋 Two-step form detected - password field hidden or submit button indicates continue');
      
      // Look for "Continue with email" button to trigger password field
      const continueSelectors = [
        'button[type="submit"]:has-text("Continue with email")',
        'button:has-text("Continue with email")',
        'button[type="submit"]'
      ];
      
      let continueButton = null;
      for (const selector of continueSelectors) {
        try {
          const button = this.page.locator(selector);
          if (await button.isVisible()) {
            continueButton = button;
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (continueButton) {
        this.logger.info('Clicking continue button to reveal password field...');
        await continueButton.click();
        await StealthUtils.randomDelay(1000, 1500);
        
        // Wait for password field to appear
        try {
          await this.page.waitForSelector(passwordSelector, { timeout: 5000, state: 'visible' });
          this.logger.info('Password field appeared - filling password...');
          await StealthUtils.humanLikeTyping(this.page, passwordSelector, this.credentials.password);
          await StealthUtils.randomDelay(500, 800);
          
          // Now proceed to final submit
          this.logger.info('Password filled in two-step form - proceeding to final submit...');
        } catch (error) {
          this.logger.warn('Password field did not appear after clicking continue');
          await this.checkValidationErrors();
        }
      } else {
        this.logger.warn('Could not find continue button for two-step form');
      }
    }
  }

  async fillSignupForm() {
    this.logger.info('📝 Filling signup form...');
    
    try {
      // Fast form detection with multiple strategies
      const formFound = await this.detectSignupForm();
      if (!formFound) {
        // Try reload and different form detection
        this.logger.warn('⚠️ Form not found, trying reload to get normal version...');
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await StealthUtils.randomDelay(2000, 3000);
        
        const formFoundAfterReload = await this.detectSignupForm();
        if (!formFoundAfterReload) {
          await this.handleFormNotFound();
          return false;
        }
      }

      // Check if Google signup button exists (optional)
      const googleButton = this.page.locator('[data-testid="google-auth-button"]');
      if (await googleButton.isVisible()) {
        this.logger.info('Google signup button found (not using)');
      }

      // More human-like mouse movements
      await this.page.mouse.move(Math.random() * 200 + 50, Math.random() * 200 + 100);
      await StealthUtils.randomDelay(500, 1200);
      
      // Simulate reading the page
      await this.page.mouse.move(Math.random() * 400 + 200, Math.random() * 300 + 200);
      await StealthUtils.randomDelay(800, 1500);
      
      // Fill email field (always present)
      this.logger.info('Filling email field...');
      const emailSelector = 'input[id="email"]';
      await this.page.waitForSelector(emailSelector, { timeout: 5000 });
      
      // Move mouse to email field and click
      const emailField = this.page.locator(emailSelector);
      const emailBox = await emailField.boundingBox();
      if (emailBox) {
        await this.page.mouse.move(emailBox.x + emailBox.width/2, emailBox.y + emailBox.height/2);
        await StealthUtils.randomDelay(300, 600);
      }
      
      // Click field to focus
      await emailField.click();
      await StealthUtils.randomDelay(400, 800);
      
      await StealthUtils.humanLikeTyping(this.page, emailSelector, this.credentials.email);
      
      // Verify email was entered
      const emailValue = await this.page.locator(emailSelector).inputValue();
      this.logger.info(`✅ Email entered: ${emailValue}`);
      
      // Shorter pause
      await StealthUtils.randomDelay(300, 600);

      // Detect form type and handle accordingly
      await this.handleFormType();

      // Check for captcha/bot detection after form interaction
      const captchaDetected = await this.checkForCaptcha();
      if (captchaDetected) {
        throw new Error('Captcha or bot detection triggered after form interaction');
      }

      this.logger.success('Form filled successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to fill signup form', error.message);
      await this.logger.takeScreenshot(this.page, 'form-fill-error');
      throw error;
    }
  }

  async submitForm() {
    this.logger.info('🚀 Submitting signup form...');
    
    try {
      // Check for captcha before submitting
      const captchaResult = await this.checkForCaptcha();
      
      // Check if we have password field (single step) or not (two-step)
      const passwordExists = await this.page.locator('input[id="password"]').count() > 0;
      
      if (!passwordExists) {
        // Two-step flow: first submit email
        await this.submitEmailStep();
        // Then fill and submit password
        await this.fillPasswordStep();
      }
      
      // Final submit (either single step or second step of two-step flow)
      await this.finalSubmit();
      
    } catch (error) {
      this.logger.error('Failed to submit form', error.message);
      await this.logger.takeScreenshot(this.page, 'submit-error');
      throw error;
    }
  }

  async submitEmailStep() {
    this.logger.info('📧 Submitting email (step 1 of 2)...');
    
    const submitButton = this.page.locator('button[type="submit"]');
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    
    this.logger.info('Clicking "Continue with email" button...');
    await StealthUtils.randomDelay(500, 1000);
    await submitButton.click();
    
    // Wait for password field to appear
    this.logger.info('Waiting for password field to appear...');
    await this.page.waitForSelector('input[id="password"]', { timeout: 10000 });
    await StealthUtils.randomDelay(500, 1000);
  }

  async fillPasswordStep() {
    this.logger.info('🔒 Filling password (step 2 of 2)...');
    
    const passwordSelector = 'input[id="password"]';
    await StealthUtils.humanLikeTyping(this.page, passwordSelector, this.credentials.password);
    await StealthUtils.randomDelay(300, 500);
  }

  async finalSubmit() {
    this.logger.info('🎯 Final submit - creating account...');
    
    // Check for captcha again
    await this.checkForCaptcha();
    
    // Try different submit button selectors for different form types
    const submitSelectors = [
      'button[data-testid="signup-button"]', // Classic form: "Create your account"
      'button[type="submit"]:has-text("Create account")', // Final form: "Create account"
      'button[type="submit"]:has-text("Create your account")',
      'button[type="submit"]:has-text("Continue with email")', // Two-step form
      'button[type="submit"]' // Fallback
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      try {
        const button = this.page.locator(selector);
        if (await button.isVisible()) {
          submitButton = button;
          this.logger.info(`Found submit button: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!submitButton) {
      throw new Error('Could not find submit button');
    }
    
    // Check if button is enabled
    const isEnabled = await submitButton.isEnabled();
    if (!isEnabled) {
      this.logger.warn('Submit button is disabled, waiting a moment...');
      await StealthUtils.randomDelay(1000, 2000);
    }
    
    const buttonText = await submitButton.textContent();
    this.logger.info(`Clicking final "${buttonText}" button...`);
    
    // Check button state before clicking
    const buttonEnabled = await submitButton.isEnabled();
    const buttonVisible = await submitButton.isVisible();
    this.logger.debug(`Button state: enabled=${buttonEnabled}, visible=${buttonVisible}`);
    
    // Longer delay with human-like behavior before clicking to avoid reCAPTCHA
    this.logger.info('Adding human-like behavior before final submit...');
    
    // Simulate reading/reviewing the form
    await this.page.mouse.move(Math.random() * 300 + 100, Math.random() * 200 + 100);
    await StealthUtils.randomDelay(2000, 3000);
    
    // Move around the page like a human would
    await this.page.mouse.move(Math.random() * 400 + 200, Math.random() * 300 + 150);
    await StealthUtils.randomDelay(1500, 2500);
    
    // Finally move to button area
    const buttonBox = await submitButton.boundingBox();
    if (buttonBox) {
      // Move to button with some randomness
      const targetX = buttonBox.x + buttonBox.width/2 + (Math.random() - 0.5) * 20;
      const targetY = buttonBox.y + buttonBox.height/2 + (Math.random() - 0.5) * 10;
      await this.page.mouse.move(targetX, targetY);
      await StealthUtils.randomDelay(800, 1200);
    }
    
    // Additional delay before clicking
    await StealthUtils.randomDelay(1000, 2000);
    
    // Try multiple submission approaches
    let submitSuccess = false;
    
    // Method 1: Regular click
    try {
      await submitButton.click();
      this.logger.info('Method 1: Regular click attempted');
      await StealthUtils.randomDelay(1000, 2000);
      
      // Immediately check for reCAPTCHA after clicking
      const captchaAfterSubmit = await this.checkForCaptcha();
      if (captchaAfterSubmit) {
        this.logger.warn('🤖 reCAPTCHA appeared after form submission - manual intervention needed');
        return; // Exit and let manual intervention handle it
      }
      
      // Check if URL changed immediately
      const urlAfterClick = this.page.url();
      if (urlAfterClick !== config.signupUrl && !urlAfterClick.includes('/signup')) {
        this.logger.success('✅ Form submitted successfully - URL changed');
        submitSuccess = true;
      }
    } catch (error) {
      this.logger.warn('Method 1 failed:', error.message);
    }
    
    // Method 2: Force click if regular click didn't work
    if (!submitSuccess) {
      try {
        await submitButton.click({ force: true });
        this.logger.info('Method 2: Force click attempted');
        await StealthUtils.randomDelay(1000, 2000);
        
        const urlAfterForceClick = this.page.url();
        if (urlAfterForceClick !== config.signupUrl && !urlAfterForceClick.includes('/signup')) {
          this.logger.success('✅ Form submitted successfully with force click');
          submitSuccess = true;
        }
      } catch (error) {
        this.logger.warn('Method 2 failed:', error.message);
      }
    }
    
    // Method 3: Try form submission via JavaScript
    if (!submitSuccess) {
      try {
        this.logger.info('Method 3: Attempting JavaScript form submission');
        await this.page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });
        await StealthUtils.randomDelay(1000, 2000);
        
        const urlAfterJS = this.page.url();
        if (urlAfterJS !== config.signupUrl && !urlAfterJS.includes('/signup')) {
          this.logger.success('✅ Form submitted successfully via JavaScript');
          submitSuccess = true;
        }
      } catch (error) {
        this.logger.warn('Method 3 failed:', error.message);
      }
    }
    
    // Method 4: Try pressing Enter on the submit button
    if (!submitSuccess) {
      try {
        this.logger.info('Method 4: Attempting Enter key press');
        await submitButton.focus();
        await this.page.keyboard.press('Enter');
        await StealthUtils.randomDelay(1000, 2000);
        
        const urlAfterEnter = this.page.url();
        if (urlAfterEnter !== config.signupUrl && !urlAfterEnter.includes('/signup')) {
          this.logger.success('✅ Form submitted successfully with Enter key');
          submitSuccess = true;
        }
      } catch (error) {
        this.logger.warn('Method 4 failed:', error.message);
      }
    }
    
    if (submitSuccess) {
      this.logger.success('✅ Submit successful!');
    } else {
      this.logger.warn('⚠️ All submission methods attempted, checking for validation errors...');
      
      // Check for validation errors or disabled state
      const formErrors = await this.page.locator('[aria-invalid="true"], .error, [class*="error"]').count();
      if (formErrors > 0) {
        this.logger.warn(`Found ${formErrors} potential form validation errors`);
      }
      
      // Check if button is now disabled
      const buttonDisabled = !(await submitButton.isEnabled());
      if (buttonDisabled) {
        this.logger.warn('Submit button is now disabled');
      }
    }
    
    this.logger.info('Waiting for response...');
    
      // Wait for either success or error with better logging
      this.logger.info('⏳ Waiting for signup response...');
      
      try {
        await Promise.race([
          this.waitForSuccess(),
          this.waitForError(),
          new Promise((_, reject) => 
            setTimeout(() => {
              this.logger.error('❌ 10 second timeout reached waiting for signup response');
              reject(new Error('Submission timeout - no success or error detected'));
            }, 10000)
          )
        ]);
      } catch (error) {
        // Log current state for debugging
        this.logger.error('❌ Error during signup wait:', error.message);
        this.logger.info(`📍 Current URL: ${this.page.url()}`);
        this.logger.info(`📝 Page title: ${await this.page.title()}`);
        await this.logger.takeScreenshot(this.page, 'signup-timeout');
        throw error;
      }
  }

  async waitForSuccess() {
    this.logger.info('🔍 Checking for success indicators...');
    
    // Wait for successful signup indicators
    const successSelectors = [
      '[data-testid*="success"]',
      '.success', 
      'text=Welcome',
      'text=Account created',
      'text=Check your email',
      'text=Verify your email'
    ];

    // First, wait a moment for any immediate response
    await StealthUtils.randomDelay(2000, 3000);

    // Check for success messages
    for (const selector of successSelectors) {
      try {
        this.logger.debug(`Looking for success selector: ${selector}`);
        await this.page.waitForSelector(selector, { timeout: 3000 });
        this.logger.success('🎉 Signup success message found!');
        await this.logger.takeScreenshot(this.page, 'success');
        await this.extractJWTToken();
        await this.navigateToKeywords();
        return true;
      } catch {
        // Continue to next selector
      }
    }

    // Check for URL changes (redirect to dashboard/welcome page) - quick checks
    let urlCheckCount = 0;
    const maxUrlChecks = 3; // Only check 3 times
    
    while (urlCheckCount < maxUrlChecks) {
      await StealthUtils.randomDelay(1000, 1500); // Shorter delays
      const currentUrl = this.page.url();
      
      this.logger.debug(`URL check ${urlCheckCount + 1}: ${currentUrl}`);
      
      if (currentUrl !== config.signupUrl && !currentUrl.includes('/signup') && !currentUrl.includes('/auth/signup')) {
        this.logger.success('🎉 Signup successful - redirected to: ' + currentUrl);
        await this.logger.takeScreenshot(this.page, 'success-redirect');
        await this.extractJWTToken();
        await this.navigateToKeywords();
        return true;
      }
      
      urlCheckCount++;
    }

    this.logger.warn('⚠️ No clear success indicators found');
    return false;
  }

  async extractJWTToken() {
    this.logger.info('🔑 Attempting to extract JWT token...');
    
    try {
      // Method 1: Check localStorage for JWT token
      const localStorageToken = await this.page.evaluate(() => {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (value && (value.includes('eyJ') || key.toLowerCase().includes('token') || key.toLowerCase().includes('jwt'))) {
            return { key, value };
          }
        }
        return null;
      });

      if (localStorageToken) {
        this.logger.success(`🎯 JWT Token found in localStorage[${localStorageToken.key}]:`);
        this.logger.info(localStorageToken.value);
        
        // Save token to file
        const fs = require('fs');
        const tokenData = {
          timestamp: new Date().toISOString(),
          email: this.credentials.email,
          password: this.credentials.password,
          source: 'localStorage',
          key: localStorageToken.key,
          token: localStorageToken.value
        };
        fs.writeFileSync('./jwt_token.json', JSON.stringify(tokenData, null, 2));
        this.logger.success('💾 JWT token saved to jwt_token.json');
        this.logger.success('🎉 Signup completed! Now capturing VidIQ extension tokens...');
        
        // Navigate to YouTube to capture VidIQ extension API calls
        await this.captureVidIQExtensionTokens();
        return;
      }

      // Method 2: Check sessionStorage
      const sessionStorageToken = await this.page.evaluate(() => {
        const keys = Object.keys(sessionStorage);
        for (const key of keys) {
          const value = sessionStorage.getItem(key);
          if (value && (value.includes('eyJ') || key.toLowerCase().includes('token') || key.toLowerCase().includes('jwt'))) {
            return { key, value };
          }
        }
        return null;
      });

      if (sessionStorageToken) {
        this.logger.success(`🎯 JWT Token found in sessionStorage[${sessionStorageToken.key}]:`);
        this.logger.info(sessionStorageToken.value);
        
        // Save token to file
        const fs = require('fs');
        const tokenData = {
          timestamp: new Date().toISOString(),
          email: this.credentials.email,
          password: this.credentials.password,
          source: 'sessionStorage',
          key: sessionStorageToken.key,
          token: sessionStorageToken.value
        };
        fs.writeFileSync('./jwt_token.json', JSON.stringify(tokenData, null, 2));
        this.logger.success('💾 JWT token saved to jwt_token.json');
        this.logger.success('🎉 Signup completed successfully! Closing browser...');
        
        // Immediately cleanup and exit
        setTimeout(async () => {
          await this.cleanup();
          process.exit(0);
        }, 1000);
        return;
      }

      // Method 3: Check cookies for JWT
      const cookies = await this.context.cookies();
      const jwtCookie = cookies.find(cookie => 
        cookie.name.toLowerCase().includes('token') || 
        cookie.name.toLowerCase().includes('jwt') ||
        cookie.name.toLowerCase().includes('auth') ||
        (cookie.value && cookie.value.startsWith('eyJ'))
      );

      if (jwtCookie) {
        this.logger.success(`🎯 JWT Token found in cookie[${jwtCookie.name}]:`);
        this.logger.info(jwtCookie.value);
        
        // Save token to file
        const fs = require('fs');
        const tokenData = {
          timestamp: new Date().toISOString(),
          email: this.credentials.email,
          password: this.credentials.password,
          source: 'cookie',
          key: jwtCookie.name,
          token: jwtCookie.value
        };
        fs.writeFileSync('./jwt_token.json', JSON.stringify(tokenData, null, 2));
        this.logger.success('💾 JWT token saved to jwt_token.json');
        return;
      }

      // Method 4: Check network requests for JWT tokens
      this.logger.info('🔍 Monitoring network requests for JWT tokens...');
      
      // Wait a bit for any async requests
      await StealthUtils.randomDelay(3000, 5000);
      
      this.logger.warn('⚠️ No JWT token found in localStorage, sessionStorage, or cookies');
      this.logger.info('💡 Token might be in network requests or require manual extraction');

    } catch (error) {
      this.logger.error('Failed to extract JWT token:', error.message);
    }
  }

  async setupNetworkMonitoring() {
    this.logger.info('🔍 Setting up network monitoring for JWT token capture...');
    
    this.capturedTokens = [];
    
    // Monitor all network requests
    this.page.on('request', request => {
      const url = request.url();
      const headers = request.headers();
      
      // Look for API requests to vidIQ
      if (url.includes('api.vidiq.com') || url.includes('vidiq.com/api')) {
        this.logger.debug(`🌐 API Request: ${request.method()} ${url}`);
        
        // Check for Authorization header
        if (headers.authorization) {
          const authHeader = headers.authorization;
          if (authHeader.includes('Bearer') || authHeader.includes('JWT') || authHeader.startsWith('eyJ')) {
            this.logger.success(`🔑 JWT Token found in request to ${url}:`);
            this.logger.info(`Authorization: ${authHeader}`);
            
            // Capture complete header context for API replay
            const capturedData = {
              timestamp: new Date().toISOString(),
              url: url,
              method: request.method(),
              token: authHeader,
              source: 'request_header',
              // Capture all headers for exact replay
              headers: {
                'user-agent': headers['user-agent'] || '',
                'accept': headers['accept'] || '',
                'accept-language': headers['accept-language'] || '',
                'accept-encoding': headers['accept-encoding'] || '',
                'referer': headers['referer'] || '',
                'origin': headers['origin'] || '',
                'content-type': headers['content-type'] || '',
                'sec-ch-ua': headers['sec-ch-ua'] || '',
                'sec-ch-ua-mobile': headers['sec-ch-ua-mobile'] || '',
                'sec-ch-ua-platform': headers['sec-ch-ua-platform'] || '',
                'sec-fetch-dest': headers['sec-fetch-dest'] || '',
                'sec-fetch-mode': headers['sec-fetch-mode'] || '',
                'sec-fetch-site': headers['sec-fetch-site'] || '',
                'x-timezone': headers['x-timezone'] || '',
                'x-vidiq-auth': headers['x-vidiq-auth'] || '',
                'x-vidiq-client': headers['x-vidiq-client'] || '',
                'x-vidiq-device-id': headers['x-vidiq-device-id'] || '',
                // Include any custom headers that might be present
                ...Object.fromEntries(
                  Object.entries(headers).filter(([key]) => 
                    key.startsWith('x-') && !key.startsWith('x-vidiq')
                  )
                )
              },
              // Store the raw headers object for debugging
              rawHeaders: headers
            };
            
            this.capturedTokens.push(capturedData);
            
            // Log key headers for debugging
            this.logger.debug(`📋 User-Agent: ${headers['user-agent'] || 'Not set'}`);
            this.logger.debug(`🌍 Origin: ${headers['origin'] || 'Not set'}`);
            this.logger.debug(`🔗 Referer: ${headers['referer'] || 'Not set'}`);
          }
        }
        
        // Check for tokens in request body
        try {
          const postData = request.postData();
          if (postData && (postData.includes('token') || postData.includes('jwt') || postData.includes('eyJ'))) {
            this.logger.success(`🔑 Potential JWT Token found in request body to ${url}:`);
            this.logger.info(`Body: ${postData.substring(0, 200)}...`);
          }
        } catch (error) {
          // Ignore errors reading post data
        }
      }
    });

    // Monitor responses for tokens
    this.page.on('response', async response => {
      const url = response.url();
      
      if (url.includes('api.vidiq.com') || url.includes('vidiq.com/api')) {
        try {
          const responseBody = await response.text();
          
          // Look for JWT tokens in response body
          if (responseBody && (responseBody.includes('eyJ') || responseBody.includes('token') || responseBody.includes('jwt'))) {
            this.logger.success(`🔑 JWT Token found in response from ${url}:`);
            
            // Try to parse as JSON to extract tokens cleanly
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (jsonResponse.access_token || jsonResponse.token || jsonResponse.jwt) {
                const token = jsonResponse.access_token || jsonResponse.token || jsonResponse.jwt;
                this.logger.info(`Token: ${token}`);
                
                const requestHeaders = response.request().headers();
                this.capturedTokens.push({
                  timestamp: new Date().toISOString(),
                  url: url,
                  method: response.request().method(),
                  token: token,
                  source: 'response_body',
                  // Capture request headers that were used for this response
                  headers: {
                    'user-agent': requestHeaders['user-agent'] || '',
                    'accept': requestHeaders['accept'] || '',
                    'accept-language': requestHeaders['accept-language'] || '',
                    'accept-encoding': requestHeaders['accept-encoding'] || '',
                    'referer': requestHeaders['referer'] || '',
                    'origin': requestHeaders['origin'] || '',
                    'content-type': requestHeaders['content-type'] || '',
                    'sec-ch-ua': requestHeaders['sec-ch-ua'] || '',
                    'sec-ch-ua-mobile': requestHeaders['sec-ch-ua-mobile'] || '',
                    'sec-ch-ua-platform': requestHeaders['sec-ch-ua-platform'] || '',
                    'sec-fetch-dest': requestHeaders['sec-fetch-dest'] || '',
                    'sec-fetch-mode': requestHeaders['sec-fetch-mode'] || '',
                    'sec-fetch-site': requestHeaders['sec-fetch-site'] || '',
                    'x-timezone': requestHeaders['x-timezone'] || '',
                    'x-vidiq-auth': requestHeaders['x-vidiq-auth'] || '',
                    'x-vidiq-client': requestHeaders['x-vidiq-client'] || '',
                    'x-vidiq-device-id': requestHeaders['x-vidiq-device-id'] || '',
                    // Include any custom headers
                    ...Object.fromEntries(
                      Object.entries(requestHeaders).filter(([key]) => 
                        key.startsWith('x-') && !key.startsWith('x-vidiq')
                      )
                    )
                  },
                  rawHeaders: requestHeaders
                });
              }
            } catch (parseError) {
              // If not JSON, just log the relevant part
              const tokenMatch = responseBody.match(/(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
              if (tokenMatch) {
                this.logger.info(`Token: ${tokenMatch[1]}`);
                
                const requestHeaders = response.request().headers();
                this.capturedTokens.push({
                  timestamp: new Date().toISOString(),
                  url: url,
                  method: response.request().method(),
                  token: tokenMatch[1],
                  source: 'response_body',
                  // Capture request headers that were used for this response
                  headers: {
                    'user-agent': requestHeaders['user-agent'] || '',
                    'accept': requestHeaders['accept'] || '',
                    'accept-language': requestHeaders['accept-language'] || '',
                    'accept-encoding': requestHeaders['accept-encoding'] || '',
                    'referer': requestHeaders['referer'] || '',
                    'origin': requestHeaders['origin'] || '',
                    'content-type': requestHeaders['content-type'] || '',
                    'sec-ch-ua': requestHeaders['sec-ch-ua'] || '',
                    'sec-ch-ua-mobile': requestHeaders['sec-ch-ua-mobile'] || '',
                    'sec-ch-ua-platform': requestHeaders['sec-ch-ua-platform'] || '',
                    'sec-fetch-dest': requestHeaders['sec-fetch-dest'] || '',
                    'sec-fetch-mode': requestHeaders['sec-fetch-mode'] || '',
                    'sec-fetch-site': requestHeaders['sec-fetch-site'] || '',
                    'x-timezone': requestHeaders['x-timezone'] || '',
                    'x-vidiq-auth': requestHeaders['x-vidiq-auth'] || '',
                    'x-vidiq-client': requestHeaders['x-vidiq-client'] || '',
                    'x-vidiq-device-id': requestHeaders['x-vidiq-device-id'] || '',
                    // Include any custom headers
                    ...Object.fromEntries(
                      Object.entries(requestHeaders).filter(([key]) => 
                        key.startsWith('x-') && !key.startsWith('x-vidiq')
                      )
                    )
                  },
                  rawHeaders: requestHeaders
                });
              }
            }
          }
        } catch (error) {
          // Ignore errors reading response body
        }
      }
    });
  }

  async navigateToKeywords() {
    this.logger.info('🔍 Navigating to keywords page...');
    
    try {
      const keywordsUrl = 'https://app.vidiq.com/keywords';
      await this.page.goto(keywordsUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: config.browser.timeout 
      });

      this.logger.info('⏳ Waiting for keywords page to load...');
      await this.page.waitForLoadState('networkidle', { timeout: 15000 });
      
      // Wait for the page content to be ready and API calls to be made
      await StealthUtils.randomDelay(5000, 8000);
      
      const currentUrl = this.page.url();
      this.logger.success(`✅ Successfully navigated to keywords page: ${currentUrl}`);
      
      // Take a screenshot of the keywords page
      await this.logger.takeScreenshot(this.page, 'keywords-page');
      
      // Check if we can access the keywords functionality
      const pageTitle = await this.page.title();
      this.logger.info(`📄 Keywords page title: ${pageTitle}`);
      
      // Try to trigger some API calls by interacting with the page
      await this.triggerKeywordAPIRequests();
      
      // Look for keyword-related elements to confirm we're on the right page
      const keywordElements = await this.page.locator('input[placeholder*="keyword"], input[placeholder*="search"], [data-testid*="keyword"]').count();
      if (keywordElements > 0) {
        this.logger.success('🎯 Keywords page loaded successfully - search elements found!');
      } else {
        this.logger.warn('⚠️ Keywords page loaded but search elements not immediately visible');
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to navigate to keywords page:', error.message);
      await this.logger.takeScreenshot(this.page, 'keywords-navigation-error');
      return false;
    }
  }

  async triggerKeywordAPIRequests() {
    this.logger.info('🚀 Attempting to trigger keyword API requests...');
    
    try {
      // Wait for any initial API calls to complete
      await StealthUtils.randomDelay(2000, 3000);
      
      // Try to find and interact with keyword search elements
      const searchInputs = await this.page.locator('input[type="search"], input[placeholder*="keyword"], input[placeholder*="search"]').all();
      
      if (searchInputs.length > 0) {
        this.logger.info('🔍 Found search input, attempting to trigger API call...');
        const searchInput = searchInputs[0];
        
        // Click and type in search to trigger API calls
        await searchInput.click();
        await StealthUtils.randomDelay(500, 1000);
        await searchInput.type('youtube marketing');
        await StealthUtils.randomDelay(2000, 3000);
        
        // Press Enter to trigger search
        await searchInput.press('Enter');
        await StealthUtils.randomDelay(3000, 5000);
      }
      
      // Check if we captured any tokens during this process
      if (this.capturedTokens.length > 0) {
        this.logger.success(`🎯 Captured ${this.capturedTokens.length} JWT tokens from API requests!`);
        this.saveNetworkTokens();
      } else {
        this.logger.warn('⚠️ No JWT tokens captured from network requests yet');
      }
      
    } catch (error) {
      this.logger.warn('Could not trigger keyword API requests:', error.message);
    }
  }

  async saveNetworkTokens() {
    if (this.capturedTokens.length === 0) return;
    
    const fs = require('fs');
    const networkTokenData = {
      timestamp: new Date().toISOString(),
      email: this.credentials.email,
      password: this.credentials.password,
      capturedTokens: this.capturedTokens
    };
    
    fs.writeFileSync('./network_jwt_tokens.json', JSON.stringify(networkTokenData, null, 2));
    this.logger.success('💾 Network JWT tokens saved to network_jwt_tokens.json');
  }

  async captureVidIQExtensionTokens() {
    this.logger.info('🎬 Navigating to YouTube to capture VidIQ extension tokens...');
    
    try {
      // Set up VidIQ-specific network monitoring
      this.vidiqTokens = [];
      
      // Monitor requests to VidIQ API endpoints
      this.page.on('request', request => {
        const url = request.url();
        const headers = request.headers();
        
        if (url.includes('api.vidiq.com') || url.includes('vidiq.com/api')) {
          this.logger.info(`🔗 VidIQ API request: ${request.method()} ${url}`);
          
          // Capture all headers for VidIQ requests
          const capturedRequest = {
            timestamp: new Date().toISOString(),
            url: url,
            method: request.method(),
            headers: headers,
            // Look for auth tokens in headers
            authHeaders: {
              authorization: headers.authorization || '',
              'x-api-key': headers['x-api-key'] || '',
              'x-auth-token': headers['x-auth-token'] || '',
              'x-vidiq-token': headers['x-vidiq-token'] || '',
              cookie: headers.cookie || ''
            }
          };
          
          this.vidiqTokens.push(capturedRequest);
          this.logger.debug(`📋 Captured VidIQ request headers`);
        }
      });

      // Navigate to YouTube
      await this.page.goto('https://www.youtube.com/', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      this.logger.info('⏳ Waiting for VidIQ extension to make API calls...');
      
      // Wait for VidIQ extension to load and make API calls
      await StealthUtils.randomDelay(5000, 8000);
      
      // Try to trigger more VidIQ activity by searching
      try {
        const searchInput = this.page.locator('input[name="search_query"]');
        if (await searchInput.isVisible({ timeout: 5000 })) {
          await searchInput.click();
          await searchInput.type('youtube marketing');
          await this.page.keyboard.press('Enter');
          
          // Wait for search results and VidIQ to analyze them
          await StealthUtils.randomDelay(5000, 7000);
        }
      } catch (error) {
        this.logger.debug('Could not perform search to trigger VidIQ');
      }

      // Save captured VidIQ tokens
      if (this.vidiqTokens.length > 0) {
        const fs = require('fs');
        const vidiqTokenData = {
          timestamp: new Date().toISOString(),
          email: this.credentials.email,
          password: this.credentials.password,
          capturedRequests: this.vidiqTokens
        };
        
        fs.writeFileSync('./vidiq_extension_tokens.json', JSON.stringify(vidiqTokenData, null, 2));
        this.logger.success(`🎯 Captured ${this.vidiqTokens.length} VidIQ API requests and saved to vidiq_extension_tokens.json`);
      } else {
        this.logger.warn('⚠️ No VidIQ API requests captured - extension may not be installed or active');
      }

      // Clean up and exit
      this.logger.success('✅ VidIQ token capture completed! Closing browser...');
      setTimeout(async () => {
        await this.cleanup();
        process.exit(0);
      }, 2000);

    } catch (error) {
      this.logger.error('❌ Failed to capture VidIQ tokens:', error.message);
      // Still exit gracefully
      setTimeout(async () => {
        await this.cleanup();
        process.exit(0);
      }, 1000);
    }
  }

  async waitForError() {
    this.logger.info('🔍 Checking for error indicators...');
    
    // Wait for error indicators
    const errorSelectors = [
      '.error',
      '[role="alert"]', 
      '.chakra-alert',
      'text=Error',
      'text=already exists',
      'text=Invalid',
      'text=required',
      'text=failed',
      '[data-testid*="error"]',
      '.text-red',
      '.text-danger'
    ];

    // Check for errors with shorter timeouts to not block success detection
    for (const selector of errorSelectors) {
      try {
        this.logger.debug(`Looking for error selector: ${selector}`);
        const element = await this.page.waitForSelector(selector, { timeout: 2000 });
        const errorText = await element.textContent();
        this.logger.error('❌ Signup error detected: ' + errorText);
        await this.logger.takeScreenshot(this.page, 'signup-error');
        throw new Error('Signup failed: ' + errorText);
      } catch (error) {
        if (error.message.includes('Signup failed:')) {
          throw error;
        }
        // Continue to next selector if it's just a timeout
      }
    }

    // Also check if we're still on signup page after a while (might indicate an error)
    await StealthUtils.randomDelay(2000, 3000);
    const currentUrl = this.page.url();
    if (currentUrl === config.signupUrl || currentUrl.includes('/signup')) {
      this.logger.warn('⚠️ Still on signup page - checking for validation errors');
      
      // Look for form validation errors
      const validationErrors = await this.page.locator('[aria-invalid="true"], .invalid, [class*="error"]').count();
      if (validationErrors > 0) {
        const errorElements = await this.page.locator('[aria-invalid="true"], .invalid, [class*="error"]').all();
        for (const element of errorElements) {
          const errorText = await element.textContent();
          if (errorText && errorText.trim()) {
            this.logger.error('❌ Form validation error: ' + errorText.trim());
          }
        }
        await this.logger.takeScreenshot(this.page, 'validation-errors');
        throw new Error('Form validation errors detected');
      }
    }

    return false;
  }

  async run() {
    try {
      this.logger.info('🎯 Starting VidIQ automated signup process...');
      
      await this.initialize();
      await this.navigateToSignup();
      await this.fillSignupForm();
      await this.submitForm();
      
      this.logger.success('✅ Signup process completed successfully!');
      
      // Save the profile with the account name
      if (this.credentials && this.profilePath) {
        const savedProfilePath = await this.profileManager.saveProfileState(this.profilePath, this.credentials);
        if (savedProfilePath) {
          this.logger.success(`💾 Profile saved with NordVPN authentication: ${savedProfilePath}`);
        }
      }
      
      // Brief pause to ensure everything is saved
      await StealthUtils.randomDelay(1000, 1000);
      
    } catch (error) {
      this.logger.error('❌ Signup process failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    this.logger.info('🧹 Cleaning up resources...');
    
    try {
      if (this.context && config.debug.saveCookies) {
        const cookies = await this.context.cookies();
        const fs = require('fs');
        const path = require('path');
        const cookiesPath = path.join(__dirname, 'cookies.json');
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        this.logger.info('Cookies saved to cookies.json');
      }
      
      // Save generated credentials
      if (this.credentials) {
        CredentialsGenerator.saveCredentials(this.credentials);
      }
      
      // Save any captured network tokens
      if (this.capturedTokens && this.capturedTokens.length > 0) {
        this.saveNetworkTokens();
      }
      
      // Close the persistent context (profile automatically saved)
      if (this.context) {
        await this.context.close();
        this.logger.info('✅ Profile updated and context closed - all extensions remain authenticated!');
      }
    } catch (error) {
      this.logger.error('Error during cleanup:', error.message);
    }
  }
}

// Run the signup process if this file is executed directly
if (require.main === module) {
  const signup = new VidIQSignup();
  signup.run().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = VidIQSignup;
