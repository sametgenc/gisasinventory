const copy = {
    tr: {
        retry: 'Tekrar dene',
        saveFailed: 'Tersane kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.',
        deleteFailed: 'Tersane silinemedi. Tekrar deneyin.',
        downloadFailed: 'Dosya indirilemedi. Tekrar deneyin.',
        tenantLoadFailed: 'Tersane bilgileri yüklenemedi. Tekrar deneyin.',
        usersLoadFailed: 'Kullanıcılar yüklenemedi. Tekrar deneyin.',
        availableLoadFailed: 'Atanabilecek kullanıcılar yüklenemedi. Tekrar deneyin.',
        createUserGuidance: 'Yeni kullanıcı hesapları platform yöneticisi tarafından oluşturulur.',
        managedByPlatform: 'Platform yöneticisi tarafından yönetilir',
        removal: (username: string, tenant: string, administrator: boolean) =>
            `${username}, ${tenant} tersanesinden çıkarılacak. ${administrator ? 'Tersane yöneticisi rolü Kullanıcı olarak değişecek. ' : ''}Bu kullanıcının ekipman sorumlulukları kaldırılacak. Hesabı silinmeyecek.`,
    },
    en: {
        retry: 'Try again',
        saveFailed: 'Could not save the shipyard. Check the details and try again.',
        deleteFailed: 'Could not delete the shipyard. Try again.',
        downloadFailed: 'Could not download the file. Try again.',
        tenantLoadFailed: 'Could not load shipyard details. Try again.',
        usersLoadFailed: 'Could not load users. Try again.',
        availableLoadFailed: 'Could not load available users. Try again.',
        createUserGuidance: 'New user accounts are created by a platform administrator.',
        managedByPlatform: 'Managed by a platform administrator',
        removal: (username: string, tenant: string, administrator: boolean) =>
            `${username} will be removed from ${tenant}. ${administrator ? 'Their Shipyard Admin role will change to User. ' : ''}Their equipment responsibilities will be cleared. Their account will not be deleted.`,
    },
}

export function tenantTrustCopy(language: string) {
    return language.startsWith('tr') ? copy.tr : copy.en
}
