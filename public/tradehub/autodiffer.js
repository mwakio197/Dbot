class AutoDiffer {
    constructor() {
        this.isRunning = false;
        this.trades = {
            active: new Map(),
            history: [],
            stats: {
                total: 0,
                wins: 0,
                losses: 0,
                streak: 0,
                pnl: 0
            },
            maxHistorySize: 50
        };
        this.currentTradeCount = 0;
        this.consecutiveLosses = 0;
        this.maxConsecutiveLosses = 3;
        this.profitTarget = 50;
        this.wsService = window.wsService;

        this.pendingProposals = {
            DIGITDIFF: null
        };
        this.activeContracts = new Map(); // Track active contracts
        this.totalProfit = 0;

        this.maxConcurrentTrades = 1; // Default max concurrent trades
        this.takeProfitPercentage = 50; // Default take profit percentage
        this.stopLossPercentage = 50; // Default stop loss percentage
        this.martingaleMultiplier = 2; // Default Martingale multiplier

        this.initializeEventListeners();
        this.setupMarketHandler();
        this.initializeWebSocketHandlers();

        // Make handlers globally accessible
        window.autoDiffer = this;
    }

    initializeEventListeners() {
        document.getElementById('startBot').addEventListener('click', () => this.toggleBot());
        document.getElementById('resetStats').addEventListener('click', () => this.resetStats());
        document.getElementById('clearLog').addEventListener('click', () => this.clearLog());

        // Load saved preferences into the form
        const tradingPreferences = JSON.parse(localStorage.getItem('tradingPreferences')) || {};
        document.getElementById('investment').value = tradingPreferences.defaultInvestment || 10;
        document.getElementById('market').value = tradingPreferences.defaultMarket || 'R_10';

        document.getElementById('investment').addEventListener('input', (e) => {
            this.showNotification(`Investment amount changed to $${e.target.value}`, 'info');
        });
        document.getElementById('market').addEventListener('change', (e) => {
            this.showNotification(`Market changed to ${e.target.value}`, 'info');
        });
        document.getElementById('takeProfit').addEventListener('input', (e) => {
            this.showNotification(`Take profit changed to ${e.target.value}%`, 'info');
        });
        document.getElementById('stopLoss').addEventListener('input', (e) => {
            this.showNotification(`Stop loss changed to ${e.target.value}%`, 'info');
        });
    }

    setupMarketHandler() {
        const marketSelect = document.getElementById('market');
        marketSelect.addEventListener('change', (e) => {
            const symbol = e.target.value;
            if (symbol === 'SHUFFLE') {
                this.logTrade('Shuffle mode activated: Trading random symbols');
                this.shuffleSymbols = true; // Enable shuffle mode
            } else {
                this.logTrade(`Selected market: ${symbol}`);
                this.shuffleSymbols = false; // Disable shuffle mode
                this.selectedMarket = symbol; // Store the selected market
            }
        });
    }

    async toggleBot() {
        const button = document.getElementById('startBot');
        if (!this.isRunning) {
            const isConnected = await this.ensureConnection();
            if (!isConnected) {
                this.logTrade('Cannot start bot: WebSocket connection failed');
                return;
            }

            this.isRunning = true;
            this.updateSettings(); // Update settings before starting
            button.innerHTML = '<i class="fas fa-stop"></i> Stop Bot';
            button.classList.add('running');
            this.placeTrade(this.getSettings());
        } else {
            this.isRunning = false;
            button.innerHTML = '<i class="fas fa-play"></i> Start Bot';
            button.classList.remove('running');
        }
    }

    updateSettings() {
        const settings = this.getSettings();
        this.maxConcurrentTrades = settings.maxTrades || 1;
        this.takeProfitPercentage = settings.takeProfit || 50;
        this.stopLossPercentage = settings.stopLoss || 50;
        this.martingaleMultiplier = settings.martingale || 2; // Update Martingale multiplier
    }

    resetStats() {
        this.trades.stats = {
            total: 0,
            wins: 0,
            losses: 0,
            streak: 0,
            pnl: 0
        };
        this.trades.history = [];
        this.consecutiveLosses = 0;
        this.updateStats();
        this.logTrade('📊 Statistics reset');
    }

    clearLog() {
        document.getElementById('tradeLog').innerHTML = '';
    }

    logTrade(message, type = 'info') {
        const logContainer = document.getElementById('tradeDetails'); // Updated to use tradeDetails
        if (!logContainer) {
            console.error('Trade log container not found.');
            return;
        }
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `trade-detail ${type}`;
        logEntry.innerHTML = `
            <div class="trade-info">
                <span>${timestamp}</span>
                <span>${message}</span>
            </div>
        `;
        logContainer.prepend(logEntry);
    }

    updateNotificationSummary(message, type) {
        const summaryContainer = document.getElementById('notificationSummary');
        const existingSummary = summaryContainer.querySelector(`li[data-type="${type}"]`);

        if (existingSummary) {
            const count = parseInt(existingSummary.dataset.count, 10) + 1;
            existingSummary.dataset.count = count;
            existingSummary.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}`;
        } else {
            const summaryItem = document.createElement('li');
            summaryItem.dataset.type = type;
            summaryItem.dataset.count = 1;
            summaryItem.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: 1`;
            summaryContainer.appendChild(summaryItem);
        }
    }

    updateStats() {
        const stats = this.trades.stats;
        const elements = {
            totalTrades: document.getElementById('totalTrades'),
            winRate: document.getElementById('winRate'),
            pnl: document.getElementById('pnl'),
            streak: document.getElementById('streak'),
            activeTrades: document.getElementById('activeTrades')
        };

        if (elements.totalTrades) elements.totalTrades.textContent = stats.total;
        if (elements.winRate) {
            const rate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';
            elements.winRate.textContent = `${rate}%`;
            elements.winRate.className = `stat-value ${parseFloat(rate) >= 50 ? 'positive' : 'negative'}`;
        }
        if (elements.pnl) {
            const pnlValue = stats.pnl.toFixed(2);
            elements.pnl.textContent = `${stats.pnl >= 0 ? '+' : ''}$${pnlValue}`;
            elements.pnl.className = `stat-value ${stats.pnl >= 0 ? 'positive' : 'negative'}`;
        }
        if (elements.streak) {
            elements.streak.textContent = Math.abs(stats.streak);
            elements.streak.className = `stat-value ${stats.streak >= 0 ? 'positive' : 'negative'}`;
        }
        if (elements.activeTrades) {
            elements.activeTrades.textContent = this.trades.active.size;
        }
    }

    async ensureConnection() {
        if (!this.wsService || this.wsService.ws?.readyState !== WebSocket.OPEN) {
            this.logTrade('WebSocket disconnected. Attempting to reconnect...');
            window.connectWebSocket();

            return new Promise((resolve) => {
                const checkConnection = setInterval(() => {
                    if (window.wsService?.isAuthorized()) {
                        clearInterval(checkConnection);
                        this.wsService = window.wsService;
                        this.logTrade('WebSocket reconnected successfully');
                        resolve(true);
                    }
                }, 1000);

                setTimeout(() => {
                    clearInterval(checkConnection);
                    resolve(false);
                }, 10000);
            });
        }
        return true;
    }

    async placeTrade(settings) {
        if (!this.isRunning) {
            this.logTrade('Bot is not running.');
            return;
        }

        if (this.trades.active.size >= this.maxConcurrentTrades) {
            this.logTrade('Cannot place a new trade: Max concurrent trades reached.');
            return;
        }

        const isConnected = await this.ensureConnection();
        if (!isConnected) {
            this.logTrade('Trade skipped: WebSocket connection lost');
            return;
        }

        try {
            let contractType = "DIGITDIFF"; // Default to Digit Differ
            let barrier = Math.floor(Math.random() * 10).toString(); // Random barrier for Digit Differ

            // Adjust contract type and barrier based on loss recovery strategy
            if (this.trades.stats.streak < 0) { // After a loss
                if (document.getElementById('tradeOver2').checked) {
                    contractType = "DIGITOVER";
                    barrier = "2";
                } else if (document.getElementById('tradeUnder7').checked) {
                    contractType = "DIGITUNDER";
                    barrier = "7";
                }
            }

            let investment = settings.investment;

            // Apply Martingale strategy after a loss
            if (this.trades.stats.streak < 0) {
                investment *= this.martingaleMultiplier;
                this.logTrade(`Martingale applied: New investment amount is $${investment.toFixed(2)}`);
            }

            const market = this.shuffleSymbols 
                ? this.getRandomSymbol() 
                : settings.market;

            const proposalRequest = {
                proposal: 1,
                subscribe: 1,
                amount: investment,
                basis: "stake",
                contract_type: contractType,
                currency: "USD",
                duration: 1,
                duration_unit: "t",
                symbol: market,
                barrier: barrier
            };

            this.wsService.send(proposalRequest);

            const proposalResponse = await new Promise((resolve, reject) => {
                const handleProposal = (msg) => {
                    const response = JSON.parse(msg.data);
                    if (response.msg_type === 'proposal') {
                        this.wsService.ws.removeEventListener('message', handleProposal);
                        resolve(response);
                    }
                };

                this.wsService.ws.addEventListener('message', handleProposal);

                setTimeout(() => {
                    this.wsService.ws.removeEventListener('message', handleProposal);
                    reject(new Error('Proposal request timed out'));
                }, 10000);
            });

            if (proposalResponse.error) {
                this.logTrade(`Proposal Error: ${proposalResponse.error.message}`);
                return;
            }

            const proposalId = proposalResponse.proposal.id;
            this.pendingProposals[contractType] = {
                id: proposalId,
                price: proposalResponse.proposal.ask_price,
                barrier: proposalResponse.proposal.barrier
            };

            // Check if trade confirmation is required
            if (settings.tradeConfirmation) {
                const confirmTrade = confirm(`Confirm Trade:\n\nMarket: ${market}\nContract Type: ${contractType}\nBarrier: ${barrier}\nInvestment: $${investment.toFixed(2)}`);
                if (!confirmTrade) {
                    this.logTrade('Trade canceled by user.');
                    return;
                }
            }

            const buyRequest = {
                buy: proposalId,
                price: proposalResponse.proposal.ask_price
            };

            this.wsService.send(buyRequest);

            // Track the active trade
            this.trades.active.set(proposalId, {
                id: proposalId,
                investment: settings.investment,
                startTime: Date.now()
            });

            this.logTrade(`✨ Trade proposal sent - ID: ${proposalId}`);
        } catch (error) {
            this.logTrade(`Trade Error: ${error.message}`);
        }
    }

    async fetchTradeResult(contractId, retries = 3, delay = 5000) {
        if (!this.wsService) {
            this.logTrade('WebSocket service not initialized');
            return null;
        }

        const request = {
            proposal_open_contract: 1,
            contract_id: contractId
        };

        for (let attempt = 1; attempt <= retries; attempt++) {
            this.logTrade(`Fetching trade result (Attempt ${attempt}/${retries}) for contract ID: ${contractId}`);
            this.wsService.send(request);

            try {
                return await new Promise((resolve, reject) => {
                    const handleResponse = (msg) => {
                        try {
                            const response = JSON.parse(msg.data);
                            if (response.msg_type === 'proposal_open_contract' && response.proposal_open_contract.contract_id === contractId) {
                                this.wsService.ws.removeEventListener('message', handleResponse);
                                resolve(response.proposal_open_contract);
                            }
                        } catch (error) {
                            this.wsService.ws.removeEventListener('message', handleResponse);
                            reject(error);
                        }
                    };

                    this.wsService.ws.addEventListener('message', handleResponse);

                    setTimeout(() => {
                        this.wsService.ws.removeEventListener('message', handleResponse);
                        reject(new Error(`Timeout while fetching trade result for contract ID: ${contractId}`));
                    }, delay);
                });
            } catch (error) {
                this.logTrade(`Error fetching trade result (Attempt ${attempt}): ${error.message}`);
                if (attempt < retries) {
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    this.logTrade(`Failed to fetch trade result after ${retries} attempts for contract ID: ${contractId}`);
                    return null;
                }
            }
        }
    }

    logTradeDetails(contractId, status, entry, exit, contractType, stake, profit) {
        const tradeDetailsContainer = document.getElementById('tradeDetails');
        const tradeDetail = document.createElement('div');
        tradeDetail.className = `trade-detail ${status === 'won' ? 'win' : 'loss'}`;

        tradeDetail.innerHTML = `
            <div class="trade-info">
                <span>Contract: ${contractType}</span>
                <span>Entry: ${entry}</span>
                <span>Exit: ${exit}</span>
                <span>Stake: $${stake.toFixed(2)}</span>
            </div>
            <div class="trade-profit ${status === 'won' ? 'win' : 'loss'}">
                ${status === 'won' ? '+' : ''}$${profit.toFixed(2)}
            </div>
        `;

        tradeDetailsContainer.prepend(tradeDetail);
    }

    async updatePerformanceAnalytics(contractId) {
        try {
            const result = await this.fetchTradeResult(contractId);

            if (!result) {
                this.logTrade('Failed to fetch trade result.');
                return;
            }

            const profit = result.profit || -result.buy_price;
            const status = result.status;
            const entry = result.entry_tick_display_value || 'N/A';
            const exit = result.exit_tick_display_value || 'N/A';
            const contractType = result.contract_type;
            const stake = result.buy_price;

            // Log simplified trade details
            this.logTradeDetails(contractId, status, entry, exit, contractType, stake, profit);

            if (result.status === 'won') {
                this.trades.stats.wins++;
                this.trades.stats.streak = Math.max(0, this.trades.stats.streak) + 1;
                this.trades.stats.pnl += profit;
                this.logTrade(`🎉 Trade won! Profit: $${profit.toFixed(2)}`);
                this.showNotification(`🎉 Trade won! Profit: $${profit.toFixed(2)}`, 'success');
            } else if (result.status === 'lost') {
                this.trades.stats.losses++;
                this.trades.stats.streak = Math.min(0, this.trades.stats.streak) - 1;
                this.trades.stats.pnl += profit; // `profit` is negative for losses
                this.logTrade(`💔 Trade lost. Loss: $${Math.abs(profit).toFixed(2)}`);
                this.showNotification(`💔 Trade lost. Loss: $${Math.abs(profit).toFixed(2)}`, 'error');
            }

            this.trades.stats.total++;
            this.trades.history.push({
                id: contractId,
                status: result.status,
                profit: profit,
                entrySpot: result.entry_tick_display_value || 'N/A',
                exitSpot: result.exit_tick_display_value || 'N/A',
                barrier: result.barrier || 'N/A',
                buyPrice: result.buy_price,
                payout: result.payout
            });

            if (this.trades.history.length > this.trades.maxHistorySize) {
                this.trades.history.shift();
            }

            // Remove the trade from active trades
            this.trades.active.delete(contractId);

            // Calculate absolute take profit and stop loss values
            const investment = this.getSettings().investment;
            const takeProfit = (this.takeProfitPercentage / 100) * investment;
            const stopLoss = (this.stopLossPercentage / 100) * investment;

            // Log detailed trade results
            this.logTrade(`📊 Trade Details:
            - Contract ID: ${contractId}
            - Status: ${result.status}
            - Profit: $${profit.toFixed(2)}`);

            // Update analytics UI
            this.updateStats();

            // Check stop conditions
            if (this.trades.stats.pnl >= takeProfit) {
                this.stopBot();
                this.logTrade(`Bot stopped: Take profit target of ${this.takeProfitPercentage}% reached.`);
                this.showNotification(`Take profit target of ${this.takeProfitPercentage}% reached!`, 'success');
            } else if (this.trades.stats.pnl <= -stopLoss) {
                this.stopBot();
                this.logTrade(`Bot stopped: Stop loss limit of ${this.stopLossPercentage}% reached.`);
                this.showNotification(`Stop loss limit of ${this.stopLossPercentage}% reached!`, 'error');
            } else if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
                this.stopBot();
                this.logTrade(`Bot stopped: ${this.maxConsecutiveLosses} consecutive losses.`);
            } else if (this.isRunning) {
                // Automatically take another trade if the bot is still running
                this.logTrade('Taking another trade...');
                this.placeTrade(this.getSettings());
            }
        } catch (error) {
            this.logTrade(`Error updating analytics: ${error.message}`);
        }
    }

    showNotification(message, type = 'info') {
        const platformSettings = JSON.parse(localStorage.getItem('platformSettings')) || {};
        if (!platformSettings.notifications) {
            console.log(`Notification suppressed: ${message}`);
            return;
        }

        const container = document.createElement('div');
        container.className = `notification ${type}`;
        container.textContent = message;

        // Ensure the notification container is visible
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.backgroundColor = type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db';
        container.style.color = '#fff';
        container.style.padding = '10px 20px';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        container.style.zIndex = '1000';
        container.style.fontSize = '14px';

        document.body.appendChild(container);

        // Remove notification after 5 seconds
        setTimeout(() => {
            container.remove();
        }, 5000);
    }

    stopBot() {
        this.isRunning = false;
        this.trades.active.clear();
        this.pendingProposals = {
            DIGITDIFF: null
        };
        this.activeContracts.clear();
        this.totalProfit = 0;
        this.consecutiveLosses = 0;
        this.updateStats();
        this.logTrade('🛑 Bot stopped');
    }

    getSettings() {
        const tradingPreferences = JSON.parse(localStorage.getItem('tradingPreferences')) || {};
        return {
            investment: parseFloat(document.getElementById('investment').value) || tradingPreferences.defaultInvestment || 10,
            market: document.getElementById('market').value || tradingPreferences.defaultMarket || 'R_10',
            maxTrades: parseInt(document.getElementById('maxTrades').value) || 1,
            takeProfit: parseFloat(document.getElementById('takeProfit').value) || 50,
            stopLoss: parseFloat(document.getElementById('stopLoss').value) || 50,
            martingale: parseFloat(document.getElementById('martingaleMultiplier').value) || 2,
            soundAlerts: document.getElementById('soundAlerts').checked,
            tradeConfirmation: document.getElementById('tradeConfirmation').checked,
            autoStart: tradingPreferences.autoStart || false
        };
    }

    handleProposal(response) {
        if (response.msg_type === 'proposal') {
            // Removed logging for proposal received
        }
    }

    handleBuyResponse(response) {
        if (response.msg_type === 'buy') {
            // Removed logging for buy response received
        }
    }

    handleContractUpdate(response) {
        if (response.msg_type === 'proposal_open_contract') {
            const contract = response.proposal_open_contract;

            if (contract.status === 'open') {
                this.activeContracts.set(contract.contract_id, {
                    type: contract.contract_type,
                    entrySpot: contract.entry_tick_display_value,
                    barrier: contract.barrier,
                    buyPrice: contract.buy_price,
                    timestamp: Date.now()
                });
            }

            if (contract.status === 'won' || contract.status === 'lost') {
                const tradeData = this.activeContracts.get(contract.contract_id);
                if (tradeData) {
                    this.updatePerformanceAnalytics(contract.contract_id);
                    this.activeContracts.delete(contract.contract_id);
                }
            }
        }
    }

    initializeWebSocketHandlers() {
        if (this.wsService) {
            this.wsService.handleProposal = this.handleProposal.bind(this);
            this.wsService.handleBuyResponse = this.handleBuyResponse.bind(this);
            this.wsService.handleContractUpdate = this.handleContractUpdate.bind(this);
        }
    }

    getRandomSymbol() {
        const symbols = [
            "R_10", "R_25", "R_50", "R_75", "R_100",
            "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"
        ];
        return symbols[Math.floor(Math.random() * symbols.length)];
    }
}

// Initialize AutoDiffer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.autoDiffer = new AutoDiffer();
});

// Add styles for active trades
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .active-trade {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid #eee;
            font-family: monospace;
        }
        .trade-indicator {
            font-weight: bold;
        }
        .trade-indicator.profit {
            color: #2ecc71;
        }
        .trade-indicator.loss {
            color: #e74c3c;
        }
    </style>
`);

// Add styles for trade entries
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .trade-entry {
            padding: 10px;
            border-bottom: 1px solid #eee;
            font-family: monospace;
            transition: all 0.3s ease;
        }

        .trade-header {
            display: flex;
            justify-content: space-between;
            color: #666;
            font-size: 0.9em;
            margin-bottom: 5px;
        }

        .trade-details {
            display: grid;
            gap: 5px;
        }

        .trade-spots {
            display: flex;
            justify-content: space-between;
        }

        .trade-prediction {
            color: #483d8b;
            font-weight: bold;
        }

        .trade-amounts {
            display: flex;
            justify-content: space-between;
            color: #666;
        }

        .trade-status {
            text-align: right;
            font-weight: bold;
        }

        .trade-status.win { color: #2ecc71; }
        .trade-status.loss { color: #e74c3c; }
        .trade-status.pending { color: #f39c12; }

        .trade-entry.completed {
            background: #f8f9fa;
        }

        .trade-entry.active {
            background: #fff;
        }
    </style>
`);

// Add these styles at the end of your existing styles
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .analytics-card {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .stat-item {
            text-align: center;
            flex: 1;
        }

        .stat-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 5px;
        }

        .stat-value {
            font-size: 1.1em;
            font-weight: bold;
        }

        .stat-value.positive {
            color: #2ecc71;
        }

        .stat-value.negative {
            color: #e74c3c;
        }
    </style>
`);
