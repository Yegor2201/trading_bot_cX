/**
 * Chart Enhancements Script
 * This script enhances the trading bot's chart functionality by:
 * 1. Ensuring the chart properly displays at full size
 * 2. Enabling coin-specific trades to show on their respective charts
 * 3. Adding functionality to display a coin's chart when clicking on a trade
 */

(function() {
    console.log('Chart Enhancements: Initializing');
    
    // Wait for the document to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(enhanceCharts, 1000); // Delay to ensure all scripts are loaded
    });
    
    // Wait for the main app.js to initialize
    window.addEventListener('load', function() {
        setTimeout(enhanceCharts, 2000); // Delay to ensure all scripts are loaded
    });
    
    function enhanceCharts() {
        console.log('Chart Enhancements: Applying chart improvements');
        
        // Fix chart display sizing
        const chartContainer = document.getElementById('chart-container');
        const priceChart = document.getElementById('price-chart');
        
        if (chartContainer) {
            chartContainer.style.height = '520px';
            chartContainer.style.minHeight = '520px';
            console.log('Chart Enhancements: Chart container height set to 520px');
        }
        
        if (priceChart) {
            priceChart.style.height = '500px !important';
            priceChart.style.minHeight = '500px';
            priceChart.style.width = '100% !important';
            console.log('Chart Enhancements: Price chart height set to 500px');
        }
        
        // Enhance the showTradeOnChart function if it exists
        if (window.showTradeOnChart) {
            console.log('Chart Enhancements: Enhancing showTradeOnChart function');
            
            // Store the original function
            const originalShowTradeOnChart = window.showTradeOnChart;
            
            // Replace with enhanced version
            window.showTradeOnChart = function(tradeId, symbol) {
                console.log(`Chart Enhancements: Showing chart for trade ${tradeId} (${symbol})`);
                
                // Switch to the dashboard tab first
                if (window.switchTab) {
                    window.switchTab('dashboard');
                }
                
                // Check if we need to change the symbol
                const needSymbolChange = window.currentSymbol !== symbol;
                
                if (needSymbolChange) {
                    // Set the chart symbol in the dropdown
                    const symbolSelect = document.getElementById('chart-symbol');
                    if (symbolSelect) {
                        symbolSelect.value = symbol;
                        
                        // Update the current symbol
                        window.currentSymbol = symbol;
                        
                        // Show loading indicator
                        if (window.showLoading) window.showLoading();
                        
                        // Flash the dropdown to indicate it changed
                        symbolSelect.style.backgroundColor = '#ffeb3b';
                        setTimeout(() => {
                            symbolSelect.style.backgroundColor = '';
                        }, 1000);
                        
                        // Update the chart
                        if (window.updateChart) {
                            window.updateChart().then(() => {
                                // After chart update, highlight the trade
                                if (window.highlightTradeOnChart) {
                                    window.highlightTradeOnChart(tradeId);
                                }
                                
                                // Hide loading indicator
                                if (window.hideLoading) window.hideLoading();
                                
                                // Show notification
                                if (window.showNotification) {
                                    window.showNotification(`Now showing ${symbol} chart with trade #${tradeId}`, 'success');
                                }
                            }).catch(err => {
                                console.error('Error updating chart:', err);
                                if (window.hideLoading) window.hideLoading();
                                
                                if (window.showNotification) {
                                    window.showNotification(`Error showing chart: ${err.message}`, 'error');
                                }
                            });
                        } else {
                            // Fallback to original function if updateChart not available
                            originalShowTradeOnChart(tradeId, symbol);
                        }
                    } else {
                        // Fallback to original function if symbol select not available
                        originalShowTradeOnChart(tradeId, symbol);
                    }
                } else {
                    // Same symbol, just highlight the trade
                    if (window.highlightTradeOnChart) {
                        window.highlightTradeOnChart(tradeId);
                    }
                    
                    if (window.showNotification) {
                        window.showNotification(`Highlighting trade #${tradeId} on ${symbol} chart`, 'success');
                    }
                }
            };
        }
        
        // Make trade rows clickable for better UX
        function makeTradeRowsClickable() {
            console.log('Chart Enhancements: Making trade rows clickable');
            
            // Target both active trade tables
            const tradeTableIds = ['active-trades', 'trades-active'];
            
            tradeTableIds.forEach(tableId => {
                const table = document.getElementById(tableId);
                if (!table) return;
                
                // Add click event to table to delegate events (for dynamically added rows)
                table.addEventListener('click', function(e) {
                    // Find closest TR element that is a trade row
                    const tradeRow = e.target.closest('tr.trade-row');
                    
                    if (tradeRow) {
                        // Don't trigger if we clicked on an input or button
                        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                            return;
                        }
                        
                        // Get trade ID and symbol from row
                        const tradeId = tradeRow.getAttribute('data-trade-id');
                        
                        // Find the symbol cell (first TD)
                        const symbolCell = tradeRow.querySelector('td:first-child');
                        const symbol = symbolCell ? symbolCell.textContent.trim() : null;
                        
                        if (tradeId && symbol && window.showTradeOnChart) {
                            window.showTradeOnChart(tradeId, symbol);
                        }
                    }
                });
                
                // Add visual indication that rows are clickable
                const style = document.createElement('style');
                style.textContent = `
                    .trade-row {
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .trade-row:hover {
                        background-color: rgba(0, 0, 0, 0.05);
                    }
                    .highlight-trade {
                        animation: highlight-pulse 1.5s;
                    }
                    @keyframes highlight-pulse {
                        0% { background-color: rgba(255, 235, 59, 0.2); }
                        50% { background-color: rgba(255, 235, 59, 0.5); }
                        100% { background-color: rgba(255, 235, 59, 0); }
                    }
                    .clickable {
                        color: #1976D2;
                        text-decoration: underline;
                        cursor: pointer;
                    }
                `;
                document.head.appendChild(style);
            });
        }
        
        // Add enhanced chart functionality when switching symbols
        function enhanceChartSymbolSwitching() {
            console.log('Chart Enhancements: Enhancing chart symbol switching');
            
            const symbolSelect = document.getElementById('chart-symbol');
            if (!symbolSelect) return;
            
            // Update chart immediately when symbol changes
            symbolSelect.addEventListener('change', function() {
                const newSymbol = this.value;
                console.log(`Chart Enhancements: Symbol changed to ${newSymbol}`);
                
                if (window.currentSymbol !== newSymbol) {
                    window.currentSymbol = newSymbol;
                    
                    // Show loading indicator
                    if (window.showLoading) window.showLoading();
                    
                    // Update the chart
                    if (window.updateChart) {
                        window.updateChart().then(() => {
                            if (window.hideLoading) window.hideLoading();
                            
                            if (window.showNotification) {
                                window.showNotification(`Now showing ${newSymbol} chart`, 'success');
                            }
                        }).catch(err => {
                            console.error('Error updating chart:', err);
                            if (window.hideLoading) window.hideLoading();
                            
                            if (window.showNotification) {
                                window.showNotification(`Error showing chart: ${err.message}`, 'error');
                            }
                        });
                    }
                }
            });
        }
        
        // Make sure the chart is correctly sized on window resize
        function enhanceChartResizing() {
            console.log('Chart Enhancements: Enhancing chart resizing');
            
            // Handle window resize 
            window.addEventListener('resize', function() {
                if (window.chart) {
                    const chartContainer = document.getElementById('price-chart');
                    if (chartContainer) {
                        const width = chartContainer.clientWidth || 800;
                        const height = 500; // Fixed height for better display
                        
                        console.log(`Chart Enhancements: Resizing chart to ${width}x${height}`);
                        window.chart.resize(width, height);
                    }
                }
            });
        }
        
        // Call all the enhancement functions
        makeTradeRowsClickable();
        enhanceChartSymbolSwitching();
        enhanceChartResizing();
        
        // Force an update of the chart to apply any changes
        if (window.updateChart) {
            console.log('Chart Enhancements: Forcing chart update');
            window.updateChart();
        }
        
        console.log('Chart Enhancements: All enhancements applied');
    }
})();
