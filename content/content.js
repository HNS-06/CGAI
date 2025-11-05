// Content script for ClimateGuard AI
class ClimateGuardContent {
    constructor() {
        this.isAutoOffsetEnabled = false;
        this.currentPageData = null;
        this.useRealAPI = true; // Enable API calculations
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupMessageListener();
        this.scanPage();
        this.setupMutationObserver();
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoOffsetEnabled'], (result) => {
                this.isAutoOffsetEnabled = result.autoOffsetEnabled || false;
                resolve();
            });
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'scanPage':
                    this.scanPage();
                    break;
                    
                case 'showOffsetConfirmation':
                    this.showOffsetConfirmation(request.carbonAmount, request.type);
                    break;
                    
                case 'setAutoOffset':
                case 'toggleAutoOffset':
                    this.setAutoOffset(request.enabled);
                    break;
                    
                case 'getPageData':
                    sendResponse(this.currentPageData);
                    break;
            }
        });
    }

    setupMutationObserver() {
        // Watch for dynamic content changes
        const observer = new MutationObserver((mutations) => {
            let shouldRescan = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (this.isShoppingElement(node)) {
                                shouldRescan = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldRescan) {
                setTimeout(() => this.scanPage(), 500);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    isShoppingElement(element) {
        const text = element.textContent.toLowerCase();
        const classes = element.className.toLowerCase();
        
        return (
            text.includes('add to cart') ||
            text.includes('buy now') ||
            text.includes('$') ||
            classes.includes('price') ||
            classes.includes('product') ||
            classes.includes('cart') ||
            classes.includes('checkout')
        );
    }

    async scanPage() {
        const pageData = this.analyzePageContent();
        this.currentPageData = pageData;
        
        if (pageData.hasShoppingContent) {
            await this.showCarbonOverlay(pageData);
            
            // Send to popup
            chrome.runtime.sendMessage({
                action: 'pageScanComplete',
                scanData: pageData
            });
            
            // If auto-offset is enabled, prepare for offset
            if (this.isAutoOffsetEnabled) {
                this.prepareAutoOffset(pageData);
            }
        } else {
            this.removeCarbonOverlay();
        }
        
        return pageData;
    }

    analyzePageContent() {
        const hostname = window.location.hostname;
        const pageText = document.body.innerText.toLowerCase();
        
        // Shopping site detection
        const shoppingSites = [
            'amazon', 'ebay', 'walmart', 'target', 'bestbuy', 'etsy',
            'aliexpress', 'shopify', 'apple', 'nike', 'adidas'
        ];
        
        const isShoppingSite = shoppingSites.some(site => hostname.includes(site));
        
        // Shopping indicators
        const hasPrices = this.hasPrices();
        const hasProducts = this.hasProducts();
        const hasCart = this.hasCart();
        const hasCheckout = pageText.includes('checkout') || pageText.includes('payment');
        
        // Extract product information
        const products = this.extractProducts();
        const prices = this.extractPrices();
        
        return {
            siteName: hostname,
            hasShoppingContent: isShoppingSite || hasPrices || hasProducts || hasCart,
            isCheckoutPage: hasCheckout,
            products: products,
            prices: prices,
            productCount: products.length,
            priceCount: prices.length,
            hasCartButton: hasCart,
            timestamp: Date.now()
        };
    }

    hasPrices() {
        const priceSelectors = [
            '[class*="price"]',
            '[class*="cost"]',
            '.a-price',
            '.price',
            '[data-price]',
            '[itemprop="price"]',
            '.product-price',
            '.sale-price'
        ];
        
        return priceSelectors.some(selector => 
            document.querySelector(selector) !== null
        );
    }

    hasProducts() {
        const productSelectors = [
            '[class*="product"]',
            '[class*="item"]',
            '.product',
            '.item',
            '[data-product]',
            '[itemtype*="Product"]',
            '.product-card',
            '.item-card'
        ];
        
        return productSelectors.some(selector => 
            document.querySelector(selector) !== null
        );
    }

    hasCart() {
        const cartSelectors = [
            '[class*="cart"]',
            '[class*="basket"]',
            '.cart',
            '.basket',
            '[aria-label*="cart"]',
            '[href*="cart"]',
            '#add-to-cart',
            '.add-to-cart'
        ];
        
        return cartSelectors.some(selector => 
            document.querySelector(selector) !== null
        );
    }

    extractProducts() {
        const productElements = [
            'h1', 'h2', 'h3',
            '[class*="title"]',
            '[class*="name"]',
            '[class*="product"]',
            '[itemprop="name"]',
            '.product-title',
            '.item-name'
        ];
        
        const products = new Set();
        
        productElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const text = el.textContent.trim();
                if (text && text.length > 0 && text.length < 200) {
                    // Filter out navigation and common non-product text
                    if (!this.isNonProductText(text)) {
                        products.add(text);
                    }
                }
            });
        });
        
        return Array.from(products).slice(0, 10);
    }

    isNonProductText(text) {
        const nonProductTerms = [
            'home', 'menu', 'search', 'login', 'sign in', 'account',
            'cart', 'checkout', 'welcome', 'categories', 'filter',
            'sort by', 'price', 'contact', 'about', 'help'
        ];
        
        const lowerText = text.toLowerCase();
        return nonProductTerms.some(term => lowerText.includes(term));
    }

    extractPrices() {
        const priceElements = document.querySelectorAll([
            '[class*="price"]',
            '[class*="cost"]',
            '.a-price',
            '.price',
            '[data-price]',
            '[itemprop="price"]'
        ].join(','));
        
        const prices = [];
        const priceRegex = /\$?(\d+(?:\.\d{2})?)/;
        
        priceElements.forEach(el => {
            const text = el.textContent.trim();
            const match = text.match(priceRegex);
            if (match) {
                const price = parseFloat(match[1]);
                if (price > 0 && price < 100000) {
                    prices.push(price);
                }
            }
        });
        
        return prices;
    }

    async showCarbonOverlay(pageData) {
        this.removeCarbonOverlay();
        
        let carbonAmount;
        let usedAPI = false;
        
        try {
            // Try to calculate with API first
            carbonAmount = await this.calculateCarbonWithAPI(pageData);
            usedAPI = true;
        } catch (error) {
            console.warn('API calculation failed, using estimation:', error);
            // Fallback to estimation
            carbonAmount = this.calculateCarbonEstimate(pageData);
            usedAPI = false;
        }
        
        const overlay = this.createCarbonOverlay(carbonAmount, pageData, usedAPI);
        document.body.appendChild(overlay);
        
        // Auto-show on product pages
        if (pageData.products.length > 0 && pageData.hasCartButton) {
            setTimeout(() => {
                overlay.classList.add('visible');
            }, 1000);
        }
    }

    async calculateCarbonWithAPI(pageData) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'calculateCarbon',
                pageData: pageData
            }, (response) => {
                if (response && response.carbonAmount) {
                    resolve(response.carbonAmount);
                } else {
                    reject(new Error('API calculation failed'));
                }
            });
        });
    }

    calculateCarbonEstimate(pageData) {
        let totalCarbon = 0;
        
        if (pageData.products.length > 0) {
            pageData.products.forEach(product => {
                totalCarbon += this.estimateProductCarbon(product);
            });
            // Average for multiple products
            totalCarbon = totalCarbon / pageData.products.length;
        } else {
            // Default based on site
            totalCarbon = this.getSiteDefaultCarbon(pageData.siteName);
        }
        
        return Math.max(totalCarbon, 5); // Minimum 5kg
    }

    estimateProductCarbon(productText) {
        const text = productText.toLowerCase();
        
        // Electronics
        if (text.match(/(iphone|samsung|phone|smartphone)/)) return 60 + Math.random() * 40;
        if (text.match(/(laptop|macbook|computer)/)) return 200 + Math.random() * 100;
        if (text.match(/(tablet|ipad)/)) return 80 + Math.random() * 40;
        if (text.match(/(tv|television|monitor)/)) return 120 + Math.random() * 80;
        if (text.match(/(camera|dslr|mirrorless)/)) return 50 + Math.random() * 30;
        
        // Clothing
        if (text.match(/(shirt|tshirt|t-shirt)/)) return 8 + Math.random() * 6;
        if (text.match(/(jeans|pants|trousers)/)) return 15 + Math.random() * 10;
        if (text.match(/(shoes|sneakers|footwear)/)) return 12 + Math.random() * 8;
        if (text.match(/(jacket|coat|hoodie)/)) return 20 + Math.random() * 15;
        if (text.match(/(dress|skirt|blouse)/)) return 10 + Math.random() * 8;
        
        // Home & Furniture
        if (text.match(/(chair|sofa|couch)/)) return 30 + Math.random() * 20;
        if (text.match(/(table|desk)/)) return 25 + Math.random() * 15;
        if (text.match(/(bed|mattress)/)) return 40 + Math.random() * 30;
        
        // Other
        if (text.match(/(book|novel)/)) return 2 + Math.random() * 3;
        if (text.match(/(game|console|playstation|xbox)/)) return 15 + Math.random() * 10;
        
        return 10 + Math.random() * 15; // Default
    }

    getSiteDefaultCarbon(siteName) {
        const defaults = {
            'amazon': 25,
            'ebay': 20,
            'walmart': 15,
            'target': 12,
            'bestbuy': 45,
            'apple': 80,
            'nike': 15,
            'adidas': 12,
            'default': 10
        };
        
        for (const [site, carbon] of Object.entries(defaults)) {
            if (siteName.includes(site)) {
                return carbon;
            }
        }
        
        return defaults.default;
    }

createCarbonOverlay(carbonAmount, pageData, usedAPI = false) {
    const overlay = document.createElement('div');
    overlay.className = 'climateguard-overlay';
    overlay.innerHTML = `
        <div class="climateguard-card compact">  <!-- Added 'compact' class -->
            <div class="climateguard-header">
                <span class="climateguard-icon">🌍</span>
                <h3>Carbon Impact</h3>
                <span class="calculation-method">${usedAPI ? '🔬 API' : '📊 Est'}</span>
                <button class="climateguard-close">&times;</button>
            </div>
            <div class="climateguard-content">
                <div class="carbon-amount">${carbonAmount.toFixed(1)} kg CO₂</div>
                <p class="carbon-equivalent">
                    ${(carbonAmount / 0.16).toFixed(0)} miles driven
                </p>
                <div class="calculation-info">
                    <small>${usedAPI ? 'Climatiq API' : 'Estimated'}</small>
                </div>
            </div>
            <div class="climateguard-actions">
                ${this.isAutoOffsetEnabled ? `
                    <div class="auto-offset-active">
                        <span class="auto-offset-icon">⚡</span>
                        Auto-Offset Active
                    </div>
                ` : `
                    <button class="climateguard-btn climateguard-btn-primary" id="offsetNowBtn">
                        🌱 Offset ${carbonAmount.toFixed(1)} kg
                    </button>
                    <button class="climateguard-btn climateguard-btn-secondary" id="enableAutoOffsetBtn">
                        ⚡ Enable Auto
                    </button>
                `}
            </div>
            <div class="climateguard-footer">
                <small>ClimateGuard AI</small>
            </div>
        </div>
    `;
        
        // Add event listeners
        const closeBtn = overlay.querySelector('.climateguard-close');
        closeBtn.addEventListener('click', () => {
            overlay.remove();
        });
        
        if (!this.isAutoOffsetEnabled) {
            const offsetBtn = overlay.querySelector('#offsetNowBtn');
            offsetBtn.addEventListener('click', () => {
                this.triggerManualOffset(carbonAmount, pageData, usedAPI);
                overlay.remove();
            });
            
            const autoOffsetBtn = overlay.querySelector('#enableAutoOffsetBtn');
            autoOffsetBtn.addEventListener('click', () => {
                this.enableAutoOffset();
                overlay.remove();
            });
        }
        
        return overlay;
    }

    removeCarbonOverlay() {
        const existingOverlay = document.querySelector('.climateguard-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
    }

    triggerManualOffset(carbonAmount, pageData, usedAPI = false) {
        // Send to background script
        chrome.runtime.sendMessage({
            action: 'manualOffset',
            carbonAmount: carbonAmount,
            siteName: pageData.siteName,
            productName: pageData.products[0] || 'Unknown Product',
            timestamp: Date.now(),
            usedAPI: usedAPI
        });
        
        this.showOffsetConfirmation(carbonAmount, 'manual');
    }

    enableAutoOffset() {
        chrome.storage.local.set({ autoOffsetEnabled: true });
        this.isAutoOffsetEnabled = true;
        
        chrome.runtime.sendMessage({
            action: 'setAutoOffset',
            enabled: true
        });
        
        this.showAutoOffsetEnabled();
    }

    setAutoOffset(enabled) {
        this.isAutoOffsetEnabled = enabled;
        chrome.storage.local.set({ autoOffsetEnabled: enabled });
        
        if (this.currentPageData && this.currentPageData.hasShoppingContent) {
            this.showCarbonOverlay(this.currentPageData);
        }
    }

    showOffsetConfirmation(carbonAmount, type) {
        const confirmation = document.createElement('div');
        confirmation.className = 'climateguard-confirmation';
        confirmation.innerHTML = `
            <div class="climateguard-card success">
                <div class="climateguard-header">
                    <span class="climateguard-icon">✅</span>
                    <h3>Carbon Offset Complete!</h3>
                </div>
                <div class="climateguard-content">
                    <p>${carbonAmount.toFixed(1)} kg CO₂ will be automatically offset</p>
                    <div class="offset-details">
                        <span>🌳 +${(carbonAmount/5).toFixed(1)} trees planted</span>
                        <span>💚 +$${(carbonAmount*0.1).toFixed(2)} donated</span>
                    </div>
                </div>
                <div class="climateguard-footer">
                    <p>Thank you for being climate positive! 🌍</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(confirmation);
        
        setTimeout(() => {
            if (confirmation.parentNode) {
                confirmation.remove();
            }
        }, 5000);
    }

    showAutoOffsetEnabled() {
        const notification = document.createElement('div');
        notification.className = 'climateguard-notification';
        notification.innerHTML = `
            <div class="climateguard-card info">
                <div class="climateguard-content">
                    <span class="notification-icon">⚡</span>
                    <span>Auto-Offset enabled for future purchases</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    prepareAutoOffset(pageData) {
        // Watch for checkout actions
        this.watchForCheckout();
        
        // Monitor cart changes
        this.monitorCartChanges();
    }

    watchForCheckout() {
        const checkoutSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '[class*="checkout"]',
            '[class*="buy"]',
            '[class*="purchase"]',
            '#checkout',
            '.checkout',
            '#placeOrder',
            '.place-order'
        ];
        
        checkoutSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.addEventListener('click', (e) => {
                    if (this.isAutoOffsetEnabled && this.currentPageData) {
                        this.triggerAutoOffset();
                    }
                });
            });
        });
    }

    monitorCartChanges() {
        // Watch for add to cart actions
        const cartSelectors = [
            '[class*="add-to-cart"]',
            '#add-to-cart',
            '.add-to-cart',
            '[class*="addToCart"]'
        ];
        
        cartSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.addEventListener('click', (e) => {
                    setTimeout(() => {
                        this.scanPage();
                    }, 1000);
                });
            });
        });
    }

    async triggerAutoOffset() {
        if (!this.currentPageData) return;
        
        let carbonAmount;
        let usedAPI = false;
        
        try {
            carbonAmount = await this.calculateCarbonWithAPI(this.currentPageData);
            usedAPI = true;
        } catch (error) {
            carbonAmount = this.calculateCarbonEstimate(this.currentPageData);
            usedAPI = false;
        }
        
        chrome.runtime.sendMessage({
            action: 'autoOffset',
            carbonAmount: carbonAmount,
            siteName: this.currentPageData.siteName,
            productName: this.currentPageData.products[0] || 'Auto Purchase',
            timestamp: Date.now(),
            url: window.location.href,
            usedAPI: usedAPI
        });
        
        this.showOffsetConfirmation(carbonAmount, 'auto');
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ClimateGuardContent();
    });
} else {
    new ClimateGuardContent();
}