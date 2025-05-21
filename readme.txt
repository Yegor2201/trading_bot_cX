Trading Bot Modes Explained
1. Simulation Mode
SIMULATION_MODE = True  # Set to True to simulate trades if API permission denied
What it does: When enabled, the bot creates simulated trades without actually executing them on the exchange.
Use case: Perfect for testing strategies without risking real money.
Implementation: The bot creates fake trade records in your database with the simulated: true tag when this mode is on.

2. Demo Mode
DEMO_MODE = True  # Set to True to force trades for testing
DEMO_INTERVAL = 120  # Seconds between demo trades
What it does: Periodically forces the bot to make trades (even when the strategy doesn't suggest it) to ensure you can see activity.
Use case: Useful for UI testing and to visualize how trades appear on the chart.
Implementation: Every DEMO_INTERVAL seconds, it forces a trade on one of the top symbols, alternating between buy and sell.

3. Debug Mode
DEBUG_MODE = True  # Set to True for detailed debug logs
What it does: Enables detailed logging of all operations to help troubleshoot issues.
Use case: When you're developing new features or troubleshooting problems.
Implementation: Provides more verbose logs with detailed information about API calls, price calculations, and decision-making.