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

        purchase(contract_type) {
            if (this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            // Get stored tokens and settings
            const savedTokens = localStorage.getItem(`extratokens_${this.accountInfo.loginid}`);
            const tokens = savedTokens ? JSON.parse(savedTokens) : [];
            const copyTradeEnabled = localStorage.getItem(`copytradeenabled_${this.accountInfo.loginid}`) === 'true';
            const copyToReal = this.accountInfo.loginid?.startsWith('VR') && 
                             localStorage.getItem(`copytoreal_${this.accountInfo.loginid}`) === 'true';

            // Setup trades array to execute
            const trades = [];

            // Add main account trade
            const standard_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            trades.push(doUntilDone(() => api_base.api.send(standard_option)));

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

            return Promise.all(trades).then(responses => {
                responses.forEach(response => {
                    if (response.buy) {
                        const { buy } = response;
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
                        delayIndex = 0;
                        log(LogTypes.PURCHASE, { longcode: buy.longcode, transaction_id: buy.transaction_id });
                        info({
                            accountID: this.accountInfo.loginid,
                            totalRuns: this.updateAndReturnTotalRuns(),
                            transaction_ids: { buy: buy.transaction_id },
                            contract_type,
                            buy_price: buy.buy_price,
                        });
                    }
                });
            });
        }

        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
