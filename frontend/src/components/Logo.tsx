import React from 'react';
import appIcon from '@/assets/logo/app-icon.webp';
import primaryLight from '@/assets/logo/primary-light.webp';
import primaryDark from '@/assets/logo/primary-dark.webp';

type LogoVariant = 'icon' | 'full';

type LogoProps = {
    variant?: LogoVariant;
    className?: string;
    alt?: string;
};

/**
 * Logo component.
 * - variant="icon": shows only the app icon (theme-agnostic, transparent).
 * - variant="full": shows the primary wordmark. The light/dark variants are
 *   swapped via Tailwind's dark: utility so they always contrast with the
 *   current theme's background.
 */
export const Logo: React.FC<LogoProps> = ({ variant = 'full', className, alt = 'GisasTech' }) => {
    if (variant === 'icon') {
        return (
            <img
                src={appIcon}
                alt={alt}
                className={className}
                draggable={false}
            />
        );
    }

    return (
        <>
            <img
                src={primaryLight}
                alt={alt}
                className={`block dark:hidden ${className ?? ''}`}
                draggable={false}
            />
            <img
                src={primaryDark}
                alt={alt}
                className={`hidden dark:block ${className ?? ''}`}
                draggable={false}
            />
        </>
    );
};

export default Logo;
