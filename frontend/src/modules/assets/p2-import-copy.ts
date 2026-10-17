export function importCopy(language: string) {
    return language.startsWith('tr') ? {
        templates: 'Şablon gerekiyor mu?', templateType: 'Şablon için ekipman türü', chooseType: 'Ekipman türünü seçin',
        oneTemplate: 'Tek tür şablonunu indir', combinedTemplate: 'Birleşik şablonu indir',
        templatesHelp: 'Kendi Excel dosyanızı da seçebilirsiniz. Dosyayı önizleyin; uygun aktarım yolunu içerikten önerelim.',
        combinedDetected: 'Birleşik dosya yapısı algılandı',
        combinedHelp: 'Dosyada tür, alan veya taksonomi sayfaları var. Birleşik inceleme bu sayfaları birlikte değerlendirir; tek tür aktarımı yalnızca seçilen çalışma sayfasını işler.',
        reviewCombined: 'Bu dosyayı birleşik olarak incele',
        partial: 'Diğer satırlar hata verse de geçerli satırlar kaydedilebilir. Tekrar denemeden önce satır sonuçlarını okuyun.',
        atomic: 'Dosyadaki tüm değişiklikler birlikte uygulanır. Hata varsa hiçbir kayıt değişmez.',
        partialResult: 'Bazı satırlar kaydedildi; hatalı satırlar aktarılmadı. Dosyayı düzeltip yeniden yüklemeden önce kaydedilen satırları kontrol edin.',
        transferred: 'Seçilen dosya', downloadError: 'Şablon indirilemedi. Yeniden deneyin.',
    } : {
        templates: 'Need a template?', templateType: 'Template equipment type', chooseType: 'Choose an equipment type',
        oneTemplate: 'Download one-type template', combinedTemplate: 'Download combined template',
        templatesHelp: 'You can also choose your own Excel file. Preview it to get a suggested import route based on its contents.',
        combinedDetected: 'Combined workbook detected',
        combinedHelp: 'The file contains type, field or taxonomy sheets. Combined review checks these sheets together; one-type import processes only the selected worksheet.',
        reviewCombined: 'Review this file as a combined workbook',
        partial: 'Valid rows may be saved even if other rows fail. Read the row results before retrying.',
        atomic: 'All workbook changes are applied together. An error leaves every record unchanged.',
        partialResult: 'Some rows were saved; failed rows were not imported. Check saved rows before correcting and uploading the file again.',
        transferred: 'Selected file', downloadError: 'Could not download the template. Try again.',
    }
}

/** A suggestion only: server review still validates every sheet and every write. */
export function suggestsCombinedWorkbook(sheetNames: string[]) {
    const names = sheetNames.map(name => name.replace(/ı/g, 'i').replace(/İ/g, 'I').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    return names.some(name => ['ekipmanturleri', 'varliktipleri', 'katalog', 'alanlar', 'fields', '1taksonomi'].includes(name))
}
