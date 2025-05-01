import React, { useState, useRef, useEffect } from 'react';
import { Text, Button, Input } from '@deriv-com/ui';
import './trading-hub-display.scss';
import { api_base } from '../../external/bot-skeleton/services/api/api-base';
import { doUntilDone } from '../../external/bot-skeleton/services/tradeEngine/utils/helpers';
import { observer as globalObserver } from '../../external/bot-skeleton/utils/observer';
import { useStore } from '@/hooks/useStore';
import marketAnalyzer, { TradeRecommendation } from '../../services/market-analyzer';

const TradingHubDisplay: React.FC = () => {
    const MINIMUM_STAKE = '0.35';

    const [isAutoDifferActive, setIsAutoDifferActive] = useState(false);
    const [isAutoOverUnderActive, setIsAutoOverUnderActive] = useState(false);
    const [recommendation, setRecommendation] = useState<TradeRecommendation | null>(null);
    const [marketStats, setMarketStats] = useState<Record<string, any>>({});
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [stake, setStake] = useState(MINIMUM_STAKE);
    const [martingale, setMartingale] = useState('2');
    const [isTrading, setIsTrading] = useState(false);
    const [isContinuousTrading, setIsContinuousTrading] = useState(false);
    const [currentBarrier, setCurrentBarrier] = useState<number | null>(null);
    const [currentSymbol, setCurrentSymbol] = useState<string>('R_100');
    const [currentStrategy, setCurrentStrategy] = useState<string>('over');
    const tradingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [sessionRunId, setSessionRunId] = useState<string>(`tradingHub_${Date.now()}`);
    const [isAnalysisReady, setIsAnalysisReady] = useState(false);
    const analysisReadinessInterval = useRef<NodeJS.Timeout | null>(null);
    const [analysisCount, setAnalysisCount] = useState(0);
    const [lastAnalysisTime, setLastAnalysisTime] = useState<string>('');
    const analysisInfoInterval = useRef<NodeJS.Timeout | null>(null);
    const [isTradeInProgress, setIsTradeInProgress] = useState(false);
    const [lastTradeId, setLastTradeId] = useState<string>('');
    const [tradeCount, setTradeCount] = useState(0);
    const lastTradeTime = useRef<number>(0);
    const minimumTradeCooldown = 3000; // 3 seconds minimum between trades

    const [initialStake, setInitialStake] = useState(MINIMUM_STAKE);
    const [appliedStake, setAppliedStake] = useState(MINIMUM_STAKE);
    const [lastTradeWin, setLastTradeWin] = useState<boolean | null>(null);
    const [activeContractId, setActiveContractId] = useState<string | null>(null);
    const [consecutiveLosses, setConsecutiveLosses] = useState(0);

    const activeContractRef = useRef<string | null>(null);
    const [lastTradeResult, setLastTradeResult] = useState<string>('');

    const availableSymbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];

    const lastMartingaleActionRef = useRef<string>('initial');
    const lastWinTimeRef = useRef<number>(0);

    const { run_panel, transactions } = useStore();

    const [activeContracts, setActiveContracts] = useState<Record<string, any>>({});
    const contractUpdateInterval = useRef<NodeJS.Timeout | null>(null);
    const lastTradeRef = useRef<{ id: string | null, profit: number | null }>({ id: null, profit: null });
    const [winCount, setWinCount] = useState(0);
    const [lossCount, setLossCount] = useState(0);

    const currentStakeRef = useRef(MINIMUM_STAKE);
    const currentConsecutiveLossesRef = useRef(0);
    const contractSettledTimeRef = useRef(0);
    const waitingForSettlementRef = useRef(false);

    const manageMartingale = (action: 'init' | 'update' | 'get', params?: { 
        newValue?: string 
    }): string => {
        switch (action) {
            case 'init':
                if (params?.newValue) {
                    const validValue = Math.max(parseFloat(params.newValue), 1).toFixed(1);
                    console.log(`Martingale initialization from ${martingale} to ${validValue}`);
                    setMartingale(validValue);
                    
                    try {
                        localStorage.setItem('tradingHub_martingale', validValue);
                    } catch (e) {
                        console.warn('Could not save martingale to localStorage', e);
                    }
                }
                break;
                
            case 'update':
                if (params?.newValue) {
                    setMartingale(params.newValue);
                }
                break;
                
            case 'get':
                const storedValue = localStorage.getItem('tradingHub_martingale');
                if (storedValue) {
                    const parsedValue = parseFloat(storedValue);
                    if (!isNaN(parsedValue) && parsedValue >= 1) {
                        return storedValue;
                    }
                }
                return martingale;
                
            default:
                console.error('Unknown martingale management action:', action);
        }
        
        return martingale;
    };

    const manageStake = (action: 'init' | 'reset' | 'martingale' | 'update' | 'get', params?: { 
        newValue?: string,
        lossCount?: number 
    }): string => {
        switch (action) {
            case 'init':
                if (params?.newValue) {
                    const validValue = Math.max(parseFloat(params.newValue), parseFloat(MINIMUM_STAKE)).toFixed(2);
                    console.log(`Stake initialization from ${initialStake} to ${validValue}`);
                    setInitialStake(validValue);
                    setAppliedStake(validValue);
                    currentStakeRef.current = validValue;
                    
                    try {
                        localStorage.setItem('tradingHub_initialStake', validValue);
                    } catch (e) {
                        console.warn('Could not save stake to localStorage', e);
                    }
                }
                break;
                
            case 'update':
                if (params?.newValue) {
                    const inputValue = params.newValue;
                    setStake(inputValue);
                }
                break;
                
            case 'reset':
                const storedInitialStake = localStorage.getItem('tradingHub_initialStake') || initialStake;
                lastMartingaleActionRef.current = 'reset';
                lastWinTimeRef.current = Date.now();
                
                console.log(`Resetting stake from ${currentStakeRef.current} to stored initial: ${storedInitialStake} (state value: ${initialStake})`);
                console.log(`Consecutive losses counter reset from ${currentConsecutiveLossesRef.current} to 0`);
                
                setAppliedStake(storedInitialStake);
                currentStakeRef.current = storedInitialStake;
                setConsecutiveLosses(0);
                currentConsecutiveLossesRef.current = 0;
                break;
                
            case 'martingale':
                if (lastMartingaleActionRef.current === 'martingale' && 
                    Date.now() - lastWinTimeRef.current < 2000) {
                    console.warn('Prevented duplicate martingale application - too soon after last martingale');
                    return currentStakeRef.current;
                }
                
                const prevLossCount = currentConsecutiveLossesRef.current;
                const newLossCount = params?.lossCount !== undefined ? 
                    params.lossCount : prevLossCount + 1;
                    
                const maxLossCount = 10;
                const safeLossCount = Math.min(newLossCount, maxLossCount);
                
                currentConsecutiveLossesRef.current = safeLossCount;
                
                const baseStake = localStorage.getItem('tradingHub_initialStake') || initialStake;
                
                const currentMartingale = manageMartingale('get');
                const multiplier = parseFloat(currentMartingale);
                const validMultiplier = !isNaN(multiplier) && multiplier >= 1 ? multiplier : 1;
                
                const newStake = (parseFloat(baseStake) * Math.pow(validMultiplier, safeLossCount)).toFixed(2);
                
                console.log(`Martingale calculation details:`);
                console.log(`- Base stake: ${baseStake}`);
                console.log(`- Multiplier: ${validMultiplier}`);
                console.log(`- Previous loss count: ${prevLossCount}`);
                console.log(`- New loss count: ${safeLossCount}`);
                console.log(`- Formula: ${baseStake} × ${validMultiplier}^${safeLossCount} = ${newStake}`);
                
                lastMartingaleActionRef.current = 'martingale';
                currentStakeRef.current = newStake;
                setAppliedStake(newStake);
                setConsecutiveLosses(safeLossCount);
                break;
                
            case 'get':
                return currentStakeRef.current || initialStake;
                
            default:
                console.error('Unknown stake management action:', action);
        }
        
        return currentStakeRef.current;
    };

    useEffect(() => {
        try {
            const savedStake = localStorage.getItem('tradingHub_initialStake');
            if (savedStake) {
                console.log(`Loaded saved stake from storage: ${savedStake}`);
                setInitialStake(savedStake);
                setStake(savedStake);
                currentStakeRef.current = savedStake;
            }
            
            const savedMartingale = localStorage.getItem('tradingHub_martingale');
            if (savedMartingale) {
                console.log(`Loaded saved martingale from storage: ${savedMartingale}`);
                setMartingale(savedMartingale);
            }
        } catch (e) {
            console.warn('Could not load settings from localStorage', e);
        }
    }, []);

    useEffect(() => {
        const session_id = `tradingHub_${Date.now()}`;
        setSessionRunId(session_id);
        globalObserver.emit('bot.started', session_id);

        marketAnalyzer.start();

        analysisReadinessInterval.current = setInterval(() => {
            if (marketAnalyzer.isReadyForTrading()) {
                setIsAnalysisReady(true);
                if (analysisReadinessInterval.current) {
                    clearInterval(analysisReadinessInterval.current);
                }
            }
        }, 500);

        analysisInfoInterval.current = setInterval(() => {
            const info = marketAnalyzer.getAnalyticsInfo();
            setAnalysisCount(info.analysisCount);
            setLastAnalysisTime(info.lastAnalysisTime ? 
                new Date(info.lastAnalysisTime).toLocaleTimeString() : '');
        }, 1000);

        const unsubscribe = marketAnalyzer.onAnalysis((newRecommendation, allStats) => {
            setRecommendation(newRecommendation);
            setMarketStats(allStats);
            
            if (isContinuousTrading && isAutoOverUnderActive && newRecommendation) {
                setCurrentStrategy(newRecommendation.strategy);
                setCurrentSymbol(newRecommendation.symbol);
            }
        });

        const contractSettlementHandler = (response) => {
            if (response?.id === 'contract.settled' && response?.data && 
                lastTradeRef.current?.id !== response.data.contract_id) {
                const contract_info = response.data;
                
                if (contract_info.contract_id === activeContractRef.current) {
                    const isWin = contract_info.profit >= 0;
                    setLastTradeWin(isWin);
                    setLastTradeResult(isWin ? 'WIN' : 'LOSS');
                    
                    console.log(`Contract ${contract_info.contract_id} settled with ${isWin ? 'WIN' : 'LOSS'}.`);
                    console.log(`Current stake: ${currentStakeRef.current}, Initial: ${initialStake}, Consecutive losses: ${currentConsecutiveLossesRef.current}`);
                    
                    lastTradeRef.current = { 
                        id: contract_info.contract_id, 
                        profit: contract_info.profit 
                    };
                    
                    if (isWin) {
                        manageStake('reset');
                    } else {
                        manageStake('martingale');
                    }
                    
                    activeContractRef.current = null;
                }
            }
        };

        globalObserver.register('contract.status', (response) => {   
            if (response?.data?.is_sold) {     
                contractSettlementHandler({
                    id: 'contract.settled',
                    data: response.data
                });                
            }
        });

        globalObserver.register('contract.settled', contractSettlementHandler);

        contractUpdateInterval.current = setInterval(async () => {
            if (!activeContractRef.current) return;
            try {
                const response = await api_base.api.send({
                    proposal_open_contract: 1,    
                    contract_id: activeContractRef.current
                });
                if (response?.proposal_open_contract) {
                    const contract = response.proposal_open_contract;
                        
                    setActiveContracts(prev => ({
                        ...prev,
                        [contract.contract_id]: contract
                    }));
                    
                    if (contract.is_sold === 1) {    
                        const contractId = contract.contract_id;
                        
                        if (lastTradeRef.current?.id === contractId) {
                            console.log(`Contract ${contractId} already processed, skipping duplicate settlement`);
                            return;
                        }
                        
                        const isWin = contract.profit >= 0;
                        const profit = contract.profit;
                        
                        lastTradeRef.current = { id: contractId, profit };
                        contractSettledTimeRef.current = Date.now();
                        
                        console.log(`Contract ${contractId} sold. Result: ${isWin ? 'WIN' : 'LOSS'}, Profit: ${profit}`);
                        console.log(`Current stake before update: ${currentStakeRef.current}, Consecutive losses: ${currentConsecutiveLossesRef.current}`);
                        
                        if (isWin) {
                            setWinCount(prev => prev + 1);
                            manageStake('reset');
                            setLastTradeResult('WIN');
                        } else {
                            setLossCount(prev => prev + 1);
                            manageStake('martingale');
                            setLastTradeResult('LOSS');
                        }
                        
                        setActiveContracts(prev => {
                            const newContracts = { ...prev };
                            delete newContracts[contractId];
                            return newContracts;
                        });
                        activeContractRef.current = null;
                    }
                }
            } catch (error) {
                console.error('Error tracking contract:', error);
            }
        }, 1000);

        return () => {
            if (tradingIntervalRef.current) {
                clearInterval(tradingIntervalRef.current);
            }
            if (analysisReadinessInterval.current) {
                clearInterval(analysisReadinessInterval.current);
            }
            if (analysisInfoInterval.current) {
                clearInterval(analysisInfoInterval.current);
            }
            if (contractUpdateInterval.current) {
                clearInterval(contractUpdateInterval.current);
            }
            globalObserver.emit('bot.stopped');
            marketAnalyzer.stop();   
            unsubscribe();
            globalObserver.unregisterAll('contract.status');
            globalObserver.unregisterAll('contract.settled');
        };
    }, []);

    useEffect(() => {
        currentStakeRef.current = initialStake;
    }, [initialStake]);

    useEffect(() => {
        if (isContinuousTrading) {
            tradingIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const timeSinceLastTrade = now - lastTradeTime.current;
                const timeSinceSettlement = now - contractSettledTimeRef.current;

                if (isTradeInProgress || 
                    timeSinceLastTrade < minimumTradeCooldown || 
                    activeContractRef.current !== null) {                
                    if (!waitingForSettlementRef.current) {
                        console.log(`Trade skipped: ${isTradeInProgress ? 'Trade in progress' : 
                            activeContractRef.current ? 'Waiting for previous contract settlement' : 'Cooldown period'}`);
                    }
                    
                    if (activeContractRef.current) {
                        waitingForSettlementRef.current = true;
                    }
                    
                    return;
                }
                
                waitingForSettlementRef.current = false;
                
                if (timeSinceSettlement < 2000) {
                    console.log('Recent settlement, waiting for martingale calculation to complete...');
                    return;
                }
                
                if (isAutoDifferActive) {
                    executeDigitDifferTrade();
                } else if (isAutoOverUnderActive) {
                    executeDigitOverTrade();
                }
            }, 2000);
        } else {
            if (tradingIntervalRef.current) {
                clearInterval(tradingIntervalRef.current);
                tradingIntervalRef.current = null;
            }
        }

        return () => {
            if (tradingIntervalRef.current) {
                clearInterval(tradingIntervalRef.current);
            }
        };
    }, [isContinuousTrading, isAutoDifferActive, isAutoOverUnderActive, isTradeInProgress]);

    const toggleAutoDiffer = () => {
        if (!isAutoDifferActive && isAutoOverUnderActive) {
            setIsAutoOverUnderActive(false);
        }
        setIsAutoDifferActive(prev => !prev);
        if (isContinuousTrading) {
            stopTrading();
        }
    };

    const toggleAutoOverUnder = () => {
        if (!isAutoOverUnderActive && isAutoDifferActive) {
            setIsAutoDifferActive(false);
        }
        setIsAutoOverUnderActive(prev => !prev);
        if (isContinuousTrading) {
            stopTrading();
        }
    };

    const handleSaveSettings = () => {
        const validStake = Math.max(parseFloat(stake), parseFloat(MINIMUM_STAKE)).toFixed(2);
        console.log(`Saving stake settings from ${initialStake} to ${validStake}`);
        manageStake('init', { newValue: validStake });
        
        if (validStake !== stake) {
            setStake(validStake);
        }
        
        const validMartingale = Math.max(parseFloat(martingale), 1).toFixed(1);
        console.log(`Saving martingale settings from ${martingale} to ${validMartingale}`);
        manageMartingale('init', { newValue: validMartingale });
        
        if (validMartingale !== martingale) {
            setMartingale(validMartingale);
        }
        
        setIsSettingsOpen(false);
    };

    const getRandomBarrier = () => Math.floor(Math.random() * 10);
    const getRandomSymbol = () => {
        const randomIndex = Math.floor(Math.random() * availableSymbols.length);
        return availableSymbols[randomIndex];
    };

    const prepareRunPanelForTradingHub = () => {
        if (!run_panel.is_drawer_open) {
            run_panel.toggleDrawer(true);
        }
        run_panel.setActiveTabIndex(1);
        globalObserver.emit('bot.running');
        const new_session_id = `tradingHub_${Date.now()}`;
        setSessionRunId(new_session_id);
        globalObserver.emit('bot.started', new_session_id);
    };

    const executeDigitDifferTrade = async () => {
        if (isTradeInProgress) {
            console.log('Trade already in progress, skipping new trade request');
            return;
        }
        
        try {
            setIsTradeInProgress(true);
            setIsTrading(true);
            const barrier = getRandomBarrier();
            const symbol = getRandomSymbol();
            setCurrentBarrier(barrier);
            setCurrentSymbol(symbol);
            
            const tradeId = `differ_${symbol}_${barrier}_${Date.now()}`;
            setLastTradeId(tradeId);
            setTradeCount(prevCount => prevCount + 1);
            lastTradeTime.current = Date.now();

            const currentTradeStake = manageStake('get');
            console.log(`Starting trade #${tradeCount + 1}: ${tradeId} with stake ${currentTradeStake} (consecutive losses: ${currentConsecutiveLossesRef.current})`);

            const opts = {
                amount: +currentTradeStake,
                basis: 'stake',
                contract_type: 'DIGITDIFF',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: symbol,
                barrier: barrier.toString(),
            };

            const result = await doUntilDone(() => api_base.api.send({
                buy: 1,
                price: opts.amount,
                parameters: opts,
            }));

            const buy = result?.buy;
            if (buy) {
                const contractId = buy.contract_id;
                console.log(`Trade purchased. Contract ID: ${contractId}, Stake: ${currentTradeStake}`);
                activeContractRef.current = contractId;
                setActiveContractId(contractId);
                
                setActiveContracts(prev => ({
                    ...prev,
                    [contractId]: { 
                        contract_id: contractId,
                        buy_price: opts.amount,
                        status: 'open',
                        purchase_time: Date.now(),
                    }
                }));

                const contract_info = {
                    contract_id: buy.contract_id,
                    contract_type: opts.contract_type,
                    transaction_ids: { buy: buy.transaction_id },
                    buy_price: opts.amount,
                    currency: opts.currency,
                    symbol: opts.symbol,
                    barrier: opts.barrier,
                    date_start: Math.floor(Date.now() / 1000),
                    barrier_display_value: barrier.toString(),
                    contract_parameter: barrier.toString(),
                    parameter_type: 'differ_barrier',
                    entry_tick_time: Math.floor(Date.now() / 1000),
                    exit_tick_time: Math.floor(Date.now() / 1000) + opts.duration,
                    run_id: sessionRunId,
                    display_name: 'Digit Differs',
                    transaction_time: Math.floor(Date.now() / 1000),
                    underlying: symbol,
                    longcode: `Digit ${barrier} differs from last digit of last tick on ${symbol}.`,
                    display_message: `Contract parameter: Differ from ${barrier} on ${symbol}`,
                };

                globalObserver.emit('trading_hub.running');
                globalObserver.emit('bot.contract', contract_info);
                globalObserver.emit('bot.bot_ready');
                globalObserver.emit('contract.purchase_received', buy.contract_id);
                globalObserver.emit('contract.status', { 
                    id: 'contract.purchase',
                    data: contract_info,
                    buy,
                });
                
                transactions.onBotContractEvent(contract_info);
                console.log(`Trade executed: ${opts.contract_type} with barrier ${opts.barrier} on ${opts.symbol}`);
            } else {
                console.error('Trade purchase failed: No buy response received');
                globalObserver.emit('ui.log.error', 'Trade purchase failed: No buy response received');
            }
        } catch (error) {
            console.error('Trade execution error:', error);
            globalObserver.emit('ui.log.error', `Trade execution error: ${error}`);
        } finally {
            setIsTrading(false);
            setTimeout(() => {
                setIsTradeInProgress(false);
            }, 1000);
        }
    };

    const executeDigitOverTrade = async () => {
        if (isTradeInProgress) {
            console.log('Trade already in progress, skipping new trade request');
            return;
        }
        
        try {
            setIsTradeInProgress(true);
            setIsTrading(true);
            if (!isAnalysisReady) {
                console.log('Waiting for market analysis to be ready...');
                await marketAnalyzer.waitForAnalysisReady();
                console.log('Market analysis ready, proceeding with trade');
            }
            const latestRecommendation = await marketAnalyzer.getLatestRecommendation();
            const tradeRec = latestRecommendation || {
                symbol: 'R_100', 
                strategy: 'over',
                barrier: '2',
                overPercentage: 0,
                underPercentage: 0
            };
            const symbol = tradeRec.symbol;
            const strategy = tradeRec.strategy;
            const barrier = tradeRec.strategy === 'over' ? '2' : '7';
            const contract_type = tradeRec.strategy === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
            
            const tradeId = `${contract_type.toLowerCase()}_${symbol}_${barrier}_${Date.now()}`;
            setLastTradeId(tradeId);
            setTradeCount(prevCount => prevCount + 1);
            lastTradeTime.current = Date.now();

            const currentTradeStake = manageStake('get');
            console.log(`Starting trade #${tradeCount + 1}: ${tradeId} with stake ${currentTradeStake} (consecutive losses: ${currentConsecutiveLossesRef.current})`);

            setCurrentBarrier(parseInt(barrier, 10));
            setCurrentSymbol(symbol);
            setCurrentStrategy(strategy);

            const opts = {
                amount: +currentTradeStake,
                basis: 'stake',
                contract_type,
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol,
                barrier,
            };

            const result = await doUntilDone(() => api_base.api.send({
                buy: 1,
                price: opts.amount,
                parameters: opts,
            }));

            const buy = result?.buy;
            if (buy) {
                const contractId = buy.contract_id;
                console.log(`Trade purchased. Contract ID: ${contractId}, Stake: ${currentTradeStake}`);
                activeContractRef.current = contractId;
                setActiveContractId(contractId);
                
                setActiveContracts(prev => ({
                    ...prev,
                    [contractId]: { 
                        contract_id: contractId,
                        buy_price: opts.amount,
                        status: 'open',
                        purchase_time: Date.now(),
                    }
                }));

                const contract_info = {
                    contract_id: buy.contract_id,
                    contract_type: opts.contract_type,
                    transaction_ids: { buy: buy.transaction_id },
                    buy_price: opts.amount,
                    currency: opts.currency,
                    symbol: opts.symbol,
                    barrier: opts.barrier,
                    date_start: Math.floor(Date.now() / 1000),
                    barrier_display_value: barrier,
                    contract_parameter: barrier,
                    parameter_type: strategy === 'over' ? 'over_barrier' : 'under_barrier',
                    entry_tick_time: Math.floor(Date.now() / 1000),
                    exit_tick_time: Math.floor(Date.now() / 1000) + opts.duration,
                    run_id: sessionRunId,
                    display_name: strategy === 'over' ? 'Digit Over' : 'Digit Under',
                    transaction_time: Math.floor(Date.now() / 1000),
                    underlying: symbol,
                    longcode: `Last digit is ${strategy} ${barrier} on ${symbol}.`,
                    display_message: `Contract parameter: ${strategy === 'over' ? 'Over' : 'Under'} ${barrier} on ${symbol}`,
                };

                globalObserver.emit('trading_hub.running');
                globalObserver.emit('bot.contract', contract_info);
                globalObserver.emit('bot.bot_ready');
                globalObserver.emit('contract.purchase_received', buy.contract_id);
                globalObserver.emit('contract.status', { 
                    id: 'contract.purchase',
                    data: contract_info,
                    buy,
                });
                
                transactions.onBotContractEvent(contract_info);
                console.log(`Trade executed: ${opts.contract_type} with barrier ${opts.barrier} on ${opts.symbol}`);
            } else {
                console.error('Trade purchase failed: No buy response received');
                globalObserver.emit('ui.log.error', 'Trade purchase failed: No buy response received');
            }
        } catch (error) {
            console.error('Trade execution error:', error);
            globalObserver.emit('ui.log.error', `Trade execution error: ${error}`);
        } finally {
            setIsTrading(false);
            setTimeout(() => {
                setIsTradeInProgress(false);
            }, 1000);
        }
    };

    const startTrading = () => {
        prepareRunPanelForTradingHub();
        setIsContinuousTrading(true);
        
        const persistedStake = localStorage.getItem('tradingHub_initialStake') || initialStake;
        console.log(`Starting trading with persisted stake: ${persistedStake}`);
        
        setAppliedStake(persistedStake);
        currentStakeRef.current = persistedStake;
        setConsecutiveLosses(0);
        currentConsecutiveLossesRef.current = 0;
        
        contractSettledTimeRef.current = 0;
        waitingForSettlementRef.current = false;
        
        setTimeout(() => {
            if (isAutoDifferActive) executeDigitDifferTrade();
            else if (isAutoOverUnderActive) executeDigitOverTrade();
        }, 500);
    };

    const stopTrading = () => {
        setIsContinuousTrading(false);
        setIsTrading(false);
        globalObserver.emit('bot.stopped');
        manageStake('reset');
    };

    const handleTrade = () => (isContinuousTrading ? stopTrading() : startTrading());

    const isStrategyActive = isAutoDifferActive || isAutoOverUnderActive;

    const displayStake = () => {
        if (parseFloat(appliedStake) === parseFloat(initialStake)) {
            return `$${parseFloat(appliedStake).toFixed(2)}`;
        } else {
            return `$${parseFloat(appliedStake).toFixed(2)} (Base: $${parseFloat(initialStake).toFixed(2)})`;
        }
    };

    const getThemeClass = () => 'trading-hub-container purple-theme';

    return (
        <div className={getThemeClass()}>
            <div className='trading-hub-header'>
                <div className="header-content">
                    <h3 className='trading-hub-title'>TRADING STRATEGIES</h3>
                    <div className="header-accent"></div>
                </div>
                <button 
                    className='settings-button' 
                    onClick={() => setIsSettingsOpen(true)}
                    aria-label="Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24">
                        <path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8-6.5 30.6-15.1 44-25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1-9.8 15.5-20.2 22.1-31.2l4.7-8.1c6.1-11 11.4-22.4 15.8-34.3zM256 336c44.2 0 80-35.8 80-80s-35.8-80-80-80s-80 35.8-80 80s35.8 80 80 80z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
            <div className='trading-strategies'>
                <Button 
                    className={`strategy-button ${isAutoDifferActive ? 'active' : ''}`} 
                    onClick={toggleAutoDiffer}
                    variant={isAutoDifferActive ? 'primary' : 'secondary'}
                    size="lg"
                    disabled={isContinuousTrading}
                >
                    <div className="button-content">
                        <span className="strategy-name">AUTODIFFER</span>
                        <div className="status-container">
                            <span className={`status-indicator ${isAutoDifferActive ? 'on' : 'off'}`}>
                                {isAutoDifferActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>
                    </div>
                </Button>
                
                <Button 
                    className={`strategy-button ${isAutoOverUnderActive ? 'active' : ''}`}
                    onClick={toggleAutoOverUnder}
                    variant={isAutoOverUnderActive ? 'primary' : 'secondary'}
                    size="lg"
                    disabled={isContinuousTrading}
                >
                    <div className="button-content">
                        <span className="strategy-name">AUTO OVER/UNDER</span>
                        <div className="status-container">
                            <span className={`status-indicator ${isAutoOverUnderActive ? 'on' : 'off'}`}>
                                {isAutoOverUnderActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>
                    </div>
                </Button>
            </div>

            <div className="trade-button-container">
                <button
                    className={`trade-button ${isStrategyActive ? 'enabled' : 'disabled'} ${isTrading ? 'trading' : ''}`}
                    onClick={handleTrade}
                    disabled={!isStrategyActive || isTrading}
                >
                    <div className="trade-button-inner">
                        <div className="trade-icon">
                            {isContinuousTrading ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                                    <path d="M3 1h18v2H3V1zm0 8h18v2H3V9zm0 8h18v2H3v-2zM15 5l-5 3-5-3v6l5 3 5-3V5z" fill="currentColor"/>
                                </svg>
                            )}
                        </div>
                        <span className="trade-text">
                            {isContinuousTrading ? 'STOP TRADING' : isTrading ? 'TRADING...' : 'PLACE TRADE'}
                        </span>
                    </div>
                    <div className="pulse-ring"></div>
                </button>
            </div>
            
            <div className="trading-hub-display__stake-info">
                <Text size="xs" weight="bold">Current Stake: {displayStake()}</Text>
                {Object.keys(activeContracts).length > 0 && (
                    <Text size="2xs" className="active-contracts">
                        Active Trade: Contract #{Object.keys(activeContracts)[0]}
                    </Text>
                )}
                {consecutiveLosses > 0 && (
                    <Text size="2xs" className="martingale-info">
                        Martingale Active: {consecutiveLosses} consecutive loss{consecutiveLosses > 1 ? 'es' : ''}
                    </Text>
                )}
                {lastTradeResult && (
                    <div className="trade-stats">
                        <Text size="2xs" className={`trade-result ${lastTradeResult === 'WIN' ? 'win' : 'loss'}`}>
                            Last Trade: {lastTradeResult}
                        </Text>
                        <Text size="2xs">
                            W: {winCount} / L: {lossCount} ({winCount + lossCount > 0 ? Math.round(winCount / (winCount + lossCount) * 100) : 0}% Win)
                        </Text>
                    </div>
                )}
            </div>
            
            {currentBarrier !== null && (
                <div className="trading-hub-display__current-stake">
                    <span>Current {isAutoDifferActive ? 'Digit Differ' : 
                        currentStrategy === 'over' ? 'Digit Over' : 'Digit Under'}: </span>
                    <strong>{currentBarrier}</strong>
                    {isAutoDifferActive && (
                        <>
                            <span> on symbol: </span>
                            <strong>{currentSymbol}</strong>
                        </>
                    )}
                    {isAutoOverUnderActive && (
                        <>
                            <span> on symbol: </span>
                            <strong>{currentSymbol}</strong>
                            {recommendation && (
                                <span className="recommendation-info">
                                    {' '}(Recommended: {recommendation.strategy.toUpperCase()} {recommendation.strategy === 'over' ? '2' : '7'} on {recommendation.symbol})
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}
            
            {isAutoOverUnderActive && !isAnalysisReady && (
                <div className="trading-hub-display__analysis">
                    <Text size="xs" weight="bold">Analyzing Markets</Text>
                    <div className="analysis-details">
                        <Text size="2xs">Collecting data from all markets...</Text>
                        <Text size="2xs">This will improve trade accuracy.</Text>
                    </div>
                </div>
            )}
            
            {isAutoOverUnderActive && isAnalysisReady && recommendation && (
                <div className="trading-hub-display__analysis">
                    <Text size="xs" weight="bold">Pattern Analysis</Text>
                    <div className="analysis-details">
                        <Text size="2xs">Strategy: {recommendation.strategy === 'over' ? 'OVER 2' : 'UNDER 7'}</Text>
                        <Text size="2xs">
                            <strong>Best Symbol: {recommendation.symbol}</strong>
                        </Text>
                        <Text size="2xs">Most Frequent Digit: {recommendation.mostFrequentDigit}</Text>
                        <Text size="2xs">Current Last Digit: {recommendation.currentLastDigit}</Text>
                        <Text size="2xs" className="analysis-method">
                            Pattern Match: {recommendation.reason}
                        </Text>
                        <Text size="2xs" className="analysis-stats">
                            Analyses: {analysisCount} (Last: {lastAnalysisTime || 'N/A'}).
                        </Text>
                        <Text size="2xs" className="trade-info">
                            Trades: {tradeCount} {isTradeInProgress && <span className="trade-lock">🔒 Trade in progress</span>}
                        </Text>
                    </div>
                </div>
            )}

            <div 
                className={`trading-hub-modal-overlay ${isSettingsOpen ? 'active' : ''}`} 
                onClick={() => setIsSettingsOpen(false)}
            >
                <div 
                    className="trading-hub-modal" 
                    onClick={e => e.stopPropagation()}
                    aria-modal="true"
                    role="dialog"
                >
                    <div className="trading-hub-modal-header">
                        <h3>Trading Settings</h3>
                        <button 
                            className="trading-hub-modal-close" 
                            onClick={() => setIsSettingsOpen(false)}
                            aria-label="Close"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div className="trading-hub-modal-content">
                        <div className="settings-field">
                            <div className="settings-label-container">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 1V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <label htmlFor="stake">Stake Amount</label>
                            </div>
                            <div className="settings-input-container">
                                <input
                                    id="stake" 
                                    type="number"
                                    value={stake}
                                    onChange={(e) => manageStake('update', { newValue: e.target.value })}
                                    min={MINIMUM_STAKE}
                                    step="0.01"
                                    className="settings-input"
                                />
                                <div className="settings-input-suffix">USD</div>
                            </div>
                            <div className="settings-input-hint">Minimum stake: {MINIMUM_STAKE} USD</div>
                        </div>
                        <div className="settings-field">
                            <div className="settings-label-container">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M6.5 9C7.88071 9 9 7.88071 9 6.5C9 5.11929 7.88071 4 6.5 4C5.11929 4 4 5.11929 4 6.5C4 7.88071 5.11929 9 6.5 9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M17.5 20C18.8807 20 20 18.8807 20 17.5C20 16.1193 18.8807 15 17.5 15C16.1193 15 15 16.1193 15 17.5C15 18.8807 16.1193 20 17.5 20Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <label htmlFor="martingale">Martingale Multiplier</label>
                            </div>
                            <div className="settings-input-container">
                                <input
                                    id="martingale"
                                    type="number"
                                    value={martingale}
                                    onChange={(e) => manageMartingale('update', { newValue: e.target.value })}
                                    min="1"
                                    step="0.1"
                                    className="settings-input"
                                />
                                <div className="settings-input-suffix">×</div>
                            </div>
                            <div className="settings-input-hint">Multiplies stake after loss</div>
                        </div>
                        <div className="settings-divider">
                            <span>Trading Parameters</span>
                        </div>
                    </div>
                    <div className="trading-hub-modal-footer">
                        <button 
                            className="modal-btn modal-btn-cancel" 
                            onClick={() => setIsSettingsOpen(false)}
                        >
                            Cancel
                        </button>
                        <button 
                            className="modal-btn modal-btn-save" 
                            onClick={handleSaveSettings}
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TradingHubDisplay;
