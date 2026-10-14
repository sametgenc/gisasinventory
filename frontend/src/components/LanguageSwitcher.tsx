import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

const languages = [
    { code: 'tr', name: 'Türkçe' },
    { code: 'en', name: 'English' }
];

export function LanguageSwitcher() {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    const close = useCallback(() => setIsOpen(false), []);
    const ref = useClickOutside<HTMLDivElement>(close);

    const currentLang = languages.find(l => i18n.language.startsWith(l.code)) || languages[0];

    const handleLanguageChange = (langCode: string) => {
        i18n.changeLanguage(langCode);
        close();
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Change language"
                aria-expanded={isOpen}
            >
                <Globe size={18} />
                <span className="text-xs font-medium uppercase">{currentLang.code}</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden animate-dropdown z-50">
                    <div className="py-1">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${currentLang.code === lang.code
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <span className="text-xs uppercase text-slate-500 dark:text-slate-400">{lang.code}</span>
                                <span className="font-medium">{lang.name}</span>
                                {currentLang.code === lang.code && (
                                    <Check size={14} className="ml-auto" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
