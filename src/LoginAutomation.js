import chalk from 'chalk';

/**
 * LoginAutomation - performs guarded VidIQ autologin flows using selectors derived by LoginAnalyzer.
 * Design:
 * - Supports email_first and email_password_same_page flows
 * - Human-like delays, stability checks, and anti-race safeguards
 * - Does NOT embed site logic; relies on provided analysis (from LoginAnalyzer.detect)
 * - Observes request capture via provided getCaptured(sessionId) to confirm success
 */
export default class LoginAutomation {
  /**
   * Perform the autologin flow on the given page.
   * @param {import('playwright').Page} page
   * @param {{ email: string, password: string }} creds
   * @param {{
   *   analysis: { loginRequired: boolean, flow: string, url: string, selectors: { email?: string, password?: string, continue?: string, submit?: string } },
   *   getCaptured: (sessionId: string) => Array<any>,
   *   sessionId: string,
   *   timeoutMs?: number,
   *   captchaGraceMs?: number
   * }} ctx
   * @returns {Promise<{ attempted: boolean, success: boolean, reason?: string }>}
   */
  static async performAutologin(page, creds, ctx) {
    const attempted = true;
    const timeoutMs = Math.max(15000, Math.min(1200000, ctx.timeoutMs || 120000));
    const captchaGraceMs = Math.max(0, Math.min(600000, ctx.captchaGraceMs || 45000));

    if (!creds || !creds.email || !creds.password) {
      return { attempted, success: false, reason: 'missing_credentials' };
    }
    const a = ctx.analysis || { flow: 'unknown', selectors: {} };

    try {
      await this.#humanPause(450, 900);

      // Handle email-first vs same-page
      if (a.flow === 'email_first') {
        // Fill email
        if (a.selectors.email) {
          await this.#focusAndType(page, a.selectors.email, creds.email, { clear: true });
          await this.#ensureStableValue(page, a.selectors.email, creds.email);
        }
        // Click continue to reveal password
        const continueSel = a.selectors.continue || this.#fallbackContinueSelector();
        if (continueSel) {
          await this.#clickCenter(page, continueSel);
          await this.#humanPause(700, 1400);
        }
        // Refresh analysis for password field visibility
        const re = await this.#reDetect(page);
        if (re.selectors.password) {
          await this.#focusAndType(page, re.selectors.password, creds.password, { clear: true, mask: true });
          await this.#ensureStableValue(page, re.selectors.password, creds.password);
        } else {
          return { attempted, success: false, reason: 'password_not_visible_after_continue' };
        }
        // Submit
        const submitSel = re.selectors.submit || continueSel || this.#fallbackSubmitSelector();
        if (submitSel) {
          await this.#humanPause(350, 900);
          await this.#clickCenter(page, submitSel);
        } else {
          // Fallback: press Enter in password field
          await page.keyboard.press('Enter').catch(() => {});
        }
      } else {
        // Same-page (email+password visible) or unknown fallback
        if (a.selectors.email) {
          await this.#focusAndType(page, a.selectors.email, creds.email, { clear: true });
          await this.#ensureStableValue(page, a.selectors.email, creds.email);
        }
        if (a.selectors.password) {
          await this.#focusAndType(page, a.selectors.password, creds.password, { clear: true, mask: true });
          await this.#ensureStableValue(page, a.selectors.password, creds.password);
        }
        const submitSel = a.selectors.submit || a.selectors.continue || this.#fallbackSubmitSelector();
        if (submitSel) {
          await this.#humanPause(300, 800);
          await this.#clickCenter(page, submitSel);
        } else {
          await page.keyboard.press('Enter').catch(() => {});
        }
      }

      // Post-submit wait for signals or dashboard API activity
      const started = Date.now();
      while (true) {
        const cap = (typeof ctx.getCaptured === 'function') ? (ctx.getCaptured(ctx.sessionId) || []) : [];
        const evalResult = this.#analyzeCaptured(cap);
        if (evalResult.success) {
          console.log(chalk.green(`✅ Autologin signals: ${evalResult.reason || 'ok'}`));
          return { attempted, success: true, reason: evalResult.reason || 'ok' };
        }
        // Detect captcha signals in DOM (heuristic)
        let captchaLikely = false;
        try {
          const rc = await page.locator('iframe[src*="recaptcha"], div.g-recaptcha').count().catch(() => 0);
          const hc = await page.locator('iframe[src*="hcaptcha"], div.h-captcha').count().catch(() => 0);
          captchaLikely = (rc > 0 || hc > 0);
        } catch (_) {}
        const elapsed = Date.now() - started;
        const eff = captchaLikely ? (timeoutMs + captchaGraceMs) : timeoutMs;
        if (elapsed >= eff) {
          return { attempted, success: false, reason: captchaLikely ? 'timeout_with_captcha' : 'timeout' };
        }
        await this.#humanPause(650, 1200);
      }
    } catch (e) {
      return { attempted, success: false, reason: `exception:${e.message || 'unknown'}` };
    }
  }

  // ---- Helpers ----

  static #fallbackContinueSelector() {
    return 'button:has-text("Continue"), button:has-text("Next"), [data-testid*="continue" i]';
  }

  static #fallbackSubmitSelector() {
    return 'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")';
  }

  static async #reDetect(page) {
    try {
      // Lightweight inline re-detection to avoid circular dependency
      const candidates = {
        email: [
          'input[type="email"]',
          'input[name="email"]',
          'input[id*="email" i]',
          'input[autocomplete="username"]',
          'input[data-testid="form-input-email"]',
          'input[data-qa*="email" i]',
          'input[placeholder*="email" i]'
        ],
        password: [
          'input[type="password"]',
          'input[name="password"]',
          'input[id*="password" i]',
          'input[autocomplete="current-password"]',
          'input[data-testid="form-input-password"]',
          'input[data-qa*="password" i]',
          'input[placeholder*="password" i]'
        ],
        continue: [
          'button:has-text("Continue")',
          'a:has-text("Continue")',
          'button:has-text("Next")',
          '[data-testid*="continue" i]',
          '[data-qa*="continue" i]'
        ],
        submit: [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Sign in")',
          'button:has-text("Sign In")',
          'button:has-text("Log in")',
          'button:has-text("Log In")',
          '[data-testid*="submit" i]',
          '[data-qa*="submit" i]'
        ]
      };
      const out = {};
      for (const [k, list] of Object.entries(candidates)) {
        out[k] = await this.#firstVisible(page, list);
      }
      return { selectors: out };
    } catch (_) {
      return { selectors: {} };
    }
  }

  static async #focusAndType(page, selector, value, opts = {}) {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await loc.click({ delay: this.#rand(40, 120) }).catch(() => {});
    await this.#humanPause(80, 180);
    if (opts.clear) {
      try { await loc.fill(''); } catch (_) {}
      await this.#humanPause(60, 120);
    }
    const text = String(value);
    for (const ch of text) {
      await page.keyboard.type(ch, { delay: this.#rand(40, 110) }).catch(() => {});
      await this.#humanPause(10, 35);
    }
  }

  static async #ensureStableValue(page, selector, expected) {
    const loc = page.locator(selector).first();
    const reads = [];
    for (let i = 0; i < 3; i++) {
      try {
        const v = await loc.inputValue({ timeout: 2000 }).catch(() => '');
        reads.push(v);
      } catch (_) {
        reads.push('');
      }
      await this.#humanPause(80, 140);
    }
    const last = reads[reads.length - 1] || '';
    if (!this.#valuesEqual(last, expected)) {
      throw new Error(`value_not_stable (${selector})`);
    }
  }

  static #valuesEqual(a, b) {
    return String(a).trim() === String(b).trim();
  }

  static async #clickCenter(page, selector) {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const box = await loc.boundingBox().catch(() => null);
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: this.#rand(5, 15) }).catch(() => {});
      await this.#humanPause(60, 150);
      await page.mouse.click(x, y, { delay: this.#rand(30, 90) }).catch(() => {});
    } else {
      await loc.click({ delay: this.#rand(40, 120) }).catch(() => {});
    }
  }

  static async #firstVisible(page, candidates) {
    for (const sel of candidates) {
      try {
        const loc = page.locator(sel).first();
        const count = await loc.count();
        if (count > 0) {
          const vis = await loc.isVisible().catch(() => false);
          if (vis) return sel;
        }
      } catch (_) {
        // ignore
      }
    }
    return null;
  }

  static #rand(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  static async #humanPause(minMs, maxMs) {
    const ms = this.#rand(minMs, maxMs);
    await new Promise(r => setTimeout(r, ms));
  }

  /**
   * Lightweight analysis of captured entries to find success indicators.
   * @param {Array<any>} captured
   */
  static #analyzeCaptured(captured) {
    const out = { success: false, reason: null };
    if (!Array.isArray(captured) || captured.length === 0) return out;

    const api2xx = captured.filter(r =>
      r && r.type === 'response' && [200, 201].includes(r.status) &&
      typeof r.url === 'string' && r.url.includes('api.vidiq.com/')
    ).length;

    for (const r of captured) {
      if (!r || r.type !== 'response') continue;
      const url = r.url || '';
      const sigs = (r.custom && Array.isArray(r.custom.signals)) ? r.custom.signals : [];

      if (sigs.includes('token_refresh_success') && [200, 201].includes(r.status)) {
        out.success = true; out.reason = 'token_refresh'; return out;
      }
      if (sigs.includes('signin_success') && [200, 201].includes(r.status)) {
        out.success = true; out.reason = 'signin_success'; return out;
      }
      if (sigs.includes('session_validated') && [200, 201].includes(r.status)) {
        out.success = true; out.reason = 'session_valid'; return out;
      }
      if ([200, 201].includes(r.status) && typeof url === 'string') {
        if (url.includes('/users/me')) { out.success = true; out.reason = 'session_valid'; return out; }
        if (url.match(/\/(token|oauth|auth)\b/i)) { out.success = true; out.reason = 'token_refresh'; return out; }
        if (url.match(/\/(signin|login)\b/i)) { out.success = true; out.reason = 'signin_success'; return out; }
      }
    }

    if (api2xx >= 5) {
      out.success = true; out.reason = 'api_activity_detected';
    }
    return out;
  }
}