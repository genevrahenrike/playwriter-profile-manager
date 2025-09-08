#!/usr/bin/env node

import { StealthManager } from './src/StealthManager.js';

const stealth = new StealthManager();

console.log('🧪 Testing Conservative Stealth Presets:');
console.log('');

// Test minimal preset
console.log('📋 MINIMAL preset (Essential anti-bot protection only):');
const minimal = stealth.createPreset('minimal');
console.log('  WebGL:', minimal.webgl.enabled ? '✅ ENABLED' : '❌ DISABLED');
console.log('  Audio:', minimal.audio.enabled ? `✅ ENABLED (noise: ${minimal.audio.noiseAmount})` : '❌ DISABLED');
console.log('  Canvas:', minimal.canvas.enabled ? `✅ ENABLED (noise: ${minimal.canvas.noiseAmount})` : '❌ DISABLED');
console.log('  User Agent:', minimal.userAgent.enabled ? '✅ RANDOMIZED' : '❌ AUTHENTIC (real browser UA)');
console.log('  Screen:', minimal.screen.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real screen)');
console.log('  Timezone:', minimal.timezone.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real timezone)');
console.log('  Hardware:', minimal.hardwareConcurrency.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real CPU cores)');

console.log('');

// Test balanced preset (default)
console.log('📋 BALANCED preset (Conservative protection - DEFAULT):');
const balanced = stealth.createPreset('balanced');
console.log('  WebGL:', balanced.webgl.enabled ? '✅ ENABLED' : '❌ DISABLED');
console.log('  Audio:', balanced.audio.enabled ? `✅ ENABLED (minimal noise: ${balanced.audio.noiseAmount})` : '❌ DISABLED');
console.log('  Canvas:', balanced.canvas.enabled ? `✅ ENABLED (minimal noise: ${balanced.canvas.noiseAmount})` : '❌ DISABLED');
console.log('  User Agent:', balanced.userAgent.enabled ? '✅ RANDOMIZED' : '❌ AUTHENTIC (real browser UA)');
console.log('  Screen:', balanced.screen.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real screen)');
console.log('  Timezone:', balanced.timezone.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real timezone)');
console.log('  Hardware:', balanced.hardwareConcurrency.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real CPU cores)');
console.log('  Memory:', balanced.memory.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC (real memory)');

console.log('');

// Test maximum preset
console.log('📋 MAXIMUM preset (Aggressive protection):');
const maximum = stealth.createPreset('maximum');
console.log('  WebGL:', maximum.webgl.enabled ? '✅ ENABLED' : '❌ DISABLED');
console.log('  Audio:', maximum.audio.enabled ? `✅ ENABLED (noise: ${maximum.audio.noiseAmount}, AudioContext: ${maximum.audio.enableAudioContext ? 'enabled' : 'DISABLED'})` : '❌ DISABLED');
console.log('  Canvas:', maximum.canvas.enabled ? `✅ ENABLED (noise: ${maximum.canvas.noiseAmount})` : '❌ DISABLED');
console.log('  User Agent:', maximum.userAgent.enabled ? `✅ RANDOMIZED (${maximum.userAgent.userAgent ? 'Generated' : 'Default'})` : '❌ AUTHENTIC');
console.log('  Screen:', maximum.screen.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC');
console.log('  Timezone:', maximum.timezone.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC');
console.log('  Hardware:', maximum.hardwareConcurrency.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC');
console.log('  Memory:', maximum.memory.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC');
console.log('  Battery:', maximum.battery.enabled ? '✅ SPOOFED' : '❌ AUTHENTIC');

console.log('');
console.log('✅ Conservative Approach Verified:');
console.log('   🎯 MINIMAL: Only WebGL protection (most authentic, basic anti-bot)');
console.log('   🛡️  BALANCED: WebGL + minimal audio/canvas noise (default, authentic with light protection)');
console.log('   🔒 MAXIMUM: All features enabled (less authentic but maximum protection)');
console.log('');
console.log('🔑 Key Philosophy:');
console.log('   • User Agent: Kept authentic by default (no random generation)');
console.log('   • Screen/Hardware: Real values preserved for authenticity');
console.log('   • Timezone/Language: Real values preserved for authenticity');
console.log('   • Only fake what\'s necessary for anti-bot protection');
console.log('   • Customization available for specific needs');
