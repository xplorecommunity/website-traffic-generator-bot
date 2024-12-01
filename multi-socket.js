const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const TorControl = require('tor-control');
const path = require('path');

// Tor Control configuration
const torControl = new TorControl({
  host: '127.0.0.1',
  port: 9051,
  password: "a", // Set to your Tor control password if configured
});

// Manage sequential NEWNYM signals
let lastTorSignalPromise = Promise.resolve();

function requestNewTorCircuit() {
  lastTorSignalPromise = lastTorSignalPromise.then(() => new Promise((resolve, reject) => {
    torControl.signalNewnym((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  }));
  return lastTorSignalPromise;
}

// Function to get current IP through Tor
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

// Function to simulate traffic for a single view
async function simulateSingleView(url, options = {}) {
  const { duration = 3000, index, maxRetries = 3, socksPort = 9050 } = options;
  const logFile = path.join(__dirname, 'website_views.log');

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];

  const logMessage = async (message) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(logEntry.trim());
    await fs.appendFile(logFile, logEntry);
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let browser = null;
    try {
      // Request new Tor circuit
      await logMessage(`View #${index}, Attempt ${attempt} - Requesting new Tor circuit...`);
      await requestNewTorCircuit();

      // Launch browser with socks proxy
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          `--proxy-server=socks5://127.0.0.1:${socksPort}`
        ],
      });

      const page = await browser.newPage();

      // Set random user agent
      await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

      // Set viewport
      await page.setViewport({
        width: 1366 + Math.floor(Math.random() * 200),
        height: 768 + Math.floor(Math.random() * 200),
        deviceScaleFactor: 1
      });

      // Verify new IP
      let currentIP = await getCurrentIP(page);
      await logMessage(`View #${index}, Attempt ${attempt} - Current IP: ${currentIP}`);

      // Check if IP has changed (for attempts after the first)
      if (attempt > 1 && currentIP === previousIP) {
        await logMessage(`View #${index}, Attempt ${attempt} - IP未变更，重新请求新电路...`);
        continue; // Retry requesting a new circuit
      }

      // Proceed with the request
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      await logMessage(`Visited ${url} with IP ${currentIP}`);

      // ... rest of the code

    } catch (error) {
      await logMessage(`Attempt ${attempt} failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// Main function to simulate traffic in parallel
async function simulateTraffic(url, options = {}) {
  const { views = 10, duration = 3000, maxConcurrentViews = 3 } = options;

  // Unique IPs tracker
  const uniqueIPs = new Set();
  const ipLogFile = path.join(__dirname, 'unique_ips.log');

  // Parallel execution with controlled concurrency
  const batches = Math.ceil(views / maxConcurrentViews);
  for (let i = 0; i < batches; i++) {
    const batch = [];
    for (let j = 0; j < maxConcurrentViews; j++) {
      const viewIndex = i * maxConcurrentViews + j + 1;
      if (viewIndex > views) break;
      batch.push(
        simulateSingleView(url, { 
          duration, 
          index: viewIndex,
          socksPort: 9050 // Use the single Tor socks port
        })
      );
    }

    try {
      // Run batch of views
      const results = await Promise.all(batch);

      // Filter out null results and add to unique IPs
      results.forEach(ip => {
        if (ip) uniqueIPs.add(ip);
      });
    } catch (batchError) {
      console.error('Error in batch simulation:', batchError.message);
    }
  }

  try {
    // Save unique IPs to file
    await fs.writeFile(ipLogFile, Array.from(uniqueIPs).join('\n'));
    console.log(`Simulation completed. Unique IPs logged to ${ipLogFile}.`);
  } catch (error) {
    console.error('Error saving unique IPs:', error.message);
  }
}

// Usage
simulateTraffic('https://xplore-blog.vercel.app', { 
  views: 10, 
  duration: 3000,
  maxConcurrentViews: 3 
});

module.exports = { simulateTraffic };