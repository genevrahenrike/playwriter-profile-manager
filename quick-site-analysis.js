#!/usr/bin/env node

/**
 * Quick analysis of bot detection sites to understand their structure
 */

import { chromium } from 'playwright';
import fs from 'fs-extra';

async function quickAnalysis() {
    console.log('🔍 Quick analysis of bot detection sites...\n');
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext();
    
    const sites = [
        {
            name: 'iphey.com',
            url: 'https://iphey.com',
            waitTime: 8000,
            description: 'Primary bot detection site'
        },
        {
            name: 'Pixelscan',
            url: 'https://pixelscan.net/fingerprint-check',
            waitTime: 12000,
            description: 'Comprehensive fingerprint analysis'
        },
        {
            name: 'AmIUnique',
            url: 'https://amiunique.org/fingerprint',
            waitTime: 20000,
            description: 'Uniqueness data (slower site)'
        }
    ];
    
    for (const site of sites) {
        console.log(`\n📊 Analyzing ${site.name}`);
        console.log(`🌐 URL: ${site.url}`);
        console.log(`📝 ${site.description}`);
        console.log('-'.repeat(50));
        
        try {
            const page = await context.newPage();
            
            console.log(`⏳ Loading site...`);
            await page.goto(site.url, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            console.log(`⏱️  Waiting ${site.waitTime}ms for analysis...`);
            await page.waitForTimeout(site.waitTime);
            
            // Quick structure analysis
            const analysis = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const result = {
                    title: document.title,
                    url: window.location.href,
                    hasResults: false,
                    scoreElements: [],
                    botKeywords: [],
                    percentages: [],
                    resultKeywords: []
                };
                
                // Look for percentages
                const percentageMatches = bodyText.match(/\d+(\.\d+)?%/g) || [];
                result.percentages = percentageMatches.slice(0, 10);
                
                // Look for bot-related keywords
                const botKeywords = ['bot', 'human', 'authentic', 'detection', 'automation', 'webdriver', 'fingerprint'];
                botKeywords.forEach(keyword => {
                    if (bodyText.toLowerCase().includes(keyword)) {
                        result.botKeywords.push(keyword);
                    }
                });
                
                // Look for result indicators
                const resultKeywords = ['score', 'result', 'analysis', 'unique', 'consistent', 'risk', 'trust'];
                resultKeywords.forEach(keyword => {
                    if (bodyText.toLowerCase().includes(keyword)) {
                        result.resultKeywords.push(keyword);
                    }
                });
                
                // Check if site has completed analysis
                result.hasResults = result.percentages.length > 0 || result.botKeywords.length > 2;
                
                // Get first 1000 chars of body text for manual inspection
                result.bodyTextPreview = bodyText.substring(0, 1000);
                
                return result;
            });
            
            console.log(`📄 Title: ${analysis.title}`);
            console.log(`✅ Has Results: ${analysis.hasResults ? 'YES' : 'NO'}`);
            
            if (analysis.percentages.length > 0) {
                console.log(`📊 Percentages Found: ${analysis.percentages.join(', ')}`);
            }
            
            if (analysis.botKeywords.length > 0) {
                console.log(`🤖 Bot Keywords: ${analysis.botKeywords.join(', ')}`);
            }
            
            if (analysis.resultKeywords.length > 0) {
                console.log(`📋 Result Keywords: ${analysis.resultKeywords.join(', ')}`);
            }
            
            console.log(`\n📝 Body Text Preview:`);
            console.log(analysis.bodyTextPreview);
            
            // Save detailed analysis
            const filename = `./quick-analysis-${site.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
            await fs.writeJson(filename, analysis, { spaces: 2 });
            console.log(`💾 Analysis saved to: ${filename}`);
            
            await page.close();
            
        } catch (error) {
            console.error(`❌ Error analyzing ${site.name}: ${error.message}`);
        }
    }
    
    await browser.close();
    console.log('\n✅ Quick analysis complete!');
}

// Run the analysis
quickAnalysis().catch(console.error);
