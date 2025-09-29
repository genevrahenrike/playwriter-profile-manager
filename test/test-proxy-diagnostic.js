#!/usr/bin/env node
// Quick diagnostic to verify Playwright proxy authentication without full profile launcher.
import { chromium } from 'playwright';
import { ProxyManager } from '../src/ProxyManager.js';

async function main() {
  const selection = process.argv[2] || 'random';
  const testUrl = process.argv[3] || 'https://api.ipify.org?format=json';
  const pm = new ProxyManager();
  await pm.loadProxies();
  const proxyConfig = await pm.getProxyConfig(selection, 'http');
  if (!proxyConfig) {
    console.error('No proxy available for selection:', selection);
    process.exit(1);
  }
  console.log('🚀 Launching headless Chromium with proxy:', {
    server: proxyConfig.server,
    user: proxyConfig.username ? '***' : null
  });
  const t0 = Date.now();
  const browser = await chromium.launch({
    headless: true,
    proxy: proxyConfig
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  let authPopup = false;
  page.on('dialog', d => { authPopup = true; d.dismiss().catch(()=>{}); });
  let status = null;
  try {
    const resp = await page.goto(testUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
    status = resp && resp.status();
    const body = await resp.text();
    console.log('✅ Response status:', status, 'body:', body.slice(0,120));
  } catch (e) {
    console.error('❌ Navigation error:', e.message);
  }
  await browser.close();
  console.log('⏱  Total time ms:', Date.now() - t0);
  if (authPopup) console.warn('⚠️ Proxy auth popup occurred (credentials not accepted by server?)');
  if (status === 407) console.warn('🚫 Got 407 Proxy Authentication Required');
}

main().catch(e => { console.error(e); process.exit(1); });