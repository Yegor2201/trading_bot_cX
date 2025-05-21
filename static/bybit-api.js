/**
 * Bybit API Integration Module
 * This module adds real trading capabilities with Bybit API.
 * Key features:
 * 1. Secure API key handling
 * 2. Real-time account balance updates
 * 3. Order execution and management
 * 4. Position tracking
 */

(function() {
    console.log('Bybit API Integration: Initializing');
    
    // API configuration
    let config = {
        apiKey: '',
        apiSecret: '',
        testnet: true,  // Use testnet by default for safety
        initialized: false
    };
    
    // Wait for the document to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initBybitIntegration, 2000);
    });
    
    // Initialize Bybit integration
    async function initBybitIntegration() {
        console.log('Bybit API Integration: Starting initialization');
        
        // Try to load saved API keys
        await loadApiKeys();
        
        // Set up event listeners for API settings
        setupEventListeners();
        
        // Initialize UI elements
        updateUIState();
        
        console.log('Bybit API Integration: Initialization complete');
    }
    
    // Load API keys from server
    async function loadApiKeys() {
        try {
            const response = await fetch('/api_settings');
            const data = await response.json();
            
            if (data.api_key) {
                config.apiKey = data.api_key;
                console.log('Bybit API Integration: API key loaded');
            }
            
            if (data.api_secret) {
                config.apiSecret = '••••••••'; // Don't store the actual secret in browser memory
                console.log('Bybit API Integration: API secret loaded');
            }
            
            if (data.testnet !== undefined) {
                config.testnet = data.testnet;
                console.log(`Bybit API Integration: Using ${config.testnet ? 'testnet' : 'mainnet'}`);
            }
            
            config.initialized = !!(config.apiKey && config.apiSecret);
            
            return config.initialized;
        } catch (error) {
            console.error('Bybit API Integration: Error loading API settings', error);
            return false;
        }
    }
    
    // Set up event listeners
    function setupEventListeners() {
        // Save API keys button
        const saveApiKeysButton = document.getElementById('save-api-keys');
        if (saveApiKeysButton) {
            saveApiKeysButton.addEventListener('click', saveApiKeys);
        }
        
        // Toggle simulation mode
        const simulationModeToggle = document.getElementById('simulation-mode');
        if (simulationModeToggle) {
            simulationModeToggle.addEventListener('change', function() {
                const warningMessage = this.checked ? 
                    'Simulation mode enabled. No real trades will be executed.' :
                    'Warning: Disabling simulation mode will execute REAL trades with REAL money. Continue?';
                
                if (!this.checked) {
                    // Confirm when turning off simulation mode
                    if (!confirm(warningMessage)) {
                        this.checked = true;
                        return;
                    }
                }
                
                // Update the server setting
                updateTradingMode({
                    simulation: this.checked
                });
                
                // Show notification
                if (window.showNotification) {
                    window.showNotification(
                        `Simulation mode ${this.checked ? 'enabled' : 'disabled'}`,
                        this.checked ? 'info' : 'warning'
                    );
                }
            });
        }
        
        // Toggle testnet/mainnet mode
        const testnetToggle = document.getElementById('testnet-mode');
        if (testnetToggle) {
            testnetToggle.addEventListener('change', function() {
                const warningMessage = this.checked ? 
                    'Switching to testnet mode. Only test trades will be executed.' :
                    'WARNING: Switching to MAINNET will use REAL funds. Are you sure?';
                
                if (!this.checked) {
                    // Confirm when switching to mainnet
                    if (!confirm(warningMessage)) {
                        this.checked = true;
                        return;
                    }
                }
                
                // Update the configuration
                config.testnet = this.checked;
                
                // Update the server setting
                updateTradingMode({
                    testnet: this.checked
                });
                
                // Show notification
                if (window.showNotification) {
                    window.showNotification(
                        `${this.checked ? 'Testnet' : 'MAINNET'} mode enabled`,
                        this.checked ? 'info' : 'warning'
                    );
                }
            });
        }
        
        // Toggle visibility of API keys
        const toggleButtons = document.querySelectorAll('.toggle-visibility');
        toggleButtons.forEach(button => {
            button.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const targetInput = document.getElementById(targetId);
                
                if (targetInput) {
                    const type = targetInput.type === 'password' ? 'text' : 'password';
                    targetInput.type = type;
                    this.textContent = type === 'password' ? '👁️' : '🔒';
                }
            });
        });
    }
    
    // Save API keys to server
    async function saveApiKeys() {
        try {
            const apiKeyInput = document.getElementById('api-key');
            const apiSecretInput = document.getElementById('api-secret');
            
            if (!apiKeyInput || !apiSecretInput) {
                throw new Error('API key input fields not found');
            }
            
            const apiKey = apiKeyInput.value.trim();
            const apiSecret = apiSecretInput.value.trim();
            
            // Validate inputs
            if (!apiKey || !apiSecret) {
                throw new Error('Both API key and API secret are required');
            }
            
            // Show loading indicator
            if (window.showLoading) window.showLoading();
            
            // Send to server
            const response = await fetch('/update_api_settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    api_secret: apiSecret,
                    testnet: config.testnet
                })
            });
            
            const result = await response.json();
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            if (result.success) {
                // Update local config
                config.apiKey = apiKey;
                config.apiSecret = '••••••••'; // Don't store actual secret
                config.initialized = true;
                
                // Show success message
                if (window.showNotification) {
                    window.showNotification('API settings saved successfully', 'success');
                }
                
                // Clear the inputs for security
                apiSecretInput.value = '';
                
                // Update UI state
                updateUIState();
                
                // Test the API connection
                testApiConnection();
                
                return true;
            } else {
                throw new Error(result.message || 'Failed to save API settings');
            }
        } catch (error) {
            console.error('Bybit API Integration: Error saving API keys', error);
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            // Show error message
            if (window.showNotification) {
                window.showNotification(`Error: ${error.message}`, 'error');
            }
            
            return false;
        }
    }
    
    // Update trading mode settings
    async function updateTradingMode(settings) {
        try {
            // Show loading indicator
            if (window.showLoading) window.showLoading();
            
            // Send to server
            const response = await fetch('/update_trading_mode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });
            
            const result = await response.json();
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            if (result.success) {
                // Show success message
                if (window.showNotification) {
                    window.showNotification('Trading mode updated', 'success');
                }
                
                return true;
            } else {
                throw new Error(result.message || 'Failed to update trading mode');
            }
        } catch (error) {
            console.error('Bybit API Integration: Error updating trading mode', error);
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            // Show error message
            if (window.showNotification) {
                window.showNotification(`Error: ${error.message}`, 'error');
            }
            
            return false;
        }
    }
    
    // Test API connection
    async function testApiConnection() {
        try {
            // Show loading indicator
            if (window.showLoading) window.showLoading();
            
            // Send to server
            const response = await fetch('/test_api_connection');
            const result = await response.json();
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            if (result.success) {
                // Show success message
                if (window.showNotification) {
                    window.showNotification('API connection successful', 'success');
                }
                
                // Update API status in UI
                const apiStatusElement = document.getElementById('diag-api-status');
                if (apiStatusElement) {
                    apiStatusElement.textContent = 'Connected';
                    apiStatusElement.className = 'status-value connected';
                }
                
                return true;
            } else {
                throw new Error(result.message || 'Failed to connect to API');
            }
        } catch (error) {
            console.error('Bybit API Integration: Error testing API connection', error);
            
            // Hide loading indicator
            if (window.hideLoading) window.hideLoading();
            
            // Show error message
            if (window.showNotification) {
                window.showNotification(`API connection failed: ${error.message}`, 'error');
            }
            
            // Update API status in UI
            const apiStatusElement = document.getElementById('diag-api-status');
            if (apiStatusElement) {
                apiStatusElement.textContent = 'Error';
                apiStatusElement.className = 'status-value error';
            }
            
            return false;
        }
    }
    
    // Update UI state based on configuration
    function updateUIState() {
        // Update API key display
        const apiKeyInput = document.getElementById('api-key');
        if (apiKeyInput && config.apiKey) {
            apiKeyInput.value = config.apiKey;
            apiKeyInput.placeholder = 'API Key saved';
        }
        
        // Update API secret display
        const apiSecretInput = document.getElementById('api-secret');
        if (apiSecretInput && config.apiSecret) {
            apiSecretInput.value = ''; // For security
            apiSecretInput.placeholder = 'API Secret saved (hidden)';
        }
        
        // Update testnet/mainnet toggle
        const testnetToggle = document.getElementById('testnet-mode');
        if (testnetToggle) {
            testnetToggle.checked = config.testnet;
        }
        
        // Add testnet badge to header if in testnet mode
        updateTestnetBadge();
    }
    
    // Add a visual indicator for testnet mode
    function updateTestnetBadge() {
        // Remove any existing badge
        const existingBadge = document.getElementById('testnet-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // Add badge if in testnet mode
        if (config.testnet) {
            const header = document.querySelector('header h1');
            if (header) {
                const badge = document.createElement('span');
                badge.id = 'testnet-badge';
                badge.className = 'testnet-badge';
                badge.textContent = 'TESTNET';
                badge.style.fontSize = '12px';
                badge.style.backgroundColor = '#ff9800';
                badge.style.color = 'white';
                badge.style.padding = '2px 6px';
                badge.style.borderRadius = '4px';
                badge.style.marginLeft = '10px';
                badge.style.verticalAlign = 'middle';
                
                header.appendChild(badge);
            }
        }
    }
    
    // Expose key functions to global scope
    window.bybitApi = {
        testConnection: testApiConnection,
        saveApiKeys: saveApiKeys,
        updateTradingMode: updateTradingMode
    };
})();
