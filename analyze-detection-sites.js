#!/usr/bin/env node

/**
 * Script to analyze bot detection sites and understand their structure
 */

import { chromium } from 'playwright';

async function analyzeSites() {
    console.log('🔍 Analyzing bot detection sites structure...\n');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    
    const sites = [
        {
            name: 'iphey.com',
            url: 'https://iphey.com',
            waitTime: 8000
        },
        {
            name: 'Pixelscan',
            url: 'https://pixelscan.net/fingerprint-check',
            waitTime: 10000
        },
        {
            name: 'AmIUnique',
            url: 'https://amiunique.org/fingerprint',
            waitTime: 15000 // Slower as mentioned
        }
    ];
    
    for (const site of sites) {
        console.log(`\n📊 Analyzing ${site.name} (${site.url})`);
        console.log('=' .repeat(60));
        
        try {
            const page = await context.newPage();
            
            console.log(`⏳ Loading ${site.name}...`);
            await page.goto(site.url, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            console.log(`⏱️  Waiting ${site.waitTime}ms for analysis to complete...`);
            await page.waitForTimeout(site.waitTime);
            
            // Analyze page structure
            const analysis = await page.evaluate(() => {
                const result = {
                    title: document.title,
                    url: window.location.href,
                    bodyText: document.body.innerText.substring(0, 2000), // First 2000 chars
                    structure: {
                        totalElements: document.querySelectorAll('*').length,
                        divs: document.querySelectorAll('div').length,
                        spans: document.querySelectorAll('span').length,
                        paragraphs: document.querySelectorAll('p').length,
                        buttons: document.querySelectorAll('button').length,
                        inputs: document.querySelectorAll('input').length,
                        tables: document.querySelectorAll('table').length,
                        forms: document.querySelectorAll('form').length
                    },
                    potentialScoreElements: [],
                    potentialResultElements: [],
                    scripts: Array.from(document.querySelectorAll('script')).map(s => ({
                        src: s.src,
                        hasContent: s.innerHTML.length > 0,
                        contentPreview: s.innerHTML.substring(0, 200)
                    })).filter(s => s.src || s.hasContent),
                    interestingClasses: [],
                    interestingIds: []
                };
                
                // Look for elements that might contain scores or results
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                    const text = el.textContent?.toLowerCase() || '';
                    const className = el.className?.toString() || '';
                    const id = el.id || '';
                    
                    // Look for score-related content
                    if (text.match(/\d+%/) || text.includes('score') || text.includes('result') || 
                        text.includes('authentic') || text.includes('bot') || text.includes('human') ||
                        text.includes('detection') || text.includes('fingerprint') || text.includes('unique')) {
                        
                        if (text.length < 200) { // Avoid huge text blocks
                            result.potentialResultElements.push({
                                tagName: el.tagName,
                                className: className,
                                id: id,
                                text: text.substring(0, 100),
                                innerHTML: el.innerHTML.substring(0, 200)
                            });
                        }
                    }
                    
                    // Collect interesting classes and IDs
                    if (className && (className.includes('score') || className.includes('result') || 
                        className.includes('fingerprint') || className.includes('detection') ||
                        className.includes('bot') || className.includes('human'))) {
                        result.interestingClasses.push(className);
                    }
                    
                    if (id && (id.includes('score') || id.includes('result') || 
                        id.includes('fingerprint') || id.includes('detection') ||
                        id.includes('bot') || id.includes('human'))) {
                        result.interestingIds.push(id);
                    }
                });
                
                // Remove duplicates
                result.interestingClasses = [...new Set(result.interestingClasses)];
                result.interestingIds = [...new Set(result.interestingIds)];
                
                return result;
            });
            
            // Display analysis results
            console.log(`📄 Title: ${analysis.title}`);
            console.log(`🌐 Final URL: ${analysis.url}`);
            console.log(`\n📊 Page Structure:`);
            console.log(`   Total elements: ${analysis.structure.totalElements}`);
            console.log(`   Divs: ${analysis.structure.divs}, Spans: ${analysis.structure.spans}`);
            console.log(`   Paragraphs: ${analysis.structure.paragraphs}, Buttons: ${analysis.structure.buttons}`);
            console.log(`   Tables: ${analysis.structure.tables}, Forms: ${analysis.structure.forms}`);
            
            if (analysis.interestingClasses.length > 0) {
                console.log(`\n🎯 Interesting Classes:`);
                analysis.interestingClasses.slice(0, 10).forEach(cls => {
                    console.log(`   • ${cls}`);
                });
            }
            
            if (analysis.interestingIds.length > 0) {
                console.log(`\n🆔 Interesting IDs:`);
                analysis.interestingIds.slice(0, 10).forEach(id => {
                    console.log(`   • ${id}`);
                });
            }
            
            if (analysis.potentialResultElements.length > 0) {
                console.log(`\n📋 Potential Result Elements (${analysis.potentialResultElements.length} found):`);
                analysis.potentialResultElements.slice(0, 5).forEach((el, i) => {
                    console.log(`   ${i + 1}. <${el.tagName}> class="${el.className}" id="${el.id}"`);
                    console.log(`      Text: "${el.text}"`);
                    if (el.innerHTML !== el.text) {
                        console.log(`      HTML: "${el.innerHTML}"`);
                    }
                    console.log('');
                });
            }
            
            console.log(`\n📝 Body Text Preview (first 500 chars):`);
            console.log(analysis.bodyText.substring(0, 500));
            
            if (analysis.scripts.length > 0) {
                console.log(`\n📜 Scripts Found (${analysis.scripts.length}):`);
                analysis.scripts.slice(0, 3).forEach((script, i) => {
                    console.log(`   ${i + 1}. ${script.src || 'Inline script'}`);
                    if (script.contentPreview) {
                        console.log(`      Preview: ${script.contentPreview}`);
                    }
                });
            }
            
            // Save detailed analysis to file
            const fs = await import('fs-extra');
            const filename = `./site-analysis-${site.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
            await fs.writeJson(filename, analysis, { spaces: 2 });
            console.log(`💾 Detailed analysis saved to: ${filename}`);
            
            await page.close();
            
        } catch (error) {
            console.error(`❌ Error analyzing ${site.name}: ${error.message}`);
        }
    }
    
    await browser.close();
    console.log('\n✅ Site analysis complete!');
    console.log('\n💡 Use the analysis files to understand how to parse each site\'s results.');
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzeSites().catch(console.error);
}

export { analyzeSites };
