let refreshInterval;
let balanceInterval;
let chartUpdateInterval;

// Global chart variables
let chart = null;
let candleSeries = null;
let volumeSeries = null;

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

// Function to load chart library
async function loadChartLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof LightweightCharts !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load chart library'));
        document.head.appendChild(script);
    });
}

// Function to initialize the chart
async function initializeChart() {
    try {
        console.log('Initializing chart...');
        showLoading();
        
        // First, ensure the chart library is loaded
        await loadChartLibrary();
        
        const chartContainer = document.getElementById('price-chart');
        if (!chartContainer) {
            throw new Error('Chart container not found');
        }
        
        // Clear any existing chart
        chartContainer.innerHTML = '';
        
        // Set initial dimensions
        chartContainer.style.height = '500px';
        chartContainer.style.width = '100%';
        
        // Get actual container dimensions
        const containerWidth = chartContainer.clientWidth || 800;
        const containerHeight = chartContainer.clientHeight || 500;
        
        // Cleanup existing chart instance if it exists
        if (chart) {
            chart.remove();
            chart = null;
        }

        // Create chart with proper dimensions
        chart = LightweightCharts.createChart(chartContainer, {
            width: containerWidth,
            height: containerHeight,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333333',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.1)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#D1D4DC',
                rightOffset: 5,
                barSpacing: 8,
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            handleScale: {
                mouseWheel: true,
                pinch: true,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true,
            }
        });

        // Initialize candlestick series
        candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350'
        });

        // Initialize volume series
        volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceLineVisible: false,
            priceScaleId: ''
        });

        // Set up window resize handler
        const resizeHandler = () => {
            // Get the container element
            const chartContainer = document.getElementById('price-chart');
            if (!chartContainer || !chart) return;
            
            // Get actual container dimensions, but only update if they're valid
            const width = chartContainer.clientWidth || 800;
            const height = chartContainer.clientHeight || 500;
            
            // Only resize if dimensions are reasonable (prevent minimizing)
            if (width > 200 && height > 200) {
                chart.applyOptions({ width, height });
            }
        };

        // Use a debounced version of the resize handler to prevent excessive updates
        let resizeTimeout;
        window.addEventListener('resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizeHandler, 100);
        });

        // Don't trigger resize on scroll events
        window.addEventListener('scroll', (e) => {
            e.stopPropagation();
        }, true);

        // Load initial data
        await loadChartData();
        hideLoading();
        
        return Promise.resolve();
    } catch (error) {
        console.error('Chart initialization failed:', error);
        hideLoading();
        const chartContainer = document.getElementById('price-chart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="chart-error" style="text-align: center; padding: 20px;">
                    <p>Chart initialization failed: ${error.message}</p>
                    <button onclick="initializeChart()" style="padding: 10px; margin-top: 10px;">Retry</button>
                </div>`;
        }
        return Promise.reject(error);
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
    else if (currentSymbol.includes('SOL')) price = 100;
    else if (currentSymbol.includes('BNB')) price = 300;
    
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
        showLoading();
        
        if (!chart || !candleSeries) {
            console.warn('Chart not initialized, attempting to initialize...');
            await initializeChart();
            if (!chart || !candleSeries) {
                throw new Error('Chart initialization failed');
            }
        }
        
        // Ensure chart is properly sized
        const chartContainer = document.getElementById('price-chart');
        if (chartContainer) {
            chart.resize(
                chartContainer.clientWidth,
                chartContainer.clientHeight || 500
            );
        }
        
        console.log(`Fetching chart data for ${currentSymbol}...`);
        const response = await fetch(`/chart_data?symbol=${currentSymbol}`);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data format received from server');
        }
        
        console.log(`Received ${data.candles ? data.candles.length : 0} candles`);
        
        if (data.candles && Array.isArray(data.candles) && data.candles.length > 0) {
            candleSeries.setData(data.candles);
            
            try {
                // Fetch trades to add markers
                const tradesResponse = await fetch('/trades');
                if (!tradesResponse.ok) {
                    throw new Error(`Failed to fetch trades: ${tradesResponse.status}`);
                }
                
                const trades = await tradesResponse.json();
                if (Array.isArray(trades.active_trades)) {
                    updateTradeMarkers(trades);
                    
                    // Update symbol in UI
                    const symbolLabel = document.getElementById('current-symbol-label');
                    if (symbolLabel) {
                        symbolLabel.textContent = currentSymbol;
                    }
                    
                    // Update the document title to include the symbol
                    document.title = `${currentSymbol} | Trading Bot Dashboard`;
                    return trades;
                } else {
                    throw new Error('Invalid trades data format');
                }
            } catch (tradeError) {
                console.error('Error fetching trade data:', tradeError);
                showNotification('Could not load trade markers, but chart data is available', 'warning');
            }
        } else {
            console.warn('No candle data received, using demo data');
            const demoData = createDemoChartData();
            candleSeries.setData(demoData);
            showNotification('Using demo data - no live data available', 'warning');
        }
    } catch (error) {
        console.error('Error fetching candlestick data:', error);
        showNotification(`Chart data error: ${error.message}`, 'error');
        
        // Create fallback demo data on error
        const demoData = createDemoChartData();
        candleSeries.setData(demoData);
    } finally {
        hideLoading();
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
                return true;
            }
            
            // Ensure marker is within visible range plus some buffer
            const visible = marker.time >= (rangeStart - 86400) && marker.time <= (rangeEnd + 86400);
            if (!visible) {
                console.log(`Marker outside visible range, adjusting: ${marker.time}`);
                marker.time = now - Math.floor(Math.random() * 7200); // Random time in last 2 hours
                return true;
            }
            
            // Only include markers for current symbol and those within range
            return marker.text && (
                marker.text.includes(currentSymbol) || 
                marker.text === 'Debug marker' ||
                marker.text.startsWith('No') ||
                marker.text.startsWith('SL') ||
                marker.text.startsWith('TP')
            );
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
            
            if (previousSymbol !== currentSymbol) {
                console.log(`Switching chart from ${previousSymbol} to ${currentSymbol}`);
                document.title = `${currentSymbol} | Trading Bot Dashboard`;
            }
        }
        
        // Ensure chart container exists and has proper dimensions
        const chartContainer = document.getElementById('price-chart');
        if (!chartContainer) {
            throw new Error('Chart container not found');
        }
        
        // Set minimum dimensions if needed
        if (chartContainer.clientHeight < 400) {
            chartContainer.style.height = '400px';
        }
        if (chartContainer.clientWidth < 600) {
            chartContainer.style.width = '100%';
        }
        
        // Reinstantiate chart if it doesn't exist
        if (!chart) {
            console.log('Chart not initialized, initializing...');
            await initializeChart();
            return; // initializeChart will call fetchCandlestickData
        }
        
        console.log(`Updating chart for ${currentSymbol}...`);
        
        // Update chart size with validated dimensions
        const width = Math.max(600, chartContainer.clientWidth);
        const height = Math.max(400, chartContainer.clientHeight);
        chart.applyOptions({ width, height });
        
        // Fetch the candle data
        await fetchCandlestickData();
        await updateTrades();
        
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
        showLoading();
        
        const response = await fetch('/trades');
        if (!response.ok) {
            throw new Error(`Failed to fetch trades: ${response.status} ${response.statusText}`);
        }
        
        const trades = await response.json();
        console.log("Trades data received:", trades);
        
        // Validate trades data structure
        if (!trades || typeof trades !== 'object') {
            throw new Error('Invalid trades data format received');
        }
        
        // Get references to required tables
        const dashboardActiveTrades = document.getElementById('active-trades');
        const tradesTabActive = document.getElementById('trades-active');
        const dashboardClosedTrades = document.getElementById('closed-trades');
        const tradesTabClosed = document.getElementById('trades-closed');
        
        if (!dashboardActiveTrades || !tradesTabActive || !dashboardClosedTrades || !tradesTabClosed) {
            throw new Error('Required trade tables not found in DOM');
        }
        
        // Update Active Trades tables (with error handling for each table)
        try {
            if (!Array.isArray(trades.active_trades)) {
                throw new Error('Active trades data is not an array');
            }
            updateActiveTradesTable('active-trades', trades.active_trades);
            updateActiveTradesTable('trades-active', trades.active_trades);
        } catch (activeError) {
            console.error('Error updating active trades tables:', activeError);
            showNotification('Error updating active trades display', 'error');
        }
        
        // Update Closed Trades tables (with error handling for each table)
        try {
            if (!Array.isArray(trades.closed_trades)) {
                throw new Error('Closed trades data is not an array');
            }
            updateClosedTradesTable('closed-trades', trades.closed_trades);
            updateClosedTradesTable('trades-closed', trades.closed_trades);
        } catch (closedError) {
            console.error('Error updating closed trades tables:', closedError);
            showNotification('Error updating closed trades display', 'error');
        }
        
        // Update trade markers on chart
        try {
            await updateTradeMarkers(trades);
        } catch (markerError) {
            console.error('Error updating trade markers:', markerError);
            showNotification('Error updating trade markers', 'warning');
        }
        
        // Update profit metrics
        try {
            await updateProfitMetrics();
        } catch (metricsError) {
            console.error('Error updating profit metrics:', metricsError);
            showNotification('Error updating profit metrics', 'warning');
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error updating trades:', error);
        showNotification(`Failed to update trades: ${error.message}`, 'error');
        
        // Create empty tables if data fetch failed
        updateActiveTradesTable('active-trades', []);
        updateActiveTradesTable('trades-active', []);
        updateClosedTradesTable('closed-trades', []);
        updateClosedTradesTable('trades-closed', []);
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
        
        if (!candleSeries || !chart) {
            console.warn('Chart not initialized for markers, attempting to initialize...');
            await initializeChart();
            if (!candleSeries || !chart) {
                return; // Skip markers if chart still not available
            }
        }
        
        // Clear existing markers first
        try {
            candleSeries.setMarkers([]);
        } catch (e) {
            console.warn('Error clearing existing markers:', e);
        }
        
        // Validate trades data
        if (!trades || typeof trades !== 'object') {
            throw new Error('Invalid trades data format');
        }
        
        // Safely clear existing markers
        // Verify activeTradeMarkers is an array and has a length property
        if (activeTradeMarkers && typeof activeTradeMarkers.length !== 'undefined') {
            for (let i = activeTradeMarkers.length - 1; i >= 0; i--) {
                try {
                    const marker = activeTradeMarkers[i];
                    if (marker && typeof marker.remove === 'function') {
                        marker.remove();
                    }
                } catch (err) {
                    console.warn('Error removing active marker:', err);
                }
            }
        }
        
        // Safely clear closed trade markers
        // Verify closedTradeMarkers is an array and has a length property
        if (closedTradeMarkers && typeof closedTradeMarkers.length !== 'undefined') {
            for (let i = closedTradeMarkers.length - 1; i >= 0; i--) {
                try {
                    const marker = closedTradeMarkers[i];
                    if (marker && typeof marker.remove === 'function') {
                        marker.remove();
                    }
                } catch (err) {
                    console.warn('Error removing closed marker:', err);
                }
            }
        }
        
        // Reset arrays
        activeTradeMarkers = [];
        closedTradeMarkers = [];
        
        // Count how many trades we found for the current symbol
        let activeTradeCount = 0;
        let closedTradeCount = 0;
        
        // Add markers for active trades
        const activeTrades = Array.isArray(trades.active_trades) ? trades.active_trades : [];
        for (const trade of activeTrades) {
            try {
                if (!Array.isArray(trade) || trade.length < 5) {
                    console.warn('Skipping invalid trade record:', trade);
                    continue;
                }
                
                const symbol = trade[1];
                if (!symbol || symbol !== currentSymbol) continue;
                
                activeTradeCount++;
                console.log(`Adding markers for active trade: ${trade[0]} (${symbol})`);
                
                const side = trade[2];
                const entryPrice = parseFloat(trade[4]);
                const stopLoss = parseFloat(trade[9]);
                const takeProfit = parseFloat(trade[10]);
                
                if (isNaN(entryPrice)) {
                    console.warn(`Invalid entry price for trade ${trade[0]}: ${trade[4]}`);
                    continue;
                }
                
                // Color based on side
                const sideColor = side === 'Buy' ? '#4CAF50' : '#f44336';
                
                // Add entry point line
                try {
                    const entryLine = candleSeries.createPriceLine({
                        price: entryPrice,
                        color: sideColor,
                        lineWidth: 2,
                        lineStyle: LightweightCharts.LineStyle.Solid,
                        axisLabelVisible: true,
                        title: `${side} @ ${entryPrice.toFixed(2)}`,
                    });
                    activeTradeMarkers.push(entryLine);
                    
                    // Add stop loss line if valid
                    if (!isNaN(stopLoss)) {
                        const slLine = candleSeries.createPriceLine({
                            price: stopLoss,
                            color: '#f44336',
                            lineWidth: 1,
                            lineStyle: LightweightCharts.LineStyle.Dashed,
                            axisLabelVisible: true,
                            title: 'SL',
                        });
                        activeTradeMarkers.push(slLine);
                    }
                    
                    // Add take profit line if valid
                    if (!isNaN(takeProfit)) {
                        const tpLine = candleSeries.createPriceLine({
                            price: takeProfit,
                            color: '#4CAF50',
                            lineWidth: 1,
                            lineStyle: LightweightCharts.LineStyle.Dashed,
                            axisLabelVisible: true,
                            title: 'TP',
                        });
                        activeTradeMarkers.push(tpLine);
                    }
                } catch (markerErr) {
                    console.error(`Error creating marker for trade ${trade[0]}:`, markerErr);
                }
            } catch (tradeErr) {
                console.error('Error processing active trade:', tradeErr);
            }
        }
        
        // Add closed trade markers (limited to recent ones to avoid clutter)
        const closedTrades = Array.isArray(trades.closed_trades) ? trades.closed_trades.slice(0, 5) : [];
        for (const trade of closedTrades) {
            try {
                if (!Array.isArray(trade) || trade.length < 6) {
                    console.warn('Skipping invalid closed trade record:', trade);
                    continue;
                }
                
                const symbol = trade[1];
                if (!symbol || symbol !== currentSymbol) continue;
                
                closedTradeCount++;
                const entryPrice = parseFloat(trade[4]);
                const exitPrice = parseFloat(trade[5]);
                const pnl = parseFloat(trade[6]);
                
                if (isNaN(exitPrice) || isNaN(pnl)) {
                    console.warn(`Invalid price/PnL for closed trade ${trade[0]}`);
                    continue;
                }
                
                try {
                    const closedLine = candleSeries.createPriceLine({
                        price: exitPrice,
                        color: pnl >= 0 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)',
                        lineWidth: 1,
                        lineStyle: LightweightCharts.LineStyle.Dotted,
                        axisLabelVisible: true,
                        title: `Closed: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
                    });
                    closedTradeMarkers.push(closedLine);
                } catch (markerErr) {
                    console.error(`Error creating closed trade marker for ${trade[0]}:`, markerErr);
                }
            } catch (tradeErr) {
                console.error('Error processing closed trade:', tradeErr);
            }
        }
        
        // Add "No trades" marker if no trades found for this symbol
        if (activeTradeCount === 0 && closedTradeCount === 0) {
            try {
                const priceScale = chart.priceScale('right');
                const priceRange = priceScale.priceRange();
                const visibleRange = chart.timeScale().getVisibleRange();
                
                if (priceRange && visibleRange) {
                    const middlePrice = (priceRange.minValue() + priceRange.maxValue()) / 2;
                    const noTradesLabel = candleSeries.createPriceLine({
                        price: middlePrice,
                        color: 'rgba(100, 100, 100, 0.5)',
                        lineWidth: 0,
                        axisLabelVisible: true,
                        title: `No ${currentSymbol} trades found`,
                    });
                    activeTradeMarkers.push(noTradesLabel);
                }
            } catch (err) {
                console.warn('Error creating no trades marker:', err);
            }
        }
        
        console.log(`Added ${activeTradeMarkers.length} active trade markers and ${closedTradeMarkers.length} closed trade markers for ${currentSymbol}`);
    } catch (error) {
        console.error('Error updating trade markers:', error);
        showNotification('Error updating trade markers on chart', 'error');
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