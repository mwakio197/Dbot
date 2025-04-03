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

            // Get real account token directly
            let realAccountToken;
            if (copyToReal) {
                try {
                    const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
                    // Get first token that belongs to a real account (CR)
                    realAccountToken = Object.entries(accountsList).find(([id]) => id.startsWith('CR'))?.[1];
                    if (realAccountToken) {
                        console.log('Found real account token for copy trading');
                    } else {
                        console.warn('No real account token found');
                    }
                } catch (e) {
                    console.error('Error getting real account token:', e);
                }
            }

            const onSuccess = response => {
                // Track regular buy response for main account
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
                    log(LogTypes.PURCHASE, { 
                        longcode: buy.longcode, 
                        transaction_id: buy.transaction_id 
                    });
                    info({
                        accountID: this.accountInfo.loginid,
                        totalRuns: this.updateAndReturnTotalRuns(),
                        transaction_ids: { buy: buy.transaction_id },
                        contract_type,
                        buy_price: buy.buy_price,
                    });
                }
                
                // Handle copy trade responses without affecting main tracking
                if (response.buy_contract_for_multiple_accounts) {
                    const copy_buy = response.buy_contract_for_multiple_accounts;
                    log(LogTypes.PURCHASE, { 
                        message: 'Copy trade executed',
                        transaction_ids: copy_buy.transaction_ids
                    });
                }
            };

            // Setup trades array to execute
            const trades = [];

            // Add main account trade
            const standard_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            trades.push(doUntilDone(() => api_base.api.send(standard_option)));

            // Add copy trades only if enabled and tokens exist
            if (copyTradeEnabled && tokens.length > 0) {
                if (!this.validateTokens(tokens)) {
                    return Promise.reject(new Error('Invalid token format'));
                }

                const copy_option = tradeCopyOptionToBuy(contract_type, {
                    ...this.tradeOptions,
                    tokens,
                });
                trades.push(doUntilDone(() => api_base.api.send(copy_option)));
            }

            // Add real account trade if enabled on demo and real account exists
            if (copyToReal && realAccountToken) {
                const real_option = tradeCopyOptionToBuy(contract_type, {
                    amount: this.tradeOptions.amount,
                    basis: this.tradeOptions.basis,
                    duration: this.tradeOptions.duration,
                    duration_unit: this.tradeOptions.duration_unit,
                    symbol: this.tradeOptions.symbol,
                    barrier: this.tradeOptions.barrierOffset,
                    prediction: this.tradeOptions.prediction,
                    tokens: [realAccountToken],
                });
                trades.push(doUntilDone(() => api_base.api.send(real_option)));
                console.log('Copying trade to real account:', real_option);
            }

            return Promise.all(trades).then(responses => {
                responses.forEach(onSuccess);
            });
        }

        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
