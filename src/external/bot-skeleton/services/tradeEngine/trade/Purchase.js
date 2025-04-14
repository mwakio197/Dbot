import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy, tradeCopyOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';

let delayIndex = 0;
let purchase_reference;

export default Engine =>
    class Purchase extends Engine {
        validateTokens(tokens) {
            if (!Array.isArray(tokens)) return false;
            const tokenPattern = /^[\w\s-]+$/;
            return tokens.every(token => typeof token === 'string' && tokenPattern.test(token));
        }

        getTradeResult(response) {
            if (!response?.buy) return 'loss';
            return response.buy.profit > 0 ? 'win' : 'loss';
        }

        calculateNextStake(lastResult, currentStake, baseStake) {
            const martingaleMultiplier = localStorage.getItem('auto_differ_martingale') || '2';
            // Apply martingale multiplier only after a loss.
            if (lastResult === 'loss') {
                return (parseFloat(currentStake) * parseFloat(martingaleMultiplier)).toFixed(2);
            }
            return baseStake;
        }

        purchase(contract_type) {
            if (this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            const isAutoOverUnderEnabled = localStorage.getItem('is_auto_overunder') === 'true';
            const isAutoDifferEnabled = localStorage.getItem('is_auto_differ') === 'true';

            if (isAutoOverUnderEnabled) {
                // Apply same stake logic as autodiffer:
                let tradeStake = localStorage.getItem('auto_differ_current_stake') || '1';

                const selectedContract = Math.random() < 0.5 ? 'DIGITOVER' : 'DIGITUNDER';
                const barrier = selectedContract === 'DIGITOVER' ? 1 : 8;
                const symbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];
                const symbol = symbols[Math.floor(Math.random() * symbols.length)];

                const overunder_request = {
                    proposal: 1,
                    amount: tradeStake,
                    basis: 'stake',
                    contract_type: selectedContract,
                    currency: this.tradeOptions.currency || 'USD',
                    duration_unit: 't',
                    duration: 1,
                    symbol: symbol,
                    barrier: barrier
                };

                return doUntilDone(() => api_base.api.send(overunder_request))
                    .then(response => {
                        if (!response.proposal) throw new Error('No proposal');
                        return doUntilDone(() => api_base.api.send({
                            buy: response.proposal.id,
                            price: tradeStake
                        }));
                    })
                    .then(response => {
                        if (!response.buy) throw new Error('Purchase failed');

                        // Update stake and martingale based on result using autodiffer local storage items
                        const isWin = response.buy.profit > 0;
                        localStorage.setItem('auto_differ_last_result', isWin ? 'win' : 'loss');

                        if (isWin) {
                            tradeStake = localStorage.getItem('auto_differ_stake') || '1';
                        } else {
                            const martingaleMultiplier = localStorage.getItem('auto_differ_martingale') || '2';
                            tradeStake = (parseFloat(tradeStake) * parseFloat(martingaleMultiplier)).toFixed(2);
                        }

                        localStorage.setItem('auto_differ_current_stake', tradeStake);

                        return this.handlePurchaseSuccess(response, selectedContract, tradeStake);
                    });
            } else if (isAutoDifferEnabled) {
                const tradeStake = localStorage.getItem('auto_differ_current_stake') || '1';
                const lastResult = localStorage.getItem('auto_differ_last_result');
                const storedContract = localStorage.getItem('auto_differ_contract_type') || 'DIGITDIFF';
                const selectedContract = storedContract;
                let barrier;

                if (selectedContract === 'DIGITOVER') {
                    barrier = 2;
                } else if (selectedContract === 'DIGITUNDER') {
                    barrier = 7;
                } else {
                    barrier = Math.floor(Math.random() * 10);
                }

                const symbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];
                const symbol = symbols[Math.floor(Math.random() * symbols.length)];

                const differ_request = {
                    proposal: 1,
                    amount: tradeStake,
                    basis: 'stake',
                    contract_type: selectedContract,
                    currency: this.tradeOptions.currency || 'USD',
                    duration_unit: 't',
                    duration: 1,
                    symbol: symbol,
                    barrier: barrier
                };

                return doUntilDone(() => api_base.api.send(differ_request))
                    .then(response => {
                        if (!response.proposal) throw new Error('No proposal');
                        return doUntilDone(() => api_base.api.send({
                            buy: response.proposal.id,
                            price: tradeStake
                        }));
                    })
                    .then(response => {
                        if (!response.buy) throw new Error('Purchase failed');
                        return this.handlePurchaseSuccess(response, selectedContract, tradeStake);
                    });
            }

            // Fallback to original trading behavior when neither mode is enabled
            const trades = [];

            // Regular bot trading - use original parameters
            const standard_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            trades.push(doUntilDone(() => {
                if (['MULTUP', 'MULTDOWN'].includes(contract_type)) {
                    console.warn(`Trade type ${contract_type} is not supported.`);
                    return Promise.resolve();
                }
                return api_base.api.send(standard_option);
            }).catch(e => console.warn(e)));

            // Get stored tokens and settings
            const savedTokens = localStorage.getItem(`extratokens_${this.accountInfo.loginid}`);
            const tokens = savedTokens ? JSON.parse(savedTokens) : [];
            const copyTradeEnabled = localStorage.getItem(`copytradeenabled_${this.accountInfo.loginid}`) === 'true';
            const copyToReal = this.accountInfo.loginid?.startsWith('VR') &&
                localStorage.getItem(`copytoreal_${this.accountInfo.loginid}`) === 'true';

            // Add copy trades if enabled and tokens exist
            if (copyTradeEnabled && tokens.length > 0) {
                const copy_option = {
                    buy_contract_for_multiple_accounts: '1',
                    price: this.tradeOptions.amount,
                    tokens,
                    parameters: {
                        amount: this.tradeOptions.amount,
                        basis: this.tradeOptions.basis,
                        contract_type,
                        currency: this.tradeOptions.currency,
                        duration: this.tradeOptions.duration,
                        duration_unit: this.tradeOptions.duration_unit,
                        symbol: this.tradeOptions.symbol
                    }
                };

                // Add barrier/prediction if they exist
                if (this.tradeOptions.prediction !== undefined) {
                    copy_option.parameters.barrier = this.tradeOptions.prediction;
                }
                if (this.tradeOptions.barrierOffset !== undefined) {
                    copy_option.parameters.barrier = this.tradeOptions.barrierOffset;
                }
                if (this.tradeOptions.secondBarrierOffset !== undefined) {
                    copy_option.parameters.barrier2 = this.tradeOptions.secondBarrierOffset;
                }

                trades.push(doUntilDone(() => api_base.api.send(copy_option)));
            }

            // Add real account trade if enabled on demo
            if (copyToReal) {
                try {
                    const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
                    const realAccountToken = Object.entries(accountsList).find(([id]) => id.startsWith('CR'))?.[1];
                    if (realAccountToken) {
                        const real_option = {
                            buy_contract_for_multiple_accounts: '1',
                            price: this.tradeOptions.amount,
                            tokens: [realAccountToken],
                            parameters: {
                                amount: this.tradeOptions.amount,
                                basis: this.tradeOptions.basis,
                                contract_type,
                                currency: this.tradeOptions.currency,
                                duration: this.tradeOptions.duration,
                                duration_unit: this.tradeOptions.duration_unit,
                                symbol: this.tradeOptions.symbol
                            }
                        };

                        // Add barrier/prediction if they exist
                        if (this.tradeOptions.prediction !== undefined) {
                            real_option.parameters.barrier = this.tradeOptions.prediction;
                        }
                        if (this.tradeOptions.barrierOffset !== undefined) {
                            real_option.parameters.barrier = this.tradeOptions.barrierOffset;
                        }
                        if (this.tradeOptions.secondBarrierOffset !== undefined) {
                            real_option.parameters.barrier2 = this.tradeOptions.secondBarrierOffset;
                        }

                        trades.push(doUntilDone(() => api_base.api.send(real_option)));
                    }
                } catch (e) {
                    console.error('Error copying to real account:', e);
                }
            }

            if (trades.length === 0) {
                return Promise.resolve();
            }

            return Promise.all(trades)
                .then(responses => {
                    const successfulTrades = responses.filter(response => response && response.buy);
                    if (successfulTrades.length > 0) {
                        return Promise.all(
                            successfulTrades.map(response =>
                                this.handlePurchaseSuccess(response, contract_type, this.tradeOptions.amount)
                            )
                        );
                    }
                    return responses;
                });
        }

        handlePurchaseSuccess(response, contract_type, stake) {
            if (!response || !response.buy) return;

            const buy = response.buy;

            // Handle contract status updates
            contractStatus({
                id: 'contract.purchase_received',
                data: buy.transaction_id,
                buy,
            });

            this.contractId = buy.contract_id;
            this.store.dispatch(purchaseSuccessful());

            if (this.is_proposal_subscription_required) {
                this.renewProposalsOnPurchase();
            }

            // Update trade metrics
            delayIndex = 0;
            log(LogTypes.PURCHASE, { longcode: buy.longcode, transaction_id: buy.transaction_id });
            info({
                accountID: this.accountInfo.loginid,
                totalRuns: this.updateAndReturnTotalRuns(),
                transaction_ids: { buy: buy.transaction_id },
                contract_type,
                buy_price: buy.buy_price,
            });

            // Store simple win/loss result
            const isWin = buy.profit > 0;
            localStorage.setItem('auto_differ_last_result', isWin ? 'win' : 'loss');

            // Check profit/loss limits
            const maxProfit = parseFloat(localStorage.getItem('auto_differ_max_profit') || '100');
            const maxLoss = parseFloat(localStorage.getItem('auto_differ_max_loss') || '100');
            const currentProfit = parseFloat(buy.profit || 0);

            if (Math.abs(currentProfit) >= maxProfit || Math.abs(currentProfit) >= maxLoss) {
                localStorage.setItem('is_auto_differ', 'false');
                this.stopBot();
            }

            return response;
        }

        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
    
const TradingHubDisplay = observer(() => {
    // Initialize state with values from localStorage
    const [stake, setStake] = useState(() => localStorage.getItem('auto_differ_current_stake') || '1');
    const [martingale, setMartingale] = useState(() => localStorage.getItem('auto_differ_martingale') || '2');
    const { run_panel } = useStore();
    const { is_auto_differ, setAutoDiffer } = run_panel;

    const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setStake(value);
        // Store original stake value
        localStorage.setItem('auto_differ_stake', value);
        localStorage.setItem('auto_differ_current_stake', value);
    };

    const handleMartingaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setMartingale(value);
        localStorage.setItem('auto_differ_martingale', value);
    };

    const handleAutoDiffer = (enabled: boolean) => {
        localStorage.setItem('is_auto_differ', String(enabled));
        if (enabled) {
            // Reset stakes when enabling
            localStorage.setItem('auto_differ_stake', stake);
            localStorage.setItem('auto_differ_current_stake', stake);
        }
        setAutoDiffer(enabled);
    };
    // ...rest of the code
});
    };
    };
