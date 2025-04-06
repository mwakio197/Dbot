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
            // Validate stake
            const validStake = Math.max(0.35, Math.min(parseFloat(newStake), 100)).toFixed(2);
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

    // Refined martingale calculation
    const calculateNextStake = (currentStake: string, isWin: boolean, martingale: string) => {
        if (isWin) {
            return stake; // Return to original stake on win
        }
        
        const multiplier = parseFloat(martingale);
        const nextStake = (parseFloat(currentStake) * multiplier).toFixed(2);
        
        // Apply limits
        const maxAllowedStake = Math.min(
            parseFloat(maxLoss),
            100 // Hard limit
        );
        
        return Math.min(parseFloat(nextStake), maxAllowedStake).toFixed(2);
    };

    // Enhanced contract tracking with improved stake and contract type management
    useEffect(() => {
        if (!transactions?.elements || !is_auto_differ) return;
        
        const elements = Object.values(transactions.elements)[0] || [];
        const latestElement = elements[0];
        
        if (latestElement?.data) {
            const contract = latestElement.data;
            
            if (contract.is_sold && contract.transaction_ids?.sell) {
                console.log('Contract completed:', {
                    id: contract.contract_id,
                    profit: contract.profit,
                    current_stake: currentStake,
                    base_stake: stake
                });
                
                setCompletedContract(contract);

                if (contract.profit !== undefined) {
                    const isWin = Number(contract.profit) > 0;
                    
                    if (isWin) {
                        // On win, reset to base stake and DIGITDIFF
                        console.log('WIN - Resetting to base stake and DIGITDIFF');
                        updateStakeAndWorkspace(stake, true);
                        updateContractType('DIGITDIFF');
                        localStorage.setItem('auto_differ_contract_type', 'DIGITDIFF');
                    } else {
                        // On loss, increase stake and switch contract
                        const nextStake = calculateNextStake(currentStake, false, martingale);
                        const nextContract = Math.random() < 0.5 ? 'DIGITOVER' : 'DIGITUNDER';
                        console.log('LOSS - Switching to', nextContract, 'with stake:', nextStake);
                        updateStakeAndWorkspace(nextStake, false);
                        updateContractType(nextContract);
                        localStorage.setItem('auto_differ_contract_type', nextContract);
                    }
                }
            }
        }
    }, [transactions?.elements, is_auto_differ]);

    // Simplified updateContractType function
    const updateContractType = (contractType: string) => {
        const workspace = (window as any).Blockly?.derivWorkspace;
        if (!workspace) return;

        const trade_definition = workspace.getAllBlocks().find((b: any) => b.type === 'trade_definition');
        if (trade_definition) {
            try {
                trade_definition.setFieldValue(contractType, 'tradetype_list');
                if (contractType === 'DIGITOVER') {
                    trade_definition.setFieldValue('2', 'number');
                } else if (contractType === 'DIGITUNDER') {
                    trade_definition.setFieldValue('7', 'number');
                } else {
                    trade_definition.setFieldValue(Math.floor(Math.random() * 10).toString(), 'number');
                }
                workspace.render();
            } catch (error) {
                console.error('Error updating contract type:', error);
            }
        }
    };

    // Reset stake on Auto Differ toggle
    const handleAutoDiffer = (enabled: boolean) => {
        localStorage.setItem('is_auto_differ', String(enabled));
        if (enabled) {
            updateStakeAndWorkspace(stake, true);
        }
        setAutoDiffer(enabled);
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
                        className='trading-hub-display__input'
                        placeholder='Stake'
                    />
                    <label>Stake</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={maxLoss}
                        onChange={handleMaxLossChange}
                        className='trading-hub-display__input'
                        placeholder='Max Loss'
                    />
                    <label>Max Loss</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={maxProfit}
                        onChange={handleMaxProfitChange}
                        className='trading-hub-display__input'
                        placeholder='Max Profit'
                    />
                    <label>Max Profit</label>
                </div>
                <div className='trading-hub-display__input-group'>
                    <Input
                        type='number'
                        value={martingale}
                        onChange={handleMartingaleChange}
                        className='trading-hub-display__input'
                        placeholder='Martingale'
                    />
                    <label>Martingale</label>
                </div>
                <Button
                    className='trading-hub-display__set-inputs-button'
                    variant='secondary'
                    onClick={handleSetInputs}
                >
                    Set Inputs
                </Button>
                <Button
                    className='trading-hub-display__auto-differ-button'
                    variant={is_auto_differ ? 'primary' : 'secondary'}
                    onClick={() => handleAutoDiffer(!is_auto_differ)}
                >
                    {is_auto_differ ? 'Auto Differ ON' : 'Auto Differ OFF'}
                </Button>
            </div>
            <div className='trading-hub-display__current-stake'>
                <Text size='sm' weight='bold'>Current Stake:</Text>
                <Text size='sm'>{formatMoney(parseFloat(currentStake))}</Text>
            </div>
        </div>
    );
});

export default TradingHubDisplay;
