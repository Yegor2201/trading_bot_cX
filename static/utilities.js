// Global utility functions for trading bot UI

// Notification function
window.showNotification = function(message, type = 'info') {
    console.log(`Notification (${type}):`, message);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <span class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
        </div>
    `;
    
    // Add styles
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.padding = '15px 20px';
    notification.style.borderRadius = '4px';
    notification.style.marginBottom = '10px';
    notification.style.transition = 'opacity 0.3s ease';
    
    // Set color based on type
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#4caf50';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.backgroundColor = '#f44336';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ff9800';
            notification.style.color = 'white';
            break;
        default:
            notification.style.backgroundColor = '#2196f3';
            notification.style.color = 'white';
    }
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
};

// Loading indicator functions
let loadingOverlay = null;
let loadingCount = 0;

window.showLoading = function() {
    loadingCount++;
    
    if (loadingCount === 1) {
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading...</div>
            `;
            
            // Add styles
            loadingOverlay.style.position = 'fixed';
            loadingOverlay.style.top = '0';
            loadingOverlay.style.left = '0';
            loadingOverlay.style.width = '100%';
            loadingOverlay.style.height = '100%';
            loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            loadingOverlay.style.display = 'flex';
            loadingOverlay.style.justifyContent = 'center';
            loadingOverlay.style.alignItems = 'center';
            loadingOverlay.style.zIndex = '9999';
            
            // Spinner styles
            const style = document.createElement('style');
            style.textContent = `
                .loading-spinner {
                    width: 50px;
                    height: 50px;
                    border: 5px solid #f3f3f3;
                    border-top: 5px solid #3498db;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                .loading-text {
                    color: white;
                    margin-top: 10px;
                    font-size: 16px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(loadingOverlay);
        } else {
            loadingOverlay.style.display = 'flex';
        }
    }
};

window.hideLoading = function() {
    loadingCount = Math.max(0, loadingCount - 1);
    
    if (loadingCount === 0 && loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
};

// Profit metrics update function
window.updateProfitMetrics = async function() {
    try {
        const response = await fetch('/profits');
        if (!response.ok) {
            throw new Error('Failed to fetch profit metrics');
        }
        
        const data = await response.json();
        
        // Update daily profit
        const dailyProfitElement = document.getElementById('daily-profit');
        if (dailyProfitElement && data.daily_profit !== undefined) {
            const dailyProfit = parseFloat(data.daily_profit);
            dailyProfitElement.textContent = `${dailyProfit >= 0 ? '+' : ''}${dailyProfit.toFixed(2)} USDT`;
            dailyProfitElement.className = dailyProfit >= 0 ? 'profit' : 'loss';
        }
        
        // Update weekly profit
        const weeklyProfitElement = document.getElementById('weekly-profit');
        if (weeklyProfitElement && data.weekly_profit !== undefined) {
            const weeklyProfit = parseFloat(data.weekly_profit);
            weeklyProfitElement.textContent = `${weeklyProfit >= 0 ? '+' : ''}${weeklyProfit.toFixed(2)} USDT`;
            weeklyProfitElement.className = weeklyProfit >= 0 ? 'profit' : 'loss';
        }
        
        // Update monthly profit
        const monthlyProfitElement = document.getElementById('monthly-profit');
        if (monthlyProfitElement && data.monthly_profit !== undefined) {
            const monthlyProfit = parseFloat(data.monthly_profit);
            monthlyProfitElement.textContent = `${monthlyProfit >= 0 ? '+' : ''}${monthlyProfit.toFixed(2)} USDT`;
            monthlyProfitElement.className = monthlyProfit >= 0 ? 'profit' : 'loss';
        }
        
        // Update win rate
        const winRateElement = document.getElementById('win-rate');
        if (winRateElement && data.win_rate !== undefined) {
            winRateElement.textContent = `${(data.win_rate * 100).toFixed(1)}%`;
        }
        
        // Update total trades
        const totalTradesElement = document.getElementById('total-trades');
        if (totalTradesElement && data.total_trades !== undefined) {
            totalTradesElement.textContent = data.total_trades;
        }
        
        // Update average trade
        const avgTradeElement = document.getElementById('avg-trade');
        if (avgTradeElement && data.average_profit !== undefined) {
            const avgProfit = parseFloat(data.average_profit);
            avgTradeElement.textContent = `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)} USDT`;
            avgTradeElement.className = avgProfit >= 0 ? 'profit' : 'loss';
        }
        
        console.log('Profit metrics updated successfully');
    } catch (error) {
        console.error('Error updating profit metrics:', error);
    }
};
