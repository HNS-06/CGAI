class ClimateGuard {
    constructor() {
        this.theme = 'light';
        this.stats = {
            carbonSaved: 0,
            treesPlanted: 0,
            offsetPurchases: 0,
            moneyDonated: 0
        };
        this.activities = [];
        this.currentPageData = null;
        this.realtimeOffsets = [];
        this.liveUpdateInterval = null;
        this.isAutoOffsetEnabled = false;
        this.climatiqApiKey = '0B0VTKY35D2HN0S42BMN6NWJ3G'; // Your API key
        this.useRealAPI = true; // Enable real API calculations
        this.init();
    }

    async init() {
        await this.loadTheme();
        await this.loadStats();
        await this.loadActivities();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
        this.updateDisplay();
        this.startAnimations();
        await this.loadCurrentPageData();
        this.startLiveOffsetTracking();
    }

    async loadTheme() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['theme'], (result) => {
                this.theme = result.theme || 'light';
                this.applyTheme();
                resolve();
            });
        });
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.theme);
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.textContent = this.theme === 'light' ? '🌙' : '☀️';
        }
    }

    async loadStats() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['climateStats'], (result) => {
                if (result.climateStats) {
                    this.stats = { ...this.stats, ...result.climateStats };
                }
                this.updateDisplay();
                resolve();
            });
        });
    }

    async loadActivities() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['recentActivities'], (result) => {
                this.activities = result.recentActivities || [
                    { 
                        product: "Welcome to ClimateGuard!", 
                        impact: "0.0 kg CO₂", 
                        time: "Just now",
                        isLive: false 
                    }
                ];
                this.updateActivityList();
                resolve();
            });
        });
    }

    saveData() {
        chrome.storage.local.set({
            climateStats: this.stats,
            recentActivities: this.activities,
            theme: this.theme
        });
    }

    setupRealtimeUpdates() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Popup received message:', request);
            
            switch (request.action) {
                case 'offsetCompleted':
                    this.handleOffsetCompletion(request);
                    break;
                    
                case 'statsUpdated':
                    this.stats = request.stats;
                    this.updateDisplay();
                    break;
                    
                case 'liveOffsetDetected':
                    this.handleLiveOffset(request.data);
                    break;
                    
                case 'pageScanComplete':
                    this.handlePageScan(request.scanData);
                    break;
                    
                case 'autoOffsetStatus':
                    this.isAutoOffsetEnabled = request.enabled;
                    this.updateAutoOffsetToggle();
                    break;
            }
        });
    }

    handleLiveOffset(offsetData) {
        console.log('Live offset detected:', offsetData);
        
        // Add to real-time tracking
        this.realtimeOffsets.push({
            ...offsetData,
            id: Date.now() + Math.random(),
            timestamp: Date.now()
        });
        
        // Update stats
        this.stats.carbonSaved += offsetData.carbonAmount;
        this.stats.treesPlanted += offsetData.carbonAmount / 5;
        this.stats.offsetPurchases += 1;
        this.stats.moneyDonated += offsetData.carbonAmount * 0.1;
        
        // Add to activity feed with API indicator
        this.activities.unshift({
            product: `🌱 ${offsetData.productName || 'Purchase'} - ${offsetData.siteName}`,
            impact: `${offsetData.carbonAmount.toFixed(1)} kg CO₂`,
            time: "Just now",
            isLive: true,
            timestamp: Date.now(),
            usedAPI: offsetData.usedAPI || false
        });
        
        // Keep activities manageable
        if (this.activities.length > 20) {
            this.activities = this.activities.slice(0, 20);
        }
        
        this.updateDisplay();
        this.saveData();
        this.showLiveOffsetNotification(offsetData);
    }

    handleOffsetCompletion(request) {
        this.stats.carbonSaved += request.carbonAmount;
        this.stats.treesPlanted += request.carbonAmount / 5;
        this.stats.offsetPurchases += 1;
        this.stats.moneyDonated += request.carbonAmount * 0.1;
        
        this.activities.unshift({
            product: `Manual Offset - ${request.siteName}`,
            impact: `${request.carbonAmount.toFixed(1)} kg CO₂`,
            time: "Just now",
            isLive: true,
            usedAPI: request.usedAPI || false
        });
        
        this.updateDisplay();
        this.saveData();
        this.showPopupNotification(`✅ Offset ${request.carbonAmount.toFixed(1)} kg CO₂!`);
    }

    showLiveOffsetNotification(offsetData) {
        const notification = document.createElement('div');
        notification.className = 'live-offset-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-header">
                    <span class="notification-icon">⚡</span>
                    <strong>Auto-Offset Active!</strong>
                    ${offsetData.usedAPI ? '<span class="api-badge-small">API</span>' : ''}
                </div>
                <div class="notification-body">
                    <p>${offsetData.carbonAmount.toFixed(1)} kg CO₂ offset from ${offsetData.siteName}</p>
                    <div class="offset-details">
                        <span>🌳 +${(offsetData.carbonAmount/5).toFixed(1)} trees</span>
                        <span>💚 +$${(offsetData.carbonAmount*0.1).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 4000);
    }

    showPopupNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'offset-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">✅</span>
                <span class="notification-text">${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    startLiveOffsetTracking() {
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }
        
        this.liveUpdateInterval = setInterval(() => {
            this.checkForNewOffsets();
            this.updateLiveCounter();
        }, 2000); // Check every 2 seconds
        
        // Optimize performance when popup is not visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(this.liveUpdateInterval);
            } else {
                this.startLiveOffsetTracking();
            }
        });
    }

    async checkForNewOffsets() {
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'getRecentOffsets' }, resolve);
            });
            
            if (response && response.offsets) {
                response.offsets.forEach(offset => {
                    const existingOffset = this.realtimeOffsets.find(
                        o => o.id === offset.id
                    );
                    
                    if (!existingOffset) {
                        this.handleLiveOffset(offset);
                    }
                });
            }
        } catch (error) {
            console.log('Error checking for new offsets:', error);
        }
    }

    updateLiveCounter() {
        const counter = document.getElementById('liveOffsetCounter');
        if (!counter) return;
        
        const recentOffsets = this.realtimeOffsets.filter(
            offset => Date.now() - offset.timestamp < 300000 // 5 minutes
        );
        
        if (recentOffsets.length > 0) {
            const totalCarbon = recentOffsets.reduce((sum, offset) => sum + offset.carbonAmount, 0);
            const apiOffsets = recentOffsets.filter(offset => offset.usedAPI).length;
            
            counter.innerHTML = `
                <div class="live-counter">
                    <span class="counter-icon">⚡</span>
                    <span class="counter-text">
                        ${recentOffsets.length} offsets (${totalCarbon.toFixed(1)} kg)
                    </span>
                    ${apiOffsets > 0 ? `<span class="api-count">${apiOffsets} via API</span>` : ''}
                </div>
            `;
            counter.style.display = 'block';
        } else {
            counter.style.display = 'none';
        }
    }

    handlePageScan(scanData) {
        this.currentPageData = scanData;
        this.updateLiveCarbonDisplay();
        this.showScanFeedback(scanData);
    }

    showScanFeedback(scanData) {
        const scanBtn = document.getElementById('scanPage');
        if (scanBtn) {
            const originalText = scanBtn.innerHTML;
            
            if (scanData.hasShoppingContent) {
                scanBtn.innerHTML = '✅ Shopping Detected';
                scanBtn.style.background = 'var(--accent-green)';
            } else {
                scanBtn.innerHTML = '❌ No Shopping';
                scanBtn.style.background = 'var(--accent-orange)';
            }
            
            setTimeout(() => {
                scanBtn.innerHTML = originalText;
                scanBtn.style.background = '';
            }, 2000);
        }
    }

    async loadCurrentPageData() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab.url.startsWith('http')) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: scanCurrentPageContent
                });
                
                if (results && results[0]) {
                    this.currentPageData = results[0].result;
                    this.updateLiveCarbonDisplay();
                }
            }
        } catch (error) {
            console.log('Cannot access page data:', error);
            this.showFallbackCarbonDisplay();
        }
    }

    async updateLiveCarbonDisplay() {
        const liveSection = document.getElementById('liveCarbonSection');
        if (!liveSection) return;

        const counterHTML = `
            <div id="liveOffsetCounter" class="live-offset-counter" style="display: none;"></div>
        `;
        
        if (this.currentPageData && this.currentPageData.hasShoppingContent) {
            // Show loading state while calculating with API
            liveSection.innerHTML = `
                ${counterHTML}
                <div class="live-carbon-alert active">
                    <div class="live-header">
                        <span class="live-icon">🌍</span>
                        <strong>Calculating Carbon...</strong>
                    </div>
                    <div class="live-details">
                        <p>Analyzing products on <strong>${this.formatSiteName(this.currentPageData.siteName)}</strong></p>
                        <div class="loading-spinner"></div>
                        <div class="api-status">
                            <small>Using Climatiq API for accurate carbon calculation</small>
                        </div>
                    </div>
                </div>
            `;
            
            try {
                const carbonAmount = await this.calculateCarbonFromPageData(this.currentPageData);
                const siteName = this.formatSiteName(this.currentPageData.siteName);
                
                this.showCarbonResult(liveSection, counterHTML, carbonAmount, siteName, true);
                
            } catch (error) {
                console.error('API calculation failed:', error);
                // Fallback to estimation
                const carbonAmount = this.calculateWithEstimation(this.currentPageData);
                const siteName = this.formatSiteName(this.currentPageData.siteName);
                this.showCarbonResult(liveSection, counterHTML, carbonAmount, siteName, false);
            }
            
        } else {
            liveSection.innerHTML = `
                ${counterHTML}
                <div class="live-carbon-alert idle">
                    <div class="live-header">
                        <span class="live-icon">🔍</span>
                        <strong>Live Carbon Scanner</strong>
                    </div>
                    <div class="live-details">
                        <p>Visit a shopping site to analyze carbon footprint</p>
                        <div class="api-info">
                            <small>Powered by Climatiq API for accurate calculations</small>
                        </div>
                    </div>
                    <div class="scan-actions">
                        <button class="btn-scan-now" id="scanNowBtn">
                            🔍 Scan Current Page
                        </button>
                    </div>
                </div>
            `;

            const scanNowBtn = document.getElementById('scanNowBtn');
            if (scanNowBtn) {
                scanNowBtn.addEventListener('click', () => {
                    this.scanCurrentPage();
                });
            }
        }
        
        this.updateLiveCounter();
    }

    async calculateCarbonFromPageData(pageData) {
        if (!pageData.products || pageData.products.length === 0) {
            return this.getDefaultCarbonEstimate(pageData.siteName);
        }
        
        if (this.useRealAPI) {
            return await this.calculateWithClimatiqAPI(pageData);
        } else {
            return this.calculateWithEstimation(pageData);
        }
    }

    async calculateWithClimatiqAPI(pageData) {
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'calculateCarbon',
                    pageData: pageData
                }, resolve);
            });
            
            if (response && response.carbonAmount) {
                return response.carbonAmount;
            } else {
                throw new Error('API response invalid');
            }
        } catch (error) {
            console.error('Climatiq API error:', error);
            throw error; // Re-throw to trigger fallback
        }
    }

    calculateWithEstimation(pageData) {
        let totalCarbon = 0;
        let productCount = 0;
        
        pageData.products.forEach(product => {
            const carbon = this.estimateCarbonFromProduct(product, pageData.siteName);
            totalCarbon += carbon;
            productCount++;
        });
        
        return productCount > 0 ? Math.max(totalCarbon / productCount, 5) : 10;
    }

    showCarbonResult(liveSection, counterHTML, carbonAmount, siteName, usedAPI = false) {
        liveSection.innerHTML = `
            ${counterHTML}
            <div class="live-carbon-alert active">
                <div class="live-header">
                    <span class="live-icon">🛒</span>
                    <strong>Shopping Detected</strong>
                    ${usedAPI ? '<span class="api-badge">🔬 API</span>' : '<span class="fallback-badge">📊 Estimate</span>'}
                </div>
                <div class="live-details">
                    <p>Currently browsing <strong>${siteName}</strong></p>
                    <div class="carbon-estimate">
                        <span class="estimate-label">Carbon Footprint:</span>
                        <span class="estimate-value">${carbonAmount.toFixed(1)} kg CO₂</span>
                    </div>
                    <div class="carbon-source">
                        <small>${usedAPI ? 'Accurate calculation via Climatiq API' : 'Estimated carbon footprint'}</small>
                    </div>
                    <div class="auto-offset-status">
                        ${this.isAutoOffsetEnabled ? 
                            '<span class="status-badge active">⚡ Auto-Offset Enabled</span>' : 
                            '<span class="status-badge inactive">⏸️ Auto-Offset Paused</span>'
                        }
                    </div>
                    <div class="live-actions">
                        <button class="btn-live-offset" id="liveOffsetBtn">
                            🌱 Offset ${carbonAmount.toFixed(1)} kg CO₂
                        </button>
                        <button class="btn-auto-offset" id="autoOffsetBtn">
                            ${this.isAutoOffsetEnabled ? '⏸️ Disable Auto-Offset' : '⚡ Enable Auto-Offset'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.setupLiveCarbonButtons(carbonAmount, siteName, usedAPI);
    }

    setupLiveCarbonButtons(carbonAmount, siteName, usedAPI = false) {
        const liveOffsetBtn = document.getElementById('liveOffsetBtn');
        if (liveOffsetBtn) {
            liveOffsetBtn.addEventListener('click', () => {
                this.triggerManualOffset(carbonAmount, siteName, usedAPI);
            });
        }

        const autoOffsetBtn = document.getElementById('autoOffsetBtn');
        if (autoOffsetBtn) {
            autoOffsetBtn.addEventListener('click', () => {
                this.toggleAutoOffsetForSite(siteName);
            });
        }
    }

    showFallbackCarbonDisplay() {
        const liveSection = document.getElementById('liveCarbonSection');
        if (liveSection) {
            liveSection.innerHTML = `
                <div class="live-carbon-alert error">
                    <div class="live-header">
                        <span class="live-icon">⚠️</span>
                        <strong>Scanner Unavailable</strong>
                    </div>
                    <p>Cannot scan this page. Try a shopping website.</p>
                </div>
            `;
        }
    }

    formatSiteName(hostname) {
        return hostname.replace('www.', '').split('.')[0];
    }

    estimateCarbonFromProduct(productText, siteName) {
        const text = productText.toLowerCase();
        
        // Electronics (highest carbon)
        if (text.match(/(iphone|samsung|phone|smartphone|mobile)/)) return 60 + Math.random() * 40;
        if (text.match(/(laptop|macbook|computer|notebook)/)) return 200 + Math.random() * 100;
        if (text.match(/(tablet|ipad|surface)/)) return 80 + Math.random() * 40;
        if (text.match(/(tv|television|monitor|display)/)) return 120 + Math.random() * 80;
        
        // Clothing & Fashion
        if (text.match(/(shirt|tshirt|t-shirt)/)) return 8 + Math.random() * 6;
        if (text.match(/(jeans|pants|trousers)/)) return 15 + Math.random() * 10;
        if (text.match(/(shoes|sneakers|footwear)/)) return 12 + Math.random() * 8;
        if (text.match(/(jacket|coat|hoodie)/)) return 20 + Math.random() * 15;
        
        // Home & Furniture
        if (text.match(/(chair|sofa|couch)/)) return 30 + Math.random() * 20;
        if (text.match(/(table|desk)/)) return 25 + Math.random() * 15;
        if (text.match(/(bed|mattress)/)) return 40 + Math.random() * 30;
        
        // Other categories
        if (text.match(/(book|novel|magazine)/)) return 2 + Math.random() * 3;
        if (text.match(/(food|grocery|snack)/)) return 1 + Math.random() * 2;
        
        return this.getDefaultCarbonEstimate(siteName);
    }

    getDefaultCarbonEstimate(siteName) {
        const defaults = {
            'amazon': 25,
            'ebay': 20,
            'walmart': 15,
            'target': 12,
            'bestbuy': 45,
            'apple': 80,
            'default': 10
        };
        
        for (const [site, carbon] of Object.entries(defaults)) {
            if (siteName.includes(site)) {
                return carbon + Math.random() * 20;
            }
        }
        
        return defaults.default;
    }

    triggerManualOffset(carbonAmount, siteName, usedAPI = false) {
        // Update stats
        this.stats.carbonSaved += carbonAmount;
        this.stats.treesPlanted += carbonAmount / 5;
        this.stats.offsetPurchases += 1;
        this.stats.moneyDonated += carbonAmount * 0.1;
        
        // Add to activities
        this.activities.unshift({
            product: `Manual Offset - ${siteName}`,
            impact: `${carbonAmount.toFixed(1)} kg CO₂`,
            time: "Just now",
            isLive: true,
            timestamp: Date.now(),
            usedAPI: usedAPI
        });
        
        this.updateDisplay();
        this.saveData();
        
        // Send to content script for confirmation
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'showOffsetConfirmation',
                    carbonAmount: carbonAmount,
                    type: 'manual'
                });
            }
        });
        
        this.showOffsetSuccess(carbonAmount);
        this.showPopupNotification(`🌱 Offset ${carbonAmount.toFixed(1)} kg CO₂!`);
    }

    toggleAutoOffsetForSite(siteName) {
        this.isAutoOffsetEnabled = !this.isAutoOffsetEnabled;
        
        chrome.storage.local.set({ 
            autoOffsetEnabled: this.isAutoOffsetEnabled 
        });
        
        // Send to background and content scripts
        chrome.runtime.sendMessage({
            action: 'setAutoOffset',
            enabled: this.isAutoOffsetEnabled
        });
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'setAutoOffset',
                    enabled: this.isAutoOffsetEnabled
                });
            }
        });
        
        const message = this.isAutoOffsetEnabled ? 
            `⚡ Auto-Offset enabled for ${siteName}` : 
            `⏸️ Auto-Offset disabled`;
            
        this.showPopupNotification(message);
        this.updateLiveCarbonDisplay();
    }

    showOffsetSuccess(carbonAmount) {
        const liveSection = document.getElementById('liveCarbonSection');
        if (liveSection) {
            liveSection.innerHTML = `
                <div class="live-carbon-alert success">
                    <div class="live-header">
                        <span class="live-icon">✅</span>
                        <strong>Offset Successful!</strong>
                    </div>
                    <div class="live-details">
                        <p>${carbonAmount.toFixed(1)} kg CO₂ has been offset</p>
                        <div class="success-stats">
                            <span>🌳 +${(carbonAmount/5).toFixed(1)} trees</span>
                            <span>💚 +$${(carbonAmount*0.1).toFixed(2)} donated</span>
                        </div>
                        <div class="impact-message">
                            <small>Equivalent to ${(carbonAmount/0.16).toFixed(0)} miles of driving</small>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    updateDisplay() {
        // Update main stats
        this.updateStatElement('carbonSaved', this.stats.carbonSaved.toFixed(1));
        this.updateStatElement('treesPlanted', this.stats.treesPlanted.toFixed(1));
        this.updateStatElement('offsetPurchases', this.stats.offsetPurchases);
        this.updateStatElement('moneyDonated', `$${this.stats.moneyDonated.toFixed(2)}`);

        // Update activities
        this.updateActivityList();
        
        // Animate tree growth
        this.animateTreeGrowth();
        
        // Update live counter
        this.updateLiveCounter();
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    updateActivityList() {
        const activityList = document.getElementById('activityList');
        if (activityList) {
            // Sort activities by timestamp (newest first)
            const sortedActivities = [...this.activities].sort((a, b) => 
                (b.timestamp || 0) - (a.timestamp || 0)
            ).slice(0, 5); // Show only 5 most recent
            
            activityList.innerHTML = sortedActivities.map(activity => `
                <div class="activity-item ${activity.isLive ? 'activity-live' : ''}">
                    <div class="activity-content">
                        <span class="activity-product">${activity.product}</span>
                        <div class="activity-details">
                            <span class="activity-impact">+${activity.impact}</span>
                            <span class="activity-time">${activity.time}</span>
                            ${activity.usedAPI ? '<span class="api-indicator" title="Calculated via API">🔬</span>' : ''}
                        </div>
                    </div>
                    ${activity.isLive ? '<div class="live-indicator"></div>' : ''}
                </div>
            `).join('');
        }
    }

    animateTreeGrowth() {
        const tree = document.getElementById('animatedTree');
        if (tree) {
            const growth = Math.min(this.stats.treesPlanted / 20, 1);
            tree.style.transform = `scale(${0.8 + growth * 0.4})`;
        }
    }

    setupEventListeners() {
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Auto-offset toggle
        const autoOffset = document.getElementById('autoOffset');
        if (autoOffset) {
            this.updateAutoOffsetToggle();
            autoOffset.addEventListener('change', (e) => {
                this.toggleGlobalAutoOffset(e.target.checked);
            });
        }

        // Scan page button
        const scanPage = document.getElementById('scanPage');
        if (scanPage) {
            scanPage.addEventListener('click', () => {
                this.scanCurrentPage();
            });
        }

        // View history button
        const viewHistory = document.getElementById('viewHistory');
        if (viewHistory) {
            viewHistory.addEventListener('click', () => {
                this.viewHistory();
            });
        }

        // Real-time updates when tab changes
        chrome.tabs.onActivated.addListener(() => {
            setTimeout(() => this.loadCurrentPageData(), 300);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.active) {
                setTimeout(() => this.loadCurrentPageData(), 300);
            }
        });
    }

    updateAutoOffsetToggle() {
        const autoOffset = document.getElementById('autoOffset');
        if (autoOffset) {
            chrome.storage.local.get(['autoOffsetEnabled'], (result) => {
                this.isAutoOffsetEnabled = result.autoOffsetEnabled || false;
                autoOffset.checked = this.isAutoOffsetEnabled;
            });
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.saveData();
    }

    toggleGlobalAutoOffset(enabled) {
        this.isAutoOffsetEnabled = enabled;
        chrome.storage.local.set({ autoOffsetEnabled: enabled });
        
        chrome.runtime.sendMessage({
            action: 'setAutoOffset',
            enabled: enabled
        });
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'setAutoOffset',
                    enabled: enabled
                });
            }
        });
        
        this.showPopupNotification(
            enabled ? '⚡ Auto-Offset Enabled Globally' : '⏸️ Auto-Offset Disabled'
        );
    }

    scanCurrentPage() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'scanPage'
                });
                
                this.showScanningFeedback();
            }
        });
    }

    showScanningFeedback() {
        const scanBtn = document.getElementById('scanPage');
        if (scanBtn) {
            const originalText = scanBtn.innerHTML;
            
            scanBtn.innerHTML = '🔍 Scanning...';
            scanBtn.disabled = true;
            
            setTimeout(() => {
                scanBtn.innerHTML = originalText;
                scanBtn.disabled = false;
                this.loadCurrentPageData();
            }, 1500);
        }
    }

    viewHistory() {
        const historyHTML = `
            <div class="history-modal">
                <div class="history-header">
                    <h3>📊 Your Climate Impact History</h3>
                    <button class="close-history">✕</button>
                </div>
                <div class="history-stats">
                    <div class="history-stat">
                        <span class="stat-value">${this.stats.carbonSaved.toFixed(1)} kg</span>
                        <span class="stat-label">Total CO₂ Offset</span>
                    </div>
                    <div class="history-stat">
                        <span class="stat-value">${this.stats.treesPlanted.toFixed(1)}</span>
                        <span class="stat-label">Trees Equivalent</span>
                    </div>
                    <div class="history-stat">
                        <span class="stat-value">$${this.stats.moneyDonated.toFixed(2)}</span>
                        <span class="stat-label">Total Donated</span>
                    </div>
                </div>
                <div class="history-activities">
                    ${this.activities.map(activity => `
                        <div class="history-activity ${activity.isLive ? 'history-live' : ''}">
                            <div class="activity-main">
                                <span class="activity-product">${activity.product}</span>
                                <span class="activity-impact">${activity.impact}</span>
                                ${activity.usedAPI ? '<span class="api-indicator" title="Calculated via API">🔬</span>' : ''}
                            </div>
                            <span class="activity-time">${activity.time}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        const modal = document.createElement('div');
        modal.className = 'climate-modal';
        modal.innerHTML = historyHTML;
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('.close-history');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    startAnimations() {
        this.createFloatingParticles();
        this.startLiveDataUpdates();
        this.injectLiveStyles();
    }

    startLiveDataUpdates() {
        // Update page data every 15 seconds
        setInterval(() => {
            this.loadCurrentPageData();
        }, 15000);
    }

    injectLiveStyles() {
        const styles = `
            .live-offset-notification {
                position: fixed;
                top: 10px;
                right: 10px;
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 600;
                z-index: 10000;
                box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
                border: 2px solid rgba(255,255,255,0.2);
                max-width: 300px;
                animation: slideInRight 0.3s ease-out;
            }
            
            .offset-notification {
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: #10b981;
                color: white;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideInDown 0.3s ease-out;
            }
            
            .live-offset-counter {
                background: linear-gradient(135deg, #fef3c7, #f59e0b);
                color: #92400e;
                padding: 6px 10px;
                border-radius: 6px;
                margin-bottom: 8px;
                font-size: 11px;
                font-weight: 600;
                text-align: center;
                border: 1px solid rgba(245, 158, 11, 0.3);
            }
            
            .live-counter {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .counter-icon {
                animation: bounce 1s infinite;
            }
            
            .api-count {
                font-size: 9px;
                background: rgba(59, 130, 246, 0.1);
                color: #3b82f6;
                padding: 2px 6px;
                border-radius: 8px;
                margin-left: 4px;
            }
            
            .activity-live {
                border-left: 3px solid #10b981;
                background: rgba(16, 185, 129, 0.05);
            }
            
            .live-indicator {
                width: 6px;
                height: 6px;
                background: #10b981;
                border-radius: 50%;
                animation: pulse 1.5s infinite;
                margin-left: 8px;
            }
            
            .api-badge, .fallback-badge, .api-badge-small {
                padding: 2px 6px;
                border-radius: 8px;
                font-size: 9px;
                font-weight: 600;
                margin-left: 8px;
            }
            
            .api-badge, .api-badge-small {
                background: rgba(59, 130, 246, 0.1);
                color: #3b82f6;
                border: 1px solid rgba(59, 130, 246, 0.3);
            }
            
            .fallback-badge {
                background: rgba(107, 114, 128, 0.1);
                color: #6b7280;
                border: 1px solid rgba(107, 114, 128, 0.3);
            }
            
            .api-badge-small {
                font-size: 8px;
                margin-left: 4px;
            }
            
            .status-badge {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
            }
            
            .status-badge.active {
                background: rgba(16, 185, 129, 0.1);
                color: #059669;
                border: 1px solid rgba(16, 185, 129, 0.3);
            }
            
            .status-badge.inactive {
                background: rgba(107, 114, 128, 0.1);
                color: #6b7280;
                border: 1px solid rgba(107, 114, 128, 0.3);
            }
            
            .api-status, .api-info, .carbon-source {
                margin-top: 8px;
            }
            
            .api-status small, .api-info small, .carbon-source small {
                color: #6b7280;
                font-size: 10px;
            }
            
            .api-indicator {
                margin-left: 4px;
                font-size: 10px;
                color: #3b82f6;
            }
            
            .loading-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid #f3f4f6;
                border-top: 2px solid #10b981;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 8px auto;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideInDown {
                from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-1px); }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        const styleSheet = document.createElement("style");
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    createFloatingParticles() {
        const container = document.querySelector('.carbon-visual');
        if (container) {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => this.createParticle(container), i * 1000);
            }
        }
    }

    createParticle(container) {
        const particle = document.createElement('div');
        particle.className = 'floating-particle';
        particle.style.cssText = `
            position: absolute;
            width: 3px;
            height: 3px;
            background: var(--accent-green);
            border-radius: 50%;
            opacity: 0;
            left: ${25 + Math.random() * 30}px;
            top: 50px;
        `;
        container.appendChild(particle);

        particle.animate([
            { transform: 'translateY(0px)', opacity: 0 },
            { transform: 'translateY(-8px)', opacity: 0.7 },
            { transform: 'translateY(-15px)', opacity: 0 }
        ], {
            duration: 2000,
            iterations: Infinity
        });
    }
}

// Content script function to scan page content
function scanCurrentPageContent() {
    try {
        const hostname = window.location.hostname;
        const pageText = document.body.innerText.toLowerCase();
        
        // Enhanced shopping site detection
        const shoppingSites = [
            'amazon', 'ebay', 'walmart', 'target', 'bestbuy', 'etsy', 
            'aliexpress', 'shopify', 'apple', 'nike', 'adidas', 'macys',
            'costco', 'home depot', 'lowes', 'wayfair', 'overstock'
        ];
        
        const isShoppingSite = shoppingSites.some(site => hostname.includes(site));
        
        // Enhanced shopping indicators
        const hasPrices = document.querySelectorAll(
            '[class*="price"], [class*="cost"], .a-price, .price, [data-price], [itemprop="price"]'
        ).length > 0;
        
        const hasProducts = document.querySelectorAll(
            '[class*="product"], [class*="item"], .product, .item, [data-product], [itemtype*="Product"]'
        ).length > 0;
        
        const hasCart = document.querySelectorAll(
            '[class*="cart"], [class*="basket"], .cart, .basket, [aria-label*="cart"], [href*="cart"]'
        ).length > 0;
        
        // Enhanced product extraction
        const products = Array.from(document.querySelectorAll(
            'h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="product"], [itemprop="name"]'
        ))
            .map(el => el.textContent.trim())
            .filter(text => text.length > 0 && text.length < 150)
            .slice(0, 15);
        
        return {
            siteName: hostname,
            hasShoppingContent: isShoppingSite || hasPrices || hasProducts || hasCart,
            products: products,
            priceCount: document.querySelectorAll('[class*="price"], [class*="cost"]').length,
            productCount: document.querySelectorAll('[class*="product"], [class*="item"]').length,
            hasCartButton: hasCart,
            timestamp: Date.now()
        };
    } catch (error) {
        return {
            siteName: window.location.hostname,
            hasShoppingContent: false,
            products: [],
            priceCount: 0,
            productCount: 0,
            hasCartButton: false,
            timestamp: Date.now(),
            error: error.message
        };
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    new ClimateGuard();
});