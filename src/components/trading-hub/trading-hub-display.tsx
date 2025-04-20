import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Button, Input, Text } from '@deriv-com/ui';
import classNames from 'classnames';
import './trading-hub-display.scss';
import { ProposalOpenContract } from '@deriv/api-types';

type TContractResult = {
    profit: number;
    timestamp: number;
    contract_id: number;
};

const TradingHubDisplay = observer(() => {
    // Initialize state with values from localStorage
    const [stake, setStake] = useState(() => localStorage.getItem('auto_differ_stake') || '1');
    const [maxLoss, setMaxLoss] = useState(() => localStorage.getItem('auto_differ_max_loss') || '100');
    const [maxProfit, setMaxProfit] = useState(() => localStorage.getItem('auto_differ_max_profit') || '100');
    const [martingale, setMartingale] = useState(() => localStorage.getItem('auto_differ_martingale') || '2');
    const [analysis, setAnalysis] = useState<any>(null);
    const [currentStake, setCurrentStake] = useState(stake);
    const [latestResult, setLatestResult] = useState<TContractResult | null>(null);
    const [completedContract, setCompletedContract] = useState<ProposalOpenContract | null>(null);
    const [is_overunder, setIsOverUnder] = useState(() => localStorage.getItem('is_auto_overunder') === 'true');

    const { run_panel, transactions } = useStore();
    const { is_auto_differ, setAutoDiffer } = run_panel;

    // Load saved settings on component mount
    useEffect(() => {
        const savedStake = localStorage.getItem('auto_differ_stake');
        const savedMaxLoss = localStorage.getItem('auto_differ_max_loss');
        const savedMaxProfit = localStorage.getItem('auto_differ_max_profit');
        const savedMartingale = localStorage.getItem('auto_differ_martingale');

        if (savedStake) setStake(savedStake);
        if (savedMaxLoss) setMaxLoss(savedMaxLoss);
        if (savedMaxProfit) setMaxProfit(savedMaxProfit);
        if (savedMartingale) setMartingale(savedMartingale);

        // Set overunder state to "no" on page load
        localStorage.setItem('is_auto_overunder', 'false');
        setIsOverUnder(false);

        // Load market analysis
        const savedAnalysis = localStorage.getItem('market_analysis');
        if (savedAnalysis) {
            setAnalysis(JSON.parse(savedAnalysis));
        }
    }, []);

    const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setStake(value);
        setCurrentStake(value); // Update current stake when base stake changes
        localStorage.setItem('auto_differ_stake', value);
        localStorage.setItem('auto_differ_current_stake', value);
    };

    const handleMaxLossChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setMaxLoss(value);
        localStorage.setItem('auto_differ_max_loss', value);
    };

    const handleMaxProfitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setMaxProfit(value);
        localStorage.setItem('auto_differ_max_profit', value);
    };

    const handleMartingaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setMartingale(value);
        localStorage.setItem('auto_differ_martingale', value);
    };

    // Contract tracking update
    useEffect(() => {
        if (!transactions?.elements || (!is_auto_differ && !is_overunder)) return;

        // Force reset stake when trading mode is first enabled
        const isAnyModeActive = is_auto_differ || is_overunder;
        if (isAnyModeActive && localStorage.getItem('is_first_trade') !== 'false') {
            console.log('Trading mode active with first trade pending, ensuring base stake is used');
            setCurrentStake(stake);
            localStorage.setItem('auto_differ_current_stake', stake);
        }

        const elements = Object.values(transactions.elements)[0] || [];
        const latestElement = elements[0];

        if (latestElement?.data) {
            const contract = latestElement.data;

            if (contract.is_sold && contract.transaction_ids?.sell) {
                console.log('Contract completed:', {
                    id            : contract.contract_id,
                    profit        : contract.profit,
                    current_stake : localStorage.getItem('auto_differ_current_stake'),
                    original_stake: localStorage.getItem('auto_differ_stake'),
                    is_first_trade: localStorage.getItem('is_first_trade')
                });

                setCompletedContract(contract);
                if (contract.profit !== undefined) {
                    const isWin = Number(contract.profit) > 0;

                    // Check if max profit or max loss is reached
                    const totalProfit = parseFloat(localStorage.getItem('total_profit') || '0') + Number(contract.profit);
                    localStorage.setItem('total_profit', totalProfit.toString());

                    if (totalProfit >= parseFloat(maxProfit)) {
                        console.log('Max profit reached. Stopping trading.');
                        localStorage.setItem('is_auto_differ', 'false');
                        localStorage.setItem('is_auto_overunder', 'false');
                        setAutoDiffer(false);
                        setIsOverUnder(false);
                        return;
                    }

                    if (totalProfit <= -parseFloat(maxLoss)) {
                        console.log('Max loss reached. Stopping trading.');
                        localStorage.setItem('is_auto_differ', 'false');
                        localStorage.setItem('is_auto_overunder', 'false');
                        setAutoDiffer(false);
                        setIsOverUnder(false);
                        return;
                    }

                    // After first trade, mark as not first trade anymore
                    localStorage.setItem('is_first_trade', 'false');
                    
                    // Calculate next stake based on win/loss
                    const nextStake = isWin ? 
                        localStorage.getItem('auto_differ_stake') || '1' :
                        calculateNextStake(false, martingale);
                        
                    localStorage.setItem('auto_differ_current_stake', nextStake);
                    setCurrentStake(nextStake);
                }
            }
        }
    }, [transactions?.elements, is_auto_differ, is_overunder, stake]);

    // Updated refined martingale calculation using stored current stake
    const calculateNextStake = (isWin: boolean, martingale: string) => {
        // Always return base stake for first trade
        if (localStorage.getItem('is_first_trade') === 'true') {
            console.log('First trade detected, using base stake:', stake);
            return localStorage.getItem('auto_differ_stake') || '1';
        }
        
        if (isWin) {
            console.log('Win detected, resetting to base stake');
            return localStorage.getItem('auto_differ_stake') || '1';
        }
        
        console.log('Loss detected, applying martingale multiplier');
        const current_stake = parseFloat(localStorage.getItem('auto_differ_current_stake') || stake);
        const multiplier = parseFloat(martingale);
        const newStake = (current_stake * multiplier).toFixed(2);
        console.log(`Martingale calculation: ${current_stake} × ${multiplier} = ${newStake}`);
        return newStake;
    };

    // Add effect to disable auto trading when component unmounts
    useEffect(() => {
        // Cleanup function that runs when component unmounts
        return () => {
            // Turn off auto trading modes when component is not visible
            if (is_auto_differ || is_overunder) {
                console.log('Trading Hub Display unmounted, disabling auto trading modes');
                localStorage.setItem('is_auto_differ', 'false');
                localStorage.setItem('is_auto_overunder', 'false');
                setAutoDiffer(false);
                setIsOverUnder(false);
            }
        };
    }, [is_auto_differ, is_overunder, setAutoDiffer]);

    const handleAutoDiffer = (enabled: boolean) => {
        localStorage.setItem('is_auto_differ', String(enabled));
        if (enabled) {
            // When enabling autodiffer disable auto overunder
            localStorage.setItem('is_auto_overunder', 'false');
            setIsOverUnder(false);
            
            // Reset to base stake when starting
            setCurrentStake(stake);
            localStorage.setItem('auto_differ_current_stake', stake);
            
            // Reset total profit counter
            localStorage.setItem('total_profit', '0');
            
            // Mark as first trade
            localStorage.setItem('is_first_trade', 'true');
            
            console.log('Auto Differ enabled with initial stake:', stake);
        } else {
            // Reset to base stake when stopping
            setCurrentStake(stake);
            localStorage.setItem('auto_differ_current_stake', stake);
        }
        setAutoDiffer(enabled);
    };

    const handleAutoOverUnder = (enabled: boolean) => {
        localStorage.setItem('is_auto_overunder', String(enabled));
        if (enabled) {
            // When enabling auto overunder disable autodiffer
            localStorage.setItem('is_auto_differ', 'false');
            setAutoDiffer(false);
            
            // Reset to base stake when starting - using same variable names and structure as handleAutoDiffer
            setCurrentStake(stake);
            localStorage.setItem('auto_differ_current_stake', stake);
            
            // Reset total profit counter
            localStorage.setItem('total_profit', '0');
            
            // Mark as first trade
            localStorage.setItem('is_first_trade', 'true');
            
            console.log('Auto Over/Under enabled with initial stake:', stake);
        } else {
            // Reset to base stake when stopping - same as handleAutoDiffer
            setCurrentStake(stake);
            localStorage.setItem('auto_differ_current_stake', stake);
        }
        setIsOverUnder(enabled);
    };

    // Save settings to localStorage
    const saveSettings = () => {
        localStorage.setItem('auto_differ_stake', stake);
        localStorage.setItem('auto_differ_max_loss', maxLoss);
        localStorage.setItem('auto_differ_max_profit', maxProfit);
        localStorage.setItem('auto_differ_martingale', martingale);
        localStorage.setItem('auto_differ_current_stake', stake);
        setCurrentStake(stake);
        
        setStatus('Settings saved successfully');
        setTimeout(() => setStatus(''), 3000);
    };

    const [status, setStatus] = useState('');

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(Math.abs(amount));
    };

    return (
        <div className='trading-hub-display'>
            {completedContract && (
                <div className='trading-hub-display__latest-result'>
                    <Text size='sm' weight='bold'>Last Trade ({completedContract.contract_type}):</Text>
                    <Text 
                        size='sm'
                        weight='bold'
                        className={classNames({
                            'profit--positive': completedContract.profit > 0,
                            'profit--negative': completedContract.profit < 0,
                        })}
                    >
                        {formatMoney(Number(completedContract.profit))}
                    </Text>
                </div>
            )}
            <div className='trading-hub-display__inputs'>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={stake}
                        onChange={handleStakeChange}
                        className='trading-hub-display__input futuristic-input'
                        placeholder='Enter Stake'
                    />
                    <label>Base Stake</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={maxLoss}
                        onChange={handleMaxLossChange}
                        className='trading-hub-display__input futuristic-input'
                        placeholder='Enter Max Loss'
                    />
                    <label>Maximum Loss</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={maxProfit}
                        onChange={handleMaxProfitChange}
                        className='trading-hub-display__input futuristic-input'
                        placeholder='Enter Max Profit'
                    />
                    <label>Maximum Profit</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={martingale}
                        onChange={handleMartingaleChange}
                        className='trading-hub-display__input futuristic-input'
                        placeholder='Enter Multiplier'
                    />
                    <label>Martingale Multiplier</label>
                </div>
                <Button
                    className='trading-hub-display__set-inputs-button futuristic-button'
                    variant='secondary'
                    onClick={saveSettings}
                >
                    Save Settings
                </Button>
                <Button
                    className={classNames('trading-hub-display__auto-differ-button futuristic-button', {
                        'futuristic-button--active': is_auto_differ,
                    })}
                    onClick={() => handleAutoDiffer(!is_auto_differ)}
                >
                    {is_auto_differ ? 'Auto Differ: ON' : 'Auto Differ: OFF'}
                </Button>
                <Button
                    className={classNames('trading-hub-display__auto-overunder-button futuristic-button', {
                        'futuristic-button--active': is_overunder,
                    })}
                    onClick={() => handleAutoOverUnder(!is_overunder)}
                >
                    {is_overunder ? 'Auto Over/Under: ON' : 'Auto Over/Under: OFF'}
                </Button>
            </div>
            <div className='trading-hub-display__current-stake futuristic-card'>
                <Text size='sm' weight='bold'>Active Stake:</Text>
                <Text size='sm'>{formatMoney(parseFloat(currentStake))}</Text>
            </div>
            {status && (
                <div className={`trading-hub-display__status ${status.includes('Error') ? 'error' : 'success'}`}>
                    {status}
                </div>
            )}
        </div>
    );
});

export default TradingHubDisplay;
