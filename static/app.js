let refreshInterval;

async function updateTrades() {
    const response = await fetch('/trades');
    const trades = await response.json();
    
    // Update Active Trades
    const activeTable = document.getElementById('active-trades');
    activeTable.innerHTML = `<tr>
        <th>Symbol</th>
        <th>Side</th>
        <th>Size</th>
        <th>Entry</th>
        <th>Current</th>
        <th>P&L</th>
    </tr>`;
    
    trades.active.forEach(trade => {
        activeTable.innerHTML += `<tr>
            <td>${trade[1]}</td>
            <td class="${trade[2]}">${trade[2]}</td>
            <td>${trade[3]}</td>
            <td>${trade[4]}</td>
            <td>${getCurrentPrice(trade[1])}</td>
            <td>${calculatePnL(trade)}</td>
        </tr>`;
    });
    
    // Update Closed Trades
    const closedTable = document.getElementById('closed-trades');
    closedTable.innerHTML = `<tr>
        <th>Symbol</th>
        <th>Side</th>
        <th>Size</th>
        <th>Entry</th>
        <th>Exit</th>
        <th>P&L</th>
    </tr>`;
    
    trades.closed.forEach(trade => {
        closedTable.innerHTML += `<tr>
            <td>${trade[1]}</td>
            <td class="${trade[2]}">${trade[2]}</td>
            <td>${trade[3]}</td>
            <td>${trade[4]}</td>
            <td>${trade[5]}</td>
            <td class="${trade[6] >= 0 ? 'profit' : 'loss'}">
                ${trade[6]}
            </td>
        </tr>`;
    });
}

function startBot() {
    fetch('/start', { method: 'POST' });
    refreshInterval = setInterval(updateTrades, 5000);
}

function stopBot() {
    fetch('/stop', { method: 'POST' });
    clearInterval(refreshInterval);
}