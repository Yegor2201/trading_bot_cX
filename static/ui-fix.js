// Fix UI Elements Script
(function() {
    console.log('UI Fix Script: Started');
    
    // Function to check if elements exist and are visible
    function checkElement(selector, name) {
        const element = document.querySelector(selector);
        if (!element) {
            console.error(`UI Fix: ${name} not found!`);
            return null;
        }
        
        const style = window.getComputedStyle(element);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        
        console.log(`UI Fix: ${name} found. Visible: ${isVisible}`);
        return element;
    }
    
    // Check important elements
    const balanceElement = checkElement('#balance', 'Balance element');
    const chartContainer = checkElement('#price-chart', 'Chart container');
    const tabButtons = document.querySelectorAll('.tab-button');
    console.log(`UI Fix: Found ${tabButtons.length} tab buttons`);
    
    // Force the dashboard to be visible
    const dashboard = checkElement('#dashboard', 'Dashboard tab');
    if (dashboard) {
        console.log('UI Fix: Ensuring dashboard is visible');
        dashboard.classList.add('active');
        dashboard.style.display = 'block';
    }
    
    // Attempt to ensure chart is displayed
    if (chartContainer) {
        console.log('UI Fix: Setting chart container dimensions');
        chartContainer.style.width = '100%';
        chartContainer.style.height = '400px';
        chartContainer.style.border = '1px solid #ddd';
        chartContainer.style.display = 'block';
        chartContainer.style.overflow = 'hidden';
        chartContainer.style.position = 'relative';
        
        // Check if chart component exists
        if (window.chart) {
            console.log('UI Fix: Chart object exists, applying fixes');
            try {
                window.chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: 400
                });
                console.log('UI Fix: Resized chart');
            } catch (err) {
                console.error('UI Fix: Error resizing chart:', err);
            }
        } else {
            console.error('UI Fix: Chart object missing, initialization may have failed');
            
            // Create fallback message
            const fallbackMsg = document.createElement('div');
            fallbackMsg.style.padding = '20px';
            fallbackMsg.style.textAlign = 'center';
            fallbackMsg.innerHTML = `
                <h3>Chart Failed to Initialize</h3>
                <p>Please try reloading the page.</p>
                <button onclick="window.location.reload()">Reload Page</button>
            `;
            chartContainer.appendChild(fallbackMsg);
        }
    }
    
    // Force balance update
    if (typeof updateBalance === 'function') {
        console.log('UI Fix: Triggering balance update');
        updateBalance();
    }
    
    // Force trades update
    if (typeof updateTrades === 'function') {
        console.log('UI Fix: Triggering trades update');
        updateTrades();
    }
    
    // Fix tab buttons if they exist
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = button.getAttribute('data-tab');
            console.log(`UI Fix: Tab button clicked: ${tabName}`);
            
            // Manually handle tab switching
            tabButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            
            // Hide all content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });
            
            // Show selected content
            const selectedContent = document.getElementById(tabName);
            if (selectedContent) {
                selectedContent.classList.add('active');
                selectedContent.style.display = 'block';
                console.log(`UI Fix: Activated tab content: ${tabName}`);
            }
        });
    });
    
    console.log('UI Fix Script: Completed');
})();
