# Crypto Trading Bot

A powerful and feature-rich trading bot for cryptocurrency markets with an advanced web interface. 

## Features

### Trading Engine
- Supports multiple trading pairs (BTC, ETH, and other altcoins)
- Customizable trading strategies
- Integrated with Bybit exchange API
- Demo mode for practice trading
- Simulation mode for strategy testing
- Real trading with proper risk management

### Advanced Chart System
- TradingView-powered candlestick charts
- Symbol-specific trade display
- Click-to-view trade details on chart
- Visual trade markers with entry/exit points
- Stop-loss and take-profit visualization
- Responsive chart sizing for all screen sizes

### Performance Analytics
- Win rate and profit factor calculations
- Comprehensive trade history
- Profit metrics (hourly, daily, weekly, monthly)
- Drawdown monitoring
- Symbol-specific performance analytics
- Market volatility detection

### User Interface
- Modern dashboard design
- Tabbed interface for easy navigation
- Real-time balance updates
- Interactive trade management
- System diagnostics tools
- Responsive design for all screen sizes

## Getting Started

### Installation

1. Clone the repository
2. Install dependencies:
```
pip install -r requirements.txt
```
3. Initialize the database:
```
python init_db.py
```
4. Start the server:
```
bash start_server.sh
```

### Configuration

The trading bot has several operating modes that can be configured in `config.json`:

#### 1. Simulation Mode
```json
"SIMULATION_MODE": true
```
When enabled, the bot creates simulated trades without actually executing them on the exchange. Perfect for testing strategies without risking real money.

#### 2. Demo Mode
```json
"DEMO_MODE": true,
"DEMO_INTERVAL": 120
```
Periodically forces the bot to make trades (even when the strategy doesn't suggest it) to ensure you can see activity. Useful for UI testing and to visualize how trades appear.

#### 3. Testnet Mode
```json
"TESTNET": true
```
Uses Bybit's testnet API instead of the production API. Essential for testing with "fake" funds before real trading.

#### 4. Debug Mode
```json
"DEBUG_MODE": true
```
Enables detailed logging of all operations to help troubleshoot issues.

## Usage Guide

### Setting Up API Keys

1. Go to the Settings tab
2. Enter your Bybit API key and secret
3. Configure testnet/mainnet mode as needed
4. Test the connection

### Managing Trades

- Active trades appear in the dashboard
- Click on any trade to see it on the chart
- Set/update stop-loss and take-profit levels
- Close trades manually when desired

### Analyzing Performance

- View profit metrics on the dashboard
- Check detailed trade history in the Trades tab
- Monitor system performance in the Diagnostics tab

## Safety First

Always start with:
1. Simulation mode enabled
2. Testnet mode enabled
3. Small position sizes
4. Proper stop-loss settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- TradingView Lightweight Charts for the charting library
- Bybit for exchange API access
- All contributors to this project
