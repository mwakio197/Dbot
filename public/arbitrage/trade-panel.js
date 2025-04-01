class TradePanel {
    constructor() {
        this.totalProfit = 0;
        this.winCount = 0;
        this.lossCount = 0;
        this.trades = [];
    }

    updateStats(trade) {
        this.trades.unshift(trade);
        if (this.trades.length > 50) this.trades.pop();
        
        this.totalProfit += trade.profit;
        if (trade.profit > 0) this.winCount++;
        else this.lossCount++;
        
        this.updateUI();
    }

    updateUI() {
        const statsElement = document.getElementById('trade-stats');
        if (!statsElement) return;

        const winRate = ((this.winCount / (this.winCount + this.lossCount)) * 100) || 0;
        
        statsElement.innerHTML = `
            <div class="stats-container">
                <div>Win Rate: ${winRate.toFixed(2)}%</div>
                <div>Total Profit: ${this.totalProfit.toFixed(2)} USD</div>
                <div>Wins/Losses: ${this.winCount}/${this.lossCount}</div>
            </div>
            <div class="trades-list">
                ${this.trades.map(trade => `
                    <div class="trade-item ${trade.profit > 0 ? 'win' : 'loss'}">
                        ${trade.symbol} - ${trade.type} - ${trade.profit.toFixed(2)} USD
                    </div>
                `).join('')}
            </div>
        `;
    }

    reset() {
        this.totalProfit = 0;
        this.winCount = 0;
        this.lossCount = 0;
        this.trades = [];
        this.updateUI();
    }
}

const tradePanel = new TradePanel();
export default tradePanel;
