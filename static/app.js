let refreshInterval;
let balanceInterval;
let chartUpdateInterval;
let chart;
let candleSeries;
let activeTradeMarkers = [];
let closedTradeMarkers = [];
let currentSymbol = "BTCUSDT";

// Tab switching state
let currentTab = "dashboard";

// Chart configuration
let chartOptions = {
    layout: {
        textColor: '#d1d4dc',
        backgroundColor: '#000000',
    },
    grid: {
        vertLines: {
            color: 'rgba(42, 46, 57, 0.5)',
        },
        horzLines: {
            color: 'rgba(42, 46, 57, 0.5)',
        },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
    },
    width: 800,
    height: 400,
};

// Function to initialize the chart
function initializeChart() {
    try {
        console.log('Initializing chart...');
        const chartContainer = document.getElementById('price-chart');
        
        if (!chartContainer) {
            console.error('Chart container not found!');
            return;
        }
        
        if (chart) {
            console.log('Destroying existing chart');
            chartContainer.innerHTML = '';
        }
        
        // Override chart dimensions to match container
        const updatedOptions = {
            ...chartOptions,
            width: chartContainer.clientWidth || 800,
            height: chartContainer.clientHeight || 400
        };
        
        console.log('Creating chart with options:', updatedOptions);
        chart = LightweightCharts.createChart(chartContainer, updatedOptions);
        
        console.log('Adding candlestick series');
        candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        
        // Load historical data
        console.log('Loading chart data');
        loadChartData();
    } catch (err) {
        console.error('Error initializing chart:', err);
    }
}

// Function to load historical price data for the chart
async function loadChartData() {
    try {
        const symbol = document.getElementById('chart-symbol').value || currentSymbol;
        currentSymbol = symbol;
        
        // Get 1-hour candles for the last 7 days (168 hours)
        const response = await fetch(`/chart_data?symbol=${symbol}&interval=1h&limit=168`);
        if (!response.ok) throw new Error('Failed to fetch chart data');
        
        const data = await response.json();
        console.log('Chart data received:', data);
        
        if (data && data.candles) {
            candleSeries.setData(data.candles);
            // After setting data, add trade markers
            addTradeMarkersToChart();
        } else {
            console.error('No candle data received:', data);
            // Create some demo data if we don't get any
            const demoData = createDemoChartData();
            candleSeries.setData(demoData);
        }
    } catch (err) {
        console.error('Error loading chart data:', err);
        // Create fallback demo data on error
        const demoData = createDemoChartData();
        candleSeries.setData(demoData);
    }
}

// Function to create demo chart data if API fails
function createDemoChartData() {
    const demoData = [];
    const now = Math.floor(Date.now() / 1000);
    let price = 60000; // Starting price for BTC
    
    if (currentSymbol === 'ETHUSDT') price = 3500;
    else if (currentSymbol.includes('AAVE')) price = 150;
    else if (currentSymbol.includes('APEX')) price = 45;
    
    // Create 168 hourly candles (1 week)
    for (let i = 0; i < 168; i++) {
        const time = now - (168 - i) * 3600;
        const volatility = price * 0.01;
        
        const open = price * (1 + (Math.random() * 0.01 - 0.005));
        const close = open * (1 + (Math.random() * 0.02 - 0.01));
        const high = Math.max(open, close) * (1 + Math.random() * 0.005);
        const low = Math.min(open, close) * (1 - Math.random() * 0.005);
        
        demoData.push({
            time: time,
            open: open,
            high: high,
            low: low,
            close: close
        });
        
        price = close; // Next candle starts at previous close
    }
    
    return demoData;
}

// Function to switch between tabs
function switchTab(tabName) {
    // Update the currentTab variable
    currentTab = tabName;
    
    // Update tab buttons (remove active class from all, add to selected)
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button.getAttribute('data-tab') === tabName) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Update tab content (hide all, show selected)
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === tabName) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // If switching to dashboard, ensure the chart is properly sized
    if (tabName === 'dashboard' && chart) {
        chart.resize(
            document.getElementById('price-chart').clientWidth,
            document.getElementById('price-chart').clientHeight
        );
    }
}

// Function to add trade markers to the chart
async function addTradeMarkersToChart() {
    try {
        // Clear previous markers
        activeTradeMarkers = [];
        closedTradeMarkers = [];
        
        // Get trade data
        const response = await fetch('/trades');
        if (!response.ok) throw new Error('Failed to fetch trades');
        
        const trades = await response.json();
        console.log('Trade data for markers:', trades);

        // Get chart visible time range
        const visibleRange = chart.timeScale().getVisibleRange();
        const now = Math.floor(Date.now() / 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60); // 7 days ago
        
        // If no visible range, set default range (last 7 days)
        const rangeStart = visibleRange ? visibleRange.from : oneWeekAgo;
        const rangeEnd = visibleRange ? visibleRange.to : now;
        
        console.log(`Adding chart markers for ${currentSymbol}, visible range: ${rangeStart} to ${rangeEnd}`);
        
        // Process active trades
        (trades.active_trades || []).forEach(trade => {
            try {
                // Only add markers for currently displayed symbol
                if (trade[1] === currentSymbol) {
                    // Convert timestamp to seconds for chart
                    let timestamp;
                    
                    // Parse the timestamp from the trade data
                    try {
                        if (trade[8]) {
                            // Handle different timestamp formats
                            if (typeof trade[8] === 'string') {
                                timestamp = new Date(trade[8]).getTime() / 1000;
                            } else if (typeof trade[8] === 'number') {
                                timestamp = Math.floor(trade[8] / 1000); // Assume milliseconds
                            } else {
                                // If no valid timestamp, use 24 hours ago (to ensure visibility)
                                timestamp = now - 86400;
                            }
                        } else {
                            // If no timestamp field, use 24 hours ago
                            timestamp = now - 86400;
                        }
                    } catch (timeError) {
                        console.warn('Error parsing timestamp:', timeError);
                        timestamp = now - 86400; // Default to 24 hours ago
                    }
                    
                    // Use more recent timestamp for better visibility
                    // For active trades, place them near the right side of the chart
                    timestamp = Math.max(timestamp, rangeEnd - 43200); // At most 12 hours from the right edge
                    
                    console.log(`Adding active marker at time ${timestamp} (${new Date(timestamp*1000).toLocaleString()})`);
                    
                    const marker = {
                        time: timestamp,
                        position: trade[2] === 'Buy' ? 'belowBar' : 'aboveBar',
                        color: trade[2] === 'Buy' ? '#26a69a' : '#ef5350',
                        shape: trade[2] === 'Buy' ? 'arrowUp' : 'arrowDown',
                        text: `${trade[2]} ${Number(trade[3]).toFixed(3)} @ ${Number(trade[4]).toFixed(1)}`,
                        size: 2
                    };
                    activeTradeMarkers.push(marker);
                    console.log(`Added active trade marker at time ${timestamp} (${new Date(timestamp*1000).toISOString()})`);
                }
            } catch (markerError) {
                console.error('Error processing active trade marker:', markerError, trade);
            }
        });
        
        // Process closed trades
        (trades.closed || []).forEach(trade => {
            try {
                // Only add markers for currently displayed symbol
                if (trade[1] === currentSymbol) {
                    // Convert timestamp to seconds for chart
                    let timestamp;
                    
                    try {
                        if (trade[8]) {
                            // Handle different timestamp formats
                            if (typeof trade[8] === 'string') {
                                timestamp = new Date(trade[8]).getTime() / 1000;
                            } else if (typeof trade[8] === 'number') {
                                timestamp = Math.floor(trade[8] / 1000); // Assume milliseconds
                            } else {
                                // If no valid timestamp, use a day ago
                                timestamp = now - 86400; 
                            }
                        } else {
                            // If no timestamp field, use a day ago
                            timestamp = now - 86400;
                        }
                    } catch (timeError) {
                        console.warn('Error parsing timestamp:', timeError);
                        timestamp = now - 86400; // Default to 24 hours ago
                    }
                    
                    // Use more recent timestamp for better visibility
                    // For closed trades, distribute them across the visible range
                    timestamp = Math.max(timestamp, rangeStart + (3600 * (Math.random() * 24))); // Random position in visible range
                    timestamp = Math.min(timestamp, rangeEnd - (3600 * (Math.random() * 24)));
                    
                    console.log(`Adding closed marker at time ${timestamp} (${new Date(timestamp*1000).toLocaleString()})`);
                    
                    const pnl = parseFloat(trade[6]) || 0;
                    const marker = {
                        time: timestamp,
                        position: trade[2] === 'Buy' ? 'aboveBar' : 'belowBar', // Opposite of entry for closed trades
                        color: pnl >= 0 ? '#26a69a' : '#ef5350', // Green for profit, red for loss
                        shape: 'circle',
                        text: `Closed ${trade[2]} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
                        size: 1
                    };
                    closedTradeMarkers.push(marker);
                    console.log(`Added closed trade marker at time ${timestamp} (${new Date(timestamp*1000).toISOString()})`);
                }
            } catch (markerError) {
                console.error('Error processing closed trade marker:', markerError, trade);
            }
        });
        
        // Add markers to chart
        const allMarkers = activeTradeMarkers.concat(closedTradeMarkers);
        console.log(`Adding ${allMarkers.length} markers to chart`);
        
        // Always set markers, even if empty array
        candleSeries.setMarkers(allMarkers);
        
        if (allMarkers.length === 0) {
            console.log('No trade markers to display - creating dummy marker for testing');
            
            // If no markers were found but we're in the dashboard tab,
            // create a demo marker just to verify chart markers are working
            if (currentTab === 'dashboard') {
                const now = Math.floor(Date.now() / 1000);
                const demoMarker = {
                    time: now - 3600, // 1 hour ago
                    position: 'aboveBar',
                    color: '#26a69a',
                    shape: 'arrowUp',
                    text: 'Demo marker',
                    size: 2
                };
                candleSeries.setMarkers([demoMarker]);
            }
        }
        
    } catch (err) {
        console.error('Error adding trade markers to chart:', err);
    }
}

// Function to update the chart with new data and markers
async function updateChart() {
    try {
        console.log('Updating chart...');
        const symbol = document.getElementById('chart-symbol')?.value || currentSymbol;
        
        // If symbol changed, reinitialize chart
        if (symbol !== currentSymbol) {
            console.log(`Symbol changed from ${currentSymbol} to ${symbol}, reinitializing chart`);
            currentSymbol = symbol;
            initializeChart();
        } else {
            // Otherwise just update trade markers
            console.log(`Updating markers for ${currentSymbol}`);
            addTradeMarkersToChart();
        }
    } catch (err) {
        console.error('Error updating chart:', err);
    }
}

async function updateBalance() {
    try {
        const res = await fetch('/balance');
        const data = await res.json();
        if (data.balance !== undefined && data.balance !== null) {
            document.getElementById('balance').textContent = `${data.balance.toFixed(2)} USDT`;
        } else if (data.error) {
            console.error('Balance error:', data.error);
            document.getElementById('balance').textContent = '10000.00 USDT (Testnet)';
        }
    } catch (e) {
        console.error('Error updating balance:', e);
        document.getElementById('balance').textContent = '10000.00 USDT (Testnet)';
    }
}

// Function to close a trade (defined at global scope to be accessible from HTML)
window.closeTrade = async function(tradeId) {
    try {
        console.log(`Attempting to close trade ${tradeId}`);
        const response = await fetch('/close_trade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `trade_id=${tradeId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Trade closed successfully:', result.message);
            // Update UI
            updateTrades();
            updateChart();
            updateStatistics();
        } else {
            console.error('Failed to close trade:', result.message);
            alert('Failed to close trade: ' + result.message);
        }
    } catch (error) {
        console.error('Error closing trade:', error);
        alert('Error closing trade');
    }
}

async function updateTrades() {
    try {
        const response = await fetch('/trades');
        if (!response.ok) throw new Error('Failed to fetch trades');
        const trades = await response.json();
        console.log("Trades data:", trades); // Debug log to see what we're getting
        
        // Update Active Trades
        const activeTable = document.getElementById('active-trades');
        activeTable.innerHTML = `<tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Stop Loss</th>
            <th>Take Profit</th>
            <th>P&L</th>
            <th>Actions</th>
        </tr>`;
        
        // Use active_trades instead of active
        const activeTradePromises = (trades.active_trades || []).map(async trade => {
            try {
                console.log('Processing active trade:', trade);
                // Get current price for the trade's symbol
                const priceResponse = await fetch(`/price?symbol=${trade[1]}`);
                const priceData = await priceResponse.json();
                
                // Calculate PnL
                let currentPrice = priceData.price || 0;
                let entryPrice = Number(trade[4]);
                let size = Number(trade[3]);
                
                // Calculate P&L based on position direction
                let pnl = 0;
                if (trade[2] === 'Buy') {
                    pnl = size * (currentPrice - entryPrice);
                } else { // Sell
                    pnl = size * (entryPrice - currentPrice);
                }
                
                // Format values for display
                const pnlClass = pnl >= 0 ? 'profit' : 'loss';
                const pnlFormatted = pnl.toFixed(2);
                
                // Get stop loss and take profit values
                const stopLoss = trade[9] ? Number(trade[9]).toFixed(2) : '';
                const takeProfit = trade[10] ? Number(trade[10]).toFixed(2) : '';
                
                return `<tr>
                    <td>${trade[1]}</td>
                    <td class="${trade[2]}">${trade[2]}</td>
                    <td>${Number(trade[3]).toFixed(4)}</td>
                    <td>${Number(trade[4]).toFixed(4)}</td>
                    <td>${currentPrice.toFixed(4)}</td>
                    <td>
                        <input type="number" class="sl-tp-input" id="sl-${trade[0]}" value="${stopLoss}" placeholder="Set SL">
                    </td>
                    <td>
                        <input type="number" class="sl-tp-input" id="tp-${trade[0]}" value="${takeProfit}" placeholder="Set TP">
                        <button class="update-btn" onclick="updateTradeSettings('${trade[0]}', document.getElementById('sl-${trade[0]}').value, document.getElementById('tp-${trade[0]}').value)">✓</button>
                    </td>
                    <td class="${pnlClass}">${pnlFormatted}</td>
                    <td><button class="close-trade" onclick="closeTrade('${trade[0]}')">Close</button></td>
                </tr>`;
            } catch (error) {
                console.error("Error calculating trade PnL:", error);
                return `<tr>
                    <td>${trade[1]}</td>
                    <td class="${trade[2]}">${trade[2]}</td>
                    <td>${Number(trade[3]).toFixed(4)}</td>
                    <td>${Number(trade[4]).toFixed(4)}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                </tr>`;
            }
        });
        
        // Wait for all price fetch operations to complete
        const activeTradeRows = await Promise.all(activeTradePromises);
        activeTable.innerHTML += activeTradeRows.join('');
        
        // Update Closed Trades
        const closedTable = document.getElementById('closed-trades');
        closedTable.innerHTML = `<tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&L</th>
        </tr>`;
        (trades.closed || []).forEach(trade => {
            closedTable.innerHTML += `<tr>
                <td>${trade[1]}</td>
                <td class="${trade[2]}">${trade[2]}</td>
                <td>${trade[3]}</td>
                <td>${trade[4]}</td>
                <td>${trade[5]}</td>
                <td class="${trade[6] >= 0 ? 'profit' : 'loss'}">
                    ${trade[6]}
                </td>
            </tr>`;
        });
        
        // Update chart markers whenever trades are updated
        addTradeMarkersToChart();
    } catch (err) {
        // Show error in UI or console
        console.error('Error updating trades:', err);
        document.getElementById('active-trades').innerHTML = '<tr><td colspan="6">No data (server error)</td></tr>';
        document.getElementById('closed-trades').innerHTML = '<tr><td colspan="6">No data (server error)</td></tr>';
    }
}

async function startBot() {
    try {
        const res = await fetch('/start', { method: 'POST' });
        if (res.ok) {
            // Start periodic updates
            refreshInterval = setInterval(updateTrades, 5000);
            balanceInterval = setInterval(updateBalance, 5000);
            chartUpdateInterval = setInterval(updateChart, 5000);
            console.log('Bot started successfully');
        }
    } catch (e) {
        console.error('Error starting bot:', e);
    }
}

async function stopBot() {
    try {
        const res = await fetch('/stop', { method: 'POST' });
        if (res.ok) {
            // Clear all intervals
            clearInterval(refreshInterval);
            clearInterval(balanceInterval);
            clearInterval(chartUpdateInterval);
            console.log('Bot stopped successfully');
        }
    } catch (e) {
        console.error('Error stopping bot:', e);
    }
}

// Close a trade function
async function closeTrade(tradeId) {
    try {
        console.log(`Closing trade ${tradeId}`);
        const res = await fetch(`/close_trade?trade_id=${tradeId}`, { 
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            alert(`Trade closed successfully. P&L: ${data.message}`);
        } else {
            alert(`Failed to close trade: ${data.message}`);
        }
        
        // Refresh trades after closing
        updateTrades();
        
    } catch (e) {
        console.error('Error closing trade:', e);
        alert(`Error: ${e.message}`);
    }
}

// Load balance and trades immediately when page loads
// Function to calculate and update trading statistics
async function updateStatistics() {
    try {
        const response = await fetch('/trades');
        if (!response.ok) throw new Error('Failed to fetch trades');
        const trades = await response.json();
        
        // Get closed trades
        const closedTrades = trades.closed || [];
        
        if (closedTrades.length > 0) {
            // Calculate win rate
            const winners = closedTrades.filter(trade => trade[6] >= 0).length;
            const winRate = (winners / closedTrades.length * 100).toFixed(1);
            document.getElementById('win-rate').textContent = `${winRate}%`;
            
            // Calculate profit factor (total profit / total loss)
            const profits = closedTrades.filter(trade => trade[6] > 0).reduce((sum, trade) => sum + trade[6], 0);
            const losses = closedTrades.filter(trade => trade[6] < 0).reduce((sum, trade) => sum + Math.abs(trade[6]), 0);
            
            const profitFactor = losses > 0 ? (profits / losses).toFixed(2) : 'N/A';
            document.getElementById('profit-factor').textContent = profitFactor;
            
            // Calculate max drawdown (simplified approach)
            const cumulativeProfits = [];
            let cumulative = 0;
            
            // Sort trades by timestamp
            const sortedTrades = [...closedTrades].sort((a, b) => {
                if (typeof a[8] === 'string' && typeof b[8] === 'string') {
                    return new Date(a[8]) - new Date(b[8]);
                }
                return 0; // Default sort if timestamps aren't comparable
            });
            
            // Calculate cumulative profits
            sortedTrades.forEach(trade => {
                cumulative += trade[6];
                cumulativeProfits.push(cumulative);
            });
            
            // Calculate drawdown
            let maxSoFar = 0;
            let maxDrawdown = 0;
            
            cumulativeProfits.forEach(profit => {
                if (profit > maxSoFar) {
                    maxSoFar = profit;
                } else {
                    const drawdown = maxSoFar - profit;
                    if (drawdown > maxDrawdown) {
                        maxDrawdown = drawdown;
                    }
                }
            });
            
            document.getElementById('drawdown').textContent = `${maxDrawdown.toFixed(2)}`;
        } else {
            // No closed trades yet
            document.getElementById('win-rate').textContent = 'N/A';
            document.getElementById('profit-factor').textContent = 'N/A';
            document.getElementById('drawdown').textContent = '0.00';
        }
    } catch (err) {
        console.error('Error updating statistics:', err);
    }
}

// Function to update profit metrics
async function updateProfitMetrics() {
    try {
        const response = await fetch('/profits');
        if (!response.ok) throw new Error('Failed to fetch profit metrics');
        
        const metrics = await response.json();
        console.log('Profit metrics:', metrics);
        
        // Update UI with profit metrics
        document.getElementById('hourly-profit').textContent = formatProfit(metrics.hourly_profit);
        document.getElementById('daily-profit').textContent = formatProfit(metrics.daily_profit);
        document.getElementById('weekly-profit').textContent = formatProfit(metrics.weekly_profit);
        document.getElementById('monthly-profit').textContent = formatProfit(metrics.monthly_profit);
    } catch (err) {
        console.error('Error updating profit metrics:', err);
        // Set default values on error
        document.getElementById('hourly-profit').textContent = '0.00';
        document.getElementById('daily-profit').textContent = '0.00';
        document.getElementById('weekly-profit').textContent = '0.00';
        document.getElementById('monthly-profit').textContent = '0.00';
    }
}

// Helper function to format profit values with color
function formatProfit(value) {
    const num = parseFloat(value);
    const formatted = num.toFixed(2);
    
    if (num > 0) {
        return `<span class="profit">+${formatted}</span>`;
    } else if (num < 0) {
        return `<span class="loss">${formatted}</span>`;
    } else {
        return `0.00`;
    }
}

// Function to update stop loss and take profit for a trade
async function updateTradeSettings(tradeId, stopLoss, takeProfit) {
    try {
        console.log(`Updating trade ${tradeId}: SL=${stopLoss}, TP=${takeProfit}`);
        
        const response = await fetch('/set_trade_settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                trade_id: tradeId,
                stop_loss: stopLoss ? parseFloat(stopLoss) : null,
                take_profit: takeProfit ? parseFloat(takeProfit) : null
            })
        });
        
        if (!response.ok) throw new Error('Failed to update trade settings');
        
        const result = await response.json();
        if (result.success) {
            alert('Trade settings updated successfully');
            // Refresh trades to show updated values
            updateTrades();
        } else {
            alert('Failed to update trade settings: ' + (result.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error updating trade settings:', err);
        alert('Error: ' + err.message);
    }
}

// Function to load settings from server
async function loadSettings() {
    try {
        const response = await fetch('/settings');
        if (!response.ok) {
            throw new Error('Failed to load settings');
        }
        
        const settings = await response.json();
        console.log('Settings loaded:', settings);
        
        // Update leverage selector
        if (settings.leverage) {
            const leverageSelect = document.getElementById('leverage');
            for (let i = 0; i < leverageSelect.options.length; i++) {
                if (leverageSelect.options[i].value == settings.leverage) {
                    leverageSelect.selectedIndex = i;
                    break;
                }
            }
        }
        
        // Update risk input
        if (settings.risk_per_trade) {
            document.getElementById('risk').value = settings.risk_per_trade;
        }
        
        // Update API credentials (not showing actual values for security)
        if (settings.api_key) {
            document.getElementById('api-key').value = settings.api_key_masked || '';
            document.getElementById('api-key').placeholder = settings.api_key ? '••••••••' : 'Enter Bybit API Key';
        }
        
        if (settings.api_secret) {
            document.getElementById('api-secret').value = settings.api_secret_masked || '';
            document.getElementById('api-secret').placeholder = settings.api_secret ? '••••••••' : 'Enter Bybit API Secret';
        }
        
        // Update toggle switches
        document.getElementById('simulation-mode').checked = settings.simulation_mode !== false;
        document.getElementById('demo-mode').checked = settings.demo_mode !== false;
        document.getElementById('debug-mode').checked = settings.debug_mode !== false;
        
        // Update demo interval
        if (settings.demo_interval) {
            document.getElementById('demo-interval').value = settings.demo_interval;
        }
        
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

// Function to save all settings
async function saveSettings() {
    try {
        const settings = {
            leverage: parseInt(document.getElementById('leverage').value),
            risk_per_trade: parseFloat(document.getElementById('risk').value),
            simulation_mode: document.getElementById('simulation-mode').checked,
            demo_mode: document.getElementById('demo-mode').checked,
            debug_mode: document.getElementById('debug-mode').checked,
            demo_interval: parseInt(document.getElementById('demo-interval').value)
        };
        
        const response = await fetch('/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save settings');
        }
        
        const result = await response.json();
        console.log('Settings saved:', result);
        
        // Show feedback to user
        alert('Settings saved successfully!');
        
    } catch (err) {
        console.error('Error saving settings:', err);
        alert('Error saving settings: ' + err.message);
    }
}

// Function to save API keys
async function saveApiKeys() {
    try {
        const apiKey = document.getElementById('api-key').value.trim();
        const apiSecret = document.getElementById('api-secret').value.trim();
        
        // Validate inputs
        if (!apiKey || !apiSecret) {
            throw new Error('Both API Key and Secret are required');
        }
        
        const response = await fetch('/api_keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                api_secret: apiSecret
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save API keys');
        }
        
        const result = await response.json();
        console.log('API keys saved:', result);
        
        // Show feedback to user
        alert('API keys saved successfully!');
        
        // Clear the form fields for security
        document.getElementById('api-key').value = '';
        document.getElementById('api-secret').value = '';
        document.getElementById('api-key').placeholder = '••••••••';
        document.getElementById('api-secret').placeholder = '••••••••';
        
    } catch (err) {
        console.error('Error saving API keys:', err);
        alert('Error saving API keys: ' + err.message);
    }
}

// Function to reset settings to defaults
function resetSettings() {
    // Set default values
    document.getElementById('leverage').value = '8';
    document.getElementById('risk').value = '2';
    document.getElementById('simulation-mode').checked = true;
    document.getElementById('demo-mode').checked = true;
    document.getElementById('debug-mode').checked = true;
    document.getElementById('demo-interval').value = '120';
    
    // Confirm to user
    alert('Settings reset to defaults. Click "Save All Settings" to apply.');
}

// Function to toggle password visibility
function toggleVisibility(targetId) {
    const inputField = document.getElementById(targetId);
    if (inputField.type === 'password') {
        inputField.type = 'text';
    } else {
        inputField.type = 'password';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateBalance();
    // Set up regular balance updates
    balanceInterval = setInterval(updateBalance, 5000);
    updateTrades();
    updateStatistics();
    updateProfitMetrics();
    
    // Initialize chart
    initializeChart();
    
    // Set up regular updates
    setInterval(updateStatistics, 30000); // Update stats every 30 seconds
    setInterval(updateProfitMetrics, 30000); // Update profit metrics every 30 seconds
    
    // Set up chart symbol change handler
    document.getElementById('chart-symbol').addEventListener('change', updateChart);
    
    // Set up tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    // Set up settings handlers
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('reset-settings').addEventListener('click', resetSettings);
    document.getElementById('save-api-keys').addEventListener('click', saveApiKeys);
    
    // Set up password visibility toggle buttons
    document.querySelectorAll('.toggle-visibility').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-target');
            toggleVisibility(targetId);
        });
    });
    
    // Load settings from server
    loadSettings();
});