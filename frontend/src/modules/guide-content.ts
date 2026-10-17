export type GuideTaskId = 'inspect' | 'add' | 'excel' | 'publish' | 'catalog' | 'usage' | 'users'
export type GuideRoute = '/assets' | '/assets/types' | '/shared-equipment' | '/shared-usage' | '/platform/users'

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
            { question: 'Paylaşınca özel bilgilerimi herkes görür mü?', answer: 'Diğer tersaneler yalnız yayın için girdiğiniz başlık, adet, kapasite, uygunluk, koşullar ve iletişim bilgileriyle ekipman türü ve sahibi tersaneyi görür. İç ekipman kodu, özel teknik alanlar, toplam stok ve atanan kişi gösterilmez. Kayıtlı hesap/tersane iletişimi otomatik yayımlanmaz.', taskId: 'publish' },
            { question: 'Stok adedi ile paylaşım adedi aynı mı?', answer: 'Hayır. Kurmaca örnekte envanterde 500 platform parçası bulunabilir; paylaşım adedine 100 yazabilirsiniz. Diğer tersaneler yalnız 100 teklifini görür. Tek tek izlenen bir ekipman kaydı için adet 1 olur. Adet boşsa tersaneyle görüşülür; uygun olarak işaretlemek için adet girilmelidir.', taskId: 'publish' },
            { question: 'Paylaşım neden durduruldu?', answer: 'Normal düzenleme veya Excel aktarımı stoku paylaşım adedinin altına düşürürse ya da ekipman türü değişirse yayın durur. Bilgiler taslak olarak korunur. Adedi ve koşulları düzeltip yeniden yayınlayın; stok artınca otomatik açılmaz. Sahibi tersane değişirse bütün yayın bilgileri temizlenir.', taskId: 'publish' },
            { question: 'Yeni alanlar zorunlu mu?', answer: 'Yeni alanlar isteğe bağlıdır. Zorunlu yaptığınızda eksik kayıtların sahipleri bildirim alır. Alan adını değiştirmek mevcut değerleri silmez.', taskId: 'catalog' },
        ],
        tasks: [
            {
                id: 'inspect', title: 'Envanterimi incelemek',
                summary: 'Marka, model ve adedi görün; listeyi açarak ekipmanları tek tek inceleyin.',
                audience: 'Tersane kullanıcıları', audienceRole: 'all', route: '/assets', action: 'Envanterimi aç',
                steps: [
                    { id: "type", title: "Modeli ve adedi bulun", body: "Envanterim ekranında aramayla ekipmanı bulun veya tür, marka ve model grubunu açın. Bir modelde 50 adet, 50 ayrı ekipman kaydıdır. Stok kalemlerinde parça adedi ayrı gösterilir.", screenshot: 'inventory-types.png', imageAlt: "Envanterde arama ve gruplar" },
                    { id: 'equipment', title: 'Listede ekipmanınızı bulun', body: 'Açılan listede her satır bir ekipmandır. Arama alanına marka, model veya kod yazabilirsiniz. Uzun listelerde alttaki sayfa numaraları ya da Önceki / Sonraki düğmeleriyle ilerleyin. Sayfa başına alanı gösterilen satır sayısını değiştirir; modelin toplam adedi aynı kalır.', screenshot: 'inventory-equipment.png', imageAlt: 'Seçili modeldeki ekipmanların tek tek gösterildiği liste' },
                    { id: 'export', title: 'İndireceğiniz dosyanın kapsamını seçin', body: 'Diğer işlemler menüsünde Görünen sonuçlar (CSV), geçerli arama ve filtrelere uyan bütün sayfaları indirir; yalnız açık sayfayı değil. Seçilen türün tamamı (Excel) ise seçtiğiniz tür ve tersanenin erişebildiğiniz tüm kayıtlarını içerir. Arama, kategori, model ve güncelleme filtreleri Excel dosyasına uygulanmaz. İndirmeden önce kapsamı kontrol edin.', screenshot: 'inventory-export.png', imageAlt: 'Görünen sonuçlar ve türün tamamı için dosya kapsamı seçimi' },
                    { id: "details", title: "Bilgileri açın; gerektiğinde işlem yapın", body: "Listede seri numarası, kapasite ve kontrol tarihi girilmişse görünür. Detayı açıp Düzenle ile bilgileri değiştirin. Yetkili yöneticiler aynı yerde Paylaşımı yönet kullanabilir. Satırdaki İşlemler menüsü korunur; personel paylaşımı tersane yöneticisinden ister." },
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
                    { id: "fields", title: "Adedi ve gerekli bilgileri yazın", body: "Adet 1 ile başlar; birden çok ekipman için artırın. Zorunlu alanları tamamlayın, bildiğiniz isteğe bağlı bilgileri İsteğe bağlı özellikler bölümünden açın. Ortak özellikleri farklı ekipmanları ayrı satırlara ekleyin. Seri numarası isteniyorsa her ekipman için ayrı gerçek değer girin; katalog kodu ve otomatik envanter koduyla karıştırmayın.", screenshot: 'inventory-add.png', imageAlt: "Tür ve adetle ekipman ekleme" },
                    { id: "save", title: "Özeti kontrol edip kaydedin", body: "Özet, kaç ayrı ekipman kaydı ve kaç stok kalemi/parçası oluşacağını gösterir. Envantere ekle ile tamamlayın. Hatalı satır varsa hiçbir kayıt eklenmez; değerleri düzeltip tekrar deneyin. Başarılı kayıt sonrası envanter yenilenir." },
                ],
                expectedResult: 'Ekipman tersanenizin envanterine eklenir. Ortak listede görünmesi için ayrı bir paylaşım kararı gerekir.',
                note: "Yerel envanter kodu sistem tarafından atanır; gerekirse daha sonra detaydan düzenlenir. Gerçek üretici seri numarası otomatik üretilmez. Stok adedi, paylaşıma açılan adet değildir.",
            },
            {
                id: 'excel', title: 'Excel envanterimi aktarmak',
                summary: 'Kendi dosyanızı ortak alanlara eşleyerek ekipman kayıtlarını içeri alın.',
                audience: 'Tersane kullanıcıları', audienceRole: 'all', route: '/assets', action: 'Excel aktarımına git',
                steps: [
                    { id: 'prepare', title: 'Dosyanızı hazırlayın', body: "Excel’den aktar penceresindeki Şablon gerekiyor mu? bölümünde türü seçip Tek tür şablonunu indir kullanın; verileri 4. satırdan başlatın. Kendi Excel dosyanızda her satır, seçili türe göre bir ekipman veya bir malzemenin stok kaydı olabilir." },
                    { id: 'file', title: 'Dosyayı seçip önizleyin', body: "Excel’den aktar düğmesini açın ve dosyanızı seçin. Dosyada tür, alan veya taksonomi sayfaları bulunursa yetkili yöneticiye birleşik inceleme önerilir; aynı dosya tekrar seçilmez. Önizle ve Devam Et ile Dosyayı inceledik önerisini görün: Excel sayfası ve başlık satırı otomatik bulunur. Belirsiz seçimleri Dosya düzeni bölümünde tamamlayın; platform hesabında önce sahibi tersaneyi seçin.", screenshot: 'inventory-import-file.png', imageAlt: 'Excel dosyasını seçme ve dosya düzeni özeti ekranı' },
                    { id: 'mapping', title: 'Önerilen türü ve sütunları kontrol edin', body: 'Önerilen ekipman türünü ve sütun eşleşmelerini kontrol edin. Birden fazla tür uygunsa seçiminizi yapın; eksik zorunlu alanları eşleştirin. Kullanılmayacak sütunda Yoksay seçin. Değişiklikten sonra Dosyayı yeniden kontrol et düğmesine basın.' },
                    { id: 'review', title: 'Hazır ve atlanan satırları inceleyin', body: 'Güvenle tanınan toplam/ara toplam ve tekrar eden başlıklar aktarım dışında gösterilir. Excel satır numarası ve nedeni listelenir. Formül, yinelenen kod veya eksik değer varsa Excel’de düzeltin ya da kontrol bekleyen satırları bu aktarımda hariç tutmayı açıkça seçin. Sıfır stok ve gerçek malzeme adları korunur.', screenshot: 'inventory-import.png', imageAlt: 'Excel dosyasından okunan ekipman satırlarının aktarım önizlemesi' },
                    { id: 'result', title: 'Hazır kayıtları aktarın', body: 'Hedef tersaneyi doğrulayın; hazır kaydı aktar düğmesiyle işlemi tamamlayın. Oluşturuldu, Güncellendi, Atlandı ve Hata sayılarını kontrol edin. Benzersiz alanı aynı tersane ve türde eşleşen kayıt güncellenir; adetler mevcut değerin üzerine eklenmez.' },
                ],
                expectedResult: 'Geçerli ekipman satırları envanterinize eklenir veya eşleşen kayıtları günceller. Hiçbiri otomatik paylaşıma açılmaz.',
                note: 'Dosyanın tamamı analiz edilir; ekranda örnek satırlar gösterilir. Eksik zorunlu eşleştirmeler ve karar verilmemiş sorunlu satırlar aktarımı engeller. Kayıt sırasında hata oluşursa başarılı satırlar kaydedilmiş olabilir; yeniden denemeden sonuç özetini okuyun. Excel’deki tersane sütunu sahipliği değiştirmez.',
            },
            {
                id: 'publish', title: 'Ekipmanımı ortak listede göstermek',
                summary: 'Paylaşım adedini, koşulları ve iletişimi belirleyip yayını önizleyin.',
                audience: 'Tersane yöneticisi veya yetkili platform hesabı', audienceRole: 'manager', route: '/assets', action: 'Paylaşımı yönetmek için envantere git',
                steps: [
                    { id: 'open', title: 'İlgili ekipmanda Paylaşımı yönet açın', body: 'Envanterim ekranında ilgili modelin Listeyi aç düğmesine basın. Paylaşacağınız ekipmanı kodundan bulun; İşlemler menüsünden Paylaşımı yönet seçin. Bu işlem tersane yöneticisine ve yetkili platform hesabına açıktır; personel paylaşım ayarını değiştiremez.' },
                    { id: 'note', title: 'Başlığı ve paylaşım adedini belirleyin', body: 'Görünürlük seçeneğini işaretleyin. Başlığı, kapasiteyi ve paylaşım adedini yazın. Kurmaca örnek: toplam 500 platform parçasından 100 adet paylaşılabilir. Tek tek izlenen bir ekipman kaydı için adet 1 olur. Toplam stok otomatik yayımlanmaz.', screenshot: 'sharing-modal.png', imageAlt: 'Paylaşım bilgileri formu ve karşı tersanenin göreceği önizleme' },
                    { id: 'conditions', title: 'Uygunluğu ve koşulları açıklayın', body: 'Uygunluk seçimini kontrol edin; tarih veya çalışma koşullarını nota yazın. Kullanım, operatör, taşıma, teslim ve iade gibi anlaşılması gereken koşulları belirtin. Uygunluk tersanenizin beyanıdır; rezervasyon oluşturmaz.' },
                    { id: 'contact', title: 'İletişimi açıkça seçin', body: 'İsteğe bağlı iletişim bölümüne paylaşmak istediğiniz kişi, e-posta ve telefonu yazın. Bu alanlar diğer tersanelere gösterilir. Hesabınızın veya tersanenizin kayıtlı iletişimi otomatik kopyalanmaz. Hiçbir mesaj otomatik gönderilmez.', screenshot: 'sharing-preview.png', imageAlt: 'Diğer tersanelere gösterilecek adet, koşullar ve açık iletişimin önizlemesi' },
                    { id: 'save', title: 'Önizlemeyi kontrol edip kaydedin', body: 'Karşı tersanenin göreceği önizlemede başlık, adet, uygunluk ve koşulları doğrulayın; Kaydet seçin. Ortak ekipmanlar ekranında Detayları gör ile kapasite, koşullar ve açık iletişimi inceleyin. İç kod, özel teknik alanlar ve toplam stok gösterilmez.', screenshot: 'shared-equipment.png', imageAlt: 'Ortak ekipmanın paylaşım adedi, koşulları ve açık iletişim ayrıntıları' },
                    { id: 'withdraw', title: 'Gerektiğinde yayını geri çekin', body: 'Envanterinizde aynı ekipmanın İşlemler → Paylaşımı yönet yolunu açın. Görünürlük seçeneğinin işaretini kaldırıp Ortak listeden kaldır düğmesine basın; ekipman ve kaydedilmiş paylaşım taslağı envanterinizde kalır.' },
                ],
                expectedResult: 'Seçtiğiniz ekipman diğer tersanelerin ortak listesinde görünür. Yayını geri çekerseniz kendi envanterinizde korunur.',
                note: 'Stok paylaşım adedinin altına düşerse veya tür değişirse yayın durur; detaylar taslak kalır, artış otomatik yeniden yayımlamaz. Sahibi tersane değişirse tüm yayın bilgileri temizlenir. K kategorisi, C ön sınıfı ve kapsam dışı türler yayınlanamaz; pasif tersanelerin ekipmanları gizlenir. Kullanım ve tarihi sahibiyle teyitleşin.',
            },
            {
                id: 'catalog', title: 'Türleri ve alanlarını hazırlamak',
                summary: 'Ortak tanımları oluşturun; aynı Excel ile tersane envanterini ekleyin.',
                audience: 'Platform yöneticisi', audienceRole: 'platform', route: '/assets/types', action: 'Ekipman türleri ekranını aç',
                steps: [
                    { id: 'catalog', title: 'Ortak türü bulun veya oluşturun', body: 'Ekipman türleri ekranında tanımı arayın. Yeni tür için adını yazın; boş katalog kodu otomatik oluşturulur. Katalog kodu ortak türü, envanter kodu tersanenin kaydını tanımlar.' },
                    { id: 'prepare', title: 'Yalnızca gerekli alanları ekleyin', body: 'Alan ekle ile tutmak istediğiniz bilgileri seçin. Alanlar isteğe bağlı başlar. Kod, görünen ad ve toplam adet için kullanılacak bilgiyi seçebilirsiniz. Alanın görünen adını değiştirmek eski değerleri silmez.' },
                    { id: 'mode', title: 'Tek Excel şablonunu doldurun', body: 'Katalogdan aktar ile Tür ve envanter aktarımı penceresini açın. İlk kurulumda katalog veya tersane yoksa Birleşik envanter → Excel’den aktar aynı pencereyi açar. Boş Excel şablonu indir seçin. Ekipman türleri ortak tanımlar, Alanlar özellikler, Envanter seçilen tersanenin kayıtlarıdır. Katalog kodu sayfaları bağlar. Yalnız tür veya yalnız envanter de aktarılabilir.' },
                    { id: 'review', title: 'Dosyayı ve etkilenecek kayıtları inceleyin', body: 'Envanter varsa hedef tersaneyi seçin; Dosyayı incele düğmesine basın. Yeni ve güncellenen kayıtları kontrol edin. Toplam satırları atlanır. Belirsiz sınıfı seçin veya dosyayı düzeltin; seçim değişince yeniden inceleyin. Zorunlu alan değişikliği hangi tersaneleri etkiliyor görebilirsiniz.' },
                    { id: 'confirm', title: 'Kontrol edilen kayıtları aktarın', body: 'Önizleme hazırsa Kontrol edilen kayıtları aktar düğmesine basın. Bütün dosya birlikte uygulanır. Yeni zorunlu alanlar için eksik kayıtları olan tersane yöneticilerine bildirim gönderilir.' },
                ],
                expectedResult: 'Ortak türler ve seçilen tersanenin envanteri oluşur. Envanter kendiliğinden paylaşıma açılmaz.',
                note: 'GISBIR taksonomisi 175 tür tanımlar; gerçek envanter veya adet içermez. A–M kategori kodudur. B/C satırları açık karar gerektirir. Eksik zorunlu bilgiler tamamlanmadan yeni kullanım onayı verilmez.',
            },
            {
                id: 'users', title: 'Kullanıcı oluşturup tersaneye atamak',
                summary: 'Hesap, tersane ve rolü aynı akışta belirleyin; erişimi gözden geçirip oluşturun.',
                audience: 'Platform yöneticisi', audienceRole: 'platform', route: '/platform/users', action: 'Kullanıcı yönetimini aç',
                steps: [
                    { id: 'open', title: 'Yeni kullanıcı formunu açın', body: 'Yönetim → Kullanıcılar → Yeni Kullanıcı Oluştur yolunu açın. Kullanıcı adı, e-posta ve parolayı doldurun. Tersane detayından başlarsanız tersane hazır seçilir.' },
                    { id: 'assignment', title: 'Tersane ve rolü belirleyin', body: 'Tersane seçin veya Şimdilik atamasız seçeneğini açıkça işaretleyin. Tersane kullanıcıları personel veya tersane yöneticisi olabilir; atamasız hesap personel rolünde kalır ve atanana kadar tersane envanterine erişemez.', screenshot: 'users-create.png', imageAlt: 'Yeni kullanıcı için tersane ve rol seçimi' },
                    { id: 'review', title: 'Erişim kapsamını gözden geçirin', body: 'Kullanıcıyı gözden geçir düğmesine basın. Tersane, rol ve yetkinin etkisini doğrulayın. Parola özette gösterilmez. Düzeltmek için Bilgilere dön kullanın.', screenshot: 'users-review.png', imageAlt: 'Kaydetmeden önce yeni kullanıcının tersane ve rol özeti' },
                    { id: 'save', title: 'Kullanıcıyı oluşturun', body: 'Kullanıcıyı oluştur ve ata ile hesabı doğrudan seçili tersanede oluşturun; kullanıcıyı yeniden bulup atamak gerekmez. Atamasız seçtiyseniz Kullanıcıyı oluştur görünür. Hata olursa bilgiler korunur; düzeltip yeniden deneyin.' },
                ],
                expectedResult: 'Hesap seçtiğiniz tersane ve rol ile oluşturulur veya açıkça atamasız bırakılır.',
                note: 'Yeni hesap oluşturma platform yöneticisindedir. Tersane yöneticisi mevcut yetkileri kapsamında kullanıcıları düzenler; bu akış yeni oluşturma yetkisi vermez. Pasif tersanede hesap oluşturulabilir; tersane etkinleşene kadar envanter erişimi başlamaz.',
            },
            {
                id: 'usage', title: 'Bedelsiz ortak kullanım istemek',
                summary: 'Tarih ve adetle talep gönderin; onay, teslim ve iadeyi takip edin.',
                audience: 'Aktif tersane kullanıcıları', audienceRole: 'all', route: '/shared-usage', action: 'Kullanım taleplerini aç',
                steps: [
                    { id: "find", title: "Ortak ekipmanı bulun", body: "Ana menüde Ortak kullanım → Ortak ekipmanlar bölümünü açın. Diğer tersanenin paylaştığı adet, kapasite ve koşulları inceleyin. Kendi tersanenizin ekipmanı için talep gönderilmez; talep alınamıyorsa nedeni ve sonraki adım detayda gösterilir." },
                    { id: 'request', title: 'Tarihi, adedi ve amacı yazın', body: 'Bedelsiz kullanım talebi düğmesini açın. Başlangıç ve bitiş tarihini, istediğiniz adedi ve kullanım amacını yazıp talebi gönderin. Bu işlem ekipmanı henüz ayırmaz.', screenshot: 'usage-request.png', imageAlt: 'Tarih, adet ve kullanım amacıyla bedelsiz talep formu' },
                    { id: "approve", title: "Sahibinin onayını takip edin", body: "Ortak kullanım → Kullanım talepleri bölümünde tersanenizin talepleri ve gelen talepler bulunur. Oluşturan kişi, sıradaki işlem ve sorumlu rol görünür. Ekipman sahibi tersanenin yöneticisi Onayla veya Reddet seçer; açıklamayı gözden geçirip İşlemi tamamla ile kararını kaydeder. Onaylanan adet ayrılır; çakışan miktar yeniden onaylanamaz.", screenshot: 'usage-approval.png', imageAlt: 'Talep durumu, sıradaki sorumlu ve sabit işlem düğmeleri' },
                    { id: 'return', title: 'Teslim ve iadeyi kaydedin', body: 'Sahibi yönetici, Onaylandı durumunda teslimi kaydeder. Ekipman geri geldiğinde İade al seçer. Her iki işlemde açıklamayı gözden geçirip İşlemi tamamla ile kaydeder. İade kaydedilene kadar adet ayrılmış kalır; tarih geçmesi ekipmanı kendiliğinden serbest bırakmaz.', screenshot: 'usage-return.png', imageAlt: 'Teslimden sonra iade işleminin sonucu' },
                ],
                expectedResult: 'İki tersane aynı talebin onay, teslim ve iade durumunu görür. İşlem bildirimleri ilgili kişilere gider.',
                note: 'Kullanım bedelsizdir. Onayı sahibi tersane verir. Teslim edilmiş talep iptal edilmez; iade kaydedilir. Saha uygunluğu, taşıma ve operatör koşullarını ayrıca doğrulayın.',
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
            { question: 'Does sharing reveal all my private details?', answer: 'Other shipyards see only the title, offered quantity, capacity, availability, terms and contacts you enter for publication, along with the equipment type and owner shipyard. Internal codes, private technical fields, total stock and assignees stay hidden. Account and shipyard contacts are never copied automatically.', taskId: 'publish' },
            { question: 'Is stock quantity the same as offered quantity?', answer: 'No. A fictional inventory can hold 500 platform parts while you offer 100. Other shipyards see only the offer of 100. An individual equipment record can offer one item. A blank quantity means contact the shipyard; marking an offer available requires a quantity.', taskId: 'publish' },
            { question: 'Why was publication paused?', answer: 'An inventory edit or Excel import that reduces stock below the offered quantity, or a change of equipment type, pauses publication. Details remain as a draft. Correct the quantity and terms and publish again; stock increases never republish automatically. Changing the owner shipyard clears all publication details.', taskId: 'publish' },
            { question: 'Are new fields required?', answer: 'New fields start optional. Making a field required notifies owners of incomplete records. Renaming a field preserves existing values.', taskId: 'catalog' },
        ],
        tasks: [
            {
                id: 'inspect', title: 'Browse my inventory',
                summary: 'See brand, model and quantity, then open a list to inspect individual items.',
                audience: 'Shipyard users', audienceRole: 'all', route: '/assets', action: 'Open my inventory',
                steps: [
                    { id: "type", title: "Find the model and quantity", body: "Search My inventory or open a type, brand and model group. A model showing 50 items has 50 separate equipment records. Material stock quantities are shown separately.", screenshot: 'inventory-types.png', imageAlt: "Inventory search and groups" },
                    { id: 'equipment', title: 'Find your equipment in the list', body: 'Each row in the list is one item. Search by brand, model or equipment code. For long lists, use the page numbers or Previous / Next below the list. Per page changes the number of visible rows; the model’s total quantity stays the same.', screenshot: 'inventory-equipment.png', imageAlt: 'Individual equipment records in the selected model group' },
                    { id: 'export', title: 'Choose the downloaded file scope', body: 'In More actions, Visible results (CSV) includes every page matching the current search and filters. All records of a type (Excel) includes every accessible record for the chosen type and shipyard. Search, category, model and update filters do not apply to Excel. Check the scope before downloading.', screenshot: 'inventory-export.png', imageAlt: 'Choosing visible results or all records of a type for export' },
                    { id: "details", title: "View details and take action", body: "Serial number, capacity and inspection date appear in the list when entered. Open details to Edit. Authorized managers can also Manage sharing there. The row Actions menu remains available; members ask their shipyard manager to manage publication." },
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
                    { id: "fields", title: "Enter quantity and required information", body: "Quantity starts at 1; increase it for multiple items. Complete required fields and open Optional properties for optional details you know. Use separate rows for equipment with different shared properties. Supply a distinct actual serial number for each item when required; catalog and automatic inventory codes are different.", screenshot: 'inventory-add.png', imageAlt: "Equipment entry by type and quantity" },
                    { id: "save", title: "Check the summary and save", body: "The summary distinguishes separate equipment records from stock lines and pieces. Select Add to inventory. An invalid row stops the entire save and preserves entries for correction. Inventory refreshes after success." },
                ],
                expectedResult: 'The equipment is added to your shipyard’s inventory. Showing it in the shared list requires a separate sharing decision.',
                note: "The system assigns a local inventory code; edit it later from details if needed. Actual manufacturer serial numbers are never generated. Stock quantity differs from the amount offered for sharing.",
            },
            {
                id: 'excel', title: 'Import my Excel inventory',
                summary: 'Map your own workbook to common fields and import equipment records.',
                audience: 'Shipyard users', audienceRole: 'all', route: '/assets', action: 'Go to Excel import',
                steps: [
                    { id: 'prepare', title: 'Prepare your workbook', body: 'In Import from Excel, expand Need a template?, choose the type and select Download one-type template; begin data on row 4. In your own workbook, each data row can represent one equipment item or one material stock record, depending on the selected type.' },
                    { id: 'file', title: 'Choose the file and preview it', body: 'Open Import from Excel, choose your file and select Preview & continue. Type, field or taxonomy sheets prompt a combined review for authorized administrators, using the same selected file. File analysis proposes the worksheet and header row. Complete uncertain choices under File layout; platform accounts must select the owner shipyard first.', screenshot: 'inventory-import-file.png', imageAlt: 'Excel file selection and file layout summary' },
                    { id: 'mapping', title: 'Check the proposed type and columns', body: 'Check the proposed equipment type and column matches. Choose a type when several fit; map missing required fields. Select Ignore for unused columns. After any changes, select Recheck file.' },
                    { id: 'review', title: 'Review ready and excluded rows', body: 'Confidently identified totals, subtotals and repeated headings are excluded with their Excel row numbers and reasons. Correct formulas, duplicate codes or missing values in Excel, or explicitly exclude all review rows from this import. Zero stock and actual material names are preserved.', screenshot: 'inventory-import.png', imageAlt: 'Import preview showing equipment rows read from an Excel workbook' },
                    { id: 'result', title: 'Import the ready records', body: 'Check the owner shipyard and select Import ready records. Read Created, Updated, Skipped and Errors. Matching unique codes update records within the same shipyard and type; quantities replace existing values rather than adding to them.' },
                ],
                expectedResult: 'Valid equipment rows are added to your inventory or update matching records. None are published automatically.',
                note: 'The full worksheet is analyzed; the screen shows sample rows. Missing required mappings and unresolved review rows block import. Errors during saving can leave successful records stored; read the result before retrying. The workbook’s shipyard column never assigns ownership.',
            },
            {
                id: 'publish', title: 'Publish equipment in the shared list',
                summary: 'Set the offered quantity, terms and contact details, then preview publication.',
                audience: 'Shipyard administrator or authorized platform account', audienceRole: 'manager', route: '/assets', action: 'Go to inventory to manage sharing',
                steps: [
                    { id: 'open', title: 'Open Manage sharing on the item', body: 'In My inventory, select Open list for the model. Find the item by its code, then choose Actions → Manage sharing. Shipyard administrators and authorized platform accounts can manage publication; personnel cannot change sharing settings.' },
                    { id: 'note', title: 'Set the title and offered quantity', body: 'Enable visibility. Enter the title, capacity and offered quantity. Fictional example: offer 100 of 500 platform parts. An individual equipment record can offer one item. Total stock is never published automatically.', screenshot: 'sharing-modal.png', imageAlt: 'Publication details form and preview for other shipyards' },
                    { id: 'conditions', title: 'Explain availability and terms', body: 'Check availability and write any date or working conditions in the note. Explain operation, operator, transport, delivery and return arrangements. Availability is your shipyard’s declaration; it creates no reservation.' },
                    { id: 'contact', title: 'Choose public contacts explicitly', body: 'Enter the name, email and phone you want to share in the optional contact section. Other shipyards see these fields. Account or shipyard contacts are not copied automatically. No message is sent automatically.', screenshot: 'sharing-preview.png', imageAlt: 'Preview of offered quantity, terms and explicit public contacts for other shipyards' },
                    { id: 'save', title: 'Check the preview and save', body: 'Review the title, quantity, availability and terms in the public preview, then select Save. Open View details in Shared equipment to inspect capacity, terms and public contacts. Internal codes, private technical fields and total stock stay hidden.', screenshot: 'shared-equipment.png', imageAlt: 'Shared offer details showing quantity, terms and explicit public contacts' },
                    { id: 'withdraw', title: 'Withdraw publication when needed', body: 'Open Actions → Manage sharing for the same item in your inventory. Clear the visibility option and select Remove from shared list; the equipment and saved offer draft remain in your inventory.' },
                ],
                expectedResult: 'Your selected item appears in the shared equipment list. Withdrawing publication keeps the item in your own inventory.',
                note: 'Stock falling below the offer or a type change pauses publication and preserves the draft; an increase never republishes automatically. Changing the owner clears all offer details. Category K, class C and excluded types cannot publish; inactive shipyards are hidden. Confirm use and dates with the owner.',
            },
            {
                id: 'catalog', title: 'Prepare types and their fields',
                summary: 'Create shared definitions and import shipyard inventory in one workbook.',
                audience: 'Platform administrator', audienceRole: 'platform', route: '/assets/types', action: 'Open equipment types',
                steps: [
                    { id: 'catalog', title: 'Find or create the shared type', body: 'Search Equipment types. Enter a name for a new type; a blank catalog code is generated automatically. Catalog codes identify shared types, inventory codes identify local shipyard records.' },
                    { id: 'prepare', title: 'Add only information you need', body: 'Use Add field to choose information. New fields start optional. Choose fields for matching code, displayed name and total count. Renaming a field preserves existing values.' },
                    { id: 'mode', title: 'Fill in the single workbook template', body: 'Import catalog opens Type and inventory import. When the catalog or shipyard list is empty, Combined inventory → Import from Excel opens the same window. Download the blank Excel template. Equipment types are shared definitions, Fields define information, Inventory belongs to the selected shipyard. Catalog codes link the sheets. Type-only and inventory-only imports also work.' },
                    { id: 'review', title: 'Review the file and affected records', body: 'Select a target shipyard when inventory is present, then Review workbook. Check new and updated records. Total rows are skipped. Resolve uncertain classifications or correct the workbook; changed decisions require a fresh review. Required-field changes show affected shipyards.' },
                    { id: 'confirm', title: 'Import reviewed records', body: 'When the preview is ready, choose Import reviewed records. The complete workbook is applied together. New required fields notify managers whose inventory has missing information.' },
                ],
                expectedResult: 'Shared types and inventory for the selected shipyard are created. Inventory remains private until published separately.',
                note: 'GISBIR taxonomy defines 175 types, not actual inventory or quantities. A–M are category codes. B/C rows need a decision. Missing required information blocks new usage approvals.',
            },
            {
                id: 'users', title: 'Create and assign a user',
                summary: 'Choose the account, shipyard and role in one flow, then review access before creating.',
                audience: 'Platform administrator', audienceRole: 'platform', route: '/platform/users', action: 'Open user management',
                steps: [
                    { id: 'open', title: 'Open the new user form', body: 'Open Management → Users → Create New User. Enter username, email and password. Starting from shipyard details presets that shipyard.' },
                    { id: 'assignment', title: 'Choose the shipyard and role', body: 'Select a shipyard or explicitly choose Leave unassigned for now. Assigned users can be personnel or shipyard administrators. Unassigned accounts stay personnel and cannot access shipyard inventory until assigned.', screenshot: 'users-create.png', imageAlt: 'Choosing a shipyard and role for a new user' },
                    { id: 'review', title: 'Review the access scope', body: 'Select Review user. Check the shipyard, role and access effect. The password stays hidden in the summary. Use Back to details to make corrections.', screenshot: 'users-review.png', imageAlt: 'Reviewing a new user’s shipyard and role before saving' },
                    { id: 'save', title: 'Create the account', body: 'Select Create user and assign to create the account directly in the selected shipyard, without finding the user again for assignment. Unassigned accounts show Create user. Errors preserve entered details so you can correct them and retry.' },
                ],
                expectedResult: 'The account is created with the chosen shipyard and role, or explicitly left unassigned.',
                note: 'Platform administrators create accounts. Shipyard administrators edit users within their existing permissions; this flow grants no new creation rights. Accounts can be created in inactive shipyards; inventory access starts only after the shipyard is activated.',
            },
            {
                id: 'usage', title: 'Request free shared use',
                summary: 'Request dates and quantity, then track approval, handover and return.',
                audience: 'Active shipyard members', audienceRole: 'all', route: '/shared-usage', action: 'Open usage requests',
                steps: [
                    { id: "find", title: "Find shared equipment", body: "Open Shared use → Shared equipment from main navigation. Check another shipyard’s offered quantity, capacity and conditions. You cannot request your own equipment. Unavailable requests show a reason and the next valid step in details." },
                    { id: 'request', title: 'Enter dates, quantity and purpose', body: 'Open Request free shared use. Enter start and end dates, quantity and intended use, then send it. A pending request does not reserve equipment.', screenshot: 'usage-request.png', imageAlt: 'Free usage request with dates, quantity and purpose' },
                    { id: "approve", title: "Follow the owner’s decision", body: "Open Shared use → Usage requests for your shipyard’s requests and incoming requests. The author, next step and responsible role appear together. The owning shipyard manager selects Approve or Reject, reviews the note and selects Complete action to save the decision. Approved quantity is reserved; overlapping quantities cannot be approved twice.", screenshot: 'usage-approval.png', imageAlt: 'Request status, responsible actor and persistent action controls' },
                    { id: 'return', title: 'Record handover and return', body: 'The owner manager records handover after approval. When equipment comes back, select Receive return. For either action, review the note and select Complete action to save. Quantity remains reserved until return is recorded, even after the planned end date.', screenshot: 'usage-return.png', imageAlt: 'Result after recording the equipment return' },
                ],
                expectedResult: 'Both shipyards see approval, handover and return status. Relevant users receive notifications.',
                note: 'Use is free and approval belongs to the owning shipyard. Handed-over requests are returned rather than cancelled. Confirm site suitability, transport and operator conditions separately.',
            },
        ],
    },
}
