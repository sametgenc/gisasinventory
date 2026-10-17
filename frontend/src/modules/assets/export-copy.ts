export const exportCopy = (language: string) => language.startsWith('tr') ? {
    title: 'Envanteri dışa aktar', scope: 'Dosya kapsamı', visible: 'Görünen sonuçlar (CSV)', allType: 'Seçilen türün tamamı (Excel)',
    count: (count: number) => `${count} kayıt`, visibleHelp: 'Geçerli arama ve filtrelere uyan tüm sayfaları içerir.',
    typeHelp: 'Seçilen ekipman türünün erişebildiğiniz tüm kayıtlarını içerir.', ignoredFilters: 'Arama, kategori, model ve güncelleme filtreleri uygulanmaz.',
    ownShipyard: 'Yalnız kendi tersanenizde erişebildiğiniz kayıtlar dahil edilir.', target: 'Hedef tersane',
    csv: 'CSV indir', excel: 'Excel indir', templateHelp: 'Boş şablon yalnız bu türün alanlarını içerir; envanter kaydı içermez.',
} : {
    title: 'Export inventory', scope: 'File scope', visible: 'Visible results (CSV)', allType: 'All records of a type (Excel)',
    count: (count: number) => `${count} ${count === 1 ? 'record' : 'records'}`, visibleHelp: 'Includes every page matching the current search and filters.',
    typeHelp: 'Includes all records of the selected equipment type that you can access.', ignoredFilters: 'Search, category, model and update filters do not apply.',
    ownShipyard: 'Only records you can access in your shipyard are included.', target: 'Target shipyard',
    csv: 'Download CSV', excel: 'Download Excel', templateHelp: 'The blank template contains this type’s fields and no inventory records.',
}
