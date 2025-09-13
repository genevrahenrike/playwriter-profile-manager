import chalk from 'chalk';

/**
 * LoginAnalyzer - lightweight analyzer to detect VidIQ login flows and derive selectors.
 * Avoids heavy DOM traversal; focuses on common patterns and visibility checks.
 */
export class LoginAnalyzer {
  /**
   * Detect login UI and flow type on the current page.
   * @param {import('playwright').Page} page
   * @param {object} [options]
   * @returns {Promise<{loginRequired: boolean, flow: 'email_first'|'email_password_same_page'|'password_only_visible'|'unknown', url: string, selectors: { email?: string, password?: string, continue?: string, submit?: string } }>}
   */
  static async detect(page, options = {}) {
    const url = page.url();
    const loginHost = /\.vidiq\.com/i.test(url);
    const selectors = {};

    const emailCandidates = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[autocomplete="username"]',
      'input[data-testid="form-input-email"]',
      'input[data-qa*="email" i]',
      'input[placeholder*="email" i]'
    ];

    const passwordCandidates = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password" i]',
      'input[autocomplete="current-password"]',
      'input[data-testid="form-input-password"]',
      'input[data-qa*="password" i]',
      'input[placeholder*="password" i]'
    ];

    const continueCandidates = [
      'button:has-text("Continue")',
      'a:has-text("Continue")',
      'button:has-text("Next")',
      '[data-testid*="continue" i]',
      '[data-qa*="continue" i]'
    ];

    const submitCandidates = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Sign In")',
      'button:has-text("Log in")',
      'button:has-text("Log In")',
      '[data-testid*="submit" i]',
      '[data-qa*="submit" i]'
    ];

    const emailSel = await LoginAnalyzer.#firstVisible(page, emailCandidates);
    const passSel = await LoginAnalyzer.#firstVisible(page, passwordCandidates);
    const contSel = await LoginAnalyzer.#firstVisible(page, continueCandidates);
    const submitSel = await LoginAnalyzer.#firstVisible(page, submitCandidates);

    if (emailSel) selectors.email = emailSel;
    if (passSel) selectors.password = passSel;
    if (contSel) selectors.continue = contSel;
    if (submitSel) selectors.submit = submitSel;

    let flow = 'unknown';
    let loginRequired = false;

    if (loginHost) {
      if (emailSel || passSel) {
        loginRequired = true;
        if (emailSel && !passSel && contSel) {
          flow = 'email_first';
        } else if (emailSel && passSel) {
          flow = 'email_password_same_page';
        } else if (passSel && !emailSel) {
          flow = 'password_only_visible';
        }
      }
    }

    return { loginRequired, flow, url, selectors };
  }

  /**
   * Get the first visible selector from a candidate list.
   * @param {import('playwright').Page} page
   * @param {string[]} candidates
   * @returns {Promise<string|null>}
   */
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

  /**
   * Log a concise analysis summary.
   * @param {ReturnType<LoginAnalyzer.detect> extends Promise<infer T> ? T : any} analysis
   */
  static logSummary(analysis) {
    try {
      const parts = [];
      parts.push(`url=${analysis.url}`);
      parts.push(`flow=${analysis.flow}`);
      const sel = analysis.selectors || {};
      const ks = ['email', 'password', 'continue', 'submit'].filter(k => !!sel[k]);
      parts.push(`selectors=[${ks.join(', ')}]`);
      console.log(chalk.dim(`🔎 LoginAnalyzer: ${parts.join(' | ')}`));
    } catch (_) {
      // ignore
    }
  }
}

export default LoginAnalyzer;