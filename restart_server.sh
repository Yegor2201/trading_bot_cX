#!/bin/bash
# Script to restart the trading bot server with logging

# Kill existing server
echo "Stopping existing server process..."
pkill -f "python main.py" || true
sleep 2

# Clear logs
echo "Clearing log files..."
echo "" > bot.log

# Start server with logging
echo "Starting trading bot server..."
python main.py > bot.log 2>&1 &
sleep 2

# Check if server started
if pgrep -f "python main.py" > /dev/null; then
    echo "Server started successfully!"
    echo "Server logs available in bot.log"
else
    echo "Server failed to start. Check bot.log for details."
    exit 1
fi

# Show the port
echo "Server running on http://localhost:8000"
