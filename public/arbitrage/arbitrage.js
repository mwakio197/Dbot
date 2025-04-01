let derivWs;
let tradeWs;
let tradingToken = localStorage.getItem('authToken');
let activeLoginId = localStorage.getItem('active_loginid');
let tickHistory = [];
let currentSymbol = "R_100";
let decimalPlaces = 2;
let stakeAmount = 0;
let activeContracts = new Map(); // Track active contracts

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

    const client_accounts = JSON.parse(localStorage.getItem('accountsList')) || undefined;

    if (activeLoginId && client_accounts) {
        const { residence, account_type, created_at } = client_accounts[activeLoginId] || {};
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

// Add token validation function
function validateToken() {
    if (!tradingToken) {
        showNotification('No trading token found. Please log in.', 'error');
        return false;
    }
    if (!activeLoginId) {
        showNotification('No active account found. Please log in.', 'error');
        return false;
    }
    return true;
}

// Add trading WebSocket initialization
function initTradeWebSocket() {
    if (!validateToken()) {
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

        // Handle buy response
        if (response.buy) {
            const contractId = response.buy.contract_id;
            const contractType = response.buy.contract_type;
            activeContracts.set(contractId, {
                type: contractType,
                openTime: new Date(),
                stake: response.buy.buy_price
            });
            
            // Subscribe to contract updates
            subscribeToContract(contractId);
            
            showNotification(`${contractType} contract opened: ${contractId}`, 'success');
        }

        // Handle contract updates
        if (response.proposal_open_contract) {
            const contract = response.proposal_open_contract;
            if (contract.is_sold) {
                const profit = contract.profit;
                const contractId = contract.contract_id;
                const contractData = activeContracts.get(contractId);
                
                if (contractData) {
                    updateTradeResults(contract.exit_tick_display_value.slice(-1), profit >= 0, {
                        contractId,
                        profit,
                        type: contractData.type,
                        duration: (new Date() - contractData.openTime) / 1000
                    });
                    activeContracts.delete(contractId);
                }
            }
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

    // Place both OVER and UNDER trades simultaneously
    const batchRequest = {
        passthrough: { 
            batch: true,
            login_id: activeLoginId 
        },
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
                    basis: "stake",
                    currency: "USD"
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
                    barrier: "4", // Using same barrier 5 for both contracts
                    basis: "stake",
                    currency: "USD"
                }
            }
        ]
    };

    tradeWs.send(JSON.stringify(batchRequest));
}

// Add contract subscription function
function subscribeToContract(contractId) {
    const request = {
        proposal_open_contract: 1,
        subscribe: 1,
        contract_id: contractId
    };
    tradeWs.send(JSON.stringify(request));
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

    derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=68848');
    
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
    document.getElementById("current-price").textContent = currentPrice || "N/A";
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
function updateTradeResults(digit, isWin, contractDetails) {
    const result = {
        time: new Date().toLocaleTimeString(),
        digit: digit,
        isWin: isWin,
        type: contractDetails.type,
        contractId: contractDetails.contractId,
        profit: contractDetails.profit,
        duration: contractDetails.duration
    };
    
    tradeResults.unshift(result);
    if (tradeResults.length > 10) tradeResults.pop();
    
    if (isWin) totalWins++;
    else totalLosses++;
    
    updateResultsDisplay();
}

// Modify updateResultsDisplay to show more contract details
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
    
    // Update results list with more details
    resultsContainer.innerHTML = tradeResults.map(result => `
        <div class="trade-result ${result.isWin ? 'win' : 'loss'}">
            <span>${result.time}</span>
            <span>ID: ${result.contractId}</span>
            <span>Digit: ${result.digit}</span>
            <span>${result.type}</span>
            <span>${result.isWin ? 'WIN' : 'LOSS'}</span>
            <span>$${parseFloat(result.profit).toFixed(2)}</span>
            <span>${result.duration.toFixed(1)}s</span>
        </div>
    `).join('');
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

// Modify the form submission handler
document.getElementById('tradingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!validateToken()) {
        return;
    }

    const stake = parseFloat(document.getElementById('stake').value);
    const symbol = document.getElementById('symbol').value;
    
    if (stake && symbol) {
        stakeAmount = stake;
        currentSymbol = symbol;
        
        // Just place the trades once
        placeTrades(stake, symbol);
        
        // Start websocket for analysis only
        startWebSocket();
        
        // Disable the form submit button to prevent multiple submissions
        const submitButton = document.querySelector('#tradingForm button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            setTimeout(() => {
                submitButton.disabled = false;
            }, 2000); // Re-enable after 2 seconds
        }
    }
});

// Add token refresh handling
window.addEventListener('storage', (e) => {
    if (e.key === 'authToken') {
        tradingToken = e.newValue;
        if (!tradingToken) {
            showNotification('Trading stopped - token expired', 'error');
        }
    }
    if (e.key === 'active_loginid') {
        activeLoginId = e.newValue;
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

// Add cleanup function for page unload
window.addEventListener('beforeunload', () => {
    // Close all active contract subscriptions
    activeContracts.forEach((_, contractId) => {
        const request = {
            forget_all: ["proposal_open_contract"],
            contract_id: contractId
        };
        tradeWs.send(JSON.stringify(request));
    });
    activeContracts.clear();
});

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    startWebSocket();
    
    // Add fullscreen button event listener
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
});
