export function userCreationCopy(language: string) {
    const tr = language.startsWith('tr')
    return {
        shipyard: tr ? 'Tersane' : 'Shipyard',
        chooseShipyard: tr ? 'Tersane veya atamasız seçin' : 'Choose a shipyard or leave unassigned',
        unassigned: tr ? 'Şimdilik atamasız' : 'Leave unassigned for now',
        chooseRequired: tr ? 'Bir tersane veya atamasız seçeneğini seçin.' : 'Choose a shipyard or the unassigned option.',
        assignmentHelp: tr ? 'Kullanıcı seçilen tersanede oluşturulur. Ayrı bir atama işlemi gerekmez.' : 'The user is created in the selected shipyard. No separate assignment is needed.',
        unassignedEffect: tr ? 'Atanana kadar bir tersanenin envanterine erişemez.' : 'Cannot access a shipyard inventory until assigned.',
        inactive: tr ? 'Pasif' : 'Inactive',
        inactiveEffect: tr ? 'Tersane etkinleştirilene kadar bu kullanıcı tersane envanterine erişemez.' : 'This user cannot access the shipyard inventory until the shipyard is activated.',
        adminEffect: tr ? 'Bu tersanedeki kullanıcıları ve kullanım taleplerini yönetebilir.' : 'Can manage users and usage requests within this shipyard.',
        userEffect: tr ? 'Bu tersanenin envanterinde çalışabilir ve kurum adına kullanım talebi gönderebilir. Yönetici onayı veremez.' : 'Can work in this shipyard inventory and send usage requests for the institution. Cannot give administrator approval.',
        review: tr ? 'Kullanıcıyı gözden geçir' : 'Review user',
        reviewTitle: tr ? 'Yeni kullanıcıyı gözden geçir' : 'Review new user',
        reviewHelp: tr ? 'Henüz kaydedilmedi. Bilgileri ve erişim kapsamını doğrulayın.' : 'Not saved yet. Check the details and access scope.',
        back: tr ? 'Bilgilere dön' : 'Back to details',
        createAssigned: tr ? 'Kullanıcıyı oluştur ve ata' : 'Create user and assign',
        createUnassigned: tr ? 'Kullanıcıyı oluştur' : 'Create user',
        passwordProtected: tr ? 'Parola belirlendi; güvenlik için özette gösterilmez.' : 'Password set; hidden in this summary for security.',
        retry: tr ? 'Tekrar dene' : 'Try again',
        showPassword: tr ? 'Parolayı göster' : 'Show password',
        hidePassword: tr ? 'Parolayı gizle' : 'Hide password',
        loadingShipyards: tr ? 'Tersaneler yükleniyor…' : 'Loading shipyards…',
    }
}
