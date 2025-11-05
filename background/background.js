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
                this.autoOffsetEnabled = result.autoOffsetEnabled || false;
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
                    break;
                    
                case 'getRecentOffsets':
                    sendResponse({ offsets: this.getRecentOffsets() });
                    break;
                    
                case 'setAutoOffset':
                    this.setAutoOffset(request.enabled);
                    break;
                    
                case 'getStats':
                    sendResponse({ stats: this.stats });
                    break;
                    
                case 'calculateCarbon':
                    // Handle API carbon calculation
                    this.calculateCarbonWithAPI(request.pageData)
                        .then(carbonAmount => {
                            sendResponse({ carbonAmount });
                        })
                        .catch(error => {
                            console.error('API calculation failed:', error);
                            sendResponse({ carbonAmount: null });
                        });
                    return true; // Keep message channel open for async
            }
        });
    }

    async calculateCarbonWithAPI(pageData) {
        try {
            console.log('Calculating carbon with Climatiq API for:', pageData);
            
            const product = pageData.products && pageData.products.length > 0 
                ? pageData.products[0] 
                : 'General product';
                
            const price = this.extractPrice(pageData);
            const category = this.detectCategory(product);
            
            console.log('API calculation parameters:', { product, price, category });
            
            const emissionFactor = this.getEmissionFactor(category);
            
            const response = await fetch('https://beta3.api.climatiq.io/estimate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.climatiqApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    emission_factor: emissionFactor,
                    parameters: {
                        money: price,
                        money_unit: "usd"
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Climatiq API error:', response.status, errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('Climatiq API response:', data);
            
            // Convert to kg CO₂e
            const co2e = data.co2e || 0;
            const co2eKg = co2e * 1000; // Convert to kg
            
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
        
        // Fallback price estimates based on site and product type
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
        
        for (const [site, price] of Object.entries(siteDefaults)) {
            if (pageData.siteName && pageData.siteName.includes(site)) {
                console.log('Using default price for', site, ':', price);
                return price;
            }
        }
        
        console.log('Using default price:', siteDefaults.default);
        return siteDefaults.default;
    }

    detectCategory(productText) {
        if (!productText) return 'general';
        
        const text = productText.toLowerCase();
        
        // Electronics
        if (text.match(/(iphone|samsung|phone|smartphone|mobile|android|pixel)/)) return 'electronics';
        if (text.match(/(laptop|macbook|computer|notebook|desktop|mac pro)/)) return 'electronics';
        if (text.match(/(tablet|ipad|surface|kindle)/)) return 'electronics';
        if (text.match(/(tv|television|monitor|display|screen)/)) return 'electronics';
        if (text.match(/(camera|dslr|mirrorless|canon|nikon|sony)/)) return 'electronics';
        if (text.match(/(headphone|earbud|airpod|speaker|audio)/)) return 'electronics';
        if (text.match(/(watch|smartwatch|apple watch|fitbit)/)) return 'electronics';
        
        // Clothing
        if (text.match(/(shirt|tshirt|t-shirt|blouse|top)/)) return 'clothing';
        if (text.match(/(jeans|pants|trousers|leggings)/)) return 'clothing';
        if (text.match(/(shoes|sneakers|footwear|boots|sandals|heels)/)) return 'clothing';
        if (text.match(/(jacket|coat|hoodie|sweater|sweatshirt)/)) return 'clothing';
        if (text.match(/(dress|skirt|shorts|jumper)/)) return 'clothing';
        if (text.match(/(underwear|sock|bra|lingerie)/)) return 'clothing';
        
        // Home & Furniture
        if (text.match(/(chair|sofa|couch|recliner|stool)/)) return 'furniture';
        if (text.match(/(table|desk|dining|coffee)/)) return 'furniture';
        if (text.match(/(bed|mattress|headboard)/)) return 'furniture';
        if (text.match(/(wardrobe|cabinet|shelf|bookcase)/)) return 'furniture';
        if (text.match(/(lamp|lighting|chandelier)/)) return 'furniture';
        
        // Other categories
        if (text.match(/(book|novel|magazine|textbook)/)) return 'media';
        if (text.match(/(game|console|playstation|xbox|nintendo|switch)/)) return 'entertainment';
        if (text.match(/(food|grocery|snack|beverage|drink|coffee|tea)/)) return 'food';
        if (text.match(/(toy|lego|doll|action figure|game)/)) return 'toys';
        if (text.match(/(cosmetic|makeup|skincare|perfume|shampoo)/)) return 'personal_care';
        
        console.log('Using general category for:', productText);
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
            'food': {
                id: "consumer_goods-type_food",
                name: "Food products"
            },
            'media': {
                id: "consumer_goods-type_other",
                name: "Other consumer goods"
            },
            'entertainment': {
                id: "consumer_goods-type_other",
                name: "Other consumer goods"
            },
            'toys': {
                id: "consumer_goods-type_other",
                name: "Other consumer goods"
            },
            'personal_care': {
                id: "consumer_goods-type_other", 
                name: "Other consumer goods"
            },
            'general': {
                id: "consumer_goods-type_other",
                name: "Other consumer goods"
            }
        };
        
        const factor = emissionFactors[category] || emissionFactors.general;
        console.log('Using emission factor:', factor, 'for category:', category);
        return factor;
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
        
        // Add to offsets array
        this.offsets.unshift(offset);
        
        // Update stats
        this.stats.carbonSaved += offset.carbonAmount;
        this.stats.treesPlanted += offset.carbonAmount / 5;
        this.stats.offsetPurchases += 1;
        this.stats.moneyDonated += offset.carbonAmount * 0.1;
        
        // Keep only recent offsets (last 100)
        if (this.offsets.length > 100) {
            this.offsets = this.offsets.slice(0, 100);
        }
        
        this.saveData();
        
        // Notify all popups and content scripts
        this.broadcastOffset(offset);
        this.broadcastStatsUpdate();
        
        // Log for debugging
        console.log('Offset processed:', offset);
    }

    broadcastOffset(offset) {
        // Notify all tabs
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
        
        // Notify all popups
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
        // Clean up old offsets every hour
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