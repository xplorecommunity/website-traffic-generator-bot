const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const TorControl = require('tor-control');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

// Increase max listeners
EventEmitter.defaultMaxListeners = 20;

// Tor Control configuration function to create a new instance for each process
function createTorControl() {
  return new TorControl({
    host: '127.0.0.1',
    port: 9051,
    password: "a", // Set to your Tor control password if configured
  });
}

const torControl = new TorControl({
    host: '127.0.0.1',
    port: 9051,
    password: "a", // Set to your Tor control password if configured
  });


// Function to safely request new Tor circuit with timeout
function requestNewTorCircuit(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tor circuit request timed out'));
    }, timeout);

    torControl.signalNewnym((err) => {
      clearTimeout(timer);
      if (err) {
        reject(new Error(`Error requesting new Tor circuit: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

async function getCurrentIP(page) {
    try {
      await page.goto('https://check.torproject.org', { timeout: 10000 });
      const ip = await page.$eval('body', (body) => {
        const match = body.innerText.match(/Your IP address appears to be: (\d+\.\d+\.\d+\.\d+)/);
        return match ? match[1] : 'Unknown';
      });
      return ip;
    } catch (error) {
      console.error('Error fetching IP:', error.message);
      return 'Unknown';
    }
  }
  
  async function simulateSingleView(url, options = {}) {
    const { duration = 3000, index, maxRetries = 3 } = options;
    const logFile = path.join(__dirname, 'website_views.log');
    const uniqueIpsFile = path.join(__dirname, 'unique_ips.log');
  
    // User agents for variety
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];
  
    // Logging function
    const logMessage = async (message) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      console.log(logEntry.trim());
      await fs.appendFile(logFile, logEntry);
    };
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let browser = null;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--proxy-server=socks5://127.0.0.1:9050'
          ],
        });
  
        const page = await browser.newPage();
  
        // Set random user agent
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(userAgent);
  
        // Set viewport
        await page.setViewport({
          width: 1366 + Math.floor(Math.random() * 200),
          height: 768 + Math.floor(Math.random() * 200),
          deviceScaleFactor: 1
        });
  
        // Get current IP
        let currentIP = await getCurrentIP(page);
        await logMessage(`View #${index}, Attempt ${attempt} - Current IP: ${currentIP}`);
  
        // Request new Tor circuit
        await logMessage('Requesting new Tor circuit...');
        await requestNewTorCircuit();
  
        // Wait for circuit change
        await new Promise((resolve) => setTimeout(resolve, 5000));
  
        // Check if IP has changed
        let newIP = await getCurrentIP(page);
        let timeout = Date.now() + 15000; // 15 seconds timeout
        while (newIP === currentIP && Date.now() < timeout) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before checking again
          newIP = await getCurrentIP(page);
        }
  
        if (newIP === currentIP) {
          throw new Error('IP did not change after requesting new Tor circuit');
        }
  
        currentIP = newIP;
        await logMessage(`New IP obtained: ${currentIP}`);
  
        // Visit the target URL
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });
        await logMessage(`Visited ${url} with IP ${currentIP}`);
  
        const links = await page.evaluate((baseUrl) => {
          // Collect all unique links
          const anchors = Array.from(new Set(
            Array.from(document.querySelectorAll('a'))
              .map(a => a.href)
              .filter(href => 
                href && 
                href.startsWith(baseUrl) && 
                !href.startsWith(`${baseUrl}/roadmaps`) && 
                !href.includes('#') && 
                !href.includes('javascript:')
              )
          ));
          return anchors;
        }, url);
  
        const shuffledLinks = links
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.floor(Math.random() * Math.min(5, links.length)));
  
        // Browse additional pages
        for (const link of shuffledLinks) {
          try {
            await page.goto(link, { 
              waitUntil: 'networkidle0',
              timeout: 30000 
            });
  
            // Log page details
            const subPageTitle = await page.title();
            await logMessage(`  └ Navigated to sub-page: ${link} - Title: ${subPageTitle}`);
  
            // Random scroll
            await page.evaluate(() => {
              window.scrollBy(0, Math.random() * 500);
            });
  
            // Short wait
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
          } catch (subPageError) {
            await logMessage(`  └ Error navigating sub-page: ${link} - ${subPageError.message}`);
          }
        }
  
        // Simulate viewing duration
        const viewDuration = duration + Math.floor(Math.random() * 1000);
        await new Promise(resolve => setTimeout(resolve, viewDuration));
  
        await page.close();
  
        await browser.close();
  
        return currentIP;
      } catch (error) {
        await logMessage(`Attempt ${attempt} failed: ${error.message}`);
        
        // Close browser if it's still open
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error('Error closing browser:', closeError);
          }
        }
  
        // If it's the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
  
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  
    throw new Error(`Failed to complete view after ${maxRetries} attempts`);
  }

// Main function to simulate traffic in parallel with enhanced IP diversity
async function simulateTraffic(url, options = {}) {
  const { views = 10, duration = 3000, maxConcurrentViews = 3 } = options;

  // Unique IPs tracker
  const uniqueIPs = new Set();
  const ipLogFile = path.join(__dirname, 'unique_ips_parallel_diff.log');

  // Parallel execution with improved IP rotation
  const viewPromises = Array.from(
    { length: views }, 
    (_, i) => simulateSingleView(url, { 
      duration, 
      index: i + 1,
      forceNewCircuit: true  // Ensure a new circuit for each view
    })
  );

  try {
    // Run all views in parallel, but with the option to force new circuits
    const results = await Promise.all(viewPromises);

    // Filter out null results and add to unique IPs
    results.forEach(ip => {
      if (ip && ip !== 'Unknown') uniqueIPs.add(ip);
    });

    // Save unique IPs to file
    await fs.writeFile(ipLogFile, Array.from(uniqueIPs).join('\n'));
    console.log(`Simulation completed. Unique IPs logged to ${ipLogFile}.`);
    console.log('Unique IPs:', Array.from(uniqueIPs));
  } catch (error) {
    console.error('Error in traffic simulation:', error.message);
  }
}

// Usage
simulateTraffic('https://xplore-blog.vercel.app', { 
  views: 20, 
  duration: 3000,
  maxConcurrentViews: 2
});

module.exports = { simulateTraffic };