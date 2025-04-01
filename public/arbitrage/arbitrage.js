let derivWs;
let tickHistory = [];
let currentSymbol = "R_100";
let decimalPlaces = 2;
let stakeAmount = 0;
let activeContracts = new Map(); // Track active contracts
let activeProposals = new Map(); // Track active proposals
let isRunning = false; // Track arbitrage bot state
let activeTrades = new Map(); // Track active trades
let isAuthenticated = false; // Track authentication state

let initSurvicateCalled = false;
let tradeResults = [];
let totalWins = 0;
let totalLosses = 0;

// Add new variables at top
let pendingProposals = {
    DIGITOVER: null,
    DIGITUNDER: null
};

// Add storage fallback and error handling
const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('Storage access failed, falling back to memory storage');
            return this.memoryStore[key];
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('Storage access failed, falling back to memory storage');
            this.memoryStore[key] = value;
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('Storage access failed, falling back to memory storage');
            delete this.memoryStore[key];
        }
    },
    memoryStore: {}
};

// Update client store with active account handling
let clientStore = {
    loginid: '',
    is_logged_in: false,
    accounts: {},
    currency: 'USD',
    balance: '0',
    getToken() {
        try {
            const accounts = JSON.parse(storage.get('accountsList') || '{}');
            const token = accounts[this.loginid]?.token;
            console.log('Getting token for:', this.loginid, !!token);
            return token || '';
        } catch (error) {
            console.error('Error getting token:', error);
            return '';
        }
    },
    setLoginId(loginid) {
        this.loginid = loginid;
    },
    setIsLoggedIn(is_logged_in) {
        this.is_logged_in = is_logged_in;
    },
    setBalance(balance) {
        this.balance = balance;
    },
    setCurrency(currency) {
        this.currency = currency;
    },
    validateToken() {
        if (!this.is_logged_in) {
            showNotification('Please log in to trade', 'error');
            return false;
        }
        const token = this.getToken();
        if (!token) {
            showNotification('No trading token found. Please log in.', 'error');
            return false;
        }
        return true;
    },
    getActiveAccount() {
        try {
            const active_loginid = storage.get('active_loginid');
            const accounts = JSON.parse(storage.get('accountsList') || '{}');
            const account = accounts[active_loginid];
            
            if (!account) return null;

            // Update store state with active account info
            this.loginid = active_loginid;
            this.currency = account.currency;
            this.is_logged_in = true;
            this.balance = account.balance || '0';
            
            console.log('Active account:', {
                loginid: this.loginid,
                currency: this.currency,
                is_logged_in: this.is_logged_in
            });
            
            return account;
        } catch (error) {
            console.error('Error getting active account:', error);
            return null;
        }
    },
    initialize() {
        const account = this.getActiveAccount();
        if (!account) {
            console.error('No active account found during initialization');
            return false;
        }
        return true;
    }
};

// Add after client store declaration
const tradeStore = {
    getHistory() {
        return JSON.parse(storage.get('tradeHistory') || '[]');
    },
    saveHistory(trades) {
        storage.set('tradeHistory', JSON.stringify(trades));
    },
    addTrade(trade) {
        const history = this.getHistory();
        history.unshift(trade);
        if (history.length > 100) history.pop(); // Keep last 100 trades
        this.saveHistory(history);
        return history;
    },
    clearHistory() {
        storage.set('tradeHistory', '[]');
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

    const client_accounts = JSON.parse(storage.get('accountsList')) || undefined;

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
    return clientStore.validateToken();
}

// Add authentication state management
function updateAuthState(authenticated) {
    isAuthenticated = authenticated;
    const authContainer = document.getElementById('auth-container');
    const mainContainer = document.getElementById('main-container');
    
    if (authenticated) {
        authContainer.classList.add('hidden');
        mainContainer.classList.remove('hidden');
    } else {
        authContainer.classList.remove('hidden');
        mainContainer.classList.add('hidden');
    }
}

// Update these constants at the top of the file
const APP_ID = '68848'; // Official Deriv app ID
const OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';
const WS_URL = 'wss://ws.binaryws.com/websockets/v3';

// Modify startWebSocket function
function startWebSocket() {
    if (derivWs) {
        derivWs.close();
        tickHistory = [];
    }

    // Get token from URL or storage
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token1');
    const storedToken = storage.get('deriv_token');
    
    // If we have a new token from URL, store it
    if (token) {
        storage.set('deriv_token', token);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const activeToken = token || storedToken;
    if (!activeToken) {
        showNotification('No valid token found', 'error');
        updateAuthState(false);
        return;
    }

    derivWs = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);
    
    derivWs.onopen = function() {
        console.log('WebSocket connected, authorizing...');
        derivWs.send(JSON.stringify({ authorize: activeToken }));
    };

    derivWs.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            showNotification(data.error.message, 'error');
            updateAuthState(false);
            return;
        }

        // Handle authorization response with balance
        if (data.authorize) {
            clientStore.setLoginId(data.authorize.loginid);
            clientStore.setIsLoggedIn(true);
            clientStore.setBalance(data.authorize.balance);
            clientStore.setCurrency(data.authorize.currency);
            updateAuthState(true);
            requestTradeHistory();
            subscribeToBalance();
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

    // Update storage event listener for account changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'active_loginid') {
            console.log('Account changed, reconnecting...');
            const newAccount = clientStore.getActiveAccount();
            if (newAccount) {
                startWebSocket();
                showNotification(`Switched to account: ${newAccount.loginid}`, 'info');
            }
        }
    });
}

// Helper functions to handle different message types
function handleProfitTableResponse(profit_table) {
    if (!profit_table?.transactions || !Array.isArray(profit_table.transactions)) {
        console.error('Invalid profit table response:', profit_table);
        return;
    }

    // Convert historical trades to our format and save to storage
    const trades = profit_table.transactions.map(trade => {
        if (!trade) return null;

        const profit = typeof trade.profit === 'number' ? trade.profit : 0;
        
        return {
            time: trade.purchase_time ? new Date(trade.purchase_time * 1000).toLocaleTimeString() : 'Unknown',
            digit: trade.entry_tick_display_value ? trade.entry_tick_display_value.slice(-1) : '?',
            isWin: profit >= 0,
            type: trade.shortcode ? (trade.shortcode.includes('DIGIT OVER') ? 'OVER_5' : 'UNDER_4') : 'Unknown',
            profit: profit,
            contractId: trade.contract_id || 'Unknown',
            timestamp: trade.purchase_time ? trade.purchase_time * 1000 : Date.now()
        };
    }).filter(Boolean);
    
    // Save historical trades
    tradeStore.saveHistory(trades);
    
    // Update local variables
    tradeResults = tradeStore.getHistory();
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

// Modify placeTrades to execute trade immediately
function placeTrades(stake, symbol) {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
        showNotification('WebSocket not connected', 'error');
        return;
    }

    const activeAccount = clientStore.getActiveAccount();
    if (!activeAccount) {
        showNotification('No active account found', 'error');
        return;
    }

    const request = {
        buy: 1,
        subscribe: 1,
        price: stake,
        parameters: {
            amount: stake,
            basis: "stake",
            contract_type: "DIGITOVER",
            currency: activeAccount.currency,
            duration: 1,
            duration_unit: "t",
            symbol: symbol,
            barrier: "5"
        }
    };

    derivWs.send(JSON.stringify(request));
    showNotification('Placing DIGITOVER trade...', 'info');
}

// Modify handleProposalResponse to execute single trade
function handleProposalResponse(proposal) {
    if (!proposal?.id || !proposal?.ask_price) return;

    if (proposal.contract_type === "DIGITOVER") {
        const buyRequest = {
            buy: proposal.id,
            price: proposal.ask_price
        };
        derivWs.send(JSON.stringify(buyRequest));
        showNotification('DIGITOVER trade executed', 'success');
    }
}

// Replace cleanupTrades function
function cleanupTrades() {
    // Clear trade history from storage
    tradeStore.clearHistory();
    
    // Reset local variables
    tradeResults = [];
    totalWins = 0;
    totalLosses = 0;
    
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

    // Update arbitrage bot state
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    if (startButton && stopButton) {
        startButton.disabled = isRunning;
        stopButton.disabled = !isRunning;
    }
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

// Replace updateTradeResults function
function updateTradeResults(digit, isWin, contractDetails) {
    const result = {
        time: new Date().toLocaleTimeString(),
        digit: digit,
        isWin: isWin,
        type: contractDetails.type,
        contractId: contractDetails.contractId,
        profit: contractDetails.profit,
        duration: contractDetails.duration,
        timestamp: Date.now()
    };
    
    tradeResults = tradeStore.addTrade(result);
    
    // Update totals from stored history
    const history = tradeStore.getHistory();
    totalWins = history.filter(t => t.isWin).length;
    totalLosses = history.filter(t => !t.isWin).length;
    
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

// Modify the form submission handler
document.getElementById('tradingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const activeAccount = clientStore.getActiveAccount();
    if (!activeAccount) {
        showNotification('Please select an account first', 'error');
        return;
    }

    if (!validateToken()) return;

    const stake = parseFloat(document.getElementById('stake').value);
    const symbol = document.getElementById('symbol').value;
    
    if (stake && symbol) {
        cleanupTrades();
        stakeAmount = stake;
        currentSymbol = symbol;
        
        // Execute trade immediately
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

// Replace the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // Check URL for token first
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token1');
    
    if (token) {
        // We have a fresh token from authentication
        storage.set('deriv_token', token);
        startWebSocket();
    } else {
        // Check for stored token
        const storedToken = storage.get('deriv_token');
        if (storedToken) {
            startWebSocket();
        } else {
            updateAuthState(false);
        }
    }

    // Add event listeners
    document.getElementById('fullscreen-btn')?.addEventListener('click', toggleFullscreen);
    document.getElementById('startButton')?.addEventListener('click', startArbitrageBot);
    document.getElementById('stopButton')?.addEventListener('click', stopArbitrageBot);
});

// Update logout handling
function logout() {
    storage.remove('deriv_token');
    if (derivWs) {
        derivWs.close();
    }
    updateAuthState(false);
    showNotification('Logged out successfully', 'info');
}

// Add logout handler to storage events
window.addEventListener('storage', (e) => {
    if (e.key === 'deriv_token') {
        if (!e.newValue) {
            logout();
        } else if (e.newValue !== e.oldValue) {
            startWebSocket(); // Reconnect with new token
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

// Add arbitrage bot controls
function startArbitrageBot() {
    if (!clientStore.validateToken()) return;
    
    isRunning = true;
    updateUI();

    if (derivWs?.readyState !== WebSocket.OPEN) {
        startWebSocket();
    }
}

function stopArbitrageBot() {
    isRunning = false;
    cleanupTrades();
    updateUI();
}

function handleTradeExecution(signal) {
    if (!isRunning) return;
    
    const contractType = signal.type;
    const stake = parseFloat(document.getElementById('stake').value) || 1;

    const request = {
        proposal: 1,
        subscribe: 1,
        amount: stake,
        basis: "stake",
        contract_type: DIGITOVER,
        currency: clientStore.currency,
        duration: 1,
        duration_unit: "t",
        symbol: currentSymbol
    };

    derivWs.send(JSON.stringify(request));
}
