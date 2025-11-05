// Background script for ClimateGuard AI
class ClimateGuardBackground {
    constructor() {
        this.offsets = [];
        this.stats = {
            carbonSaved: 0,
            treesPlanted: 0,
            offsetPurchases: 0,
            moneyDonated: 0
        };
        this.climatiqApiKey = '0B0VTKY35D2HN0S42BMN6NWJ3G'; // Your API key
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupMessageListener();
        this.setupOffsetsCleanup();
    }

    async loadData() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'climateStats', 
                'recentOffsets',
                'autoOffsetEnabled'
            ], (result) => {
                if (result.climateStats) {
                    this.stats = { ...this.stats, ...result.climateStats };
                }
                if (result.recentOffsets) {
                    this.offsets = result.recentOffsets;
                }
                this.autoOffsetEnabled = result.autoOffsetEnabled || false; // FIXED: Removed backtick
                resolve();
            });
        });
    }

    saveData() {
        chrome.storage.local.set({
            climateStats: this.stats,
            recentOffsets: this.offsets
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Background received message:', request);
            
            switch (request.action) {
                case 'manualOffset':
                case 'autoOffset':
                    this.handleOffset(request);
                    sendResponse({ success: true });
                    break;
                    
                case 'getRecentOffsets':
                    sendResponse({ offsets: this.getRecentOffsets() });
                    break;
                    
                case 'setAutoOffset':
                    this.setAutoOffset(request.enabled);
                    sendResponse({ success: true });
                    break;
                    
                case 'getStats':
                    sendResponse({ stats: this.stats });
                    break;
                    
                case 'calculateCarbon':
                    // Handle API carbon calculation ASYNCHRONOUSLY
                    this.calculateCarbonWithAPI(request.pageData)
                        .then(carbonAmount => {
                            sendResponse({ 
                                success: true, 
                                carbonAmount: carbonAmount 
                            });
                        })
                        .catch(error => {
                            console.error('API calculation failed:', error);
                            sendResponse({ 
                                success: false, 
                                error: error.message,
                                carbonAmount: null 
                            });
                        });
                    return true; // IMPORTANT: Keep message channel open for async
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        });
    }

    async calculateCarbonWithAPI(pageData) {
        try {
            console.log('Calculating carbon with Climatiq API for:', pageData);
            
            if (!pageData || !pageData.products || pageData.products.length === 0) {
                throw new Error('No products found for carbon calculation');
            }
            
            const product = pageData.products[0];
            const price = this.extractPrice(pageData);
            const category = this.detectCategory(product);
            
            console.log('API calculation parameters:', { product, price, category });
            
            const emissionFactor = this.getEmissionFactor(category);
            
            const response = await fetch('https://beta3.api.climatiq.io/estimate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.climatiqApiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'ClimateGuard-AI/1.0'
                },
                body: JSON.stringify({
                    emission_factor: emissionFactor,
                    parameters: {
                        money: price,
                        money_unit: "usd"
                    }
                })
            });

            console.log('API response status:', response.status);
            
            if (!response.ok) {
                let errorText = 'Unknown error';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = `HTTP ${response.status}`;
                }
                throw new Error(`Climatiq API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('Climatiq API response data:', data);
            
            if (!data || typeof data.co2e !== 'number') {
                throw new Error('Invalid API response format');
            }
            
            // Convert to kg CO₂e
            const co2eKg = data.co2e * 1000; // Convert to kg
            
            console.log('Calculated carbon:', co2eKg, 'kg');
            
            return Math.max(co2eKg, 5); // Minimum 5kg
            
        } catch (error) {
            console.error('Climatiq API calculation failed:', error);
            throw error;
        }
    }

    extractPrice(pageData) {
        // Try to extract actual prices first
        if (pageData.prices && pageData.prices.length > 0) {
            const validPrice = pageData.prices.find(price => price > 0 && price < 10000);
            if (validPrice) {
                console.log('Using extracted price:', validPrice);
                return validPrice;
            }
        }
        
        // Fallback price estimates based on site
        const siteDefaults = {
            'amazon': 45,
            'ebay': 35,
            'walmart': 30,
            'target': 25,
            'bestbuy': 85,
            'apple': 120,
            'nike': 80,
            'adidas': 70,
            'default': 25
        };
        
        if (pageData.siteName) {
            for (const [site, price] of Object.entries(siteDefaults)) {
                if (pageData.siteName.includes(site)) {
                    console.log('Using default price for', site, ':', price);
                    return price;
                }
            }
        }
        
        console.log('Using default price:', siteDefaults.default);
        return siteDefaults.default;
    }

    detectCategory(productText) {
        if (!productText) return 'general';
        
        const text = productText.toLowerCase();
        
        // Electronics
        if (text.match(/(iphone|samsung|phone|smartphone|mobile|android)/)) return 'electronics';
        if (text.match(/(laptop|macbook|computer|notebook)/)) return 'electronics';
        if (text.match(/(tablet|ipad|surface)/)) return 'electronics';
        if (text.match(/(tv|television|monitor)/)) return 'electronics';
        if (text.match(/(camera|dslr|mirrorless)/)) return 'electronics';
        
        // Clothing
        if (text.match(/(shirt|tshirt|t-shirt)/)) return 'clothing';
        if (text.match(/(jeans|pants|trousers)/)) return 'clothing';
        if (text.match(/(shoes|sneakers|footwear)/)) return 'clothing';
        if (text.match(/(jacket|coat|hoodie)/)) return 'clothing';
        
        // Furniture
        if (text.match(/(chair|sofa|couch)/)) return 'furniture';
        if (text.match(/(table|desk)/)) return 'furniture';
        if (text.match(/(bed|mattress)/)) return 'furniture';
        
        return 'general';
    }

    getEmissionFactor(category) {
        const emissionFactors = {
            'electronics': {
                id: "consumer_goods-type_electronics",
                name: "Electronics"
            },
            'clothing': {
                id: "consumer_goods-type_textiles", 
                name: "Clothing and textiles"
            },
            'furniture': {
                id: "consumer_goods-type_wooden_furniture",
                name: "Wooden furniture"
            },
            'general': {
                id: "consumer_goods-type_other",
                name: "Other consumer goods"
            }
        };
        
        return emissionFactors[category] || emissionFactors.general;
    }

    handleOffset(offsetData) {
        const offset = {
            id: Date.now() + Math.random(),
            type: offsetData.action === 'autoOffset' ? 'auto' : 'manual',
            carbonAmount: offsetData.carbonAmount,
            siteName: offsetData.siteName,
            productName: offsetData.productName,
            timestamp: Date.now(),
            url: offsetData.url,
            usedAPI: offsetData.usedAPI || false
        };
        
        this.offsets.unshift(offset);
        
        // Update stats
        this.stats.carbonSaved += offset.carbonAmount;
        this.stats.treesPlanted += offset.carbonAmount / 5;
        this.stats.offsetPurchases += 1;
        this.stats.moneyDonated += offset.carbonAmount * 0.1;
        
        // Keep only recent offsets
        if (this.offsets.length > 100) {
            this.offsets = this.offsets.slice(0, 100);
        }
        
        this.saveData();
        this.broadcastOffset(offset);
        this.broadcastStatsUpdate();
    }

    broadcastOffset(offset) {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'liveOffsetDetected',
                    data: offset
                }).catch(() => {
                    // Tab might not have content script
                });
            });
        });
        
        chrome.runtime.sendMessage({
            action: 'offsetCompleted',
            ...offset
        }).catch(() => {
            // No popup open
        });
    }

    broadcastStatsUpdate() {
        chrome.runtime.sendMessage({
            action: 'statsUpdated',
            stats: this.stats
        }).catch(() => {
            // No listeners
        });
    }

    getRecentOffsets() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return this.offsets.filter(offset => offset.timestamp > fiveMinutesAgo);
    }

    setAutoOffset(enabled) {
        this.autoOffsetEnabled = enabled;
        chrome.storage.local.set({ autoOffsetEnabled: enabled });
    }

    setupOffsetsCleanup() {
        setInterval(() => {
            this.cleanupOldOffsets();
        }, 60 * 60 * 1000);
    }

    cleanupOldOffsets() {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.offsets = this.offsets.filter(offset => offset.timestamp > oneWeekAgo);
        this.saveData();
    }
}

// Initialize background script
new ClimateGuardBackground();

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('ClimateGuard AI installed with API integration');
});