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
        
        // Update workspace immediately with new stake
        const workspace = (window as any).Blockly?.derivWorkspace;
        if (workspace) {
            const purchase = workspace.getAllBlocks().find((b: any) => b.type === 'purchase');
            if (purchase) {
                const amount_block = purchase.getInputTargetBlock('AMOUNT');
                if (amount_block) {
                    amount_block.setFieldValue(value, 'NUM');
                    workspace.render();
                }
            }
        }
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

    // Enhanced stake update function
    const updateStakeAndWorkspace = async (newStake: string, isWin: boolean) => {
        try {
            // Remove hardcoded max limit of 100
            const validStake = Math.max(0.35, parseFloat(newStake)).toFixed(2);
            console.log(`${isWin ? 'WIN' : 'LOSS'} - Validated stake:`, validStake);
            
            setCurrentStake(validStake);
            localStorage.setItem('auto_differ_current_stake', validStake);

            const workspace = (window as any).Blockly?.derivWorkspace;
            if (!workspace) return;

            const purchase = workspace.getAllBlocks().find((b: any) => b.type === 'purchase');
            if (purchase) {
                const amount_block = purchase.getInputTargetBlock('AMOUNT');
                if (amount_block) {
                    amount_block.setFieldValue(validStake, 'NUM');
                    workspace.render();
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Error updating stake:', error);
            return false;
        }
    };

    // Updated refined martingale calculation using stored current stake
    const calculateNextStake = (isWin: boolean, martingale: string) => {
        if (isWin) {
            return localStorage.getItem('auto_differ_stake') || '1';
        }
        const current_stake = parseFloat(localStorage.getItem('auto_differ_current_stake') || stake);
        const multiplier = parseFloat(martingale);
        const newStake = (current_stake * multiplier).toFixed(2);
        return newStake;
    };

    // Update updateContractType to use proper barriers when in auto overunder mode
    const updateContractType = (contractType: string) => {
        const workspace = (window as any).Blockly?.derivWorkspace;
        if (!workspace) return;
        const trade_definition = workspace.getAllBlocks().find((b: any) => b.type === 'trade_definition');
        if (trade_definition) {
            try {
                trade_definition.setFieldValue(contractType, 'tradetype_list');
                if (localStorage.getItem('is_auto_overunder') === 'true') {
                    // For auto overunder, use barrier 1 for DIGITOVER and 8 for DIGITUNDER
                    if (contractType === 'DIGITOVER') {
                        trade_definition.setFieldValue('1', 'number');
                    } else if (contractType === 'DIGITUNDER') {
                        trade_definition.setFieldValue('8', 'number');
                    }
                } else {
                    if (contractType === 'DIGITOVER') {
                        trade_definition.setFieldValue('2', 'number');
                    } else if (contractType === 'DIGITUNDER') {
                        trade_definition.setFieldValue('7', 'number');
                    } else {
                        trade_definition.setFieldValue(Math.floor(Math.random() * 10).toString(), 'number');
                    }
                }
                workspace.render();
            } catch (error) {
                console.error('Error updating contract type:', error);
            }
        }
    };

    // Enhanced contract tracking with improved stake and contract type management
    useEffect(() => {
        if (!transactions?.elements || (!is_auto_differ && !is_overunder)) return;

        const elements = Object.values(transactions.elements)[0] || [];
        const latestElement = elements[0];

        if (latestElement?.data) {
            const contract = latestElement.data;

            if (contract.is_sold && contract.transaction_ids?.sell) {
                console.log('Contract completed:', {
                    id            : contract.contract_id,
                    profit        : contract.profit,
                    current_stake : localStorage.getItem('auto_differ_current_stake'),
                    original_stake: localStorage.getItem('auto_differ_stake')
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

                    if (isWin) {
                        console.log('WIN - Resetting to original stake and DIGITDIFF');
                        updateStakeAndWorkspace(localStorage.getItem('auto_differ_stake') || '1', true);
                        updateContractType('DIGITDIFF');
                        localStorage.setItem('auto_differ_contract_type', 'DIGITDIFF');
                    } else {
                        const nextStake = calculateNextStake(false, martingale);

                        if (is_overunder) {
                            window.autoDiffer &&
                                window.autoDiffer.getAutoOverUnderTrade().then(({ contract, barrier }) => {
                                    console.log(`LOSS - Auto O/U: Switching to ${contract} with stake:`, nextStake);
                                    updateStakeAndWorkspace(nextStake, false);
                                    updateContractType(contract);
                                    localStorage.setItem('auto_differ_contract_type', contract);
                                    localStorage.setItem('auto_differ_current_stake', nextStake);
                                });
                        } else {
                            const nextContract = Math.random() < 0.5 ? 'DIGITOVER' : 'DIGITUNDER';
                            console.log('LOSS - Switching to', nextContract, 'with stake:', nextStake);
                            updateStakeAndWorkspace(nextStake, false);
                            updateContractType(nextContract);
                            localStorage.setItem('auto_differ_contract_type', nextContract);
                            localStorage.setItem('auto_differ_current_stake', nextStake);
                        }
                    }
                }
            }
        }
    }, [transactions?.elements, is_auto_differ, is_overunder]);

    // Reset stake on Auto Differ toggle
    const handleAutoDiffer = (enabled: boolean) => {
        localStorage.setItem('is_auto_differ', String(enabled));
        if (enabled) {
            // When enabling autodiffer disable auto overunder
            localStorage.setItem('is_auto_overunder', 'false');
            setIsOverUnder(false);
            updateStakeAndWorkspace(stake, true);
        }
        setAutoDiffer(enabled);
    };

    const handleAutoOverUnder = (enabled: boolean) => {
        localStorage.setItem('is_auto_overunder', String(enabled));
        if (enabled) {
            // When enabling auto overunder disable autodiffer
            localStorage.setItem('is_auto_differ', 'false');
            setAutoDiffer(false);
        }
        setIsOverUnder(enabled);
    };

    // Modified handleSetInputs to use new updateContractType function
    const handleSetInputs = () => {
        const workspace = (window as any).Blockly?.derivWorkspace;
        if (!workspace) return;

        const blocks = workspace.getAllBlocks();
        const trade_definition = blocks.find((b: any) => b.type === 'trade_definition');
        const purchase = blocks.find((b: any) => b.type === 'purchase');
        const duration = trade_definition?.getInputTargetBlock('TRADE_OPTIONS');

        if (trade_definition && purchase) {
            try {
                // Set market
                trade_definition.setFieldValue('R_10', 'market_list');
                
                // Start with DIGITDIFF
                updateContractType('DIGITDIFF');

                // Set stake amount
                const amount_block = purchase.getInputTargetBlock('AMOUNT');
                if (amount_block) {
                    amount_block.setFieldValue(currentStake, 'NUM');
                }

                // Set duration to 1 tick
                if (duration) {
                    duration.setFieldValue('t', 'DURATIONTYPE_LIST');
                    duration.setFieldValue('1', 'DURATION');
                }

                workspace.render();
            } catch (error) {
                console.error('Error setting inputs:', error);
            }
        }
    };

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
                    onClick={handleSetInputs}
                >
                    Apply Settings
                </Button>
                <Button
                    className={classNames('trading-hub-display__auto-differ-button futuristic-button', {
                        'futuristic-button--active': is_auto_differ, // Add active class when Auto Differ is ON
                    })}
                    onClick={() => handleAutoDiffer(!is_auto_differ)}
                >
                    {is_auto_differ ? 'Auto Differ: ON' : 'Auto Differ: OFF'}
                </Button>
                <Button
                    className={classNames('trading-hub-display__auto-overunder-button futuristic-button', {
                        'futuristic-button--active': is_overunder, // Add active class when Auto Over/Under is ON
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
        </div>
    );
});

export default TradingHubDisplay;
