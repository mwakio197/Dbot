let derivWs;
let tickHistory = [];
let currentSymbol = "R_100";
let decimalPlaces = 2;
let stakeAmount = 0;
let activeContracts = new Map(); // Track active contracts
let activeProposals = new Map(); // Track active proposals

let initSurvicateCalled = false;
let tradeResults = [];
let totalWins = 0;
let totalLosses = 0;

// Add new variables at top
let pendingProposals = {
    DIGITOVER: null,
    DIGITUNDER: null
};

// Replace clientStore with enhanced version
let clientStore = {
    loginid: '',
    is_logged_in: false,
    accounts: {},
    currency: 'USD',
    balance: '0',
    initialized: false,
    getToken() {
        const accountList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        return accountList[this.loginid] ?? '';
    },
    init() {
        if (this.initialized) return;
        
        const active_loginid = localStorage.getItem('active_loginid');
        const accountList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        
        if (active_loginid && accountList[active_loginid]) {
            this.loginid = active_loginid;
            this.is_logged_in = true;
            this.accounts = accountList;
            if (accountList[active_loginid].currency) {
                this.currency = accountList[active_loginid].currency;
            }
        }
        
        this.initialized = true;
        return this.is_logged_in;
    },
    setLoginId(loginid) {
        this.loginid = loginid;
        localStorage.setItem('active_loginid', loginid);
    },
    setIsLoggedIn(is_logged_in) {
        this.is_logged_in = is_logged_in;
    },
    setBalance(balance) {
        this.balance = balance;
        this.updateUI();
    },
    setCurrency(currency) {
        this.currency = currency;
    },
    updateUI() {
        const balanceElement = document.getElementById("account-balance");
        if (balanceElement) {
            balanceElement.textContent = `Balance: ${this.currency} ${Number(this.balance).toFixed(2)}`;
        }
    }
};

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

    if (clientStore.loginid && client_accounts) {
        const { residence, account_type, created_at } = client_accounts[clientStore.loginid] || {};
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

// Replace validateToken function
function validateToken() {
    if (!clientStore.is_logged_in) {
        showNotification('Please log in to trade', 'error');
        return false;
    }
    const token = clientStore.getToken();
    if (!token) {
        showNotification('No trading token found. Please log in.', 'error');
        return false;
    }
    return true;
}

// Replace startWebSocket function
function startWebSocket() {
    if (derivWs) {
        derivWs.close();
        tickHistory = [];
    }

    derivWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=68848');
    
    derivWs.onopen = function() {
        console.log('WebSocket connected');
        // Initialize client store before authorization
        if (clientStore.init() && clientStore.getToken()) {
            const authRequest = {
                authorize: clientStore.getToken(),
                account: clientStore.loginid
            };
            derivWs.send(JSON.stringify(authRequest));
        } else {
            showNotification('Please log in to continue', 'error');
        }
    };

    // Modify onmessage to handle initial balance
    derivWs.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            showNotification(data.error.message, 'error');
            if (data.error.code === 'InvalidToken') {
                clientStore.setIsLoggedIn(false);
                clientStore.setBalance('0');
            }
            return;
        }

        // Enhanced authorization handling
        if (data.authorize) {
            clientStore.setLoginId(data.authorize.loginid);
            clientStore.setIsLoggedIn(true);
            clientStore.setCurrency(data.authorize.currency);
            clientStore.setBalance(data.authorize.balance);
            
            // Request additional account data
            requestAccountSettings();
            requestTradeHistory();
            subscribeToBalance();
            requestTickHistory();
            return;
        }

        // Handle balance updates
        if (data.balance) {
            clientStore.setBalance(data.balance.balance);
            updateUI();
            return;
        }

        // Handle profit table response
        if (data.profit_table) {
            handleProfitTableResponse(data.profit_table);
            return;
        }

        // Handle buy response
        if (data.buy) {
            handleBuyResponse(data.buy);
            return;
        }

        // Handle contract updates
        if (data.proposal_open_contract) {
            handleContractUpdate(data.proposal_open_contract);
            return;
        }

        // Handle proposal response
        if (data.proposal) {
            handleProposalResponse(data.proposal);
            return;
        }

        // Handle tick data
        if (data.history || data.tick) {
            handleTickData(data);
        }
    };

    derivWs.onclose = function() {
        console.log('WebSocket disconnected');
    };
    
    derivWs.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Add account settings request
function requestAccountSettings() {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) return;
    
    const request = {
        get_settings: 1
    };
    derivWs.send(JSON.stringify(request));
}

// Helper functions to handle different message types
function handleProfitTableResponse(profit_table) {
    if (!profit_table?.transactions || !Array.isArray(profit_table.transactions)) {
        console.error('Invalid profit table response:', profit_table);
        return;
    }

    const trades = profit_table.transactions;
    tradeResults = trades.map(trade => {
        // Add null checks for each property
        if (!trade) return null;

        const profit = typeof trade.profit === 'number' ? trade.profit : 0;
        
        return {
            time: trade.purchase_time ? new Date(trade.purchase_time * 1000).toLocaleTimeString() : 'Unknown',
            digit: trade.entry_tick_display_value ? trade.entry_tick_display_value.slice(-1) : '?',
            isWin: profit >= 0,
            type: trade.shortcode ? (trade.shortcode.includes('DIGIT OVER') ? 'OVER_5' : 'UNDER_4') : 'Unknown',
            profit: profit,
            contractId: trade.contract_id || 'Unknown'
        };
    }).filter(Boolean); // Remove any null entries
    
    totalWins = tradeResults.filter(t => t.isWin).length;
    totalLosses = tradeResults.filter(t => !t.isWin).length;
    
    updateResultsDisplay();
}

function handleBuyResponse(buy) {
    if (!buy?.contract_id) {
        console.error('Invalid buy response:', buy);
        return;
    }

    const contractId = buy.contract_id;
    const contractType = buy.contract_type || 'Unknown';
    activeContracts.set(contractId, {
        type: contractType,
        openTime: new Date(),
        stake: buy.buy_price || 0
    });
    
    subscribeToContract(contractId);
    showNotification(`${contractType} contract opened: ${contractId}`, 'success');
}

function handleContractUpdate(contract) {
    if (!contract?.contract_id) {
        console.error('Invalid contract update:', contract);
        return;
    }

    if (contract.is_sold) {
        const profit = contract.profit || 0;
        const contractId = contract.contract_id;
        const contractData = activeContracts.get(contractId);
        
        if (contractData) {
            const exitDigit = contract.exit_tick_display_value ? 
                contract.exit_tick_display_value.slice(-1) : '?';

            updateTradeResults(exitDigit, profit >= 0, {
                contractId,
                profit,
                type: contractData.type,
                duration: (new Date() - contractData.openTime) / 1000
            });
            activeContracts.delete(contractId);
        }
    }
}

function handleTickData(data) {
    if (data.history && Array.isArray(data.history.prices)) {
        tickHistory = data.history.prices.map((price, index) => ({
            time: data.history.times?.[index] || Date.now(),
            quote: parseFloat(price) || 0
        }));
        detectDecimalPlaces();
    } else if (data.tick?.quote) {
        let tickQuote = parseFloat(data.tick.quote) || 0;
        tickHistory.push({ 
            time: data.tick.epoch || Date.now(), 
            quote: tickQuote 
        });
        if (tickHistory.length > 100) tickHistory.shift();
    }
    updateUI();
}

// Add after WebSocket initialization
function requestTradeHistory() {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
        return;
    }

    const request = {
        "profit_table": 1,
        "description": 1,
        "sort": "DESC",
        "limit": 10
    };

    derivWs.send(JSON.stringify(request));
}

// Add new function to request trade proposal
function requestProposal(contractType, symbol, stake) {
    const request = {
        proposal: 1,
        subscribe: 1,
        amount: stake,
        basis: "stake",
        contract_type: contractType,
        currency: clientStore.currency,
        duration: 1,
        duration_unit: "t",
        symbol: symbol,
        barrier: contractType === "DIGITOVER" ? "5" : "4"
    };
    
    derivWs.send(JSON.stringify(request));
}

// Modify the placeTrades function
function placeTrades(stake, symbol) {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
        showNotification('WebSocket not connected', 'error');
        return;
    }

    const currentDigit = getLastDigit(tickHistory[tickHistory.length - 1]?.quote);
    
    // Only request the appropriate trade based on current digit
    if (currentDigit < 5) {
        requestProposal("DIGITOVER", symbol, stake);
    } else if (currentDigit > 4) {
        requestProposal("DIGITUNDER", symbol, stake);
    }
}

// Modify handleProposalResponse function
function handleProposalResponse(proposal) {
    if (!proposal?.id || !proposal?.ask_price) return;

    // Store in active proposals
    activeProposals.set(proposal.id, proposal);

    // Place trade immediately if it's favorable
    const currentDigit = getLastDigit(tickHistory[tickHistory.length - 1]?.quote);
    
    if (proposal.contract_type === "DIGITOVER" && currentDigit < 5) {
        const buyRequest = {
            buy: proposal.id,
            price: proposal.ask_price
        };
        derivWs.send(JSON.stringify(buyRequest));
    } else if (proposal.contract_type === "DIGITUNDER" && currentDigit > 4) {
        const buyRequest = {
            buy: proposal.id,
            price: proposal.ask_price
        };
        derivWs.send(JSON.stringify(buyRequest));
    }
}

// Add cleanup for pending proposals 
function cleanupTrades() {
    // Reset pending proposals
    pendingProposals = {
        DIGITOVER: null,
        DIGITUNDER: null
    };

    // Forget all proposals
    activeProposals.forEach((proposal, id) => {
        const request = {
            forget: id
        };
        derivWs.send(JSON.stringify(request));
    });
    activeProposals.clear();

    // Close all active contract subscriptions
    activeContracts.forEach((_, contractId) => {
        const request = {
            forget_all: ["proposal_open_contract"],
            contract_id: contractId
        };
        derivWs.send(JSON.stringify(request));
    });
    activeContracts.clear();
}

// Modify beforeunload handler
window.addEventListener('beforeunload', cleanupTrades);

// Add contract subscription function
function subscribeToContract(contractId) {
    const request = {
        proposal_open_contract: 1,
        subscribe: 1,
        contract_id: contractId
    };
    derivWs.send(JSON.stringify(request));
}

// Add balance subscription after auth
function subscribeToBalance() {
    if (derivWs && derivWs.readyState === WebSocket.OPEN) {
        const request = {
            balance: 1,
            subscribe: 1
        };
        derivWs.send(JSON.stringify(request));
    }
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

// Modify updateUI to show balance
function updateUI() {
    const currentPrice = tickHistory[tickHistory.length - 1]?.quote.toFixed(decimalPlaces);
    document.getElementById("current-price").textContent = currentPrice || "N/A";
    
    // Add balance display
    const balanceElement = document.getElementById("account-balance");
    if (balanceElement) {
        balanceElement.textContent = `Balance: ${clientStore.currency} ${Number(clientStore.balance).toFixed(2)}`;
    }
    
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

// Simplify updateResultsDisplay
function updateResultsDisplay() {
    const resultsContainer = document.getElementById('trade-results');
    const statsContainer = document.getElementById('trade-stats');
    
    // Update stats
    const totalTrades = totalWins + totalLosses;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';
    const totalProfit = tradeResults.reduce((sum, trade) => sum + (trade.profit || 0), 0).toFixed(2);
    
    statsContainer.innerHTML = `
        <div>Win Rate: ${winRate}%</div>
        <div>Profit: $${totalProfit}</div>
    `;
    
    // Update results list with simplified display
    resultsContainer.innerHTML = tradeResults.slice(0, 10).map(result => {
        const profit = (result.profit || 0).toFixed(2);
        return `
            <div class="trade-result ${result.isWin ? 'win' : 'loss'}">
                <span>${result.time || 'Unknown'}</span>
                <span>${result.type || 'Unknown'}</span>
                <span class="profit">$${profit}</span>
            </div>
        `;
    }).join('');
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

// Add account status check before trades
function validateAccount() {
    if (!clientStore.is_logged_in) {
        showNotification('Please log in to trade', 'error');
        return false;
    }
    
    if (!clientStore.initialized) {
        showNotification('Account not fully initialized', 'error');
        return false;
    }
    
    if (parseFloat(clientStore.balance) <= 0) {
        showNotification('Insufficient balance', 'error');
        return false;
    }
    
    return true;
}

// Modify the form submission handler
document.getElementById('tradingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!validateAccount()) return;

    const stake = parseFloat(document.getElementById('stake').value);
    const symbol = document.getElementById('symbol').value;
    
    if (stake && symbol) {
        // Cleanup any existing trades first
        cleanupTrades();
        
        stakeAmount = stake;
        currentSymbol = symbol;
        
        // Request new trades
        placeTrades(stake, symbol);
        
        // Disable submit button temporarily
        const submitButton = document.querySelector('#tradingForm button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            setTimeout(() => {
                submitButton.disabled = false;
            }, 2000);
        }
    }
});

// Handle storage events for client-store sync
window.addEventListener('storage', (e) => {
    if (e.key === 'active_loginid') {
        const loginid = e.newValue;
        if (loginid) {
            clientStore.setLoginId(loginid);
            startWebSocket(); // Reconnect with new credentials
        } else {
            clientStore.setIsLoggedIn(false);
            showNotification('Logged out', 'info');
        }
    }
    
    if (e.key === 'accountsList') {
        if (!e.newValue) {
            clientStore.setIsLoggedIn(false);
            showNotification('Session expired', 'error');
        }
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
    // Initialize client store first
    if (clientStore.init()) {
        startWebSocket();
    } else {
        showNotification('Please log in to start trading', 'info');
    }
    
    // Add fullscreen button event listener
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
});
