const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const TorControl = require('tor-control');
const path = require('path');
const os = require('os');

// Tor Control configuration
const torControl = new TorControl({
  host: '127.0.0.1',
  port: 9051,
  password: "a", // Set to your Tor control password if configured
});

// Function to get current IP through Tor
async function getCurrentIP(page) {
  try {
    await page.goto('https://check.torproject.org', { waitUntil: 'networkidle0', timeout: 10000 });
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
  const { duration = 3000, index } = options;
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

  try {
    const browser = await puppeteer.launch({
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
    const currentIP = await getCurrentIP(page);
    await logMessage(`View #${index} - Current IP: ${currentIP}`);

    // Visit the target URL
    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
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
            window.scrollBy(0,  Math.random() * 500);
          });

          // Short wait
          await new Promise(resolve => setTimeout(resolve,  Math.random() * 2000));
        } catch (subPageError) {
          await logMessage(`  └ Error navigating sub-page: ${link} - ${subPageError.message}`);
        }
      }

    } catch (visitError) {
      console.error(`Error visiting ${url}: ${visitError.message}`);
    }

    // Simulate viewing duration
    const viewDuration = duration + Math.floor(Math.random() * 1000);
    await new Promise(resolve => setTimeout(resolve, viewDuration));

    await page.close();

    // Request new Tor circuit
    await logMessage('Requesting new Tor circuit...');
    await new Promise((resolve, reject) => {
      torControl.signalNewnym((err) => {
        if (err) {
          console.error('Error requesting new Tor circuit:', err.message);
          return reject(err);
        }
        resolve();
      });
    });
    
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for circuit change

    await browser.close();

    return currentIP;
  } catch (error) {
    console.error(`Error in simulation for view: ${error.message}`);
    return null;
  }
}

// Main function to simulate traffic in parallel
async function simulateTraffic(url, options = {}) {
  const { views = 10, duration = 3000 } = options;
  
  // Determine number of parallel processes (use # of CPU cores)
  const numCPUs = os.cpus().length;
  const maxParallelViews = Math.min(numCPUs, views);
  console.log("numCpus: ",numCPUs)
  console.log("Parallel Views: ",maxParallelViews)

  // Unique IPs tracker
  const uniqueIPs = new Set();
  const ipLogFile = path.join(__dirname, 'unique_ips_parallel-diff-ips.log');

  // Parallel execution using Promise.all
  const viewPromises = Array.from({ length: views }, (_, index) => 
    simulateSingleView(url, { duration, index: index + 1 })
    // console.log("asd")
  );

  try {
    // Run views in parallel
    const results = await Promise.all(viewPromises);

    // Filter out null results and add to unique IPs
    results.forEach(ip => {
      if (ip) uniqueIPs.add(ip);
    });

    // Save unique IPs to file
    await fs.writeFile(ipLogFile, Array.from(uniqueIPs).join('\n'));
    console.log(`Simulation completed. Unique IPs logged to ${ipLogFile}.`);
  } catch (error) {
    console.error('Error in parallel simulation:', error.message);
  }
}

// Usage
simulateTraffic('https://xplore-blog.vercel.app', { views: 20, duration: 3000 });

module.exports = { simulateTraffic };