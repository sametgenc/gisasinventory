# GİSAŞ — kullanıcı deneyimi ve ürün GAP analizi

14 Ekim 2026 · Yerel kaynak kodu ve örnek veriyle test kapsamı

Uygulamanın güçlü tarafı ortak tip tanımlarını tersane envanterinden ayırmasıdır. Kullanıcının ilk işi bu ayrımı anlamak, doğru Excel dosyasını seçmek ve aktarımın sonucunu görmek. Arayüz geliştirmesinde öncelik, bu üç adımı görünür yapmak ve bir hata olduğunda kullanıcıyı çıkmazda bırakmamaktır.

Bu rapor canlı ortam kabulü değildir. Yerel demo kurmaca verilerle çalışır. Test/build kanıtları [VERIFICATION.md](VERIFICATION.md), demo kurulumu [TEST_ORTAMI.md](TEST_ORTAMI.md), kullanıcı anlatımı [KULLANIM_REHBERI.md](KULLANIM_REHBERI.md) içindedir.

## Merkezi envanter ve kontrollü ortak liste için güncel durum

Kullanıcının ürün açıklamasıyla kapsam netleşti: ayrı Excel envanterleri ortak ekipman türlerinde birleşir; bütün özel kayıtlar diğer tersanelere açılmaz. Ortak listede yalnız sahibi tersanenin yöneticisinin paylaşıma açtığı kayıtlar görünür. Ayrıntılı güncel ürün analizi [ORTAK_ENVANTER_URUN_ANALIZI.md](ORTAK_ENVANTER_URUN_ANALIZI.md) içindedir.

- **Envanterim:** ilk ekran ekipman türü ve sayı kartları; tür seçince ekipman kodu, teknik bilgiler ve kayıt işlemleri. Platform için adı **Birleşik envanter** ve kapsamı bütün tersanelerdir.
- **Ekipman türleri:** kategori başlıkları altında ortak tanım dizini. “Forklift” bir türdür; belirli tersanenin FL-001 kaydı fiziksel ekipmandır.
- **Ortak ekipmanlar:** yönetici tarafından yayımlanan aktif/kapsam içindeki kayıtların ayrı, sayfalı listesi. Diğer tersaneler yalnız tür, sahibi tersane, katalog/kategori, kamuya yazılmış not ve yayın tarihini görür.
- **Yayın kararı:** tersane yöneticisi kendi ekipmanını açar/kapatır; personel yayın izni veremez. Normal kayıt ve Excel aktarımı otomatik paylaşım açmaz. Sahip değişince yayın sıfırlanır.

Aşağıdaki SSRP operasyon GAP'leri tam kullanım/rezervasyon ürünü içindir. Rezervasyon ve ödeme, merkezi envanter/listeleme MVP'sinin zorunlu başlangıç işi değildir. Kontrollü keşif artık temel düzeyde uygulanmıştır; kalan iş yapılandırılmış kamu teknik bilgileri, iletişim/talep kanalı ve daha güçlü kayıt standardıdır.

## Kullanıcının izleyeceği ana akış

| Adım | Ekran | Başarı göstergesi |
|---|---|---|
| Ortak tanımı hazırlama | Varlık Tipleri | Tip kodu, kategori, ön sınıf ve ekipman alanları görünür |
| Katalog dosyasını gözden geçirme | Katalogdan aktar | Oluşturma/güncelleme/atlama/hata sayıları; değişecek mevcut bilgiler |
| Fiziksel ekipmanı kaydetme | Envanter | Doğru tip ve sahibi tersaneyle ekipman kodlu kayıt |
| Excel'i eşleme | Envanter aktarımı | Başlık satırı, tip, hedef kurum ve zorunlu sütun eşlemesi belirgin |
| Sonucu kontrol etme | Aktarım sonucu ve liste | Oluşturulan/güncellenen/hatalı satırlar; filtre ve aramayla kayıt doğrulaması |

## Bu turda ele alınan kullanıcı deneyimi alanları

| Sorun / kullanıcı etkisi | Değişikliğin hedef davranışı | Kaynak ve kabul kontrolü |
|---|---|---|
| Katalog ile ekipman dosyası karışabiliyor | Ayrı adlandırma, akış açıklaması, rehber ve örnek dosyalarla doğru yol bulunur | [Katalog ekranı](../frontend/src/routes/_secured/assets/types.tsx), [Envanter](../frontend/src/routes/_secured/assets/index.tsx), [Rehber](../frontend/src/routes/help.tsx); iki dosya türü gerçek demoda denenir |
| Güncelleme dosyasında boş hücrenin bilgiyi temizlediği kolay fark edilmiyor | Katalog önizlemesi eski/yeni değeri ve temizlenen alanı açık gösterir | [Katalog servisi](../backend/apps/assets/catalog_import.py), [Önizleme penceresi](../frontend/src/components/assets/CatalogImportModal.tsx); güncelleme dosyasında açıklama/gerekçe kontrolü |
| Yalnız yeni modunda atlanan satırın yüklenen sınıfı mevcut kayıt sanılabiliyor | Atlanan mevcut kaydın saklanan bilgisi ve atlama nedeni gösterilir | Aynı katalog dosyaları; tekrar önizleme sırasında yanlış “güncellenecek” izlenimi olmamalı |
| Ana ekranda işlem adı ile varılan ekran farklı olabiliyor | Ekipman listesine yönlendiren bağlantı kendi görevini açık söyler; tıklanamayan ok kaldırılır veya gerçek yönlendirme olur | [Ana ekran](../frontend/src/routes/_secured/dashboard.tsx); son kayıt ve hızlı işlem kontrolü |
| Ölçülmeyen “sistem güncel/sağlıklı” göstergesi yanlış güven verebiliyor | Gerçek ölçüme dayanmayan operasyon durumu yerine yapılabilir kullanıcı görevi gösterilir | Ana ekran; backend/SMTP/Redis sağlığına dair kanıtsız iddia olmamalı |
| Yetkisiz hesapta yönetici sorgusu gereksiz hata/istek oluşturabiliyor | Rol uygun değilse ayrıcalıklı liste çağrısı çalışmaz | [Kurum sorguları](../frontend/src/modules/tenants/hooks.ts), Ana ekran; personel hesabında genel kullanıcı çağrısı olmamalı |
| Boş liste ile yükleme hatası aynı görünebiliyor | Hata, tekrar deneme, gerçekten boş durum ve filtre sonucu boş durum ayrılır | Envanter ve katalog ekranı; hata yanıtı/mobil boş sonuç senaryosu |
| Pencere açıkken klavye odağı arka ekrana kaçabiliyor | Başlık/kapama adı okunur; odak pencere içinde kalır, kapanınca önceki noktaya döner | [Ortak pencere](../frontend/src/components/ui/Modal.tsx); Tab/Shift+Tab/Escape kontrolü |
| Dosya işlenirken pencereyi kapatmak sonucu belirsizleştiriyor | Devam eden iş sırasında kapama ve dosya değişimi kontrol edilir | Katalog ve envanter aktarım pencereleri; işlem sürerken klavye/kapama testi |
| Tip/kurum seçimi eksik olunca pasif düğmenin nedeni anlaşılmıyor | Ön koşullar, aktif kurum ve alan eşleme açıklanır; eksik tanım için katalog bağlantısı bulunur | [Ekipman formu](../frontend/src/components/assets/AssetFormModal.tsx), Envanter; farklı rollerle kayıt |
| Aynı ekipman şablonunun tekrar yüklenmesi kopya oluşturabiliyor | Benzersiz anahtarlı tipte tersane+tip+anahtarla güncelleme, ayrı oluşturma/güncelleme sayısı | [Ekipman aktarımı](../backend/apps/assets/views.py); tekrarlı dosyada ekipman sayısı artmamalı |
| Tip adındaki `/` ve Excel'e özel karakterler şablon indirmeyi bozabiliyor | Geçerli sayfa adı, `_mapping` koruması ve güvenli Unicode indirme başlığı | [Excel işlemleri](../backend/apps/assets/views.py); gerçek demoda MIG/MAG şablonu indirildi |
| Excel çıktısındaki `=` ile başlayan kullanıcı metni formüle dönüşebiliyor | Metin hücre türü korunuyor | Ekipman dışa aktarma regresyonu; sayı/checkbox değerleri kendi türünde kalır |
| Kullanıcı yardım almak için dış anlatım aramak zorunda | Üst çubukta rehber, demo örnekleri, görev odaklı adımlar ve sık sorular | [Uygulama rehberi](../frontend/src/routes/help.tsx), [Çevrimdışı rehber](kullanim-rehberi.html); dar ekranda erişim |

Bu tablo değişikliklerin kabul hedefini belirtir. Test sonuçlarını ayrı doğrulama kaydından okuyun; kodda bulunması tek başına bütün tarayıcı/rol senaryolarının geçtiği anlamına gelmez.

## Kurumsal arayüz düzeni

Arayüz, günlük envanter işlerinde okunurluk ve tutarlılığa göre yenilendi. Sistem yazı karakteri, çelik mavisi işlem rengi, düz yüzeyler, küçük köşeler ve ölçülü ikonlar ortak bileşenlere uygulandı. Dekoratif gradient, parlama, büyük ikon kutuları ve ölçeklenen düğmeler ana ekranlardan kaldırıldı.

- Ana ekran: tek özet şeridi, açık işlem adları, son ekipmanlar ve tarihli bildirimler.
- Envanter ve katalog: türe göre envanter kartları, ekipman ayrıntı kartları ve kategori altında ortak tür dizini. Ekipman kodu, sahibi ve yayın durumu ayrı görünür; ön A/B/C değerlendirmesi yayın kararıyla karıştırılmaz.
- Navigasyon, giriş, kullanıcı ve tersane yönetimi: tutarlı başlıklar, düğmeler ve küçük, nötr hesap işaretleri.
- Açık/koyu tema: aynı hiyerarşi; koyu temada görünür klavye odağı ve işlem vurguları. Tema animasyonu düğmenin merkezinden başlamaya devam eder.
- Rehber: uygulama ile aynı renk ve yüzey düzeni; çevrimdışı HTML sürümündeki anlatım, arama ve yazdırma akışları korunur.

Yerel demo örnekleri: [ana ekran](images/corporate-dashboard-desktop-light.png), [katalog](images/corporate-catalog-desktop-light.png), [giriş](images/corporate-login-desktop-light.png), [koyu ana ekran](images/corporate-dashboard-desktop-dark.png), [mobil envanter](images/corporate-inventory-mobile-light.png). Kontrol sonuçları aşağıdaki ürün GAP'lerinden ayrı olarak [doğrulama kaydında](VERIFICATION.md) tutulur.

## Kalan UI ve günlük kullanım eksikleri

| Öncelik | Eksik ve somut etki | Kaynak kanıtı | Önerilen sonraki dilim / kabul |
|---|---|---|---|
| P1 | `tenant_user` salt okunur değil; personel kendi kurum ekipmanını silebilir. Kurumun beklediği onay/salt okuma ayrımı bulunmuyor | [Varlık izinleri](../backend/apps/assets/views.py), [IsTenantMember](../backend/apps/tenants/permissions.py) | Görüntüleme/oluşturma/düzenleme/silme ayrı ürün yetkileri; API ve düğmeler aynı matrisi uygulamalı |
| P1 | Genel yönetimde `superuser`, katalogda ayrıca `platform_admin` rolü kullanılıyor; tek “platform yöneticisi” etiketi kapsamı açıklamıyor | [Kurum izinleri](../backend/apps/tenants/permissions.py), [Platform rota koruması](../frontend/src/routes/_secured/platform/route.tsx), [Tip API](../backend/apps/assets/views.py) | Rol açıklaması ve yönetim görevi netleştirilmeli; mevcut izinleri farkında olmadan genişletmeden ortak yetki politikası |
| P1 | Büyük listeler bütün kayıtları getirip tarayıcıda filtreliyor; binlerce kayıtta yükleme ve mobil kullanım yavaşlayabilir | [Varlık sorguları](../frontend/src/modules/assets/hooks.ts), Envanter/katalog listeleri | Sunucu sayfalaması+arama+filtreleme birlikte; doğru toplam ve dışa aktarım kapsamı, temsilî büyük veri ölçümü |
| P1 | Dinamik benzersiz anahtar aktarım eşlemesidir; eşzamanlı veya elle kayıtta tekillik garantisi yok | [Asset modeli](../backend/apps/assets/models.py), `bulk_import`/`raw_import` | Normalize ekipman kimliği ve veritabanı kısıtı; iki eşzamanlı istekte aynı kodun tek kayıt oluşturduğunu PostgreSQL'de test |
| P1 | Tip alan şeması yerinde değişiyor; eski ekipman verisi/görünümü yeni şemaya sessizce bağımlı | [Tip modeli ve serializer](../backend/apps/assets/serializers.py), [Detay ekranı](../frontend/src/routes/_secured/assets/index.tsx) | Şema sürümü, etkilenen kayıt özeti ve kontrollü veri göçü; eski değer kaybolmamalı |
| P1 | Envanter dosyası önizlemesi örnek satırlardır; bütün dosya için ön doğrulama ve katalogdaki kadar güçlü kaynak sınırı yok | `preview_import`, `bulk_import`, `raw_import` içinde [views.py](../backend/apps/assets/views.py) | Dosya boyutu/açılmış boyut/satır sınırı, tam doğrulama ve indirilebilir tüm hata raporu; büyük dosyada görev ilerlemesi |
| P1 | Envanter aktarımı satır bazında kısmi başarı verebilir; kullanıcı başarıyla aktarılan satırları tekrar gönderebilir | Aynı aktarım yolları; hata listesi ilk 20 satırla sınırlı | Sonuçtan yalnız hatalı satırları indirip yeniden deneme; kısmi başarı açıklaması ve iş geçmişi |
| P2 | Çok sayıda tipte kısa açılır listede seçim zorlaşır | [Ekipman formu](../frontend/src/components/assets/AssetFormModal.tsx), Envanter aktarım tipi seçimi | Klavyeyle aranabilen tip seçici; kategori ve kodla arama, seçimi koruma |
| P2 | Modelde kişiye atama alanı mevcut, ekipman formunda sorumlu kişi seçimi yok | `Asset.assigned_to`, [Ekipman formu](../frontend/src/components/assets/AssetFormModal.tsx) | Aynı tersanedeki aktif kullanıcılar için rol kapsamına uygun liste API'si ve sorumlu seçici |
| P2 | Arayüz TR/EN olsa da katalog adı ve özel alan etiketi tek metin | [AssetType.schema](../backend/apps/assets/models.py) ve katalog modeli | Katalog/etiket çevirisi ayrı saklansın; eksik çeviride tutarlı geri dönüş |
| P2 | Şema yapıcısı ve envanter ekranı büyük; kod bakımı ve ilk yükleme maliyeti yüksek | [Tip formu](../frontend/src/components/assets/AssetTypeFormModal.tsx), Envanter route'u | Parçalama ve rota yükleme ayrımı; bundle ölçümüyle, davranış korunarak ilerleme |
| P2 | Form/kimlik ekranlarında biriken lint ve tip borcu yeni hataları ayırt etmeyi zorlaştırıyor | Önceki [doğrulama kaydı](VERIFICATION.md), Allauth ekranları | Borcu modül modül temizleme; yeni işlerde kuralları gevşetmeden değişen dosyaları kontrol |

P1 temel günlük kullanım/veri bütünlüğü; P2 sonraki iyileştirme. Mevcut kurumların yetki veya iş kurallarını değiştiren işler ayrı kabul kriteriyle tasarlanmalıdır.

## Ortak kullanım ürünü için kalan GAP'ler

| Öncelik | Eksik | Kullanıcıda yaratılmaması gereken izlenim | İlk kabul kriteri |
|---|---|---|---|
| P0 | Fiziksel ekipmanın saha uygunluk değerlendirmesi | “A rozeti varsa kullanıma hazır” | Değerlendiren, tarih, geçerlilik, gerekçe/kanıt ve nihai karar ekipmana bağlı kaydedilmeli |
| P0 | Miktarlı stok ve tahsis | “Bir iskele kaydı, 1.200 m² stokla aynı şey” | Tekil ekipman, havuz ve sarf ayrılmalı; stok birimi kapasiteden bağımsız olmalı |
| P0 | Talep/onay ve rezervasyon | “Katalogdan başka tersanenin ekipmanını hemen rezerve edebilirim” | Sahip kurum, talep eden kurum, zaman, miktar, karar ve çakışma kontrolü birlikte |
| P0 | Muayene/kalibrasyon/belge geçerliliği | “Envanter kaydı güvenlik kontrolünü tamamlar” | Geçersiz/eksik uygunluk gerekli işlemde paylaşımı bloke etmeli |
| P1 | Kontrollü keşfin ayrıntılı teknik araması ve iletişim kanalı | “Yayımlanmış kayıt, anında kullanılabilir ekipmandır” | Temel kontrollü liste var; kamu teknik alanları, kapasite/birim filtreleri ve talep/iletişim yönü ayrıca tasarlanmalı |
| P1 | Teslim/iade, hasar ve bakım geçmişi | “Kişiye atama, kurumlar arası teslimdir” | Sahiplik sabit; kullanım ilişkisi ve teslim/iade olayları ayrı tutulmalı |
| P1 | Değişiklik geçmişi ve katalog sürümü | “Oluşturan/tarih alanları tam denetim kaydıdır” | Önemli eski/yeni değerler, kişi, zaman ve kaynak/sürüm izlenmeli |
| P2 | Kiralama, maliyet paylaşımı, ortak satın alma | “Mevcut envanter ekranı ödeme/sözleşme sürecini kapsar” | Tam SSRP raporu ve ürün kurallarıyla ayrı ticari kapsam belirlenmeli |

Tam teknik/modelleme bağlamı [GİSBİR SSRP analizinde](GISBIR_SSRP_GAP_ANALIZI.md). İç katalog kodu atama sıradan bir katalog işlemidir; PDF'nin özgün kodu diye sunulmaması yeterlidir. Kaynak PDF'nin 175 tiplik listesi, kontrollü kaynak/sürüm dosyası olarak ayrıca tamamlanmalıdır.

## Demo kabul senaryoları

| Senaryo | Beklenen davranış |
|---|---|
| Yeni kullanıcı ilk 15 dakika | Rehberden hesap seçer, tip/ekipman ayrımını anlar, örnek dosya indirip aktarım sonucunu bulur |
| Geçerli katalog | Yeni tipler oluşur, tekrar önizlemede mevcut kodlar atlanır |
| Hatalı katalog | Hatalar satırlarıyla görünür; onay kapalı ve kayıt yok |
| Katalog güncellemesi | Eski/yeni değer ve boş hücre temizliği görülebilir; şema ve ekipmanlar korunur |
| Forklift dosyası tekrar aktarım | Benzersiz anahtarlı tipte aynı kurum/anahtar güncellenir; yeni kopya yok |
| Mavi Körfez → Poyraz hesap değişimi | Ortak tipler görünür, diğer kurumun fiziksel ekipmanları görünmez |
| Personel hesabı | Tip yönetim düğmeleri görünmez; kendi envanterini yönetir; genel yönetici isteği gönderilmez |
| Mobil ve klavye | Menü erişilir, sayfa yatay taşmaz; pencere odağı ve kapama davranışı anlaşılır |
| Açık/koyu tema | Tema gerçek düğmeden başlar; içerik ve hata metni iki temada okunur |

## Önerilen sonraki sıra

1. Günlük veri bütünlüğü: ekipman tekilliği, rol matrisi, tam dosya ön doğrulaması ve hata raporu.
2. Büyük veri ve bakım: sunucu filtre/sayfalama, tip arama, şema sürümleme, kod/lint borcu.
3. SSRP pilotu: saha değerlendirmesi ve miktarlı stok; ardından talep/onay/rezervasyon ve teslim/iade.

Bu sıra kalan kapsamı belirtir; mevcut demoda rezervasyon veya ticari işlem bulunduğu iddia edilmez.
