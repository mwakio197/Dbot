import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { standalone_routes } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { StandaloneCircleUserRegularIcon } from '@deriv/quill-icons/Standalone';
import { requestOidcAuthentication } from '@deriv-com/auth-client';
import { Localize, useTranslations } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { Tooltip } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import AccountsInfoLoader from './account-info-loader';
import AccountSwitcher from './account-switcher';
import MenuItems from './menu-items';
import MobileMenu from './mobile-menu';
import PlatformSwitcher from './platform-switcher';
import { getAppId } from '@/components/shared';
import './header.scss';
import React, { useState, useEffect } from 'react';
import Modal from '@/components/shared_ui/modal'; // Import the modal component

const InfoIcon = () => {
    const [showModal, setShowModal] = useState(false);

    const socialLinks = [
        {
            name: 'Telegram',
            url: 'https://t.me/binaryfx_site',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 0C5.37 0 0 5.37 0 12C0 18.63 5.37 24 12 24C18.63 24 24 18.63 24 12C24 5.37 18.63 0 12 0ZM17.94 8.19L15.98 17.03C15.82 17.67 15.42 17.83 14.88 17.52L11.88 15.33L10.44 16.71C10.27 16.88 10.12 17.03 9.79 17.03L10.02 13.97L15.61 8.9C15.87 8.67 15.56 8.54 15.22 8.77L8.21 13.31L5.24 12.38C4.62 12.19 4.61 11.74 5.38 11.43L17.08 7.08C17.6 6.9 18.06 7.23 17.94 8.19Z" fill="#229ED9"/>
                </svg>
            )
        },
        {
            name: 'Email',
            url: 'mailto:peterwallacekaranja@gmail.com',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM19.6 8.25L12.53 12.67C12.21 12.87 11.79 12.87 11.47 12.67L4.4 8.25C4.15 8.09 4 7.82 4 7.53C4 6.86 4.73 6.46 5.3 6.81L12 11L18.7 6.81C19.27 6.46 20 6.86 20 7.53C20 7.82 19.85 8.09 19.6 8.25Z" fill="#EA4335"/>
                </svg>
            )
        },
        {
            name: 'Website',
            url: 'https://binaryfx.site',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM11 14.45L16.95 8.5L15.53 7.08L11 11.61L8.71 9.32L7.29 10.74L11 14.45Z" fill="#4285F4"/>
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="#34A853" fillOpacity="0.2"/>
                </svg>
            )
        },
        {
            name: 'TikTok',
            url: 'https://tiktok.com/@binary_fx_academy',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M16.6 5.82C15.9165 5.03962 15.5397 4.03743 15.54 3H12.45V15.4C12.4261 16.071 12.1428 16.7066 11.6597 17.1729C11.1766 17.6393 10.5316 17.8999 9.86 17.91C8.44 17.91 7.26 16.77 7.26 15.36C7.26 13.73 8.76 12.44 10.39 12.76V9.64C7.05 9.34 4.2 11.88 4.2 15.36C4.2 18.71 7 21.02 9.85 21.02C12.89 21.02 15.54 18.37 15.54 15.33V9.01C16.793 9.90985 18.2974 10.3926 19.84 10.39V7.3C19.84 7.3 17.96 7.39 16.6 5.82Z" fill="black"/>
                </svg>
            )
        },
        {
            name: 'WhatsApp',
            url: 'https://wa.me/254714653438',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 13.85 2.49 15.55 3.36 17.02L2.05 21.95L7.08 20.66C8.51 21.48 10.19 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.53 15.5C16.37 15.93 15.71 16.33 15.19 16.43C14.5 16.57 13.96 16.48 12.06 15.75C9.54 14.78 7.9 12.23 7.77 12.07C7.64 11.91 6.76 10.73 6.76 9.5C6.76 8.27 7.4 7.66 7.65 7.39C7.9 7.12 8.18 7.05 8.36 7.05C8.54 7.05 8.72 7.05 8.88 7.06C9.04 7.07 9.27 7 9.49 7.47C9.71 7.94 10.18 9.17 10.25 9.31C10.32 9.45 10.36 9.62 10.27 9.82C9.75 10.93 9.17 10.86 9.54 11.47C10.41 12.87 11.38 13.47 12.62 14.09C12.89 14.23 13.06 14.21 13.21 14.04C13.36 13.87 13.81 13.35 13.98 13.11C14.15 12.87 14.32 12.91 14.54 12.99C14.76 13.07 15.98 13.67 16.23 13.8C16.48 13.93 16.64 13.99 16.71 14.09C16.78 14.19 16.78 14.57 16.53 15.5Z" fill="#25D366"/>
                </svg>
            )
        },
        {
            name: 'YouTube',
            url: 'https://youtube.com/@binary_fx?si=t-M-Ihq8gVZEaRBG', // update with your YouTube channel URL
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="5" fill="#EF0000"/>
                    <polygon points="10,8 16,12 10,16" fill="white"/>
                </svg>
            )
        }
    ];

    return (
        <>
            <button 
                className="info-icon"
                onClick={() => setShowModal(true)}
            >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Base circle */}
                    <circle cx="16" cy="16" r="16" fill="url(#chatGradient)" />
                    
                    {/* Message bubble */}
                    <path 
                        d="M24 12C24 8.7 20.87 6 17 6H15C11.13 6 8 8.7 8 12C8 15.3 11.13 18 15 18H16V21L20 18C22.33 17.1 24 14.7 24 12Z" 
                        fill="white"
                    />
                    
                    {/* Gradient definition */}
                    <defs>
                        <linearGradient id="chatGradient" x1="0" y1="0" x2="32" y2="32">
                            <stop offset="0%" stopColor="#6b48ff"/>
                            <stop offset="100%" stopColor="#3311bb"/>
                        </linearGradient>
                    </defs>
                </svg>
            </button>

            <Modal
                is_open={showModal}
                toggleModal={() => setShowModal(false)}
                title="Connect With Us"
            >
                <div className="social-links-modal">
                    {socialLinks.map((link, index) => (
                        <a 
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="social-link"
                        >
                            <span className="social-link__icon">{link.icon}</span>
                            <span className="social-link__name">{link.name}</span>
                        </a>
                    ))}
                </div>
            </Modal>
        </>
    );
};

const AppHeader = observer(() => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const { data: activeAccount, error: activeAccountError } = useActiveAccount({ 
        allBalanceData: client?.all_accounts_balance,
        shouldFetch: !!client 
    });

    const { 
        accounts = {}, 
        all_accounts_balance = {}, 
        balance = 0,
        currency = 'USD' 
    } = client ?? {};

    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Active Account:', activeAccount);
            console.log('All Accounts:', accounts);
            console.log('All Balances:', all_accounts_balance);
        }
    }, [activeAccount, accounts, all_accounts_balance]);

    const getAccountBalance = (account_id: string) => {
        try {
            if (activeAccount && activeAccount.loginid === account_id) {
                return {
                    balance: activeAccount.balance,
                    currency: activeAccount.currency
                };
            }

            if (client?.balance !== undefined && client?.loginid === account_id) {
                return {
                    balance: client.balance,
                    currency: client.currency
                };
            }

            return {
                balance: 0,
                currency: 'USD'
            };
        } catch (error) {
            console.error(`Error getting balance for account ${account_id}:`, error);
            return { balance: 0, currency: 'USD' };
        }
    };

    const formatBalance = (account_id: string) => {
        const { balance, currency } = getAccountBalance(account_id);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(balance));
    };

    const has_wallet = Object.values(accounts).some(account => 
        account?.account_category === 'wallet' && account?.is_active
    );

    const { localize } = useTranslations();

    const { isOAuth2Enabled } = useOauth2();

    const [isToggled, setIsToggled] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [stake, setStake] = useState('');
    const [martingale, setMartingale] = useState('');
    const [tokens, setTokens] = useState(() => {
        if (!client?.loginid) return [];
        const savedTokens = localStorage.getItem(`extratokens_${client.loginid}`);
        return savedTokens ? JSON.parse(savedTokens) : [];
    });

    // Update tokens when account changes
    useEffect(() => {
        if (client?.loginid) {
            const savedTokens = localStorage.getItem(`extratokens_${client.loginid}`);
            setTokens(savedTokens ? JSON.parse(savedTokens) : []);
        } else {
            setTokens([]);
        }
    }, [client?.loginid]);

    const [tokenInput, setTokenInput] = useState('');

    const handleToggle = () => {
        if (!isToggled) {
            setIsModalOpen(true); // Open modal when toggled on
        } else {
            setIsToggled(false); // Turn off toggle
        }
    };

    const handleProceed = () => {
        if (stake.trim() && martingale.trim()) {
            setIsToggled(true); // Enable toggle only if inputs are valid
            setIsModalOpen(false); // Close modal
        } else {
            alert('Please enter valid Stake and Martingale values.');
        }
    };

    const submitToken = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!client?.loginid || !tokenInput.trim()) return;

        if (tokenInput.length < 8) {
            alert('Token must be at least 8 characters long');
            return;
        }

        if (tokens.includes(tokenInput)) {
            alert('This token is already connected');
            return;
        }

        const newTokens = [...tokens, tokenInput];
        setTokens(newTokens);
        localStorage.setItem(`extratokens_${client.loginid}`, JSON.stringify(newTokens));
        setTokenInput('');
    };

    // Handle token removal
    const removeToken = (tokenToRemove: string) => {
        if (!client?.loginid) return;
        
        const newTokens = tokens.filter(token => token !== tokenToRemove);
        setTokens(newTokens);
        localStorage.setItem(`extratokens_${client.loginid}`, JSON.stringify(newTokens));
    };

    const [copyToReal, setCopyToReal] = useState(() => {
        if (!client?.loginid) return false;
        return localStorage.getItem(`copytoreal_${client.loginid}`) === 'true';
    });

    const [copyTradeEnabled, setCopyTradeEnabled] = useState(() => {
        if (!client?.loginid) return false;
        return localStorage.getItem(`copytradeenabled_${client.loginid}`) === 'true';
    });

    const renderAccountSection = () => {
        if (isAuthorizing) {
            return <AccountsInfoLoader isLoggedIn isMobile={!isDesktop} speed={3} />;
        } else if (activeLoginid) {
            return (
                <>
                    {isDesktop && (
                        <Tooltip
                            as='a'
                            href={standalone_routes.personal_details}
                            tooltipContent={localize('Manage account settings')}
                            tooltipPosition='bottom'
                            className='app-header__account-settings'
                        >
                            <StandaloneCircleUserRegularIcon className='app-header__profile_icon' />
                        </Tooltip>
                    )}
                    <AccountSwitcher activeAccount={activeAccount} />
                    {isDesktop &&
                        (has_wallet ? (
                            <Button
                                className='manage-funds-button'
                                has_effect
                                text={localize('Manage funds')}
                                onClick={() => window.location.assign(standalone_routes.wallets_transfer)}
                                primary
                            />
                        ) : (
                            <Button
                                primary
                                onClick={() => {
                                    window.location.assign(standalone_routes.cashier_deposit);
                                }}
                                className='deposit-button'
                            >
                                {localize('Deposit')}
                            </Button>
                        ))}
                </>
            );
        } else {
            return (
                <div className='auth-actions'>
                    <Button
                        tertiary
                        onClick={() => {
                            const app_id = getAppId();
                            const oauth_url = 'https://oauth.deriv.com/oauth2/authorize';
                            const redirect_uri = encodeURIComponent(`${window.location.origin}/callback`);
                            const url = `${oauth_url}?app_id=${app_id}&l=EN&brand=deriv&redirect_uri=${redirect_uri}`;
                            window.location.href = url;
                        }}
                    >
                        <Localize i18n_default_text='Log in' />
                    </Button>
                    <Button
                        onClick={() => {
                            window.location.href = 'https://track.deriv.com/_iwWUciP8an5BMfcXPt5VjGNd7ZgqdRLk/1/';
                        }}
                    >
                        <Localize i18n_default_text='Sign up' />
                    </Button>
                </div>
            );
        }
    };

    return (
        <Header
            className={clsx('app-header', {
                'app-header--desktop': isDesktop,
                'app-header--mobile': !isDesktop,
            })}
        >
            <Wrapper variant='left'>
                <AppLogo />
                <MobileMenu />
                <InfoIcon />
                <button
                    className="app-header__toggle"
                    onClick={handleToggle}
                    aria-pressed={isToggled}
                >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                    </svg>
                </button>
            </Wrapper>
            <Wrapper variant='right'>{renderAccountSection()}</Wrapper>

            {isModalOpen && (
                <Modal
                    is_open={isModalOpen}
                    toggleModal={() => setIsModalOpen(false)}
                    title="Account Details"
                >
                    <div>
                        <h2 className="manage-header">Current Account</h2>
                        {activeLoginid ? (
                            <>
                                <div className="account-cards-container">
                                    <div className="deriv-account-switcher-item">
                                        <span className="deriv-account-switcher-item__icon">
                                            {client.loginid?.startsWith('VR') ? (
                                                // Demo account icon
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32" width="24" height="24" role="img"><path fill="#85ACB0" d="M32 16c0 8.837-7.163 16-16 16S0 24.837 0 16 7.163 0 16 0s16 7.163 16 16"></path><path fill="#fff" d="M17.535 6C22.665 6 27 10.743 27 16s-4.336 10-9.465 10H9a1 1 0 1 1 0-2h2v-4H9a1 1 0 0 1-.993-.883L8 19a1 1 0 0 1 1-1h2v-4H9a1 1 0 0 1-.993-.883L8 13a1 1 0 0 1 1-1h2V8H9a1 1 0 0 1-.993-.883L8 7a1 1 0 0 1 1-1zm0 2H13v4h4a1 1 0 0 1 .993.883L18 13a1 1 0 0 1-1 1h-4v4h4a1 1 0 0 1 .993.883L18 19a1 1 0 0 1-1 1h-4v4h4.535c3.906 0 7.33-3.665 7.461-7.759L25 16c0-4.19-3.483-8-7.465-8"></path></svg>
                                            ) : (
                                                // Real account icon
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32" width="24" height="24" role="img"><path fill="#fff" d="M.03 15a16.3 16.3 0 0 0 .094 3h31.752a16 16 0 0 0 .093-3zM16 9v3h15.496a16 16 0 0 0-1.104-3zM16 6h12.49a16 16 0 0 0-3.16-3H16zM.797 21a16 16 0 0 0 1.343 3h27.72c.545-.943.997-1.948 1.343-3zM4.381 27a16 16 0 0 0 3.867 3h15.504a16 16 0 0 0 3.867-3z"></path><path fill="#F44336" d="M16 0v3h9.33A15.93 15.93 0 0 0 16 0M16 15h15.97a16 16 0 0 0-.474-3H16zM16 9h14.392a16 16 0 0 0-1.901-3H16zM31.876 18a16 16 0 0 1-.673 3H.797a16 16 0 0 1-.673-3zM2.14 24a16 16 0 0 0 2.241 3h23.238a16 16 0 0 0 2.24-3zM16 32c2.813 0 5.455-.726 7.752-2H8.248c2.297 1.274 4.94 2 7.752 2"></path><path fill="#283991" fill-rule="evenodd" d="M16 15H.03a16 16 0 0 1 .176-1.575l-.01.069a.078.078 0 0 0 .057-.102l-.027-.085q.06-.355.136-.705l-.004.016.194-.143a.08.08 0 0 0-.048-.142H.422a16 16 0 0 1 1.232-3.425l.264-.19.48.344a.08.08 0 0 0 .121-.03.08.08 0 0 0 .002-.056l-.18-.563.48-.354a.08.08 0 0 0-.048-.142h-.584A16.1 16.1 0 0 1 6.655 3.01l.28.202a.08.08 0 0 0 .085.009l.006-.003.004-.003a.08.08 0 0 0 .03-.09L6.953 2.8A15.93 15.93 0 0 1 16 0zM13.515.637l-.143-.422-.24.041-.129.384h-.59a.1.1 0 0 0-.03.007l-.01.005-.003.002a.08.08 0 0 0-.005.128l.48.354-.197.56a.08.08 0 0 0 .123.086l.48-.344.48.344a.08.08 0 0 0 .094.003.08.08 0 0 0 .03-.089l-.181-.563.48-.354a.08.08 0 0 0 .022-.028l.003-.007a.1.1 0 0 0 .005-.025.08.08 0 0 0-.053-.077.1.1 0 0 0-.025-.005zM9.287 1.785a.08.08 0 0 0 .03-.089l-.067-.207-.167.08-.112.054.222.16a.08.08 0 0 0 .094.002m3.716 10.551.19-.563a.067.067 0 0 1 .132-.003l.19.563h.59a.08.08 0 0 1 .074.054.08.08 0 0 1-.025.088l-.48.354.18.563a.079.079 0 0 1-.123.086l-.48-.344-.48.344-.013.008-.006.002-.008.003a.08.08 0 0 1-.076-.022l-.01-.012-.002-.005-.003-.003-.002-.007a.1.1 0 0 1-.003-.05l.197-.56-.48-.354a.08.08 0 0 1 .005-.129l.007-.004.005-.002.004-.002.009-.002.018-.003zm-4.216-.566a.067.067 0 0 0-.131.003l-.19.563h-.59a.08.08 0 0 0-.049.142l.48.354-.197.56a.08.08 0 0 0 .01.063l.004.006.004.006.014.011a.08.08 0 0 0 .092 0l.48-.344.48.344.035.016.007.001h.005a.1.1 0 0 0 .046-.014.08.08 0 0 0 .03-.089l-.181-.563.48-.354.016-.016.004-.008.009-.024v-.025l-.001-.007-.002-.008a.08.08 0 0 0-.074-.054h-.59zm-4.526 0 .19.563h.59a.08.08 0 0 1 .048.142l-.48.354.18.563.003.012.001.008v.008a.08.08 0 0 1-.033.061.08.08 0 0 1-.094-.003l-.48-.344-.48.344a.08.08 0 0 1-.125-.078l.002-.008.197-.56-.48-.354a.08.08 0 0 1-.03-.06q-.001-.013.004-.028a.08.08 0 0 1 .074-.054h.592l.19-.563c.002-.08.107-.08.13-.003m6.795-1.488a.074.074 0 1 1 .074.074l.19.563h.591a.08.08 0 0 1 .048.142l-.48.354.18.563a.08.08 0 0 1-.01.07l-.004.006-.004.004-.01.01a.08.08 0 0 1-.095-.004l-.48-.344-.48.344a.08.08 0 0 1-.123-.086l.181-.563-.48-.354a.08.08 0 0 1 .048-.142h.59l.19-.563c0-.041.034-.074.075-.074m-4.262.637-.19-.563c-.023-.077-.128-.077-.13 0l-.19.563h-.608a.08.08 0 0 0-.048.142l.48.354-.181.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.08.08 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142zM6.53 4.422l.19.564h.59a.08.08 0 0 1 .048.142l-.48.354.181.563a.078.078 0 0 1-.123.086l-.48-.344-.48.344a.08.08 0 0 1-.123-.086l.18-.563-.48-.354a.08.08 0 0 1 .049-.142h.59l.19-.564c.02-.065.125-.065.148 0m4.716.564-.19-.564c-.013-.065-.118-.065-.147 0l-.19.564h-.591a.08.08 0 0 0-.048.142l.48.354-.18.563a.08.08 0 0 0 .122.086l.48-.344.48.344a.078.078 0 0 0 .124-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142zM8.787 2.992l.19.563h.591a.1.1 0 0 1 .04.012.08.08 0 0 1 .008.13l-.48.354.18.563a.078.078 0 0 1-.123.087l-.48-.344-.48.344a.08.08 0 0 1-.124-.078l.001-.009.181-.563-.48-.353a.08.08 0 0 1 .048-.143h.59l.19-.563c.03-.066.135-.066.148 0m4.728.563-.19-.563c-.013-.066-.119-.066-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.143l.48.353-.181.563a.08.08 0 0 0 .123.087l.48-.344.48.344a.078.078 0 0 0 .123-.087l-.18-.563.48-.353a.08.08 0 0 0-.048-.143zm-2.472-2.093a.1.1 0 0 1 .013.042l.19.563h.59a.08.08 0 0 1 .075.055.08.08 0 0 1-.026.088l-.48.353.18.563a.08.08 0 0 1-.029.09.08.08 0 0 1-.094-.003l-.48-.344-.48.344a.08.08 0 0 1-.092 0 .08.08 0 0 1-.03-.087l.18-.563-.48-.353a.08.08 0 0 1 .048-.143h.59l.19-.563a.073.073 0 0 1 .135-.042" clip-rule="evenodd"></path><path fill="#283991" d="m4.783 4.59-.078.078-.035.035a.078.078 0 0 0 .12-.089z"></path><path fill="#fff" d="m13.133.256.24-.041.142.422h.59a.08.08 0 0 1 .049.142l-.48.354.18.563a.079.079 0 0 1-.123.086l-.48-.344-.48.344a.08.08 0 0 1-.123-.086l.197-.56-.48-.354a.08.08 0 0 1 .048-.142h.59zM8.97 1.623l.28-.134.067.207a.078.078 0 0 1-.124.086zM6.655 3.011q.149-.107.3-.21l.104.325a.078.078 0 0 1-.123.087zM4.67 4.703l.113-.112.007.023a.078.078 0 0 1-.12.089M1.654 8.908q.25-.506.535-.991h.584a.08.08 0 0 1 .048.142l-.48.354.18.563a.078.078 0 0 1-.123.086l-.48-.344zM.195 13.494a.078.078 0 0 0 .057-.102l-.026-.085zM.358 12.618q.03-.142.064-.285h.082a.08.08 0 0 1 .048.142zM13.325 11.77a.067.067 0 0 0-.131.003l-.19.563h-.591a.08.08 0 0 0-.048.142l.48.354-.197.56a.08.08 0 0 0 .123.086l.48-.344.48.344a.079.079 0 0 0 .123-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142zm-4.538 0a.067.067 0 0 0-.131.003l-.19.563h-.59a.08.08 0 0 0-.049.142l.48.354-.197.56a.08.08 0 0 0 .124.086l.48-.344.48.344a.079.079 0 0 0 .123-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM4.451 12.333l-.19-.563c-.023-.077-.128-.077-.13.003l-.19.563h-.592a.08.08 0 0 0-.048.142l.48.354-.197.56a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142zM11.056 10.282a.074.074 0 1 0-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.142l.48.354-.18.563a.08.08 0 0 0 .122.086l.48-.344.48.344a.078.078 0 0 0 .124-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM6.72 10.845l-.19-.563c-.023-.077-.129-.077-.148 0l-.19.563h-.59a.08.08 0 0 0-.048.142l.48.354-.181.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.049-.142zM2.182 10.845l-.19-.563c-.023-.077-.128-.077-.13 0l-.19.563h-.608a.08.08 0 0 0-.048.142l.48.354-.18.563a.08.08 0 0 0 .122.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142zM13.515 9.403l-.19-.563c-.013-.066-.119-.066-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.142l.48.354-.197.56a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM8.787 9.403a.074.074 0 0 0-.147 0l-.19.563h-.59a.08.08 0 0 0-.049.142l.48.354-.18.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM4.451 9.403l-.19-.563c-.023-.066-.128-.066-.13 0l-.19.563h-.608a.08.08 0 0 0-.048.143l.48.353-.181.563a.08.08 0 0 0 .123.087l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.564.48-.353a.08.08 0 0 0-.048-.143zM11.056 7.354a.074.074 0 1 0-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.142l.48.354-.18.563a.08.08 0 0 0 .122.086l.48-.344.48.344a.078.078 0 0 0 .124-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM6.72 7.917l-.19-.563c-.023-.077-.129-.077-.148 0l-.19.563h-.59a.08.08 0 0 0-.048.142l.48.354-.181.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.049-.142zM13.325 5.922a.067.067 0 0 0-.131.003l-.19.563h-.591a.08.08 0 0 0-.048.142l.48.354-.197.56a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM8.787 5.922a.074.074 0 0 0-.147 0l-.19.563h-.59a.08.08 0 0 0-.049.142l.48.354-.18.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142h-.59zM4.451 6.485l-.19-.563c-.023-.077-.128-.077-.13 0l-.19.563h-.608a.08.08 0 0 0-.048.142l.48.354-.181.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.048-.142zM6.72 4.986l-.19-.564c-.023-.065-.129-.065-.148 0l-.19.564h-.59a.08.08 0 0 0-.048.142l.48.354-.181.563a.08.08 0 0 0 .123.086l.48-.344.48.344a.078.078 0 0 0 .123-.086l-.18-.563.48-.354a.08.08 0 0 0-.049-.142zM11.246 4.986l-.19-.564c-.013-.065-.118-.065-.147 0l-.19.564h-.591a.08.08 0 0 0-.048.142l.48.354-.18.563a.08.08 0 0 0 .122.086l.48-.344.48.344a.078.078 0 0 0 .124-.086l-.181-.563.48-.354a.08.08 0 0 0-.048-.142zM8.978 3.555l-.19-.563c-.014-.066-.12-.066-.148 0l-.19.563h-.59a.08.08 0 0 0-.049.143l.48.353-.18.563a.08.08 0 0 0 .123.087l.48-.344.48.344a.078.078 0 0 0 .123-.087l-.181-.563.48-.353a.08.08 0 0 0-.048-.143zM13.515 3.555l-.19-.563c-.013-.066-.119-.066-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.143l.48.353-.181.563a.08.08 0 0 0 .123.087l.48-.344.48.344a.078.078 0 0 0 .123-.087l-.18-.563.48-.353a.08.08 0 0 0-.048-.143h-.59zM11.056 1.504a.074.074 0 1 0-.147 0l-.19.563h-.591a.08.08 0 0 0-.048.143l.48.353-.18.563a.08.08 0 0 0 .122.087l.48-.344.48.344a.078.078 0 0 0 .124-.087l-.181-.563.48-.353a.08.08 0 0 0-.048-.143h-.59z"></path></svg>
                                            )}
                                        </span>
                                        <div className="deriv-account-switcher-item__detail">
                                            <span className="deriv-account-switcher-item__currency">
                                                {client.loginid}
                                            </span>
                                            <span className="deriv-account-switcher-item__type">
                                                {client.loginid?.startsWith('VR') ? 'Demo' : 'Real'} {client.currency || 'USD'} Account
                                            </span>
                                        </div>
                                        <div className="deriv-account-switcher-item__balance">
                                            {new Intl.NumberFormat('en-US', {
                                                style: 'currency',
                                                currency: client.currency || 'USD',
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            }).format(Number(client.balance || 0))}
                                        </div>
                                    </div>
                                </div>
                                <div className="copy-trading-header">
                                    Copy Trading
                                </div>
                                <div className="copy-trading-controls">
                                    <div className="copy-trading-toggle">
                                        <span>Enable Copy Trading</span>
                                        <button 
                                            className={`toggle-button ${copyTradeEnabled ? 'active' : ''}`}
                                            onClick={() => {
                                                const newValue = !copyTradeEnabled;
                                                setCopyTradeEnabled(newValue);
                                                localStorage.setItem(`copytradeenabled_${client.loginid}`, newValue.toString());
                                            }}
                                        >
                                            <span className="toggle-button__slider"></span>
                                        </button>
                                    </div>
                                    {/* Only show tokens section if copy trading is enabled */}
                                    {copyTradeEnabled && (
                                        <>
                                            <div className="input-section">
                                                <input 
                                                    type="text" 
                                                    placeholder="Enter token..."
                                                    value={tokenInput}
                                                    onChange={(e) => setTokenInput(e.target.value)}
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter') {
                                                            submitToken(e);
                                                        }
                                                    }}
                                                />
                                                <button 
                                                    className="submit-button" 
                                                    title="Submit token"
                                                    onClick={submitToken}
                                                >
                                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"/>
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="connected-tokens">
                                                <h4 className="connected-tokens__title">Connected Tokens</h4>
                                                <div className="connected-tokens__list">
                                                    {tokens.map((token, index) => (
                                                        <div key={index} className="connected-tokens__item">
                                                            <div className="connected-tokens__item-info">
                                                                <span className="connected-tokens__item-token">
                                                                    {token}
                                                                </span>
                                                            </div>
                                                            <button 
                                                                className="connected-tokens__item-remove"
                                                                onClick={() => removeToken(token)}
                                                            >
                                                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {client.loginid?.startsWith('VR') && (
                                    <div className="copy-to-real">
                                        <h4 className="copy-to-real__title">Demo Settings</h4>
                                        <div className="copy-to-real__toggle">
                                            <span>Copy trades to real account</span>
                                            <button 
                                                className={`toggle-button ${copyToReal ? 'active' : ''}`}
                                                onClick={() => {
                                                    const newValue = !copyToReal;
                                                    setCopyToReal(newValue);
                                                    localStorage.setItem(`copytoreal_${client.loginid}`, newValue.toString());
                                                }}
                                            >
                                                <span className="toggle-button__slider"></span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="no-account-state">
                                <div className="no-account-state__icon">
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm0-2h2V7h-2z"/>
                                    </svg>
                                </div>
                                <h3 className="no-account-state__title">No Active Account</h3>
                                <p className="no-account-state__description">
                                    Please log in or create an account to start copy trading
                                </p>
                                <button 
                                    className="no-account-state__button"
                                    onClick={() => {
                                        const app_id = getAppId();
                                        const oauth_url = 'https://oauth.deriv.com/oauth2/authorize';
                                        const redirect_uri = encodeURIComponent(`${window.location.origin}/callback`);
                                        const url = `${oauth_url}?app_id=${app_id}&l=EN&brand=deriv&redirect_uri=${redirect_uri}`;
                                        window.location.href = url;
                                    }}
                                >
                                    Get Started
                                </button>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </Header>
    );
});

export default AppHeader;