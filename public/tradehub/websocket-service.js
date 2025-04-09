class WebSocketService {
    constructor() {
        this.ws = null;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.baseReconnectDelay = 1000;
        this.lastPongTime = Date.now();
        this.connectionTimeout = null;
        this.isConnecting = false;
        this.accounts = new Map(); // Store account info
        this.activeLoginId = null; // Active account login ID
        this.balanceSubscribers = new Set(); // Balance subscription callbacks
        this.activeContracts = new Map(); // Store active contracts
        
        // Simplified endpoint configuration
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        this.appId = isLocal ? '36300' : '68848';
        this.endpoint = `wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`;

        this.messageHandlers = new Map();
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        this.messageHandlers.set('proposal_open_contract', (data) => this.handleProposalOpenContract(data));
        this.messageHandlers.set('buy', (data) => this.handleBuyResponse(data));
        this.messageHandlers.set('proposal', (data) => this.handleProposal(data));
    }

    connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        console.log(`Connecting to ${this.endpoint} with app_id: ${this.appId}`);

        try {
            this.ws = new WebSocket(this.endpoint);
            this.setupListeners();
            this.setupConnectionTimeout();
        } catch (error) {
            console.error('WebSocket instantiation error:', error);
            this.handleConnectionFailure();
        }
    }

    setupConnectionTimeout() {
        this.connectionTimeout = setTimeout(() => {
            if (this.ws?.readyState !== WebSocket.OPEN) {
                console.warn('Connection timeout - attempting reconnect');
                this.handleConnectionFailure();
            }
        }, 10000); // 10 second connection timeout
    }

    setupListeners() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            clearTimeout(this.connectionTimeout);
            this.startPing();
            this.authorize();
        };

        this.ws.onclose = (event) => {
            console.log(`WebSocket closed with code ${event.code}`);
            this.handleConnectionFailure();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleConnectionFailure();
        };

        this.ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                console.log('Received message:', data); // Debug incoming messages
                
                // Handle message using registered handlers
                if (this.messageHandlers.has(data.msg_type)) {
                    this.messageHandlers.get(data.msg_type)(data);
                }

                // Handle other message types
                switch (data.msg_type) {
                    case 'ping':
                        this.send({ pong: 1 });
                        break;
                    case 'pong':
                        this.lastPongTime = Date.now();
                        break;
                    case 'balance':
                        console.log('Balance update:', data.balance); // Debug balance updates
                        this.handleBalance(data.balance);
                        break;
                    case 'authorize':
                        this.handleAuthorize(data);
                        break;
                }
            } catch (error) {
                console.error('Message handling error:', error);
            }
        };
    }

    handleConnectionFailure() {
        this.cleanup();

        const delay = this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
    }

    resetAndReconnect() {
        this.reconnectAttempts = 0;
        this.connect();
    }

    cleanup() {
        this.isConnecting = false;
        clearInterval(this.pingInterval);
        clearTimeout(this.connectionTimeout);
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            try {
                this.ws.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (Date.now() - this.lastPongTime > 300000) {
                console.warn('No pong received - reconnecting');
                this.handleConnectionFailure();
                return;
            }
            this.send({ ping: 1 });
        }, 15000);
    }

    authorize() {
        const token = localStorage.getItem('authToken');
        if (token) {
            this.send({
                authorize: token
            });
        }
    }

    subscribeBalance() {
        this.send({
            "balance": 1,
            "account": "all",
            "subscribe": 1
        });
    }

    subscribeToBalances(callback) {
        this.balanceSubscribers.add(callback);
    }

    unsubscribeFromBalances(callback) {
        this.balanceSubscribers.delete(callback);
    }

    notifyBalanceUpdate(balance) {
        this.balanceSubscribers.forEach(callback => {
            try {
                callback(balance);
            } catch (error) {
                console.error('Balance subscriber error:', error);
            }
        });
    }

    logAccountBalances() {
        console.group('Account Balances:');
        for (const [loginid, account] of this.accounts.entries()) {
            console.log(`${account.is_virtual ? 'Demo' : 'Real'} Account ${loginid}:`, {
                balance: account.balance,
                currency: account.currency,
                isActive: loginid === this.activeLoginId
            });
        }
        console.groupEnd();
    }

    handleAuthorize(data) {
        if (data.error) {
            console.error('Authorization failed:', data.error);
            document.querySelectorAll('.account-card.loading').forEach(card => {
                card.classList.remove('loading');
            });
            return;
        }

        console.log('Authorized successfully:', data.authorize);
        
        // Store all accounts with their existing balances
        const authorizedAccount = data.authorize;
        
        // Update the currently authorized account
        this.accounts.set(authorizedAccount.loginid, {
            ...authorizedAccount,
            balance: authorizedAccount.balance ?? this.accounts.get(authorizedAccount.loginid)?.balance ?? 0
        });

        // Update other accounts while preserving their balances
        authorizedAccount.account_list.forEach(account => {
            const existingAccount = this.accounts.get(account.loginid);
            this.accounts.set(account.loginid, {
                ...account,
                ...existingAccount, // Preserve existing account data
                balance: existingAccount?.balance ?? account.balance ?? 0
            });
        });

        if (!this.activeLoginId) {
            this.activeLoginId = authorizedAccount.loginid;
        }

        this.logAccountBalances();

        // Update UI with all accounts
        this.updateAccountInfo({
            account_list: Array.from(this.accounts.values())
        });

        // Subscribe to balance updates for all accounts
        setTimeout(() => {
            this.send({
                "forget_all": "balance"
            });
            this.send({
                "balance": 1,
                "account": "all",
                "subscribe": 1
            });
        }, 500);

        document.querySelectorAll('.account-card.loading').forEach(card => {
            card.classList.remove('loading');
        });
    }

    handleBalance(balanceData) {
        if (!balanceData) return;
        
        console.log('Processing balance update:', balanceData);
        
        const { loginid, balance, currency, accounts } = balanceData;
        
        // Update account balance display in Auto Differ
        const accountBalanceElement = document.getElementById('accountBalance');
        if (accountBalanceElement && loginid === this.activeLoginId) {
            accountBalanceElement.textContent = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency || 'USD'
            }).format(balance || 0);
        }

        // Update the specific account that changed
        const existingAccount = this.accounts.get(loginid);
        if (existingAccount) {
            this.accounts.set(loginid, {
                ...existingAccount,
                balance: balance,
                currency: currency || existingAccount.currency
            });
        }

        // Update other account balances if provided
        if (accounts) {
            Object.entries(accounts).forEach(([id, accountData]) => {
                const account = this.accounts.get(id);
                if (account) {
                    this.accounts.set(id, {
                        ...account,
                        balance: accountData.balance,
                        currency: accountData.currency || account.currency
                    });
                }
            });
        }

        this.logAccountBalances();

        // Force full UI refresh with all accounts
        this.updateAccountInfo({
            account_list: Array.from(this.accounts.values())
        });

        if (loginid === this.activeLoginId) {
            const formattedBalance = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency || 'USD'
            }).format(balance || 0);
            this.showNotification(`Balance updated: ${formattedBalance}`, 'info');
        }
    }

    updateAccountInfo(authorizeData) {
        const balanceContainer = document.getElementById('balance-container');
        if (!balanceContainer) return;

        console.log('Updating UI with accounts:', authorizeData.account_list);

        // Create fresh account cards
        const accountsWithBalances = authorizeData.account_list.map(account => {
            const currentAccount = this.accounts.get(account.loginid);
            return {
                ...account,
                ...currentAccount, // Ensure we use the most recent account data
                balance: currentAccount?.balance || account.balance || 0,
                currency: currentAccount?.currency || account.currency || 'USD'
            };
        });

        // Update the DOM
        balanceContainer.innerHTML = accountsWithBalances
            .map(account => this.createAccountCard(account))
            .join('');

        // Save active account to localStorage
        localStorage.setItem('activeAccount', this.activeLoginId);
    }

    createAccountCard(account) {
        const formattedBalance = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: account.currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(account.balance || 0);

        const accountClass = account.is_virtual ? 'demo' : 'real';
        const accountType = account.is_virtual ? 'Demo' : 'Real';
        const isActive = account.loginid === this.activeLoginId;

        return `
            <div id="account-${account.loginid}" 
                 class="account-card ${accountClass} ${isActive ? 'active-account' : ''}"
                 data-loginid="${account.loginid}"
                 onclick="window.wsService.switchAccount('${account.loginid}')">
                <div class="account-header">
                    <span class="account-type">${accountType}</span>
                    <span class="account-id">${account.loginid}</span>
                </div>
                <div class="balance-info">
                    <span class="currency">${account.currency || 'USD'}</span>
                    <span class="amount">${formattedBalance}</span>
                </div>
            </div>
        `;
    }

    async switchAccount(loginid) {
        if (loginid === this.activeLoginId) return;
        
        console.log(`Switching to account: ${loginid}`);
        
        const card = document.querySelector(`#account-${loginid}`);
        if (card) card.classList.add('loading');

        this.activeLoginId = loginid;

        // Save active account to localStorage
        localStorage.setItem('activeAccount', loginid);

        // Update active state immediately
        document.querySelectorAll('.account-card').forEach(card => {
            card.classList.toggle('active-account', card.dataset.loginid === loginid);
        });

        // Unsubscribe from existing balance subscription
        this.send({
            "forget_all": "balance"
        });

        const isDemoToken = localStorage.getItem('authToken')?.startsWith('demo_');
        let token;

        if (isDemoToken) {
            const demoAccounts = JSON.parse(localStorage.getItem('accounts') || '[]');
            const account = demoAccounts.find(acc => acc.loginid === loginid);
            token = account?.token;
        } else {
            const accounts = JSON.parse(localStorage.getItem('accountsList') || '{}');
            token = accounts[loginid];
        }

        if (token) {
            localStorage.setItem('authToken', token);
            this.send({
                authorize: token
            });
            
            // Resubscribe to balances after a short delay
            setTimeout(() => {
                this.send({
                    "balance": 1,
                    "account": "all",
                    "subscribe": 1
                });
            }, 500);
        }

        this.showNotification(`Switched to account: ${loginid}`, 'info');
    }

    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
            } catch (error) {
                console.error('Send error:', error);
                this.handleConnectionFailure();
            }
        }
    }

    isAuthorized() {
        return this.ws?.readyState === WebSocket.OPEN && !!localStorage.getItem('authToken');
    }

    getActiveLoginId() {
        return this.activeLoginId;
    }

    handleProposalOpenContract(data) {
        const contract = data.proposal_open_contract;
        console.log('Contract Update:', contract);

        if (contract && contract.contract_id) {
            this.activeContracts.set(contract.contract_id, contract);
            
            if (window.autoDiffer) {
                window.autoDiffer.handleContractUpdate(data);
            }

            if (contract.status === 'sold') {
                this.activeContracts.delete(contract.contract_id);
                console.log('Contract completed:', contract);
            }
        }
    }

    handleBuyResponse(data) {
        console.log('Buy Response:', data);
        
        if (!data.error && data.buy) {
            const contractId = data.buy.contract_id;
            
            // Subscribe to contract updates
            this.send({
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1
            });
        }

        if (window.autoDiffer) {
            window.autoDiffer.handleBuyResponse(data);
        }
    }

    handleProposal(data) {
        if (window.autoDiffer) {
            window.autoDiffer.handleProposal(data);
        }
    }
}

window.connectWebSocket = function() {
    const wsService = new WebSocketService();
    wsService.connect();
    window.wsService = wsService;
};
