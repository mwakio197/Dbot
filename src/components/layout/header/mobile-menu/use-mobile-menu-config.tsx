import { ComponentProps, ReactNode } from 'react';
import Livechat from '@/components/chat/Livechat';
import useIsLiveChatWidgetAvailable from '@/components/chat/useIsLiveChatWidgetAvailable';
import { standalone_routes } from '@/components/shared';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import useRemoteConfig from '@/hooks/growthbook/useRemoteConfig';
import { useIsIntercomAvailable } from '@/hooks/useIntercom';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import RootStore from '@/stores/root-store';
import {
    LegacyAccountLimitsIcon,
    LegacyCashierIcon,
    LegacyChartsIcon,
    LegacyHelpCentreIcon,
    LegacyHomeOldIcon,
    LegacyLogout1pxIcon,
    LegacyProfileSmIcon,
    LegacyResponsibleTradingIcon,
    LegacyTheme1pxIcon,
    LegacyWhatsappIcon,
    LegacyTelegramIcon,
} from '@deriv/quill-icons/Legacy';
import { SocialTiktokBrandIcon } from '@deriv/quill-icons/Social';

import { BrandDerivLogoCoralIcon } from '@deriv/quill-icons/Logo';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';
import { URLConstants } from '@deriv-com/utils';

export type TSubmenuSection = 'accountSettings' | 'cashier';

//IconTypes
type TMenuConfig = {
    LeftComponent: ReactNode | React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    submenu?: TSubmenuSection;
    target?: ComponentProps<'a'>['target'];
}[];

const useMobileMenuConfig = (client?: RootStore['client']) => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    const { oAuthLogout } = useOauth2({ handleLogout: async () => client?.logout(), client });

    const { data } = useRemoteConfig(true);
    const { cs_chat_whatsapp } = data;

    const { is_livechat_available } = useIsLiveChatWidgetAvailable();
    const icAvailable = useIsIntercomAvailable();

    const menuConfig: TMenuConfig[] = [
        [
            {
                as: 'button',
                label: localize('Dark theme'),
                LeftComponent: LegacyTheme1pxIcon,
                RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
            },
            {
                as: 'a',
                href: 'https://xdbtraders.app.vercel',
                label: localize('x-dbtraders.com'),
                LeftComponent: BrandDerivLogoCoralIcon,
            },
            {
                          as: 'a',
                          href: 'https://wa.me/254100169913',
                          label: localize('WhatsApp'),
                          LeftComponent: LegacyWhatsappIcon,
                          target: '_blank',
            },
            {
                          as: 'a',
                          href: 'https://t.me/chartbotaixtrade',
                          label: localize('Telegram'),
                          LeftComponent: LegacyTelegramIcon,
                          target: '_blank',
            },
            
            {
                          as: 'a',
                          href: 'https://tiktok.com',
                          label: localize('Tiktok'),
                          LeftComponent: SocialTiktokBrandIcon,
                          target: '_blank',
            },
            
        ],
        (
            [
                
                is_livechat_available || icAvailable
                    ? {
                          as: 'button',
                          label: localize('Live chat'),
                          LeftComponent: Livechat,
                          onClick: () => {
                              icAvailable ? window.Intercom('show') : window.LiveChatWidget?.call('maximize');
                          },
                      }
                    : null,
            ] as TMenuConfig
        ).filter(Boolean),
        client?.is_logged_in
            ? [
                  {
                      as: 'button',
                      label: localize('Log out'),
                      LeftComponent: LegacyLogout1pxIcon,
                      onClick: oAuthLogout,
                      removeBorderBottom: true,
                  },
              ]
            : [],
    ];

    return {
        config: menuConfig,
    };
};

export default useMobileMenuConfig;
