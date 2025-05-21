// Global chart variables
let chart = null;
let candleSeries = null;
let volumeSeries = null;

// Function to load chart library
async function loadChartLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof LightweightCharts !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js';
        script.onload = () => {
            if (typeof LightweightCharts === 'undefined') {
                reject(new Error('Chart library loaded but LightweightCharts is undefined'));
            } else {
                resolve();
            }
        };
        script.onerror = () => reject(new Error('Failed to load chart library'));
        document.head.appendChild(script);
    });
}

// Function to initialize the chart
async function initializeChart() {
    try {
        console.log('Initializing chart...');
        showLoading();
        
        // First ensure the library is loaded
        await loadChartLibrary();
        
        const chartContainer = document.getElementById('price-chart');
        if (!chartContainer) {
            throw new Error('Chart container not found');
        }
        
        // Clear any existing chart
        chartContainer.innerHTML = '';
        
        // Set dimensions
        chartContainer.style.height = '500px';
        chartContainer.style.width = '100%';
        
        // Get actual container dimensions and ensure they are reasonable
        const containerWidth = Math.max(chartContainer.clientWidth || 800, 300);
        const containerHeight = Math.max(chartContainer.clientHeight || 500, 200);
        
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
                background: { type: 'solid', color: '#ffffff' },
                textColor: '#333333',
                fontSize: 12
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.1)' }
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#D1D4DC',
                rightOffset: 5,
                barSpacing: 8,
                fixLeftEdge: true,
                fixRightEdge: true
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: '#555',
                    width: 1,
                    style: 1
                },
                horzLine: {
                    color: '#555',
                    width: 1,
                    style: 1
                }
            },
            rightPriceScale: {
                borderVisible: true,
                scaleMargins: {
                    top: 0.2,
                    bottom: 0.2
                }
            }
        });

        // Initialize candlestick series with proper colors
        candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            priceFormat: {
                type: 'price',
                precision: 6,
                minMove: 0.000001
            }
        });

        // Initialize volume series with proper placement
        volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume'
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.8,
                bottom: 0
            }
        });

        // Set up responsive handling
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    chart.applyOptions({ 
                        width: Math.max(width, 300), 
                        height: Math.max(height, 200) 
                    });
                }
            }
        });
        
        resizeObserver.observe(chartContainer);

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
                <div class="chart-error" style="text-align: center; padding: 20px; background-color: #ffebee; border: 1px solid #ffcdd2; border-radius: 4px;">
                    <h3 style="color: #d32f2f; margin-bottom: 10px;">Chart Failed to Initialize</h3>
                    <p style="color: #555;">${error.message}</p>
                    <button onclick="initializeChart()" style="margin-top: 15px; padding: 8px 16px; background-color: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Try Again
                    </button>
                </div>`;
        }
        return Promise.reject(error);
    }
}
