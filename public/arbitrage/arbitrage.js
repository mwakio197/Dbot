let derivWs;
let tradeWs; // New WebSocket for trading
let tradingToken = localStorage.getItem('derivToken');
let tickHistory = [];
let currentSymbol = "R_100";
let decimalPlaces = 2;
let isTrading = false;
let tradeType = ''; // 'OVER_5' or 'UNDER_4'
let stakeAmount = 0;
let consecutiveLosses = 0;
const maxConsecutiveLosses = 3;

let initSurvicateCalled = false;
let tradeResults = [];
let totalWins = 0;
let totalLosses = 0;

// Add Survicate initialization
function setSurvicateUserAttributes(residence, account_type, created_at) {
    if (window.Survicate && window.Survicate.setCustomAttributes) {
        window.Survicate.setCustomAttributes({
            residence,
            account_type,
            created_at,
        });
    }
}

function initSurvicate() {
    if (initSurvicateCalled) return;
    initSurvicateCalled = true;

    const active_loginid = localStorage.getItem('active_loginid');
    const client_accounts = JSON.parse(localStorage.getItem('accountsList')) || undefined;

    if (active_loginid && client_accounts) {
        const { residence, account_type, created_at } = client_accounts[active_loginid] || {};
        setSurvicateUserAttributes(residence, account_type, created_at);
    }
}

// Add this new function for trade notifications
function showNotification(message, type = 'info') {
    const container = document.createElement('div');
    container.className = `notification ${type}`;
    container.textContent = message;
    document.body.appendChild(container);

    // Remove notification after 5 seconds
    setTimeout(() => {
        container.remove();
    }, 5000);
}

// Add trading WebSocket initialization
function initTradeWebSocket() {
    if (!tradingToken) {
        showNotification('Please login first to trade', 'error');
        return false;
    }

    initSurvicate(); // Initialize Survicate when trading starts

    if (tradeWs) {
        tradeWs.close();
    }

    tradeWs = new WebSocket("wss://ws.derivws.com/websockets/v3");

    tradeWs.onopen = function() {
        const authData = { authorize: tradingToken };
        tradeWs.send(JSON.stringify(authData));
    };

    tradeWs.onmessage = function(event) {
        const response = JSON.parse(event.data);

        if (response.error) {
            showNotification(response.error.message, 'error');
            return;
        }

        if (response.authorize) {
            requestTradeHistory();
            return;
        }

        if (response.profit_table) {
            const trades = response.profit_table.transactions;
            tradeResults = trades.map(trade => ({
                time: new Date(trade.purchase_time * 1000).toLocaleTimeString(),
                digit: trade.entry_tick_display_value.slice(-1),
                isWin: trade.profit >= 0,
                type: trade.shortcode.includes('DIGIT OVER') ? 'OVER_5' : 'UNDER_4',
                profit: trade.profit
            }));
            
            // Update totals
            totalWins = tradeResults.filter(t => t.isWin).length;
            totalLosses = tradeResults.filter(t => !t.isWin).length;
            
            updateResultsDisplay();
            return;
        }

        if (response.buy) {
            const contractType = response.buy.contract_type;
            const profit = response.buy.profit;
            showNotification(`${contractType} contract purchased! Potential profit: ${profit}`, 'success');
            
            // Refresh trade history after new trade
            setTimeout(requestTradeHistory, 2000);
        }
    };

    tradeWs.onerror = function(error) {
        showNotification('Trading connection error', 'error');
        console.error('Trading WebSocket error:', error);
    };

    return true;
}

// Add after WebSocket initialization
function requestTradeHistory() {
    if (!tradeWs || tradeWs.readyState !== WebSocket.OPEN) {
        if (!initTradeWebSocket()) return;
    }

    const request = {
        "profit_table": 1,
        "description": 1,
        "sort": "DESC",
        "limit": 10
    };

    tradeWs.send(JSON.stringify(request));
}

// Function to place trades
function placeTrades(stake, symbol) {
    if (!tradeWs || tradeWs.readyState !== WebSocket.OPEN) {
        if (!initTradeWebSocket()) return;
    }

    const batchRequest = {
        passthrough: { batch: true },
        requests: [
            {
                buy: 1,
                price: stake,
                parameters: {
                    contract_type: "DIGITOVER",
                    symbol: symbol,
                    duration: 1,
                    duration_unit: "t",
                    barrier: "5",
                    basis: "stake"
                }
            },
            {
                buy: 1,
                price: stake,
                parameters: {
                    contract_type: "DIGITUNDER",
                    symbol: symbol,
                    duration: 1,
                    duration_unit: "t",
                    barrier: "4",
                    basis: "stake"
                }
            }
        ]
    };

    tradeWs.send(JSON.stringify(batchRequest));
}

// Initialize WebSocket connection
function requestTickHistory() {
    if (derivWs && derivWs.readyState === WebSocket.OPEN) {
        const request = {
            ticks_history: currentSymbol,
            count: 100,
            end: "latest",
            style: "ticks",
            subscribe: 1
        };
        derivWs.send(JSON.stringify(request));
    }
}

function startWebSocket() {
    if (derivWs) {
        derivWs.close();
        tickHistory = [];
    }

    derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    
    derivWs.onopen = function() {
        console.log('WebSocket connected');
        requestTickHistory();
    };
    
    derivWs.onclose = function() {
        console.log('WebSocket disconnected');
    };
    
    derivWs.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
    
    derivWs.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            console.error('WebSocket error:', data.error);
            return;
        }
        
        if (data.history) {
            tickHistory = data.history.prices.map((price, index) => ({
                time: data.history.times[index],
                quote: parseFloat(price)
            }));
            detectDecimalPlaces();
            updateUI();
        } else if (data.tick) {
            let tickQuote = parseFloat(data.tick.quote);
            tickHistory.push({ time: data.tick.epoch, quote: tickQuote });
            if (tickHistory.length > 100) tickHistory.shift();
            
            // Execute trade logic on each new tick
            if (isTrading) {
                const currentDigit = getLastDigit(tickQuote);
                executeTrade(currentDigit);
            }
            
            updateUI();
        }
    };
}

// Helper functions for tick analysis
function detectDecimalPlaces() {
    if (tickHistory.length === 0) return;
    let decimalCounts = tickHistory.map(tick => {
        let decimalPart = tick.quote.toString().split(".")[1] || "";
        return decimalPart.length;
    });
    decimalPlaces = Math.max(...decimalCounts, 2);
}

function getLastDigit(price) {
    let priceStr = price.toString();
    let priceParts = priceStr.split(".");
    let decimals = priceParts[1] || "";
    while (decimals.length < decimalPlaces) decimals += "0";
    return Number(decimals.slice(-1));
}

function updateUI() {
    const currentPrice = tickHistory[tickHistory.length - 1]?.quote.toFixed(decimalPlaces);
    const statusText = isTrading ? 
        `Trading ${tradeType} | Losses: ${consecutiveLosses}/${maxConsecutiveLosses}` : 
        'Not Trading';
    document.getElementById("current-price").textContent = 
        `${currentPrice || "N/A"} | ${statusText}`;
    updateDigitDisplay();
}

function updateDigitDisplay() {
    const digitCounts = new Array(10).fill(0);
    tickHistory.forEach(tick => {
        const lastDigit = getLastDigit(tick.quote);
        digitCounts[lastDigit]++;
    });

    const digitPercentages = digitCounts.map(count => (count / tickHistory.length) * 100);
    const maxPercentage = Math.max(...digitPercentages);
    const minPercentage = Math.min(...digitPercentages);
    const currentDigit = getLastDigit(tickHistory[tickHistory.length - 1]?.quote);

    const container = document.getElementById("digit-display-container");
    container.innerHTML = "";

    digitPercentages.forEach((percentage, digit) => {
        const digitContainer = document.createElement("div");
        digitContainer.classList.add("digit-container");

        if (digit === currentDigit) {
            digitContainer.classList.add("current");
            const arrow = document.createElement("div");
            arrow.classList.add("arrow");
            digitContainer.appendChild(arrow);
        }

        const digitBox = document.createElement("div");
        digitBox.classList.add("digit-box");
        if (percentage === maxPercentage) digitBox.classList.add("highest");
        if (percentage === minPercentage) digitBox.classList.add("lowest");
        digitBox.textContent = digit;

        const percentageText = document.createElement("div");
        percentageText.classList.add("digit-percentage");
        percentageText.textContent = `${percentage.toFixed(2)}%`;

        digitContainer.appendChild(digitBox);
        digitContainer.appendChild(percentageText);
        container.appendChild(digitContainer);
    });
}

// Add this function to update trade results
function updateTradeResults(digit, isWin) {
    const result = {
        time: new Date().toLocaleTimeString(),
        digit: digit,
        isWin: isWin,
        type: tradeType
    };
    
    tradeResults.unshift(result); // Add to beginning of array
    if (tradeResults.length > 10) tradeResults.pop(); // Keep only last 10 results
    
    if (isWin) totalWins++;
    else totalLosses++;
    
    updateResultsDisplay();
}

function updateResultsDisplay() {
    const resultsContainer = document.getElementById('trade-results');
    const statsContainer = document.getElementById('trade-stats');
    
    // Update stats
    const totalTrades = totalWins + totalLosses;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(2) : 0;
    const totalProfit = tradeResults.reduce((sum, trade) => sum + parseFloat(trade.profit || 0), 0).toFixed(2);
    
    statsContainer.innerHTML = `
        <div>Total Trades: ${totalTrades}</div>
        <div>Wins: ${totalWins}</div>
        <div>Losses: ${totalLosses}</div>
        <div>Win Rate: ${winRate}%</div>
        <div>Total Profit: ${totalProfit}</div>
    `;
    
    // Update results list
    resultsContainer.innerHTML = tradeResults.map(result => `
        <div class="trade-result ${result.isWin ? 'win' : 'loss'}">
            <span>${result.time}</span>
            <span>Digit: ${result.digit}</span>
            <span>${result.type}</span>
            <span>${result.isWin ? 'WIN' : 'LOSS'}</span>
            <span>$${parseFloat(result.profit).toFixed(2)}</span>
        </div>
    `).join('');
}

// Modify the executeTrade function
function executeTrade(digit) {
    if (!isTrading || !stakeAmount) return;

    const isWin = (tradeType === 'OVER_5' && digit > 5) || 
                  (tradeType === 'UNDER_4' && digit < 4);

    updateTradeResults(digit, isWin);

    if (isWin) {
        consecutiveLosses = 0;
        showNotification('Trade Won!', 'success');
    } else {
        consecutiveLosses++;
        showNotification('Trade Lost!', 'error');
        
        if (consecutiveLosses >= maxConsecutiveLosses) {
            isTrading = false;
            showNotification('Max consecutive losses reached. Trading stopped.', 'error');
        }
    }
}

// Symbol change handler
document.getElementById('symbol').addEventListener('change', function(e) {
    const newSymbol = e.target.value;
    if (newSymbol) {
        currentSymbol = newSymbol;
        tickHistory = [];
        startWebSocket();
    }
});

// Modify the existing form submission handler
document.getElementById('tradingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const stake = parseFloat(document.getElementById('stake').value);
    const symbol = document.getElementById('symbol').value;
    
    if (!tradingToken) {
        showNotification('Please login to trade', 'error');
        return;
    }

    if (stake && symbol) {
        stakeAmount = stake;
        currentSymbol = symbol;
        isTrading = true;
        consecutiveLosses = 0;
        
        // Place the trades
        placeTrades(stake, symbol);
        
        // Start websocket for analysis
        startWebSocket();
    }
});

// Add fullscreen functionality
function toggleFullscreen() {
    if (!document.fullscreenElement &&
        !document.mozFullScreenElement &&
        !document.webkitFullscreenElement &&
        !document.msFullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    startWebSocket();
    
    // Add fullscreen button event listener
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
});
