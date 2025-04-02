let derivWs;
let tickWs; // Add websocket for ticks only
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

// Add contract subscription tracking
let subscribedContracts = new Set(); // Track contract subscriptions

// Add at top with other variables
let activeContractPairs = new Map(); // Track pairs of contracts
let totalProfit = 0;
let consecutiveLosses = 0;
const MAX_CONSECUTIVE_LOSSES = 3;
const PROFIT_TARGET = 50; // $50 profit target

// Replace storage object with read-only version
const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('Storage access failed:', e);
            return null;
        }
    }
};

// Update token manager to handle active account token
const tokenManager = {
    storage: localStorage,
    
    getActiveToken() {
        const active_loginid = this.getActiveLoginId();
        const accountsList = JSON.parse(this.storage.getItem('accountsList') || '{}');
        return accountsList[active_loginid] || null;
    },

    getActiveLoginId() {
        const token = this.storage.getItem('authToken');
        if (!token || token === 'null') return 'CR6360772';

        const accountsList = JSON.parse(this.storage.getItem('accountsList') || '{}');
        const activeLoginId = Object.keys(accountsList)
            .find(key => accountsList[key] === token);

        return activeLoginId || 'CR6360772';
    },

    getAccounts() {
        try {
            const accountsList = this.storage.getItem('accountsList');
            if (!accountsList) {
                return this.getDefaultAccounts();
            }

            const parsedAccounts = JSON.parse(accountsList);
            if (!parsedAccounts) {
                return this.getDefaultAccounts();
            }

            // Convert token format to full account objects
            return Object.entries(parsedAccounts).reduce((acc, [loginid, token]) => {
                acc[loginid] = {
                    token,
                    currency: 'USD',
                    loginid,
                    accountType: loginid.startsWith('VRTC') ? 'virtual' : 'real'
                };
                return acc;
            }, {});
        } catch (error) {
            console.warn('Error parsing accounts:', error);
            return this.getDefaultAccounts();
        }
    },

    getDefaultAccounts() {
        return {
            CR6360772: {
                token: "a1-1oLpIRm48jSZ0EGphJ27HwZwnkA9a",
                currency: 'USD',
                loginid: 'CR6360772',
                accountType: 'real'
            },
            VRTC9432913: {
                token: "a1-ltbv1sQMdv9O4LKESPexp7hIwrqRf",
                currency: 'USD',
                loginid: 'VRTC9432913',
                accountType: 'virtual'
            }
        };
    },

    getTokenInfo() {
        const active_loginid = this.getActiveLoginId();
        const client_accounts = JSON.parse(this.storage.getItem('accountsList')) || {};
        return {
            token: client_accounts[active_loginid] || null,
            account_id: active_loginid
        };
    },

    callIntercom(token) {
        if (typeof window.useIntercom === 'function') {
            window.useIntercom(token);
        }
    }
};

// Update clientStore token handling
let clientStore = {
    loginid: '',
    is_logged_in: false,
    accounts: {},
    currency: 'USD', // Default currency
    balance: '0',
    accountType: '', // Add account type
    getToken() {
        try {
            const { token } = tokenManager.getTokenInfo();
            if (!token) {
                console.warn('No active token found');
                return null;
            }
            return token;
        } catch (error) {
            console.error('Error getting token:', error);
            return null;
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
        this.currency = 'USD'; // Always set to USD
    },
    async validateToken() {
        try {
            const token = this.getToken();
            
            if (!token) {
                showNotification('Please log in to continue', 'error');
                return false;
            }

            const { authorize, error } = await auth.authorize(token);
            if (error || !authorize) {
                showNotification(error?.message || 'Token validation failed', 'error');
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    },
    getActiveAccount() {
        try {
            const active_loginid = tokenManager.getActiveLoginId();
            const accounts = tokenManager.getAccounts();
            const account = accounts[active_loginid];
            
            if (!account) {
                console.warn('No active account found, defaulting to CR account');
                return accounts['CR6360772'];
            }

            // Update store state with active account info
            this.loginid = active_loginid;
            this.currency = 'USD';
            this.is_logged_in = true;
            this.balance = account.balance || '0';
            this.accountType = account.accountType;
            
            console.log('Active account:', {
                loginid: this.loginid,
                currency: this.currency,
                is_logged_in: this.is_logged_in,
                accountType: this.accountType
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

// Update tradeStore to be read-only
const tradeStore = {
    getHistory() {
        try {
            return JSON.parse(storage.get('tradeHistory') || '[]');
        } catch (error) {
            console.warn('Error getting trade history:', error);
            return [];
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

    const client_accounts = tokenManager.getAccounts();

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

// Update these constants at the top of the file
const APP_CONFIG = {
    local: '36300', // Local/test app ID
    staging: '68848', // Staging environment
    production: '68848' // Production app ID
};

// Helper to get appropriate app ID based on environment
function getAppId() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return APP_CONFIG.local;
    }
    // Add staging check if needed
    // if (host.includes('staging')) return APP_CONFIG.staging;
    return APP_CONFIG.production;
}

// Replace the static APP_ID constant
const APP_ID = getAppId();

const OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';
const WS_URL = 'wss://ws.binaryws.com/websockets/v3';

// Update auth helper
const auth = {
    ws: null,
    connecting: false,
    
    async connect() {
        if (this.connecting) return;
        if (this.ws?.readyState === WebSocket.OPEN) return;
        
        this.connecting = true;
        try {
            this.ws = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);
            await new Promise((resolve, reject) => {
                this.ws.onopen = resolve;
                this.ws.onerror = reject;
            });
        } finally {
            this.connecting = false;
        }
    },

    async authorize(token) {
        if (!token) return { authorize: null, error: 'No token provided' };
        
        try {
            await this.connect();
            const response = await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    resolve({ authorize: null, error: 'Authorization timeout' });
                }, 10000);

                const handleMessage = (msg) => {
                    clearTimeout(timeoutId);
                    const data = JSON.parse(msg.data);
                    this.ws.removeEventListener('message', handleMessage);
                    resolve(data);
                };

                this.ws.addEventListener('message', handleMessage);
                this.ws.send(JSON.stringify({ authorize: token }));
            });

            return response;
        } catch (error) {
            return { authorize: null, error };
        }
    },

    cleanup() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
};

// Add WebSocket manager implementation
const wsManager = {
    attempts: 0,
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 16000,

    resetAttempts() {
        this.attempts = 0;
    },

    getDelay() {
        // Exponential backoff with max delay
        return Math.min(this.baseDelay * Math.pow(2, this.attempts), this.maxDelay);
    },

    reconnect() {
        if (this.attempts >= this.maxAttempts) {
            showNotification('Max reconnection attempts reached. Please refresh.', 'error');
            return;
        }

        const delay = this.getDelay();
        this.attempts++;

        showNotification(`Reconnecting in ${delay/1000} seconds... (Attempt ${this.attempts})`, 'warning');
        
        setTimeout(() => {
            startWebSocket()
                .then(() => {
                    this.resetAttempts();
                    showNotification('Successfully reconnected!', 'success');
                })
                .catch(() => {
                    if (this.attempts < this.maxAttempts) {
                        this.reconnect();
                    }
                });
        }, delay);
    }
};

// Update WebSocket initialization
async function startWebSocket() {
    if (derivWs?.readyState === WebSocket.OPEN) {
        return;
    }

    return new Promise((resolve, reject) => {
        try {
            derivWs = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);

            const timeoutId = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 10000);

            derivWs.onopen = () => {
                clearTimeout(timeoutId);
                console.log('Trading WebSocket connected');
                initializeWebSocket();
                
                // Authenticate immediately if token exists
                const token = clientStore.getToken();
                if (token) {
                    derivWs.send(JSON.stringify({ authorize: token }));
                }
                
                resolve();
            };

            derivWs.onerror = (error) => {
                clearTimeout(timeoutId);
                console.error('WebSocket connection failed:', error);
                reject(error);
            };

        } catch (error) {
            reject(error);
        }
    });
}

// Add WebSocket initialization function
function initializeWebSocket() {
    if (!derivWs) return;

    derivWs.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        wsManager.resetAttempts();
        const token = clientStore.getToken();
        if (token) {
            derivWs.send(JSON.stringify({ authorize: token }));
        }
    };

    derivWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            showNotification(data.error.message, 'error');
            return;
        }

        if (data.authorize) {
            clientStore.setLoginId(data.authorize.loginid);
            clientStore.setIsLoggedIn(true);
            clientStore.setBalance(data.authorize.balance);
            clientStore.setCurrency(data.authorize.currency);
            requestTradeHistory();
            subscribeToBalance();
            return;
        }

        if (data.balance) {
            clientStore.setBalance(data.balance.balance);
            updateUI();
            return;
        }

        if (data.profit_table) handleProfitTableResponse(data.profit_table);
        if (data.buy) handleBuyResponse(data.buy);
        if (data.proposal_open_contract) handleContractUpdate(data.proposal_open_contract);
        if (data.proposal) handleProposalResponse(data.proposal);
    };

    derivWs.onclose = (event) => {
        console.log('WebSocket disconnected', event.code);
        updateConnectionStatus(false);
        if (!event.wasClean) {
            wsManager.reconnect();
        }
    };

    derivWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
}

// Add WebSocket initialization functions at the top level
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('ws-status');
    if (statusElement) {
        statusElement.classList.toggle('connected', connected);
        statusElement.style.backgroundColor = connected ? '#4CAF50' : '#f44336'; // Green when connected, Red when disconnected
        statusElement.title = connected ? 'Connected' : 'Disconnected';
    }
}

// Update WebSocket constants
const WS_RECONNECT_DELAY = 500;
const WS_MAX_RECONNECT_DELAY = 30000;

// Update tick WebSocket handling
function startTickAnalysis(symbol = 'R_100') {
    return new Promise((resolve, reject) => {
        if (tickWs?.readyState === WebSocket.OPEN) {
            tickWs.close();
        }

        try {
            tickWs = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);
            
            const timeoutId = setTimeout(() => {
                reject(new Error('Tick WebSocket connection timeout'));
            }, 10000);

            tickWs.onopen = () => {
                clearTimeout(timeoutId);
                console.log('Tick WebSocket connected');
                subscribeTicks(symbol);
                resolve();
            };

            tickWs.onclose = (event) => {
                console.log('Tick WebSocket closed:', event.code);
                if (!event.wasClean) {
                    reject(new Error('Tick WebSocket closed unexpectedly'));
                }
            };

            tickWs.onerror = (error) => {
                console.error('Tick WebSocket error:', error);
                reject(error);
            };

            tickWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    processTickData(data);
                } catch (error) {
                    console.error('Error processing tick data:', error);
                }
            };
        } catch (error) {
            reject(error);
        }
    });
}

function subscribeTicks(symbol) {
    if (!tickWs || tickWs.readyState !== WebSocket.OPEN) return;

    // First get history
    const historyRequest = {
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: "latest",
        start: Math.floor(Date.now() / 1000) - 3600, // Last hour
        style: "ticks"
    };
    
    // Then subscribe to ongoing ticks
    const tickRequest = {
        ticks: symbol,
        subscribe: 1
    };

    tickWs.send(JSON.stringify(historyRequest));
    setTimeout(() => {
        tickWs.send(JSON.stringify(tickRequest));
    }, 500);
}

function processTickData(data) {
    if (data.error) {
        console.error('Tick data error:', data.error);
        return;
    }

    // Handle history response
    if (data.history) {
        tickHistory = data.history.prices.map((price, index) => ({
            time: data.history.times[index] * 1000, // Convert to milliseconds
            quote: parseFloat(price),
            digit: getLastDigit(price)
        }));
        detectDecimalPlaces();
        updateDigitAnalysis();
    }
    
    // Handle live tick updates
    if (data.tick) {
        const quote = parseFloat(data.tick.quote);
        const tick = {
            time: data.tick.epoch * 1000,
            quote: quote,
            digit: getLastDigit(quote)
        };
        
        tickHistory.push(tick);
        if (tickHistory.length > 100) tickHistory.shift();
        updateDigitAnalysis();
    }
}

function updateDigitAnalysis() {
    if (!tickHistory.length) return;

    const lastTick = tickHistory[tickHistory.length - 1];
    
    // Update current price display
    const priceElement = document.getElementById("current-price");
    if (priceElement) {
        priceElement.textContent = lastTick.quote.toFixed(decimalPlaces);
    }

    // Calculate digit statistics
    const digitStats = calculateDigitStats();
    updateDigitDisplay(digitStats, lastTick.digit);
}

function calculateDigitStats() {
    const stats = new Array(10).fill(0);
    const recentTicks = tickHistory.slice(-30); // Analyze last 30 ticks

    recentTicks.forEach(tick => {
        if (tick && typeof tick.quote === 'number') {
            const digit = getLastDigit(tick.quote);
            if (digit >= 0 && digit <= 9) {
                stats[digit]++;
            }
        }
    });

    return stats.map(count => ({
        count,
        percentage: (count / recentTicks.length) * 100
    }));
}

function updateDigitDisplay(digitStats, currentDigit) {
    const container = document.getElementById("digit-display-container");
    if (!container) return;

    const maxCount = Math.max(...digitStats.map(s => s.count));
    const minCount = Math.min(...digitStats.map(s => s.count));

    container.innerHTML = digitStats.map((stat, digit) => `
        <div class="digit-container ${digit === currentDigit ? 'current' : ''}">
            <div class="digit-box ${stat.count === maxCount ? 'highest' : ''} 
                               ${stat.count === minCount ? 'lowest' : ''}">
                ${digit}
            </div>
            <div class="digit-percentage">
                ${stat.percentage.toFixed(1)}%
            </div>
            ${digit === currentDigit ? '<div class="arrow"></div>' : ''}
        </div>
    `).join('');
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

// Update requestProposal function
function requestProposal(contractType, symbol, stake) {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
        wsManager.reconnect();
        return;
    }

    const halfStake = stake / 2; // Split stake in half

    const request = {
        proposal: 1,
        subscribe: 1,
        amount: halfStake, // Use half stake
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: 1,
        duration_unit: "t",
        symbol: symbol,
        barrier: "4"
    };
    
    derivWs.send(JSON.stringify(request));
}

// Update placeTrades function parameters
function placeTrades(stake, symbol) {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
        showNotification('Reconnecting before placing trades...', 'warning');
        wsManager.reconnect();
        return;
    }

    const halfStake = stake / 2; // Split stake in half

    // Place DIGITOVER trade at 4
    const overRequest = {
        buy: 1,
        subscribe: 1,
        price: halfStake, // Use half stake
        parameters: {
            amount: halfStake, // Use half stake
            basis: "stake",
            contract_type: "DIGITOVER",
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: symbol,
            barrier: "5"
        }
    };

    // Place DIGITUNDER trade at 4
    const underRequest = {
        buy: 1,
        subscribe: 1,
        price: halfStake, // Use half stake
        parameters: {
            amount: halfStake, // Use half stake
            basis: "stake",
            contract_type: "DIGITUNDER",
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: symbol,
            barrier: "5"
        }
    };

    derivWs.send(JSON.stringify(overRequest));
    derivWs.send(JSON.stringify(underRequest));
    showNotification(`Placing trades with $${halfStake.toFixed(2)} each...`, 'info');
}

// Update handleTradeExecution for fixed barrier
function handleTradeExecution(signal) {
    if (!isRunning) return;

    const stake = parseFloat(document.getElementById('stake').value) || 1;

    const overRequest = {
        proposal: 1,
        subscribe: 1,
        amount: stake,
        basis: "stake",
        contract_type: "DIGITOVER",
        currency: "USD",
        duration: 1,
        duration_unit: "t",
        symbol: currentSymbol,
        barrier: "5"  // Fixed at 5
    };

    const underRequest = {
        proposal: 1,
        subscribe: 1,
        amount: stake,
        basis: "stake",
        contract_type: "DIGITUNDER",
        currency: "USD",
        duration: 1,
        duration_unit: "t",
        symbol: currentSymbol,
        barrier: "5"  // Fixed at 4
    };

    derivWs.send(JSON.stringify(overRequest));
    derivWs.send(JSON.stringify(underRequest));
}

// Update handleProposalResponse to track more trade details
function handleProposalResponse(proposal) {
    if (!proposal?.id || !proposal?.ask_price) return;

    pendingProposals[proposal.contract_type] = {
        id: proposal.id,
        price: proposal.ask_price,
        type: proposal.contract_type,
        barrier: proposal.barrier,
        timestamp: Date.now()
    };

    const buyRequest = {
        buy: proposal.id,
        price: proposal.ask_price
    };

    if (proposal.contract_type === "DIGITOVER" || proposal.contract_type === "DIGITUNDER") {
        derivWs.send(JSON.stringify(buyRequest));
        showNotification(`Placing ${proposal.contract_type} trade at barrier ${proposal.barrier}`, 'info');
    }
}

// Update handleContractUpdate for better result tracking
function handleContractUpdate(contract) {
    if (!contract?.contract_id) return;

    if (contract.status === "open") {
        activeContracts.set(contract.contract_id, {
            type: contract.contract_type,
            entrySpot: contract.entry_spot,
            barrier: contract.barrier,
            buyPrice: contract.buy_price,
            timestamp: Date.now()
        });
    }

    if (contract.status === "won" || contract.status === "lost") {
        const tradeData = activeContracts.get(contract.contract_id);
        if (tradeData) {
            const result = {
                time: new Date().toLocaleTimeString(),
                type: contract.contract_type,
                digit: contract.exit_tick_display_value?.slice(-1) || 'N/A',
                entrySpot: contract.entry_tick_display_value,
                exitSpot: contract.exit_tick_display_value,
                barrier: contract.barrier,
                buyPrice: contract.buy_price,
                payout: contract.payout,
                profit: contract.profit,
                isWin: contract.status === "won",
                duration: ((contract.sell_time - contract.purchase_time) / 1000).toFixed(1),
                contractId: contract.contract_id
            };

            tradeResults.unshift(result);
            if (tradeResults.length > 50) tradeResults.pop();

            if (result.isWin) {
                totalWins++;
                consecutiveLosses = 0;
            } else {
                totalLosses++;
                consecutiveLosses++;
            }

            totalProfit += parseFloat(result.profit);
            updateResultsDisplay();

            // Check stop conditions
            if (consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
                stopArbitrageBot();
                showNotification(`Bot stopped: ${MAX_CONSECUTIVE_LOSSES} consecutive losses`, 'error');
            } else if (totalProfit >= PROFIT_TARGET) {
                stopArbitrageBot();
                showNotification(`Target profit of $${PROFIT_TARGET} reached!`, 'success');
            }

            activeContracts.delete(contract.contract_id);
        }
    }
}

// Update cleanupTrades
function cleanupTrades() {
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

    // Clear subscribed contracts
    subscribedContracts.clear();

    // Clear additional tracking
    activeContractPairs.clear();
    totalProfit = 0;
    consecutiveLosses = 0;
}

// Modify beforeunload handler
window.addEventListener('beforeunload', cleanupTrades);

// Update subscribeToContract function
function subscribeToContract(contractId) {
    // Check if already subscribed
    if (subscribedContracts.has(contractId)) {
        return;
    }

    const request = {
        proposal_open_contract: 1,
        subscribe: 1,
        contract_id: contractId
    };

    derivWs.send(JSON.stringify(request));
    subscribedContracts.add(contractId);
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
    if (price === undefined || price === null) return 0;

    try {
        let priceStr = price.toString();
        let priceParts = priceStr.split(".");
        let decimals = priceParts[1] || "";
        while (decimals.length < decimalPlaces) decimals += "0";
        return Number(decimals.slice(-1));
    } catch (error) {
        console.error('Error getting last digit:', error);
        return 0;
    }
}

// Split UI update into analysis-only and trading parts
function updateDigitAnalysis() {
    try {
        const currentPrice = tickHistory[tickHistory.length - 1]?.quote;
        const priceElement = document.getElementById("current-price");
        if (priceElement) {
            priceElement.textContent = currentPrice !== undefined ?
                currentPrice.toFixed(decimalPlaces) : "N/A";
        }

        updateDigitDisplay();
    } catch (error) {
        console.error('Error updating digit analysis:', error);
    }
}

function updateUI() {
    try {
        const balanceElement = document.getElementById("account-balance");
        if (balanceElement) {
            balanceElement.textContent = `Balance: ${clientStore.currency} ${Number(clientStore.balance).toFixed(2)}`;
        }

        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        if (startButton && stopButton) {
            startButton.disabled = isRunning;
            stopButton.disabled = !isRunning;
        }
    } catch (error) {
        console.error('Error updating UI:', error);
    }
}

function updateDigitDisplay() {
    if (!tickHistory || !tickHistory.length) {
        console.warn('No tick history available');
        return;
    }

    const container = document.getElementById("digit-display-container");
    if (!container) {
        console.warn('Digit container not found');
        return;
    }

    const digitCounts = new Array(10).fill(0);
    tickHistory.forEach(tick => {
        if (tick && typeof tick.quote === 'number') {
            const lastDigit = getLastDigit(tick.quote);
            if (lastDigit >= 0 && lastDigit <= 9) {
                digitCounts[lastDigit]++;
            }
        }
    });

    const total = digitCounts.reduce((sum, count) => sum + count, 0);
    const digitPercentages = digitCounts.map(count => total > 0 ? (count / total) * 100 : 0);
    const maxPercentage = Math.max(...digitPercentages);
    const minPercentage = Math.min(...digitPercentages);

    const currentQuote = tickHistory[tickHistory.length - 1]?.quote;
    const currentDigit = currentQuote !== undefined ? getLastDigit(currentQuote) : null;

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

// Update updateTradeResults to include more details
function updateTradeResults(digit, isWin, contractDetails) {
    const result = {
        time: new Date().toLocaleTimeString(),
        digit: digit,
        isWin: isWin,
        type: contractDetails.type,
        contractId: contractDetails.contractId,
        profit: contractDetails.profit,
        entrySpot: contractDetails.entrySpot,
        exitSpot: contractDetails.exitSpot,
        barrier: contractDetails.barrier,
        buyPrice: contractDetails.buyPrice,
        payout: contractDetails.payout,
        duration: contractDetails.duration,
        timestamp: Date.now()
    };

    tradeResults.unshift(result);
    if (tradeResults.length > 100) tradeResults.pop();

    totalWins = tradeResults.filter(t => t.isWin).length;
    totalLosses = tradeResults.filter(t => !t.isWin).length;
    totalProfit = tradeResults.reduce((sum, trade) => sum + (trade.profit || 0), 0);

    updateResultsDisplay();
}

// Update updateResultsDisplay for better visualization
function updateResultsDisplay() {
    const container = document.querySelector('.results-card');
    if (!container) return;

    const totalTrades = totalWins + totalLosses;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';

    const statsHtml = `
        <div class="trade-stats">
            <div class="stat-item">
                <div class="stat-label">Total Trades</div>
                <div class="stat-value">${totalTrades}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Win/Loss</div>
                <div class="stat-value">${totalWins}/${totalLosses}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Win Rate</div>
                <div class="stat-value ${parseFloat(winRate) >= 50 ? 'positive' : 'negative'}">${winRate}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Total Profit</div>
                <div class="stat-value ${totalProfit >= 0 ? 'positive' : 'negative'}">$${totalProfit.toFixed(2)}</div>
            </div>
        </div>
        <div class="trade-results">
            ${tradeResults.map(result => `
                <div class="trade-result ${result.isWin ? 'win' : 'loss'}">
                    <div class="trade-details">
                        <span>Exit: ${result.exitSpot}</span>
                        <span>Stake: $${result.buyPrice.toFixed(2)}</span>
                        <span>Payout: $${result.payout.toFixed(2)}</span>
                    </div>
                    <span class="trade-profit">
                        ${result.profit >= 0 ? '+' : ''}$${parseFloat(result.profit).toFixed(2)}
                    </span>
                </div>
            `).join('')}
        </div>
    `;

    container.innerHTML = `<h3>Trading Results</h3>${statsHtml}`;
}

// Add this new function to sync symbol dropdown and analyzer
function syncSymbol(newSymbol) {
    if (!newSymbol) return;
    
    // Update current symbol globally
    currentSymbol = newSymbol;
    
    // Update dropdown if it exists
    const symbolDropdown = document.getElementById('symbol');
    if (symbolDropdown && symbolDropdown.value !== newSymbol) {
        symbolDropdown.value = newSymbol;
    }
    
    // Reset tick history and start new analysis
    tickHistory = [];
    startTickAnalysis(newSymbol);

    // If we're authenticated, also update trading websocket
    if (clientStore.getToken()) {
        startWebSocket();
    }
}

// Update the symbol change handler
document.getElementById('symbol').addEventListener('change', function(e) {
    syncSymbol(e.target.value);
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

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Sync symbol dropdown with current symbol
        syncSymbol(currentSymbol);
        
        // Initialize WebSocket connections immediately
        let connectionAttempts = 0;
        const maxAttempts = 3;
        
        while (connectionAttempts < maxAttempts) {
            try {
                await Promise.all([
                    startWebSocket().catch(e => {
                        console.warn('WebSocket connection failed, retrying...', e);
                        throw e;
                    }),
                    startTickAnalysis(currentSymbol).catch(e => {
                        console.warn('Tick analysis connection failed, retrying...', e);
                        throw e;
                    })
                ]);
                break; // Exit loop if successful
            } catch (error) {
                connectionAttempts++;
                if (connectionAttempts === maxAttempts) {
                    throw new Error('Failed to establish WebSocket connections after multiple attempts');
                }
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            }
        }

        // Get and validate token after connections established
        const token = clientStore.getToken();
        if (token) {
            const isValid = await clientStore.validateToken();
            if (isValid) {
                isAuthenticated = true;
                showNotification('Successfully connected to trading server', 'success');
            }
        }

        // Add event listeners
        document.getElementById('fullscreen-btn')?.addEventListener('click', toggleFullscreen);
        document.getElementById('startButton')?.addEventListener('click', startArbitrageBot);
        document.getElementById('stopButton')?.addEventListener('click', stopArbitrageBot);

        // Initialize UI
        updateUI();
        
    } catch (error) {
        console.error('Failed to initialize:', error);
        showNotification('Failed to connect to trading server. Please refresh.', 'error');
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

    // Reset tracking on start
    totalProfit = 0;
    consecutiveLosses = 0;

    if (derivWs?.readyState !== WebSocket.OPEN) {
        startWebSocket();
    }
}

function stopArbitrageBot() {
    isRunning = false;
    wsManager.resetAttempts(); // Reset attempts when stopping manually
    cleanupTrades();
    updateUI();
}
