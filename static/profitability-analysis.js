/**
 * Profitability Analysis Module
 * This module enhances the trading bot by adding profitability analysis features.
 * Key features:
 * 1. Analyzes trade history to calculate win rate, profit factor, and drawdown
 * 2. Provides coin-specific profitability metrics
 * 3. Supports market volatility detection for improved trading decisions
 */

(function() {
    console.log('Profitability Analysis: Initializing');
    
    // Wait for the document to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(initProfitabilityAnalysis, 1500);
    });
    
    // Initialize the profitability analysis module
    async function initProfitabilityAnalysis() {
        console.log('Profitability Analysis: Starting initialization');
        
        // Update profit metrics periodically
        if (window.updateProfitMetrics) {
            console.log('Profitability Analysis: Original updateProfitMetrics function found');
            
            // Store the original function
            const originalUpdateProfitMetrics = window.updateProfitMetrics;
            
            // Replace with enhanced version
            window.updateProfitMetrics = async function() {
                try {
                    // Call the original function first
                    await originalUpdateProfitMetrics();
                    
                    // Then add our enhanced analytics
                    await enhancedProfitAnalytics();
                } catch (error) {
                    console.error('Profitability Analysis: Error updating profit metrics', error);
                    // Fall back to original if our enhanced version fails
                    await originalUpdateProfitMetrics();
                }
            };
        } else {
            // Create the function if it doesn't exist
            window.updateProfitMetrics = async function() {
                await enhancedProfitAnalytics();
            };
        }
        
        // First-time update
        updateProfitMetrics();
        
        // Set up a periodic update every 60 seconds
        setInterval(updateProfitMetrics, 60000);
        
        console.log('Profitability Analysis: Initialization complete');
    }
    
    // Enhanced profit analytics function
    async function enhancedProfitAnalytics() {
        try {
            console.log('Profitability Analysis: Calculating enhanced profit metrics');
            
            // Fetch closed trades data
            const response = await fetch('/trades');
            const data = await response.json();
            
            if (!data || !data.closed_trades || data.closed_trades.length === 0) {
                console.log('Profitability Analysis: No closed trades available for analysis');
                return;
            }
            
            const closedTrades = data.closed_trades;
            console.log(`Profitability Analysis: Found ${closedTrades.length} closed trades for analysis`);
            
            // Calculate metrics
            const metrics = calculateTradeMetrics(closedTrades);
            
            // Update the UI with calculated metrics
            updateMetricsUI(metrics);
            
            // Calculate coin-specific metrics
            analyzeBySymbol(closedTrades);
            
            // Detect market volatility
            detectVolatility(closedTrades);
            
            console.log('Profitability Analysis: Completed enhanced profit metrics calculation');
        } catch (error) {
            console.error('Profitability Analysis: Error calculating profit metrics', error);
        }
    }
    
    // Calculate overall trading metrics
    function calculateTradeMetrics(trades) {
        // Initialize metrics
        let totalTrades = trades.length;
        let winningTrades = 0;
        let losingTrades = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let maxDrawdown = 0;
        let peakBalance = 0;
        let currentDrawdown = 0;
        
        // Running balance for drawdown calculation
        let runningBalance = 0;
        
        // Process trades in chronological order (trades are typically returned newest first)
        const sortedTrades = [...trades].sort((a, b) => new Date(a[8]) - new Date(b[8]));
        
        sortedTrades.forEach(trade => {
            const pnl = parseFloat(trade[6]);
            
            // Update running balance
            runningBalance += pnl;
            
            // Update peak balance (high water mark)
            if (runningBalance > peakBalance) {
                peakBalance = runningBalance;
                currentDrawdown = 0;
            } else {
                // Calculate current drawdown
                currentDrawdown = peakBalance - runningBalance;
                // Update max drawdown if current is greater
                if (currentDrawdown > maxDrawdown) {
                    maxDrawdown = currentDrawdown;
                }
            }
            
            // Update win/loss counters
            if (pnl >= 0) {
                winningTrades++;
                grossProfit += pnl;
                totalProfit += pnl;
            } else {
                losingTrades++;
                grossLoss += Math.abs(pnl);
                totalLoss += Math.abs(pnl);
            }
        });
        
        // Calculate derived metrics
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0;
        const averageWin = winningTrades > 0 ? (grossProfit / winningTrades) : 0;
        const averageLoss = losingTrades > 0 ? (grossLoss / losingTrades) : 0;
        const expectancy = (winRate/100 * averageWin) - ((100-winRate)/100 * averageLoss);
        
        // Calculate time-based profit metrics
        const hourlyProfit = calculateTimePeriodProfit(sortedTrades, 1);
        const dailyProfit = calculateTimePeriodProfit(sortedTrades, 24);
        const weeklyProfit = calculateTimePeriodProfit(sortedTrades, 24 * 7);
        const monthlyProfit = calculateTimePeriodProfit(sortedTrades, 24 * 30);
        
        return {
            totalTrades,
            winningTrades,
            losingTrades,
            winRate,
            profitFactor,
            maxDrawdown,
            totalProfit,
            totalLoss,
            netProfit: totalProfit - totalLoss,
            averageWin,
            averageLoss,
            expectancy,
            hourlyProfit,
            dailyProfit,
            weeklyProfit,
            monthlyProfit
        };
    }
    
    // Calculate profit for a specific time period
    function calculateTimePeriodProfit(trades, hoursBack) {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - (hoursBack * 60 * 60 * 1000));
        
        // Filter trades within the time period
        const periodTrades = trades.filter(trade => new Date(trade[8]) >= cutoffTime);
        
        // Sum the profit/loss
        return periodTrades.reduce((sum, trade) => sum + parseFloat(trade[6]), 0);
    }
    
    // Update UI with metrics
    function updateMetricsUI(metrics) {
        // Update win rate
        const winRateElement = document.getElementById('win-rate');
        if (winRateElement) {
            winRateElement.textContent = `${metrics.winRate.toFixed(1)}%`;
            winRateElement.className = metrics.winRate >= 50 ? 'profit' : 'loss';
        }
        
        // Update profit factor
        const profitFactorElement = document.getElementById('profit-factor');
        if (profitFactorElement) {
            profitFactorElement.textContent = metrics.profitFactor.toFixed(2);
            profitFactorElement.className = metrics.profitFactor >= 1 ? 'profit' : 'loss';
        }
        
        // Update drawdown
        const drawdownElement = document.getElementById('drawdown');
        if (drawdownElement) {
            drawdownElement.textContent = `${metrics.maxDrawdown.toFixed(2)} USDT`;
        }
        
        // Update time-based profit metrics
        const hourlyProfitElement = document.getElementById('hourly-profit');
        if (hourlyProfitElement) {
            hourlyProfitElement.textContent = `${metrics.hourlyProfit.toFixed(2)} USDT`;
            hourlyProfitElement.className = metrics.hourlyProfit >= 0 ? 'profit' : 'loss';
        }
        
        const dailyProfitElement = document.getElementById('daily-profit');
        if (dailyProfitElement) {
            dailyProfitElement.textContent = `${metrics.dailyProfit.toFixed(2)} USDT`;
            dailyProfitElement.className = metrics.dailyProfit >= 0 ? 'profit' : 'loss';
        }
        
        const weeklyProfitElement = document.getElementById('weekly-profit');
        if (weeklyProfitElement) {
            weeklyProfitElement.textContent = `${metrics.weeklyProfit.toFixed(2)} USDT`;
            weeklyProfitElement.className = metrics.weeklyProfit >= 0 ? 'profit' : 'loss';
        }
        
        const monthlyProfitElement = document.getElementById('monthly-profit');
        if (monthlyProfitElement) {
            monthlyProfitElement.textContent = `${metrics.monthlyProfit.toFixed(2)} USDT`;
            monthlyProfitElement.className = metrics.monthlyProfit >= 0 ? 'profit' : 'loss';
        }
    }
    
    // Analyze performance by symbol
    function analyzeBySymbol(trades) {
        // Group trades by symbol
        const symbolGroups = {};
        
        trades.forEach(trade => {
            const symbol = trade[1];
            const pnl = parseFloat(trade[6]);
            
            if (!symbolGroups[symbol]) {
                symbolGroups[symbol] = {
                    trades: 0,
                    wins: 0,
                    losses: 0,
                    totalPnl: 0
                };
            }
            
            symbolGroups[symbol].trades++;
            if (pnl >= 0) {
                symbolGroups[symbol].wins++;
            } else {
                symbolGroups[symbol].losses++;
            }
            symbolGroups[symbol].totalPnl += pnl;
        });
        
        // Calculate metrics for each symbol
        for (const symbol in symbolGroups) {
            const data = symbolGroups[symbol];
            data.winRate = data.trades > 0 ? (data.wins / data.trades * 100) : 0;
            
            console.log(`Profitability Analysis for ${symbol}: Win Rate ${data.winRate.toFixed(1)}%, PnL: ${data.totalPnl.toFixed(2)} USDT, Trades: ${data.trades}`);
        }
        
        // Find the best and worst performing symbols
        let bestSymbol = null;
        let worstSymbol = null;
        let bestPnl = -Infinity;
        let worstPnl = Infinity;
        
        for (const symbol in symbolGroups) {
            const pnl = symbolGroups[symbol].totalPnl;
            
            if (pnl > bestPnl) {
                bestPnl = pnl;
                bestSymbol = symbol;
            }
            
            if (pnl < worstPnl) {
                worstPnl = pnl;
                worstSymbol = symbol;
            }
        }
        
        if (bestSymbol) {
            console.log(`Profitability Analysis: Best performing symbol: ${bestSymbol} with ${bestPnl.toFixed(2)} USDT profit`);
        }
        
        if (worstSymbol) {
            console.log(`Profitability Analysis: Worst performing symbol: ${worstSymbol} with ${worstPnl.toFixed(2)} USDT P&L`);
        }
        
        // Store coin-specific profitability data for potential use in trading decisions
        window.symbolProfitability = symbolGroups;
    }
    
    // Detect market volatility from trade history
    function detectVolatility(trades) {
        // Group trades by symbol
        const symbolData = {};
        
        // Process recent trades first (sort by timestamp)
        const recentTrades = [...trades]
            .sort((a, b) => new Date(b[8]) - new Date(a[8]))
            .slice(0, 50); // Take most recent 50 trades for analysis
        
        recentTrades.forEach(trade => {
            const symbol = trade[1];
            const entryPrice = parseFloat(trade[4]);
            const exitPrice = parseFloat(trade[5]);
            const timestamp = new Date(trade[8]);
            
            if (!symbolData[symbol]) {
                symbolData[symbol] = {
                    priceChanges: [],
                    timestamps: []
                };
            }
            
            // Calculate absolute percentage change
            const priceChange = Math.abs((exitPrice - entryPrice) / entryPrice * 100);
            symbolData[symbol].priceChanges.push(priceChange);
            symbolData[symbol].timestamps.push(timestamp);
        });
        
        // Calculate volatility metrics for each symbol
        for (const symbol in symbolData) {
            if (symbolData[symbol].priceChanges.length > 5) { // Need at least 5 data points
                const changes = symbolData[symbol].priceChanges;
                
                // Calculate average price change (volatility)
                const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
                
                // Calculate standard deviation of price changes
                const variance = changes.reduce((sum, change) => sum + Math.pow(change - avgChange, 2), 0) / changes.length;
                const stdDev = Math.sqrt(variance);
                
                // Determine volatility level
                let volatilityLevel = 'Medium';
                if (stdDev < 0.5) volatilityLevel = 'Low';
                else if (stdDev > 2.0) volatilityLevel = 'High';
                
                console.log(`Volatility Analysis for ${symbol}: ${volatilityLevel} (${stdDev.toFixed(2)}), Avg Change: ${avgChange.toFixed(2)}%`);
                
                // Store volatility data for potential use in trading decisions
                if (!window.marketVolatility) window.marketVolatility = {};
                window.marketVolatility[symbol] = {
                    level: volatilityLevel,
                    stdDev: stdDev,
                    avgChange: avgChange
                };
            }
        }
    }
})();
