// VidIQ App/Auth Request Capture - detects login, token refresh, and session validation flows
export default {
  name: 'vidiq-app-capture',
  description: 'Capture VidIQ app/auth requests: login, signin, token refresh, and session endpoints',
  enabled: true,

  // Monitor VidIQ application hosts where JWT/refresh flows typically occur
  urlPatterns: [
    'https://app.vidiq.com/*',
    'https://auth.vidiq.com/*'
  ],

  // Broad capture rules with targeted path hints
  captureRules: {
    // Capture all HTTP methods
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],

    // Request URL patterns we care about (token refresh, signin/login, session checks)
    requestUrlPatterns: [
      'https://app.vidiq.com/*token*',
      'https://app.vidiq.com/*auth*',
      'https://app.vidiq.com/*signin*',
      'https://app.vidiq.com/*login*',
      'https://app.vidiq.com/*oauth*',
      'https://app.vidiq.com/*users/me*',
      'https://auth.vidiq.com/*token*',
      'https://auth.vidiq.com/*auth*',
      'https://auth.vidiq.com/*signin*',
      'https://auth.vidiq.com/*login*',
      'https://auth.vidiq.com/*oauth*'
    ],

    // Response URL patterns (mirror requests)
    responseUrlPatterns: [
      'https://app.vidiq.com/*token*',
      'https://app.vidiq.com/*auth*',
      'https://app.vidiq.com/*signin*',
      'https://app.vidiq.com/*login*',
      'https://app.vidiq.com/*oauth*',
      'https://app.vidiq.com/*users/me*',
      'https://auth.vidiq.com/*token*',
      'https://auth.vidiq.com/*auth*',
      'https://auth.vidiq.com/*signin*',
      'https://auth.vidiq.com/*login*',
      'https://auth.vidiq.com/*oauth*'
    ],

    // Capture all statuses
    statusCodes: [],

    // Enable response capture and body parsing
    captureResponses: true,
    captureResponseBody: true
  },

  // Extract high-signal request info (endpoint and headers)
  async customRequestCapture(request, sessionId) {
    const url = request.url();
    const method = request.method();
    const headers = request.headers() || {};

    // Endpoint derivation for app/auth domains
    let endpoint = url;
    try {
      const u = new URL(url);
      if (u.hostname.endsWith('vidiq.com')) {
        endpoint = `${u.hostname}${u.pathname}`;
      }
    } catch (_) {}

    // Pull likely auth headers
    const tokens = {};
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (authHeader) tokens.authorization = authHeader;
    if (headers['x-vidiq-device-id']) tokens['x-vidiq-device-id'] = headers['x-vidiq-device-id'];

    return {
      endpoint,
      method,
      fullUrl: url,
      tokens
    };
  },

  // Extract JWT/refresh tokens from responses and infer success types
  async customResponseCapture(response, sessionId) {
    const url = response.url();
    const status = response.status();
    const headers = response.headers ? response.headers() : (response.headers || {});

    // Endpoint derivation for app/auth domains
    let endpoint = url;
    try {
      const u = new URL(url);
      if (u.hostname.endsWith('vidiq.com')) {
        endpoint = `${u.hostname}${u.pathname}`;
      }
    } catch (_) {}

    const info = {
      endpoint,
      status,
      fullUrl: url,
      tokens: {},
      signals: []
    };

    // Header-based signals
    const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (authHeader) {
      info.tokens.authorization = authHeader;
      info.signals.push('authorization_header_present');
    }
    if (setCookie && typeof setCookie === 'string') {
      if (/token|jwt|access/i.test(setCookie)) {
        info.tokens.setCookie = setCookie;
        info.signals.push('token_cookie_set');
      }
    }

    // Body-based token extraction (best effort)
    try {
      const text = await response.text();
      if (text && text.length) {
        // Try JSON parse; ignore if not JSON
        try {
          const json = JSON.parse(text);
          // Common token fields
          const candidateKeys = [
            'access_token', 'refresh_token', 'id_token', 'token', 'jwt', 'accessToken', 'refreshToken'
          ];
          for (const k of candidateKeys) {
            if (json && Object.prototype.hasOwnProperty.call(json, k) && json[k]) {
              info.tokens[k] = json[k];
            }
          }
          if (info.tokens.access_token || info.tokens.id_token || info.tokens.token || info.tokens.jwt) {
            info.signals.push('token_in_response_body');
          }
        } catch (_) {
          // Not JSON; skip
        }

        // Lightweight success heuristics (tightened to reduce false positives)
        const ok = (status === 200 || status === 201);

        // Consider token_refresh only on explicit token/refresh/oauth endpoints AND when tokens are present
        const isTokenEndpoint = /\/(token|oauth|refresh)\b/i.test(url);
        const isGenericAuth = /\/auth\b/i.test(url) && !/\/auth\/email-check\b/i.test(url);
        const hasAnyToken =
          (info.tokens && Object.keys(info.tokens).length > 0);

        if (ok && (isTokenEndpoint || isGenericAuth) && hasAnyToken) {
          info.signals.push('token_refresh_success');
        }

        // Sign-in success only on signin/login endpoints (200/201)
        if (ok && /\/(signin|login)\b/i.test(url)) {
          info.signals.push('signin_success');
        }

        // Session validation only for users/me (200/201)
        if (ok && /\/users\/me\b/i.test(url)) {
          info.signals.push('session_validated');
        }
      }
    } catch (_) {
      // ignore
    }

    return info;
  }
};