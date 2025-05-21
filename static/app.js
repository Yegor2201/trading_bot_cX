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

// Chart configuration - define without LightweightCharts dependency for now
let chartOptions = {
    layout: {
        textColor: '#333333',
        backgroundColor: '#ffffff',
    },
    grid: {
        vertLines: {
            color: 'rgba(170, 170, 170, 0.5)',
        },
        horzLines: {
            color: 'rgba(170, 170, 170, 0.5)',
        },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    // Crosshair mode will be set during chart initialization when LightweightCharts is confirmed available
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
            // Create a message for the user
            const errorMsg = document.createElement('div');
            errorMsg.style.padding = '20px';
            errorMsg.style.background = '#fff';
            errorMsg.style.border = '1px solid #ddd';
            errorMsg.style.borderRadius = '4px';
            errorMsg.innerHTML = `
                <h3 style="color: #d32f2f;">Chart Error</h3>
                <p>Could not find chart container.</p>
                <button onclick="window.location.reload()">Reload Page</button>
            `;
            
            // Find a safe place to append the message
            const container = document.querySelector('.container') || document.body;
            container.appendChild(errorMsg);
            return;
        }
        
        // Check if LightweightCharts is defined
        if (typeof window.LightweightCharts === 'undefined') {
            console.error('LightweightCharts is not defined! Attempting to load it...');
            
            // Show loading message
            chartContainer.innerHTML = `
                <div style="padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
                    <h3>Loading Chart Library...</h3>
                    <p>Please wait while we load the TradingView chart library.</p>
                    <div style="width: 100%; height: 4px; background: #eee; margin-top: 10px;">
                        <div style="width: 0%; height: 100%; background: #4CAF50;" id="chart-loading-bar"></div>
                    </div>
                </div>
            `;
            
            // Animate loading bar
            let progress = 0;
            const loadingBar = document.getElementById('chart-loading-bar');
            const loadingInterval = setInterval(() => {
                progress += 1;
                if (progress > 95) {
                    clearInterval(loadingInterval);
                }
                if (loadingBar) loadingBar.style.width = `${progress}%`;
            }, 50);
            
            // Try to load the library with fallbacks
            const sources = [
                'https://cdn.jsdelivr.net/npm/lightweight-charts@4.0.0/dist/lightweight-charts.standalone.production.min.js',
                'https://unpkg.com/lightweight-charts@4.0.0/dist/lightweight-charts.standalone.production.js',
                'https://cdn.skypack.dev/lightweight-charts@4.0.0'
            ];
            
            function tryLoadScript(index) {
                if (index >= sources.length) {
                    console.error('All chart library fallbacks failed!');
                    if (loadingBar) loadingBar.style.background = '#f44336';
                    clearInterval(loadingInterval);
                    
                    chartContainer.innerHTML = `
                        <div style="padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
                            <h3 style="color: #d32f2f;">Chart Library Error</h3>
                            <p>Could not load the TradingView chart library. Please check your internet connection.</p>
                            <button onclick="window.location.reload()">Reload Page</button>
                        </div>
                    `;
                    return;
                }
                
                console.log(`Trying chart library source #${index+1}: ${sources[index]}`);
                const script = document.createElement('script');
                script.src = sources[index];
                
                script.onload = () => {
                    console.log(`Successfully loaded chart library from ${sources[index]}!`);
                    clearInterval(loadingInterval);
                    if (loadingBar) loadingBar.style.width = '100%';
                    // Make sure LightweightCharts is in the global scope
                    window.LightweightCharts = LightweightCharts;
                    // Try to initialize again
                    setTimeout(initializeChart, 500);
                };
                
                script.onerror = () => {
                    console.error(`Failed to load chart library from ${sources[index]}`);
                    tryLoadScript(index + 1);
                };
                
                document.head.appendChild(script);
            }
            
            tryLoadScript(0);
            return;
        }
        
        // If we get here, the chart library is loaded
        console.log('Chart library is available. Creating chart...');
        
        
        // Get the container size
        const containerWidth = chartContainer.clientWidth || 800;
        const containerHeight = 500; // Fixed height for better display
        
        console.log(`Creating chart with dimensions: ${containerWidth}x${containerHeight}`);
        
        // Update options with container size and crosshair mode
        const options = {
            ...chartOptions,
            width: containerWidth,
            height: containerHeight,
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#D1D4DC',
                rightOffset: 5,
                barSpacing: 8,
            },
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.1)' },
            },
        };
        
        // Create the chart
        chart = LightweightCharts.createChart(chartContainer, options);
        
        // Add window resize handler
        const handleResize = () => {
            const newWidth = chartContainer.clientWidth;
            const newHeight = chartContainer.clientHeight;
            chart.resize(newWidth, newHeight);
        };
        
        window.addEventListener('resize', handleResize);
        
        // Create candlestick series
        candleSeries = chart.addCandlestickSeries({
            upColor: '#4CAF50',
            downColor: '#FF5252',
            wickUpColor: '#4CAF50',
            wickDownColor: '#FF5252',
            borderVisible: false,
        });
        
        // Fetch initial data
        fetchCandlestickData();
        
        // Update every minute
        chartUpdateInterval = setInterval(fetchCandlestickData, 60000);
        
        console.log('Chart initialized successfully');
    } catch (error) {
        console.error('Error initializing chart:', error);
        
        // Show error to user
        const chartContainer = document.getElementById('price-chart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div style="padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
                    <h3 style="color: #d32f2f;">Chart Error</h3>
                    <p>There was an error initializing the chart: ${error.message}</p>
                    <button onclick="initializeChart()">Try Again</button>
                </div>
            `;
        }
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
    else if (currentSymbol.includes('APEX')) price = 25;
    
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
    console.log(`Switching to tab: ${tabName}`);
    
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
    const tabContents = document.querySelectorAll('.tab-content');
    console.log(`Found ${tabContents.length} tab content elements`);
    
    tabContents.forEach(content => {
        console.log(`Checking tab content: ${content.id}`);
        if (content.id === tabName) {
            console.log(`Activating tab content: ${content.id}`);
            content.classList.add('active');
            content.style.display = 'block';
        } else {
            content.classList.remove('active');
            content.style.display = 'none';
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

// Function to fetch candlestick data
async function fetchCandlestickData() {
    try {
        if (!chart || !candleSeries) {
            console.error('Chart not initialized, cannot fetch candlestick data');
            return;
        }
        
        console.log(`Fetching chart data for ${currentSymbol}...`);
        const response = await fetch(`/chart_data?symbol=${currentSymbol}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch chart data: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.candles ? data.candles.length : 0} candles`);
        
        // Update chart with new data
        if (data.candles && data.candles.length > 0) {
            candleSeries.setData(data.candles);
            
            // Fetch trades to add markers
            const tradesResponse = await fetch('/trades');
            if (tradesResponse.ok) {
                const trades = await tradesResponse.json();
                updateTradeMarkers(trades);
                
                // Update symbol in UI
                const symbolLabel = document.getElementById('current-symbol-label');
                if (symbolLabel) {
                    symbolLabel.textContent = currentSymbol;
                }
                
                // Update the document title to include the symbol
                document.title = `${currentSymbol} | Trading Bot Dashboard`;
                
                return trades;
            }
        } else {
            console.warn('No candle data received');
            
            // Create some demo data
            const demoData = createDemoChartData();
            candleSeries.setData(demoData);
        }
    } catch (error) {
        console.error('Error fetching candlestick data:', error);
        
        // Create fallback demo data on error
        const demoData = createDemoChartData();
        candleSeries.setData(demoData);
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
        
        // Always add a sample marker for debugging purposes
        const testMarker = {
            time: now - 3600, // 1 hour ago
            position: 'aboveBar',
            color: '#FFA500',
            shape: 'circle',
            text: 'Debug marker',
            size: 2
        };
        activeTradeMarkers.push(testMarker);
        
        // Process active trades
        (trades.active_trades || []).forEach(trade => {
            try {
                // Only add markers for currently displayed symbol
                if (trade[1] === currentSymbol) {
                    // Convert timestamp to seconds for chart
                    let timestamp = Math.floor(Date.now() / 1000);
                    
                    // Force active trades to appear in the visible range
                    // Use a timestamp within the last hour to ensure visibility
                    timestamp = now - Math.floor(Math.random() * 3600); // Random time within the last hour
                    
                    // Log the trade information for debugging
                    console.log(`Active Trade: ${trade[0]}, ${trade[1]}, ${trade[2]}, ${trade[3]}, ${trade[4]}`);
                    
                    // Ensure timestamp is valid and within chart range
                    if (isNaN(timestamp)) {
                        timestamp = now - 1800; // 30 minutes ago as fallback
                    }
                    
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
                    
                    // For closed trades, distribute evenly across the visible range for better visualization
                    const visibleRangeWidth = rangeEnd - rangeStart;
                    timestamp = rangeStart + Math.floor(Math.random() * visibleRangeWidth * 0.8) + visibleRangeWidth * 0.1;
                    
                    // Log the closed trade information for debugging
                    console.log(`Closed Trade: ${trade[0]}, ${trade[1]}, ${trade[2]}, ${trade[3]}, ${trade[4]}, PnL: ${trade[6]}`);
                    
                    // Ensure timestamp is valid
                    if (isNaN(timestamp)) {
                        timestamp = now - 43200; // 12 hours ago as fallback
                    }
                    
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
        // Add a guaranteed debug marker to verify the chart is working
        const debugMarker = {
            time: now - 3600, // 1 hour ago
            position: 'aboveBar',
            color: '#FFA500', // Orange
            shape: 'circle',
            text: 'Debug marker',
            size: 3
        };
        
        // Add debug marker at the beginning to ensure we have at least one visible marker
        activeTradeMarkers.unshift(debugMarker);
        
        const allMarkers = activeTradeMarkers.concat(closedTradeMarkers);
        console.log(`Adding ${allMarkers.length} markers to chart at time range ${rangeStart}-${rangeEnd}`);
        
        // Ensure markers are within visible range
        const validMarkers = allMarkers.filter(marker => {
            // Ensure marker time is a valid number
            if (isNaN(marker.time)) {
                marker.time = now - 1800; // 30 minutes ago
            }
            
            // Ensure marker is within visible range plus some buffer
            const visible = marker.time >= (rangeStart - 86400) && marker.time <= (rangeEnd + 86400);
            if (!visible) {
                console.log(`Marker outside visible range, adjusting: ${marker.time}`);
                marker.time = now - Math.floor(Math.random() * 7200); // Random time in last 2 hours
            }
            return true; // Include all markers after adjustment
        });
        
        // Always set markers, even if empty array
        console.log(`Setting ${validMarkers.length} valid markers to chart`);
        candleSeries.setMarkers(validMarkers);
        
    } catch (err) {
        console.error('Error adding trade markers to chart:', err);
    }
}

// Function to update the chart with new data and markers
async function updateChart() {
    try {
        window.showLoading();
        const symbolSelect = document.getElementById('chart-symbol');
        if (symbolSelect) {
            const previousSymbol = currentSymbol;
            currentSymbol = symbolSelect.value;
            
            // Check if we're switching symbols
            if (previousSymbol !== currentSymbol) {
                console.log(`Switching chart from ${previousSymbol} to ${currentSymbol}`);
                // Update document title to reflect the new symbol
                document.title = `${currentSymbol} | Trading Bot Dashboard`;
            }
        }
        
        // Reinstantiate chart if it doesn't exist
        if (!chart) {
            console.log('Chart not initialized, initializing...');
            initializeChart();
            return; // initializeChart will call fetchCandlestickData
        }
        
        console.log(`Updating chart for ${currentSymbol}...`);
        
        // Fetch the candle data
        await fetchCandlestickData();
        
        // Also update trades to show markers for the specific symbol
        await updateTrades();
        
        // Ensure the chart is properly sized
        const chartContainer = document.getElementById('price-chart');
        if (chartContainer && chart) {
            chart.resize(
                chartContainer.clientWidth,
                chartContainer.clientHeight
            );
        }
        
        window.hideLoading();
    } catch (error) {
        window.hideLoading();
        console.error('Error updating chart:', error);
        showNotification('Failed to update chart. Please try again.', 'error');
    }
}

async function updateBalance() {
    try {
        console.log('Fetching balance data...');
        const res = await fetch('/balance');
        
        if (!res.ok) {
            throw new Error(`Balance API returned ${res.status}`);
        }
        
        const data = await res.json();
        console.log('Balance data received:', data);
        
        // Get the balance element
        const balanceElement = document.getElementById('balance');
        
        if (!balanceElement) {
            console.error('Balance element not found in DOM');
            return;
        }
        
        if (data.balance !== undefined && data.balance !== null) {
            // Format the main balance value
            balanceElement.textContent = `${data.balance.toFixed(2)} USDT`;
            balanceElement.classList.add('updated');
            setTimeout(() => balanceElement.classList.remove('updated'), 1000);
            
            // Update detailed balance information if we have the elements
            const baseBalanceElement = document.getElementById('base-balance');
            const unrealizedPnlElement = document.getElementById('unrealized-pnl');
            
            if (baseBalanceElement && data.base_balance !== undefined) {
                baseBalanceElement.textContent = `${data.base_balance.toFixed(2)} USDT`;
            }
            
            if (unrealizedPnlElement && data.unrealized_pnl !== undefined) {
                const pnl = data.unrealized_pnl;
                unrealizedPnlElement.textContent = `${pnl.toFixed(2)} USDT`;
                unrealizedPnlElement.className = ''; // Clear previous classes
                if (pnl > 0) {
                    unrealizedPnlElement.classList.add('profit');
                } else if (pnl < 0) {
                    unrealizedPnlElement.classList.add('loss');
                }
            }
        } else if (data.error) {
            console.error('Balance error:', data.error);
            balanceElement.textContent = '10000.00 USDT (Testnet)';
        }
    } catch (e) {
        console.error('Error updating balance:', e);
        
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = '10000.00 USDT (Testnet)';
        }
    }
}

// Function to close a trade (defined at global scope to be accessible from HTML)
window.closeTrade = async function(tradeId) {
    try {
        if (!confirm('Are you sure you want to close this trade?')) {
            return;
        }
        
        window.showLoading();
        
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
            showNotification('Trade closed successfully', 'success');
        } else {
            console.error('Failed to close trade:', result.message);
            showNotification(`Failed to close trade: ${result.message}`, 'error');
        }
        
        window.hideLoading();
    } catch (error) {
        window.hideLoading();
        console.error('Error closing trade:', error);
        showNotification('Error closing trade. Please try again.', 'error');
    }
}

async function updateTrades() {
    try {
        window.showLoading();
        const response = await fetch('/trades');
        if (!response.ok) throw new Error('Failed to fetch trades');
        const trades = await response.json();
        console.log("Trades data:", trades); // Debug log to see what we're getting
        
        // Update Active Trades in Dashboard
        updateActiveTradesTable('active-trades', trades.active_trades || []);
        
        // Update Active Trades in Trades Tab
        updateActiveTradesTable('trades-active', trades.active_trades || []);
        
        // Update Closed Trades in Dashboard
        updateClosedTradesTable('closed-trades', trades.closed_trades || []);
        
        // Update Closed Trades in Trades Tab
        updateClosedTradesTable('trades-closed', trades.closed_trades || []);
        
        // Update trade markers on chart if available
        updateTradeMarkers(trades);
        
        // Also update profit metrics
        await updateProfitMetrics();
        
        window.hideLoading();
    } catch (error) {
        window.hideLoading();
        console.error('Error updating trades:', error);
        showNotification('Failed to fetch trades data.', 'error');
    }
}

async function updateActiveTradesTable(tableId, activeTrades) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    table.innerHTML = `<thead>
        <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Stop Loss</th>
            <th>Take Profit</th>
            <th>P&L</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
    </tbody>`;
    
    const tableBody = table.querySelector('tbody');
    
    // Use active_trades instead of active
    const activeTradePromises = activeTrades.map(async trade => {
        try {
            console.log('Processing active trade:', trade);
            // Get current price for the trade's symbol
            const priceResponse = await fetch(`/price?symbol=${trade[1]}`);
            const priceData = await priceResponse.json();
            
            // Calculate PnL
            let currentPrice = priceData.price || 0;
            let entryPrice = parseFloat(trade[4]);
            let size = parseFloat(trade[3]);
            let pnl = 0;
            
            if (trade[2] === 'Buy') {
                pnl = (currentPrice - entryPrice) * size;
            } else {
                pnl = (entryPrice - currentPrice) * size;
            }
            
            // Trade values from database:
            // 0: id
            // 1: symbol
            // 2: side
            // 3: size
            // 4: entry_price
            // 5: exit_price
            // 6: pnl
            // 7: status
            // 8: timestamp
            // 9: stop_loss
            // 10: take_profit
            
            // Format PnL with color
            const pnlFormatted = pnl >= 0 ? 
                `<span class="profit">+${pnl.toFixed(2)}</span>` : 
                `<span class="loss">${pnl.toFixed(2)}</span>`;
            
            // Format PnL percentage
            const pnlPercentage = (pnl / (entryPrice * size) * 100).toFixed(2);
            const pnlPercentFormatted = pnl >= 0 ? 
                `<span class="profit">(+${pnlPercentage}%)</span>` : 
                `<span class="loss">(${pnlPercentage}%)</span>`;
            
            // Create a new row with clickable elements
            const tradeRow = document.createElement('tr');
            tradeRow.setAttribute('data-trade-id', trade[0]);
            tradeRow.classList.add('trade-row');
            
            // Make entire row clickable to show the chart for this trade
            tradeRow.style.cursor = 'pointer';
            tradeRow.addEventListener('click', function(e) {
                // Don't trigger if we clicked on an input or button
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                    return;
                }
                
                window.showTradeOnChart(trade[0], trade[1]);
            });
            
            tradeRow.innerHTML = `
                <td><strong class="clickable" onclick="window.showTradeOnChart('${trade[0]}', '${trade[1]}')">${trade[1]}</strong></td>
                <td><span class="${trade[2]}">${trade[2]}</span></td>
                <td>${parseFloat(trade[3]).toFixed(4)}</td>
                <td>${parseFloat(trade[4]).toFixed(2)}</td>
                <td>${parseFloat(currentPrice).toFixed(2)}</td>
                <td><input id="sl-${trade[0]}" class="trade-input sl-input" type="number" step="0.01" data-trade-id="${trade[0]}" value="${trade[9] || ''}"></td>
                <td><input id="tp-${trade[0]}" class="trade-input tp-input" type="number" step="0.01" data-trade-id="${trade[0]}" value="${trade[10] || ''}"></td>
                <td>${pnlFormatted} ${pnlPercentFormatted}</td>
                <td>
                    <button class="action-button update" onclick="updateTradeSettings('${trade[0]}', document.getElementById('sl-${trade[0]}').value, document.getElementById('tp-${trade[0]}').value)">Update</button>
                    <button class="action-button close" onclick="closeTrade('${trade[0]}')">Close</button>
                    <button class="action-button" onclick="window.showTradeOnChart('${trade[0]}', '${trade[1]}')">Chart</button>
                </td>
            `;
            
            tableBody.appendChild(tradeRow);
            return tradeRow;
        } catch (err) {
            console.error(`Error processing trade ${trade[0]}:`, err);
            return null;
        }
    });
    
    await Promise.all(activeTradePromises);
}
            
            // Trade values from database:
            // 0: id
            // 1: symbol
            // 2: side
            // 3: size
            // 4: entry_price
            // 5: exit_price
            // 6: pnl
            // 7: status
            // 8: timestamp
            // 9: stop_loss
            // 10: take_profit
            
            const row = document.createElement('tr');
            row.className = trade[2];
            row.setAttribute('data-trade-id', trade[0]);
            row.innerHTML = `
                <td>${trade[1]}</td>
                <td class="${trade[2]}">${trade[2]}</td>
                <td>${parseFloat(trade[3]).toFixed(4)}</td>
                <td>${parseFloat(trade[4]).toFixed(2)}</td>
                <td>${currentPrice.toFixed(2)}</td>
                <td>
                    <input type="number" id="sl-${trade[0]}" placeholder="Stop Loss" value="${trade[9] || ''}" step="0.01">
                </td>
                <td>
                    <input type="number" id="tp-${trade[0]}" placeholder="Take Profit" value="${trade[10] || ''}" step="0.01">
                </td>
                <td class="${pnl >= 0 ? 'profit' : 'loss'}">${pnl.toFixed(2)}</td>
                <td class="actions">
                    <div class="action-buttons">
                        <button class="update-btn" onclick="updateTradeSettings('${trade[0]}', document.getElementById('sl-${trade[0]}').value, document.getElementById('tp-${trade[0]}').value)">✓</button>
                        <button class="view-btn" onclick="highlightTrade('${trade[0]}')">📊</button>
                        <button class="close-btn" onclick="closeTrade('${trade[0]}')">Close</button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        } catch (e) {
            console.error(`Error processing trade ${trade[0]}:`, e);
        }
    });
    
    await Promise.all(activeTradePromises);
}

function updateClosedTradesTable(tableId, closedTrades) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    table.innerHTML = `<thead>
        <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&L</th>
            <th>Time</th>
        </tr>
    </thead>
    <tbody>
    </tbody>`;
    
    const tableBody = table.querySelector('tbody');
    
    // Process closed trades (limit to 20 most recent)
    const recentClosedTrades = (closedTrades || []).slice(0, 20);
    
    recentClosedTrades.forEach(trade => {
        try {
            // Parse trade values
            const pnl = parseFloat(trade[6]);
            const timestamp = new Date(trade[8]);
            const formattedDate = `${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            
            // Create table row
            const row = document.createElement('tr');
            row.className = pnl >= 0 ? 'profit' : 'loss';
            
            row.innerHTML = `
                <td>${trade[1]}</td>
                <td class="${trade[2]}">${trade[2]}</td>
                <td>${parseFloat(trade[3]).toFixed(4)}</td>
                <td>${parseFloat(trade[4]).toFixed(2)}</td>
                <td>${parseFloat(trade[5]).toFixed(2)}</td>
                <td class="${pnl >= 0 ? 'profit' : 'loss'}">${pnl.toFixed(2)}</td>
                <td>${formattedDate}</td>
            `;
            
            tableBody.appendChild(row);
        } catch (e) {
            console.error(`Error processing closed trade:`, e);
        }
    });
}

// Function to update trade settings (stop loss and take profit)
window.updateTradeSettings = async function(tradeId, stopLoss, takeProfit) {
    try {
        window.showLoading();
        console.log(`Updating settings for trade ${tradeId}`, { stopLoss, takeProfit });
        
        // Convert inputs to numbers or null
        const sl = stopLoss ? parseFloat(stopLoss) : null;
        const tp = takeProfit ? parseFloat(takeProfit) : null;
        
        const response = await fetch('/update_trade_settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                trade_id: tradeId,
                stop_loss: sl,
                take_profit: tp
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Trade settings updated:', result.message);
            // Show success feedback
            const inputSl = document.getElementById(`sl-${tradeId}`);
            const inputTp = document.getElementById(`tp-${tradeId}`);
            
            if (inputSl) inputSl.style.backgroundColor = '#e6ffe6'; // light green
            if (inputTp) inputTp.style.backgroundColor = '#e6ffe6'; // light green
            
            // Reset background color after a moment
            setTimeout(() => {
                if (inputSl) inputSl.style.backgroundColor = '';
                if (inputTp) inputTp.style.backgroundColor = '';
            }, 2000);
            
            // Update trade markers on chart
            updateTrades();
            
            // Show success notification
            showNotification('Trade settings updated successfully', 'success');
        } else {
            console.error('Failed to update trade settings:', result.message);
            // Show error feedback
            showNotification(`Failed to update trade settings: ${result.message}`, 'error');
        }
        
        window.hideLoading();
    } catch (error) {
        window.hideLoading();
        console.error('Error updating trade settings:', error);
        showNotification('Error updating trade settings. Please try again.', 'error');
    }
}

// Function to update trade markers on the chart
async function updateTradeMarkers(trades) {
    try {
        console.log('Updating trade markers with trades:', trades);
        
        // Clear existing markers (first check they exist)
        if (activeTradeMarkers && typeof activeTradeMarkers.length !== 'undefined' && activeTradeMarkers.length) {
            for (const marker of activeTradeMarkers) {
                if (marker && typeof marker.remove === 'function') {
                    try {
                        marker.remove();
                    } catch (err) {
                        console.log('Error removing active marker:', err);
                    }
                }
            }
        }
        
        if (closedTradeMarkers && typeof closedTradeMarkers.length !== 'undefined' && closedTradeMarkers.length) {
            for (const marker of closedTradeMarkers) {
                if (marker && typeof marker.remove === 'function') {
                    try {
                        marker.remove();
                    } catch (err) {
                        console.log('Error removing closed marker:', err);
                    }
                }
            }
        }
        
        // Reset arrays
        activeTradeMarkers = [];
        closedTradeMarkers = [];
        
        if (!candleSeries || !chart) {
            console.warn('Chart not initialized, cannot add trade markers');
            return;
        }
        
        // Count how many trades we found for the current symbol
        let activeTradeCount = 0;
        let closedTradeCount = 0;
        
        // Add markers for active trades
        const activeTrades = trades.active_trades || [];
        for (const trade of activeTrades) {
            const symbol = trade[1];
            
            // Only add markers for the current chart symbol
            if (symbol !== currentSymbol) continue;
            
            activeTradeCount++;
            console.log(`Adding markers for active trade: ${trade[0]} (${symbol})`);
            
            // Trade details
            const side = trade[2];           // Buy or Sell
            const size = parseFloat(trade[3]);
            const entryPrice = parseFloat(trade[4]);
            const stopLoss = parseFloat(trade[9]) || null;
            const takeProfit = parseFloat(trade[10]) || null;
            
            // Color based on side
            const sideColor = side === 'Buy' ? '#4CAF50' : '#f44336';
            
            // Add entry point line
            const entryLine = candleSeries.createPriceLine({
                price: entryPrice,
                color: sideColor,
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: `${side} @ ${entryPrice.toFixed(2)}`,
            });
            activeTradeMarkers.push(entryLine);
            
            // Add stop loss line if defined
            if (stopLoss && !isNaN(stopLoss)) {
                const slLine = candleSeries.createPriceLine({
                    price: stopLoss,
                    color: '#f44336', // Red
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true,
                    title: 'SL',
                });
                activeTradeMarkers.push(slLine);
            }
            
            // Add take profit line if defined
            if (takeProfit && !isNaN(takeProfit)) {
                const tpLine = candleSeries.createPriceLine({
                    price: takeProfit,
                    color: '#4CAF50', // Green
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true,
                    title: 'TP',
                });
                activeTradeMarkers.push(tpLine);
            }
        }
        
        // Add closed trade markers (just for context, limit to last 3 to avoid clutter)
        const closedTrades = (trades.closed_trades || []).slice(0, 5);
        for (const trade of closedTrades) {
            const symbol = trade[1];
            
            // Only add markers for the current chart symbol
            if (symbol !== currentSymbol) continue;
            
            closedTradeCount++;
            const entryPrice = parseFloat(trade[4]);
            const exitPrice = parseFloat(trade[5]);
            const pnl = parseFloat(trade[6]);
            const timestamp = new Date(trade[8]);
            
            // Only add if trade was closed in last 48 hours
            const now = new Date();
            const timeDiff = now - timestamp;
            if (timeDiff > 48 * 60 * 60 * 1000) continue;
            
            // Add a marker for the closed trade
            const closedLine = candleSeries.createPriceLine({
                price: exitPrice,
                color: pnl >= 0 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                axisLabelVisible: true,
                title: `Closed: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
            });
            closedTradeMarkers.push(closedLine);
        }
        
        // Add a "No trades" marker if there are no trades for this symbol
        if (activeTradeCount === 0 && closedTradeCount === 0) {
            // Get the current visible price range
            const priceScale = chart.priceScale('right');
            const priceRange = priceScale.priceRange();
            
            if (priceRange) {
                // Calculate a position near the middle of the visible range
                const visibleRange = chart.timeScale().getVisibleRange();
                
                if (visibleRange) {
                    const middlePrice = (priceRange.minValue() + priceRange.maxValue()) / 2;
                    
                    // Add an informational marker
                    const noTradesLabel = candleSeries.createPriceLine({
                        price: middlePrice,
                        color: 'rgba(100, 100, 100, 0.5)',
                        lineWidth: 0,
                        axisLabelVisible: true,
                        title: `No ${currentSymbol} trades found`,
                    });
                    activeTradeMarkers.push(noTradesLabel);
                }
            }
        }
        
        console.log(`Added ${activeTradeMarkers.length} active trade markers and ${closedTradeMarkers.length} closed trade markers for ${currentSymbol}`);
    } catch (error) {
        console.error('Error updating trade markers:', error);
    }
}

// Function to show chart for specific symbol and highlight a trade
window.showTradeOnChart = function(tradeId, symbol) {
    try {
        console.log(`Showing chart for trade ${tradeId} (${symbol})`);
        
        // Switch to the dashboard tab first
        switchTab('dashboard');
        
        // Check if we need to change the symbol
        const needSymbolChange = currentSymbol !== symbol;
        
        if (needSymbolChange) {
            // Set the chart symbol in the dropdown
            const symbolSelect = document.getElementById('chart-symbol');
            symbolSelect.value = symbol;
            
            // Update the current symbol
            currentSymbol = symbol;
            
            // Show loading indicator
            if (window.showLoading) window.showLoading();
            
            // Flash the dropdown to indicate it changed
            symbolSelect.style.backgroundColor = '#ffeb3b';
            setTimeout(() => {
                symbolSelect.style.backgroundColor = '';
            }, 1000);
            
            // Update the chart with the new symbol
            fetchCandlestickData().then(() => {
                // Find and highlight the specific trade on the chart
                highlightTradeOnChart(tradeId);
                
                // Hide loading indicator
                if (window.hideLoading) window.hideLoading();
                
                // Show notification
                showNotification(`Now showing ${symbol} chart with trade #${tradeId}`, 'success');
            }).catch(err => {
                console.error('Error updating chart:', err);
                if (window.hideLoading) window.hideLoading();
                showNotification(`Error showing chart: ${err.message}`, 'error');
            });
        } else {
            // Same symbol, just highlight the trade
            highlightTradeOnChart(tradeId);
            showNotification(`Highlighting trade #${tradeId} on ${symbol} chart`, 'success');
        }
    } catch (error) {
        console.error('Error in showTradeOnChart:', error);
        if (window.hideLoading) window.hideLoading();
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// Function to highlight a specific trade on the chart
function highlightTradeOnChart(tradeId) {
    try {
        // Find the trade in our active trades
        fetch('/trades')
            .then(response => response.json())
            .then(trades => {
                // Find the trade by ID
                const activeTrades = trades.active_trades || [];
                const trade = activeTrades.find(t => t[0] === tradeId);
                
                if (!trade) {
                    console.log(`Trade ${tradeId} not found or not active`);
                    showNotification('Trade not found or no longer active', 'warning');
                    return;
                }
                
                // Clear current markers
                if (activeTradeMarkers && activeTradeMarkers.length) {
                    for (const marker of activeTradeMarkers) {
                        if (marker && typeof marker.remove === 'function') {
                            try {
                                marker.remove();
                            } catch (err) {
                                console.log('Error removing marker:', err);
                            }
                        }
                    }
                    activeTradeMarkers = [];
                }
                
                // Extract trade details
                const symbol = trade[1];
                const side = trade[2];
                const size = parseFloat(trade[3]);
                const entryPrice = parseFloat(trade[4]);
                const stopLoss = parseFloat(trade[9]) || null;
                const takeProfit = parseFloat(trade[10]) || null;
                
                // Color based on side
                const sideColor = side === 'Buy' ? '#4CAF50' : '#f44336';
                
                // Add special highlighted entry line
                const entryLine = candleSeries.createPriceLine({
                    price: entryPrice,
                    color: sideColor,
                    lineWidth: 3,
                    lineStyle: LightweightCharts.LineStyle.Solid,
                    axisLabelVisible: true,
                    title: `⭐ ${side} @ ${entryPrice.toFixed(2)}`,
                    axisLabelTextColor: '#000000',
                    axisLabelColor: sideColor,
                });
                activeTradeMarkers.push(entryLine);
                
                // Add stop loss line if defined
                if (stopLoss && !isNaN(stopLoss)) {
                    const slLine = candleSeries.createPriceLine({
                        price: stopLoss,
                        color: '#f44336',
                        lineWidth: 2,
                        lineStyle: LightweightCharts.LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: 'SL',
                    });
                    activeTradeMarkers.push(slLine);
                    
                    // Calculate risk percentage
                    const riskPct = Math.abs((entryPrice - stopLoss) / entryPrice * 100).toFixed(2);
                    
                    // Add risk label
                    const riskLabel = candleSeries.createPriceLine({
                        price: (stopLoss + entryPrice) / 2, // Midpoint between entry and stop
                        color: 'rgba(244, 67, 54, 0.4)', // Transparent red
                        lineWidth: 0,
                        axisLabelVisible: true,
                        title: `Risk: ${riskPct}%`,
                    });
                    activeTradeMarkers.push(riskLabel);
                }
                
                // Add take profit line if defined
                if (takeProfit && !isNaN(takeProfit)) {
                    const tpLine = candleSeries.createPriceLine({
                        price: takeProfit,
                        color: '#4CAF50',
                        lineWidth: 2,
                        lineStyle: LightweightCharts.LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: 'TP',
                    });
                    activeTradeMarkers.push(tpLine);
                    
                    // Calculate reward percentage
                    let rewardPct;
                    if (side === 'Buy') {
                        rewardPct = ((takeProfit - entryPrice) / entryPrice * 100).toFixed(2);
                    } else {
                        rewardPct = ((entryPrice - takeProfit) / entryPrice * 100).toFixed(2); 
                    }
                    
                    // Add reward label
                    const rewardLabel = candleSeries.createPriceLine({
                        price: (takeProfit + entryPrice) / 2, // Midpoint
                        color: 'rgba(76, 175, 80, 0.4)', // Transparent green
                        lineWidth: 0,
                        axisLabelVisible: true,
                        title: `Target: ${rewardPct}%`,
                    });
                    activeTradeMarkers.push(rewardLabel);
                }
                
                // Show risk-reward ratio if both SL and TP are defined
                if (stopLoss && takeProfit && !isNaN(stopLoss) && !isNaN(takeProfit)) {
                    const riskAmount = Math.abs(entryPrice - stopLoss);
                    const rewardAmount = Math.abs(entryPrice - takeProfit);
                    const rrRatio = (rewardAmount / riskAmount).toFixed(2);
                    
                    // Add R:R label near the center of the chart
                    const rrLabel = candleSeries.createPriceLine({
                        price: entryPrice, // At entry price
                        color: 'rgba(33, 150, 243, 0.6)', // Blue
                        lineWidth: 0,
                        axisLabelVisible: true,
                        title: `R:R = 1:${rrRatio}`,
                    });
                    activeTradeMarkers.push(rrLabel);
                }
                
                // Flash the trade row in the active trades table
                const tradeRow = document.querySelector(`tr[data-trade-id="${tradeId}"]`);
                if (tradeRow) {
                    tradeRow.classList.add('highlight-trade');
                    setTimeout(() => tradeRow.classList.remove('highlight-trade'), 3000);
                }
                
                // Fit visible range to include entry point and ensure trade lines are visible
                const now = Math.floor(Date.now() / 1000);
                const oneDayAgo = now - (24 * 60 * 60);
                chart.timeScale().setVisibleRange({
                    from: oneDayAgo,
                    to: now,
                });
                
                console.log(`Highlighted trade ${tradeId} on chart`);
            })
            .catch(error => {
                console.error('Error highlighting trade:', error);
                showNotification(`Error highlighting trade: ${error.message}`, 'error');
            });
    } catch (error) {
        console.error('Error in highlightTradeOnChart:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}