export type GuideTaskId = 'inspect' | 'add' | 'excel' | 'publish' | 'catalog'
export type GuideRoute = '/assets' | '/assets/types' | '/shared-equipment'

export interface GuideStep {
    id: string
    title: string
    body: string
    screenshot?: string
    imageAlt?: string
}

export interface GuideTask {
    id: GuideTaskId
    title: string
    summary: string
    audience: string
    audienceRole: 'all' | 'manager' | 'platform'
    route: GuideRoute
    action: string
    steps: GuideStep[]
    expectedResult: string
    note?: string
}

export interface GuideContent {
    title: string
    introduction: string
    taskPrompt: string
    taskLabel: string
    stepLabel: string
    stepsLabel: string
    resultLabel: string
    noteLabel: string
    audienceLabel: string
    previousStep: string
    nextStep: string
    finish: string
    openScreenshot: string
    closeScreenshot: string
    screenshotCaption: string
    conceptsTitle: string
    concepts: { title: string; example: string; body: string }[]
    faqTitle: string
    faq: { question: string; answer: string; taskId: GuideTaskId }[]
    tasks: GuideTask[]
}

export const guideContent: Record<'tr' | 'en', GuideContent> = {
    tr: {
        title: 'Kullanım rehberi',
        introduction: 'Yapmak istediğiniz işlemi seçin. Ekran üzerinde nereye bakacağınızı ve hangi sırayla ilerleyeceğinizi görün.',
        taskPrompt: 'Ne yapmak istiyorsunuz?',
        taskLabel: 'İşlem',
        stepLabel: 'Adım',
        stepsLabel: 'Adımlar',
        resultLabel: 'İşlem sonunda',
        noteLabel: 'Bilmeniz gereken',
        audienceLabel: 'Kim kullanabilir?',
        previousStep: 'Önceki adım',
        nextStep: 'Sonraki adım',
        finish: 'Adımları tamamladım',
        openScreenshot: 'Ekran görüntüsünü büyüt',
        closeScreenshot: 'Ekran görüntüsünü kapat',
        screenshotCaption: 'Örnek ekran · Kurgusal test verileri',
        conceptsTitle: 'Üç kavram, bir örnek',
        concepts: [
            { title: 'Ekipman türü', example: 'Forklift', body: 'Bütün tersanelerin kullandığı ortak tanım. Marka, kapasite ve ekipman kodu gibi hangi bilgilerin tutulacağını belirler.' },
            { title: 'Envanter kaydı', example: 'MK-FL-001', body: 'Tersanenizdeki belirli bir forklift. Kendine ait ekipman kodu ve teknik bilgileri vardır; türün katalog kodundan farklıdır.' },
            { title: 'Ortak liste', example: 'Paylaşıma açılmış forklift', body: 'Yöneticinin diğer tersanelere göstermeyi seçtiği kayıt. Envantere eklemek, ortak listede yayınlamak anlamına gelmez.' },
        ],
        faqTitle: 'Takıldığınız yerde',
        faq: [
            { question: 'İskele parçalarını binlerce ayrı kayıt olarak mı eklemeliyim?', answer: 'Hayır. Platform yöneticisi türü Adetli malzeme stoku olarak hazırlar. Malzeme kodu, malzeme adı ve stok adedini doldurun; kurmaca ORNEK-STOK-01 kodlu 500 platform parçası tek stok kaydıdır. Bu değer gerçek envanterden alınmamıştır. Envanterde adı ve adedi görünür; Ayrıntıyı aç ile kaydı inceleyebilirsiniz. Stok adedi, paylaşıma ayrılan miktar değildir.', taskId: 'add' },
            { question: 'İskele Excel’indeki Seri Numarası, İsim ve Adet sütunlarını nereye eşleştireceğim?', answer: 'Adetli malzeme stoku türünü seçin. Seri Numarası → Malzeme kodu, İsim → Malzeme adı, Adet → Stok adedi eşleşmesini kontrol edin. İlk satır başlıksa Başlık Satırı 1 olsun. Aynı tersane ve türde aynı kod tekrar aktarılırsa yeni stok adedi eski değerin yerini alır. Başka tersanenin aynı kodlu kaydıyla birleşmez.', taskId: 'excel' },
            { question: 'Ekipman türü ile ekipman kodu aynı şey mi?', answer: 'Hayır. Forklift ortak türdür; MK-FL-001 belirli bir forkliftin örnek ekipman kodudur. Katalog kodu ise ortak türü tanımlar.', taskId: 'inspect' },
            { question: 'Aradığım ekipman türü yok. Ne yapmalıyım?', answer: 'Önce Ekipman türleri ekranında arayın. Uygun tanım yoksa platform yöneticisinden ortak kataloğa eklemesini isteyin.', taskId: 'add' },
            { question: 'Excel aktarımında hata çıktı. Diğer satırlar kaydedildi mi?', answer: 'Ekipman aktarımında geçerli satırlar kaydedilmiş olabilir; sonuç sayılarına bakın. Katalog aktarımında tek bir hatalı satır varsa hiçbir satır kaydedilmez.', taskId: 'excel' },
            { question: 'Ekipmanımı ekledim; neden ortak listede yok?', answer: 'Yeni ekipman yalnız envanterinizde kalır. Yönetici Paylaşımı yönet ile yayına açmalıdır; kapsam dışı türler ve pasif tersanelerin ekipmanları gösterilmez.', taskId: 'publish' },
            { question: 'Paylaşınca özel bilgilerimi herkes görür mü?', answer: 'Diğer tersaneler ekipman türünü, sahibi tersaneyi ve paylaşım notunu görür. İç ekipman kodu, özel teknik alanlar ve atanan kişi gösterilmez.', taskId: 'publish' },
            { question: 'Katalog güncellerken boş hücreler ne yapar?', answer: 'Katalog koduna göre güncelle modunda boş Açıklama ve Kapsam dışı nedeni hücreleri önceki değeri temizler. Aktarmadan önce önizlemedeki değişiklikleri kontrol edin.', taskId: 'catalog' },
        ],
        tasks: [
            {
                id: 'inspect', title: 'Envanterimi incelemek',
                summary: 'Marka, model ve adedi görün; listeyi açarak ekipmanları tek tek inceleyin.',
                audience: 'Tersane kullanıcıları', audienceRole: 'all', route: '/assets', action: 'Envanterimi aç',
                steps: [
                    { id: 'type', title: 'Modeli ve adedi bulun', body: 'Envanterim ekranında aynı marka ve model birlikte gösterilir. Örneğin bir modelde 50 adet varsa o grupta 50 ayrı ekipman kaydı vardır. Listeyi aç düğmesine basın.', screenshot: 'inventory-types.png', imageAlt: 'Envanterim ekranında marka ve model grupları ile ekipman adetleri' },
                    { id: 'equipment', title: 'Listede ekipmanınızı bulun', body: 'Açılan listede her satır bir ekipmandır. Ekipman koduna bakarak aradığınız kaydı bulun; arama alanına marka, model veya kod yazabilirsiniz.', screenshot: 'inventory-equipment.png', imageAlt: 'Seçili modeldeki ekipmanların tek tek gösterildiği liste' },
                    { id: 'details', title: 'Bilgileri açın; gerektiğinde işlem yapın', body: 'Ekipmanı açarak bütün bilgilerini görün. Düzenlemek veya paylaşımı değiştirmek için o satırın İşlemler menüsünü açın. Başka model için Özete dön, bütün kayıtlar için Tek tek ekipmanlar kullanın.' },
                ],
                expectedResult: 'Önce modelin toplam adedini, sonra her ekipmanın kodunu ve bilgilerini görürsünüz.',
                note: 'Tek tek ekipman takibinde adet kayıt sayısıdır; tek kayda 50 yazmak 50 ayrı ekipman oluşturmaz. Adetli malzeme stokunda ise bir kayıtta binlerce parça tutulabilir; malzeme adı, kodu ve stok adedi görünür. Platform hesabında Tersane filtresiyle sahibi kurumu seçebilirsiniz.',
            },
            {
                id: 'add', title: 'Yeni ekipman eklemek',
                summary: 'Fiziksel ekipmanınızı doğru ortak türe kaydedin.',
                audience: 'Tersane kullanıcıları', audienceRole: 'all', route: '/assets', action: 'Ekipman ekleme ekranına git',
                steps: [
                    { id: 'open', title: 'Ekipman ekle düğmesini açın', body: 'Envanterim ekranında Ekipman ekle düğmesine basın. Forklift modelinin listesinden açtıysanız ekipman türü önceden seçili gelir.', screenshot: 'inventory-types.png', imageAlt: 'Envanterim ekranında üstteki Ekipman ekle düğmesi' },
                    { id: 'type', title: 'Ortak türü kontrol edin', body: 'Ekipman türü alanında fiziksel ekipmanınıza uygun tanımı seçin. Platform hesabıyla işlem yapıyorsanız sahibi Tersane alanını da seçin.' },
                    { id: 'fields', title: 'Bu ekipmanın bilgilerini yazın', body: 'Ekipman kodu için tersanenizde kullandığınız kodu yazın; MK-FL-001 bir örnektir. Marka ve modeli doldurun: aynı marka ve modeldeki kayıtlar birlikte gösterilir. Zorunlu alanları ve bildiğiniz diğer bilgileri tamamlayın.', screenshot: 'asset-form.png', imageAlt: 'Ekipman türü, ekipman kodu ve teknik alanları içeren ekleme formu' },
                    { id: 'save', title: 'Oluştur ile kaydı tamamlayın', body: 'Bilgileri kontrol edip Oluştur düğmesine basın. Form hata gösterirse belirtilen alanı düzeltin; kayıt başarılı olduğunda ekipman envanterde görünür.' },
                ],
                expectedResult: 'Ekipman tersanenizin envanterine eklenir. Ortak listede görünmesi için ayrı bir paylaşım kararı gerekir.',
                note: 'Alıştırma yapıyorsanız yalnız test ortamında, gerçek ekipmanla karışmayacak bir deneme kodu kullanın.',
            },
            {
                id: 'excel', title: 'Excel envanterimi aktarmak',
                summary: 'Kendi dosyanızı ortak alanlara eşleyerek ekipman kayıtlarını içeri alın.',
                audience: 'Tersane kullanıcıları', audienceRole: 'all', route: '/assets', action: 'Excel aktarımına git',
                steps: [
                    { id: 'prepare', title: 'Dosyanızı hazırlayın', body: "Uygulama şablonu için üç noktalı Diğer İşlemler → Excel'e Dışa Aktar yolunda türü seçip Şablonu İndir kullanın; verileri 4. satırdan başlatın. Kendi Excel dosyanızda her satır, seçili türe göre bir ekipman veya bir malzemenin stok kaydı olabilir." },
                    { id: 'file', title: 'Dosyayı seçip önizleyin', body: "Excel'den İçe Aktar düğmesini açın ve dosyanızı seçin. Harici dosyada Dosya düzeni bölümünü açarak Başlık Satırı değerini kontrol edin, ardından Önizle ve Devam Et düğmesine basın; platform hesabında önce sahibi tersaneyi seçin.", screenshot: 'inventory-import-file.png', imageAlt: 'Excel dosyasını seçme ve dosya düzeni özeti ekranı' },
                    { id: 'mapping', title: 'Türü ve sütunları eşleştirin', body: 'Uygulama şablonu algılanırsa tür otomatik belirlenir; doğru olduğunu kontrol edin. Harici dosyada Ekipman türü seçin ve her Excel sütununu ilgili sistem alanıyla eşleştirin; kullanılmayacak sütunlarda Yoksay seçin.' },
                    { id: 'review', title: 'Önizlemedeki verileri kontrol edin', body: 'Ekipman kodlarının ve teknik değerlerin doğru sütunlarda göründüğünü kontrol edin. Türde benzersiz alan tanımlıysa aynı tersane ve türdeki eşleşen kayıt güncellenir.', screenshot: 'inventory-import.png', imageAlt: 'Excel dosyasından okunan ekipman satırlarının aktarım önizlemesi' },
                    { id: 'result', title: 'Aktarın, ardından sonucu okuyun', body: 'Şablon için Şablon İçe Aktarmayı Başlat, harici dosya için İçe Aktar düğmesine basın. Sonuçta Oluşturuldu, Güncellendi ve Hata sayılarını kontrol edin; hatalı satırları dosyada düzeltip yeniden aktarın.' },
                ],
                expectedResult: 'Geçerli ekipman satırları envanterinize eklenir veya eşleşen kayıtları günceller. Hiçbiri otomatik paylaşıma açılmaz.',
                note: 'Ekipman aktarımında bazı satırlar hatalı olsa da geçerli satırlar kaydedilebilir. Önizleme bütün satırların doğrulandığı anlamına gelmez; tekrar aktarmadan önce sonuç özetini okuyun.',
            },
            {
                id: 'publish', title: 'Ekipmanımı ortak listede göstermek',
                summary: 'Diğer tersanelerin görebileceği ekipmanları siz seçin.',
                audience: 'Tersane yöneticisi', audienceRole: 'manager', route: '/assets', action: 'Paylaşımı yönetmek için envantere git',
                steps: [
                    { id: 'open', title: 'İlgili ekipmanda Paylaşımı yönet açın', body: 'Envanterim ekranında ilgili modelin Listeyi aç düğmesine basın. Paylaşacağınız ekipmanı kodundan bulun; İşlemler menüsünden Paylaşımı yönet seçin. Bu işlem tersane yöneticisine açıktır; personel paylaşım ayarını değiştiremez.' },
                    { id: 'note', title: 'Görünürlüğü ve açıklamayı belirleyin', body: 'Bu ekipmanı diğer tersanelerin ortak listesinde göster seçeneğini işaretleyin. Ortak listede görünen açıklama alanına yalnız diğer tersanelere göstermek istediğiniz bilgileri yazın.', screenshot: 'sharing-modal.png', imageAlt: 'Ortak liste görünürlüğü seçeneği ve herkese açık paylaşım notu' },
                    { id: 'save', title: 'Kaydedip ortak listeyi kontrol edin', body: 'Kaydet düğmesine basın, ardından Ortak ekipmanlar ekranını açın. Tür, sahibi tersane ve paylaşım notunuz görünür; iç ekipman kodu ve özel envanter alanları paylaşılmaz.', screenshot: 'shared-equipment.png', imageAlt: 'Yöneticiler tarafından yayınlanmış ekipmanların ortak listesi' },
                    { id: 'withdraw', title: 'Gerektiğinde yayını geri çekin', body: 'Envanterinizde aynı ekipmanın İşlemler → Paylaşımı yönet yolunu açın. Görünürlük seçeneğinin işaretini kaldırıp Kaydet düğmesine basın; ekipman envanterinizde kalır.' },
                ],
                expectedResult: 'Seçtiğiniz ekipman diğer tersanelerin ortak listesinde görünür. Yayını geri çekerseniz kendi envanterinizde korunur.',
                note: 'Yayınlama müsaitlik veya rezervasyon onayı değildir. K kategorisi, C ön paylaşım sınıfı veya kapsam dışı nedeni olan türler yayınlanamaz; pasif tersanelerin ekipmanları ortak listede görünmez.',
            },
            {
                id: 'catalog', title: 'Ortak ekipman türlerini hazırlamak',
                summary: 'Tersanelerin aynı tanımları kullanması için ortak kataloğu oluşturun.',
                audience: 'Platform yöneticisi', audienceRole: 'platform', route: '/assets/types', action: 'Ekipman türleri ekranını aç',
                steps: [
                    { id: 'catalog', title: 'Mevcut ortak tanımları inceleyin', body: 'Ekipman türleri ekranında ad veya katalog koduyla arayın. Forklift gibi bir tanım zaten varsa aynı amaçla yeni tür açmak yerine mevcut tanımı kullanın.', screenshot: 'catalog.png', imageAlt: 'Kategori gruplarına ayrılmış ortak ekipman türleri kataloğu' },
                    { id: 'prepare', title: 'Katalog şablonunu doldurun', body: 'Katalogdan aktar → Excel şablonunu indir yolunu açın. Her satıra bir ortak türün Katalog kodu, adı, A–M kategorisi ve A/B/C ön paylaşım sınıfını yazın; bu dosyaya fiziksel ekipman kodlarını yazmayın.' },
                    { id: 'mode', title: 'Aktarım davranışını seçin', body: 'Yalnızca yeni tipleri ekle seçeneği mevcut katalog kodlarını atlar. Mevcut tanımları değiştirmek için Katalog koduna göre güncelle seçin; eşleştirme adla değil katalog koduyla yapılır.' },
                    { id: 'review', title: 'Dosyayı önizle ile değişiklikleri okuyun', body: 'Eklenecek, Güncellenecek, Atlanacak ve Hatalı satırları kontrol edin. Bir hata varsa dosyayı düzeltip yeniden yükleyin; katalog aktarımı hata varken hiçbir kaydı değiştirmez.', screenshot: 'catalog-preview.png', imageAlt: 'Katalog aktarımında eklenecek ve güncellenecek türlerin satır bazlı önizlemesi' },
                    { id: 'confirm', title: 'Kontrol ettiğiniz değişiklikleri aktarın', body: 'Önizlemedeki değişiklik sayısını gösteren aktar düğmesine basın. Ortak türler hazır olunca her tersane fiziksel ekipmanlarını Envanterim ekranında bu türlere kaydedebilir.' },
                ],
                expectedResult: 'Bütün tersanelerin kullanabildiği ortak ekipman tanımları oluşur veya güncellenir. Bu işlem fiziksel ekipman kaydı oluşturmaz.',
                note: 'Güncelleme modunda boş Açıklama ve Kapsam dışı nedeni hücreleri eski değeri temizler. Önizlemede eski → yeni değerleri okuyun; ekipman kayıtları ve alan şemaları korunur.',
            },
        ],
    },
    en: {
        title: 'User guide',
        introduction: 'Choose what you want to do. See where to look on screen and follow the steps in order.',
        taskPrompt: 'What would you like to do?',
        taskLabel: 'Task',
        stepLabel: 'Step',
        stepsLabel: 'Steps',
        resultLabel: 'When you finish',
        noteLabel: 'Keep in mind',
        audienceLabel: 'Who can use this?',
        previousStep: 'Previous step',
        nextStep: 'Next step',
        finish: 'I have completed the steps',
        openScreenshot: 'Enlarge screenshot',
        closeScreenshot: 'Close screenshot',
        screenshotCaption: 'Example screen · Fictional test data',
        conceptsTitle: 'Three terms, one example',
        concepts: [
            { title: 'Equipment type', example: 'Forklift', body: 'A common definition used by every shipyard. It specifies which fields, such as brand, capacity and equipment code, to record.' },
            { title: 'Inventory record', example: 'MK-FL-001', body: 'One particular forklift in your shipyard. It has its own equipment code and technical details; this code differs from the type’s catalog code.' },
            { title: 'Shared list', example: 'Published forklift', body: 'A record an administrator has chosen to show to other shipyards. Adding equipment to inventory does not publish it.' },
        ],
        faqTitle: 'If you get stuck',
        faq: [
            { question: 'Do scaffold parts need thousands of separate records?', answer: 'No. The platform administrator sets up the type as Material stock by quantity. Enter material code, material name and stock quantity; fictional code ORNEK-STOK-01 with 500 platform parts is one stock record. This value is not taken from real inventory. Inventory shows the name and quantity; use Open details to inspect it. Stock quantity is not the amount offered for sharing.', taskId: 'add' },
            { question: 'Where do I map Seri Numarası, İsim and Adet in a scaffold workbook?', answer: 'Choose a Material stock by quantity type. Check Seri Numarası → Material code, İsim → Material name and Adet → Stock quantity. Use Header row 1 if the first row contains headers. Reimporting the same code within the same shipyard and type replaces its previous stock quantity. It does not merge with another shipyard’s same code.', taskId: 'excel' },
            { question: 'Are equipment types and equipment codes the same?', answer: 'No. Forklift is a common type; MK-FL-001 is an example code for one particular forklift. A catalog code identifies the common type.', taskId: 'inspect' },
            { question: 'The equipment type I need is missing. What should I do?', answer: 'Search Equipment types first. If no suitable definition exists, ask the platform administrator to add it to the common catalog.', taskId: 'add' },
            { question: 'The Excel import has errors. Were other rows saved?', answer: 'An equipment import may have saved valid rows; check the result counts. A catalog import saves no rows when even one row has an error.', taskId: 'excel' },
            { question: 'I added equipment. Why is it missing from the shared list?', answer: 'New equipment stays in your private inventory. An administrator must publish it using Manage sharing; excluded types and equipment from inactive shipyards are hidden.', taskId: 'publish' },
            { question: 'Does sharing reveal all my private details?', answer: 'Other shipyards see the equipment type, owner shipyard and sharing note. Internal equipment codes, private technical fields and assignees stay hidden.', taskId: 'publish' },
            { question: 'What do empty cells do in a catalog update?', answer: 'In Update by catalog code mode, empty Description and Exclusion reason cells clear existing values. Check the changes in the preview before importing.', taskId: 'catalog' },
        ],
        tasks: [
            {
                id: 'inspect', title: 'Browse my inventory',
                summary: 'See brand, model and quantity, then open a list to inspect individual items.',
                audience: 'Shipyard users', audienceRole: 'all', route: '/assets', action: 'Open my inventory',
                steps: [
                    { id: 'type', title: 'Find the model and quantity', body: 'My inventory groups equipment with the same brand and model. A model showing 50 items has 50 separate equipment records. Select Open list.', screenshot: 'inventory-types.png', imageAlt: 'Brand and model groups with equipment counts on My inventory' },
                    { id: 'equipment', title: 'Find your equipment in the list', body: 'Each row in the list is one item. Use the equipment code to identify it; search by brand, model or code when needed.', screenshot: 'inventory-equipment.png', imageAlt: 'Individual equipment records in the selected model group' },
                    { id: 'details', title: 'View details and open actions when needed', body: 'Open an item to see all its details. To edit or manage sharing, open that row’s Actions menu. Use Back to summary for another model, or Individual equipment to see all records.' },
                ],
                expectedResult: 'You see the model’s total quantity first, then each item’s code and details.',
                note: 'For individual equipment, quantity is the record count; entering 50 in one record does not create 50 individual items. Material stock can hold thousands of pieces in one record and shows material name, code and stock quantity. Platform accounts can select the owner organization with the Shipyard filter.',
            },
            {
                id: 'add', title: 'Add equipment',
                summary: 'Record a physical item under the correct common type.',
                audience: 'Shipyard users', audienceRole: 'all', route: '/assets', action: 'Go to add equipment',
                steps: [
                    { id: 'open', title: 'Open Add equipment', body: 'In My inventory, select Add equipment. If you open it from a Forklift model’s list, the equipment type is selected for you.', screenshot: 'inventory-types.png', imageAlt: 'The Add equipment button at the top of My inventory' },
                    { id: 'type', title: 'Check the common type', body: 'Choose the definition that matches your physical item in Equipment type. If you are using a platform account, also select its owner in Shipyard.' },
                    { id: 'fields', title: 'Enter this item’s details', body: 'For Ekipman kodu, enter the code used by your shipyard; MK-FL-001 is an example. Complete Brand and Model: records with the same values are grouped together. Fill in required fields and other details you know.', screenshot: 'asset-form.png', imageAlt: 'Equipment form showing the type, identifying code and technical fields' },
                    { id: 'save', title: 'Finish with Create', body: 'Review the details and select Create. If the form reports an error, correct the indicated field; equipment appears in inventory after a successful save.' },
                ],
                expectedResult: 'The equipment is added to your shipyard’s inventory. Showing it in the shared list requires a separate sharing decision.',
                note: 'For practice, use only the test environment and a trial code that cannot be mistaken for real equipment.',
            },
            {
                id: 'excel', title: 'Import my Excel inventory',
                summary: 'Map your own workbook to common fields and import equipment records.',
                audience: 'Shipyard users', audienceRole: 'all', route: '/assets', action: 'Go to Excel import',
                steps: [
                    { id: 'prepare', title: 'Prepare your workbook', body: 'For an app template, use the three-dot More actions → Export to Excel menu, choose the type and select Download template; begin data on row 4. In your own workbook, each data row can represent one equipment item or one material stock record, depending on the selected type.' },
                    { id: 'file', title: 'Choose the file and preview it', body: 'Open Import from Excel and choose your file. For an external workbook, open File layout to check Header row, then select Preview & continue; platform accounts must select the owner shipyard first.', screenshot: 'inventory-import-file.png', imageAlt: 'Excel file selection and file layout summary' },
                    { id: 'mapping', title: 'Match the type and columns', body: 'An app template sets the type automatically; check that it is correct. For an external workbook, choose Equipment type and map each Excel column to its system field; select Ignore for unused columns.' },
                    { id: 'review', title: 'Review the preview data', body: 'Check that equipment codes and technical values appear in the right columns. If the type defines a unique field, a matching record in the same shipyard and type will be updated.', screenshot: 'inventory-import.png', imageAlt: 'Import preview showing equipment rows read from an Excel workbook' },
                    { id: 'result', title: 'Import and read the result', body: 'Select Run template import for an app template, or Import for an external workbook. Check the Created, Updated and Errors counts; correct failed rows in your workbook and import them again.' },
                ],
                expectedResult: 'Valid equipment rows are added to your inventory or update matching records. None are published automatically.',
                note: 'An equipment import can save valid rows even when other rows fail. The preview does not mean every row has been validated; read the result summary before importing again.',
            },
            {
                id: 'publish', title: 'Publish equipment in the shared list',
                summary: 'Choose which equipment other shipyards can see.',
                audience: 'Shipyard administrator', audienceRole: 'manager', route: '/assets', action: 'Go to inventory to manage sharing',
                steps: [
                    { id: 'open', title: 'Open Manage sharing on the item', body: 'In My inventory, select Open list for the model. Find the item by its code, then choose Actions → Manage sharing. This is available to shipyard administrators; members cannot change sharing settings.' },
                    { id: 'note', title: 'Choose visibility and write a note', body: 'Enable Show this equipment to other shipyards in the shared list. In Public sharing note, include only information you want other shipyards to see.', screenshot: 'sharing-modal.png', imageAlt: 'Shared list visibility option and public sharing note form' },
                    { id: 'save', title: 'Save and check the shared list', body: 'Select Save, then open Shared equipment. The type, owner shipyard and your note appear; internal equipment codes and private inventory fields remain hidden.', screenshot: 'shared-equipment.png', imageAlt: 'Shared equipment published by shipyard administrators' },
                    { id: 'withdraw', title: 'Withdraw publication when needed', body: 'Open Actions → Manage sharing for the same item in your inventory. Clear the visibility option and select Save; the equipment remains in your inventory.' },
                ],
                expectedResult: 'Your selected item appears in the shared equipment list. Withdrawing publication keeps the item in your own inventory.',
                note: 'Publication does not confirm availability or a reservation. Category K, preliminary class C or an exclusion reason prevents publication; equipment from inactive shipyards is hidden.',
            },
            {
                id: 'catalog', title: 'Prepare common equipment types',
                summary: 'Build the common catalog so every shipyard uses the same definitions.',
                audience: 'Platform administrator', audienceRole: 'platform', route: '/assets/types', action: 'Open equipment types',
                steps: [
                    { id: 'catalog', title: 'Check existing definitions', body: 'In Equipment types, search by name or catalog code. If a definition such as Forklift exists, use it instead of creating another type for the same purpose.', screenshot: 'catalog.png', imageAlt: 'Common equipment types grouped by category in the catalog' },
                    { id: 'prepare', title: 'Fill in the catalog template', body: 'Open Import catalog → Download Excel template. Each row describes one common type with its Catalog code, name, A–M category and A/B/C preliminary sharing class; do not put physical equipment codes in this file.' },
                    { id: 'mode', title: 'Choose the import behavior', body: 'Add new types only skips existing catalog codes. To change existing definitions, choose Update by catalog code; matching uses codes rather than names.' },
                    { id: 'review', title: 'Use Preview file to review changes', body: 'Check Create, Update, Skip and Error rows. If any row has an error, fix the workbook and upload it again; catalog imports change no records while errors remain.', screenshot: 'catalog-preview.png', imageAlt: 'Catalog import preview showing the rows to create or update' },
                    { id: 'confirm', title: 'Import the changes you reviewed', body: 'Select the import button showing the number of changes in the preview. Once common types are ready, each shipyard can record its physical equipment under them in My inventory.' },
                ],
                expectedResult: 'Common equipment definitions are created or updated for all shipyards. This does not create physical equipment records.',
                note: 'In update mode, empty Description and Exclusion reason cells clear existing values. Review before → after values; equipment records and field schemas are preserved.',
            },
        ],
    },
}
